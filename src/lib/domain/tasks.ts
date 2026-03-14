import env from "@/lib/env";
import { CACHE_TAGS, revalidateTaskReadModels } from "@/lib/domain/cache-tags";
import { getAlgorithms } from "@/lib/domain/algorithms";
import { chargeUnits, getServiceBalance, refundUnits } from "@/lib/domain/service-balance";
import { getAppSnapshot } from "@/lib/domain/store";
import { getAppStore } from "@/lib/repositories/app-store";
import {
  bootstrapTpLinkMessageSubscription,
  fetchTpLinkDevices,
  fetchTpLinkDeviceByQrCode,
  getTpLinkInspectionTaskResult,
  setTpLinkAlgorithmVersions,
  startTpLinkInspectionTask
} from "@/lib/tplink/client";
import { slugId } from "@/lib/utils";
import { unstable_cache } from "next/cache";
import type {
  Algorithm,
  InspectionFailure,
  InspectionResult,
  InspectionRun,
  InspectionTask,
  MediaAsset,
  MessageItem,
  RegionShape,
  SchedulerScan
} from "@/lib/types";

type TaskInput = Pick<
  InspectionTask,
  "name" | "algorithmIds" | "algorithmVersions" | "devices" | "schedules" | "inspectionRule" | "messageRule" | "regionsByQrCode"
> & { id?: string };

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DUE_TASK_GRACE_MS = 5 * 1000;
const STALE_RUNNING_RUN_MS = 2 * 60 * 60 * 1000;

function calculateTaskStatus(task: Pick<InspectionTask, "devices">): InspectionTask["status"] {
  if (task.devices.length === 0) return "config_error";
  return "enabled";
}

function getShanghaiParts(base: Date) {
  const shifted = new Date(base.getTime() + SHANGHAI_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekDay: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes()
  };
}

function createShanghaiDate(year: number, month: number, day: number, hour: number, minute: number) {
  return new Date(Date.UTC(year, month, day, hour - 8, minute, 0, 0));
}

function parseClock(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute, totalMinutes: hour * 60 + minute };
}

function dedupeSchedules(schedules: InspectionTask["schedules"]) {
  return Array.from(
    new Map(
      schedules.map((schedule) => [
        JSON.stringify({
          type: schedule.type,
          startTime: schedule.startTime,
          endTime: schedule.endTime ?? "",
          repeatDays: [...schedule.repeatDays].sort((a, b) => a - b),
          intervalMinutes: schedule.intervalMinutes ?? null
        }),
        schedule
      ] as const)
    ).values()
  );
}

function getNextRunAt(schedules: InspectionTask["schedules"], from = new Date()) {
  if (schedules.length === 0) return undefined;

  let next: Date | null = null;

  for (let dayOffset = 0; dayOffset <= 30; dayOffset += 1) {
    const candidateBase = new Date(from.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const parts = getShanghaiParts(candidateBase);
    const currentMinutes = dayOffset === 0 ? parts.hour * 60 + parts.minute : -1;

    for (const schedule of schedules) {
      if (!schedule.repeatDays.includes(parts.weekDay)) continue;

      if (schedule.type === "time_point") {
        const target = parseClock(schedule.startTime);
        if (dayOffset === 0 && target.totalMinutes < currentMinutes) continue;
        const candidate = createShanghaiDate(parts.year, parts.month, parts.day, target.hour, target.minute);
        if (candidate >= from && (!next || candidate < next)) {
          next = candidate;
        }
        continue;
      }

      if (!schedule.endTime) continue;

      const start = parseClock(schedule.startTime);
      const end = parseClock(schedule.endTime);
      const intervalMinutes = schedule.intervalMinutes ?? 30;
      const endCandidate = createShanghaiDate(parts.year, parts.month, parts.day, end.hour, end.minute);
      let candidate = createShanghaiDate(parts.year, parts.month, parts.day, start.hour, start.minute);

      while (candidate < from && candidate <= endCandidate) {
        candidate = new Date(candidate.getTime() + intervalMinutes * 60 * 1000);
      }

      if (candidate > endCandidate) continue;

      if ((!next || candidate < next) && candidate >= from) {
        next = candidate;
      }
    }
  }

  return next?.toISOString();
}

function toRegionConfig(regions: RegionShape[]) {
  return JSON.stringify({
    region_info: regions.map((region) => ({
      id: region.id,
      pt_num: region.points.length,
      pt_x: region.points.map((point) => point.x),
      pt_y: region.points.map((point) => point.y)
    }))
  });
}

function buildTpLinkDevList(task: InspectionTask) {
  return task.devices.map((device) => {
    const regions = task.regionsByQrCode[device.qrCode] ?? [];
    return {
      qrCode: device.qrCode,
      channelId: device.channelId,
      ...(regions.length > 0 ? { regionConfig: toRegionConfig(regions) } : {})
    };
  });
}

function parseTpLinkTime(value: string | undefined) {
  if (!value || value.length !== 14) {
    return new Date().toISOString();
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6)) - 1;
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  const second = Number(value.slice(12, 14));
  return new Date(Date.UTC(year, month, day, hour - 8, minute, second)).toISOString();
}

function buildUnqualifiedMessage(task: InspectionTask, runId: string, result: InspectionResult): MessageItem | null {
  if (!task.messageRule.enabled || result.result !== "UNQUALIFIED") return null;

  const isContinuous = task.messageRule.triggerMode === "continuous_unqualified";
  return {
    id: slugId("msg"),
    taskId: task.id,
    runId,
    resultId: result.id,
    type: "inspection_unqualified",
    read: false,
    title: `${task.name} 巡检不合格`,
    description: isContinuous
      ? `同一监控点一天内连续 ${task.messageRule.continuousCount ?? 3} 次被巡检为不合格时推送消息`
      : "监控点每次被巡检为不合格时推送消息",
    result: "UNQUALIFIED",
    qrCode: result.qrCode,
    channelId: result.channelId,
    algorithmId: result.algorithmId,
    createdAt: result.imageTime,
    imageUrl: result.imageUrl,
    imageId: result.imageUrl ? slugId("image") : undefined,
    videoTaskId: undefined,
    profileId: result.profileId
  };
}

function mergeTaskInput(previous: InspectionTask | null, input: Partial<TaskInput> & { id?: string }) {
  return {
    id: input.id ?? previous?.id,
    name: input.name ?? previous?.name ?? "未命名巡检任务",
    algorithmIds: input.algorithmIds ?? previous?.algorithmIds ?? [],
    algorithmVersions: input.algorithmVersions ?? previous?.algorithmVersions ?? {},
    devices: input.devices ?? previous?.devices ?? [],
    schedules: input.schedules ?? previous?.schedules ?? [],
    inspectionRule: input.inspectionRule ?? previous?.inspectionRule ?? { resultMode: "detect_target" as const },
    messageRule:
      input.messageRule ??
      previous?.messageRule ?? { enabled: true, triggerMode: "every_unqualified" as const, continuousCount: 3 },
    regionsByQrCode: input.regionsByQrCode ?? previous?.regionsByQrCode ?? {}
  };
}

function dedupeDevices(devices: InspectionTask["devices"]) {
  return Array.from(
    new Map(devices.map((device) => [`${device.profileId ?? "primary"}:${device.qrCode}:${device.channelId}`, device] as const)).values()
  );
}

function isPlaceholderDeviceIdentity(device: InspectionTask["devices"][number]) {
  const normalizedName = device.name?.trim();
  const normalizedGroup = device.groupName?.trim() ?? "";
  return !normalizedName || normalizedName === device.qrCode || /托管设备|Entrust/i.test(normalizedGroup);
}

function scoreDeviceCandidate(
  source: InspectionTask["devices"][number],
  candidate: InspectionTask["devices"][number]
) {
  let score = 0;

  if (source.profileId && source.profileId === candidate.profileId) score += 200;
  if (source.mac && candidate.mac && source.mac === candidate.mac) score += 120;

  const placeholderIdentity = isPlaceholderDeviceIdentity(source);

  if (!placeholderIdentity && source.name && source.name === candidate.name) score += 80;
  if (!placeholderIdentity && source.groupName && source.groupName === candidate.groupName) score += 60;
  if (candidate.status === "online") score += 40;
  if (candidate.profileId) score += 20;

  return score;
}

function pickBestDeviceCandidate(
  source: InspectionTask["devices"][number],
  candidates: InspectionTask["devices"]
) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  return [...candidates].sort((left, right) => scoreDeviceCandidate(source, right) - scoreDeviceCandidate(source, left))[0];
}

async function resolveTaskDevicesForExecution(task: InspectionTask) {
  const allDevices = await fetchTpLinkDevices().catch(() => []);

  return Promise.all(
    task.devices.map(async (device) => {
      if (device.profileId) return device;

      const candidates = allDevices.filter((candidate) => candidate.qrCode === device.qrCode && candidate.channelId === device.channelId);
      const bestCandidate = pickBestDeviceCandidate(device, candidates);
      if (bestCandidate) {
        return { ...device, ...bestCandidate };
      }

      const fetched = await fetchTpLinkDeviceByQrCode(device.qrCode).catch(() => null);
      return fetched ? { ...device, ...fetched } : device;
    })
  );
}

async function reconcileRunningTaskState(task: InspectionTask, now = new Date()) {
  if (task.status !== "running") return task;

  const store = await getAppStore();
  const runs =
    "getTaskRunsData" in store && typeof store.getTaskRunsData === "function"
      ? await store.getTaskRunsData(task.id)
      : (await store.snapshot(false)).runs.filter((item) => item.taskId === task.id);

  const runningRuns = runs.filter((run) => run.status === "running");
  if (runningRuns.length === 0) {
    const nextTask: InspectionTask = {
      ...task,
      status: "enabled",
      updatedAt: now.toISOString(),
      nextRunAt: getNextRunAt(task.schedules, new Date(now.getTime() + 1_000))
    };
    await store.upsertTask(nextTask);
    return nextTask;
  }

  const staleRunningRuns = runningRuns.filter((run) => now.getTime() - new Date(run.startedAt).getTime() >= STALE_RUNNING_RUN_MS);
  if (staleRunningRuns.length === 0) return task;

  for (const run of staleRunningRuns) {
    await store.updateRun({
      ...run,
      completedAt: now.toISOString(),
      status: "failed",
      failedChecks: Math.max(run.failedChecks, run.totalChecks || run.chargedUnits || 1)
    });
  }

  const hasFreshRunningRuns = runningRuns.length > staleRunningRuns.length;
  const nextTask: InspectionTask = {
    ...task,
    status: hasFreshRunningRuns ? "running" : "enabled",
    updatedAt: now.toISOString(),
    nextRunAt: hasFreshRunningRuns ? task.nextRunAt : getNextRunAt(task.schedules, new Date(now.getTime() + 1_000))
  };
  await store.upsertTask(nextTask);
  return nextTask;
}

function groupDevicesByProfile(devices: InspectionTask["devices"]) {
  const grouped = new Map<string, InspectionTask["devices"]>();

  for (const device of devices) {
    const profileId = device.profileId ?? "primary";
    const bucket = grouped.get(profileId) ?? [];
    bucket.push(device);
    grouped.set(profileId, bucket);
  }

  return grouped;
}

function computeExecutableGroups(task: InspectionTask, devices: InspectionTask["devices"], algorithms: Algorithm[]) {
  const algorithmById = new Map(algorithms.map((algorithm) => [algorithm.id, algorithm] as const));
  const groupedDevices = groupDevicesByProfile(devices);
  const executableGroups: Array<{ profileId: string; devices: InspectionTask["devices"] }> = [];
  const unsupportedGroups: Array<{ profileId: string; devices: InspectionTask["devices"]; algorithmIds: string[] }> = [];

  for (const [profileId, profileDevices] of groupedDevices) {
    const unsupportedAlgorithms = task.algorithmIds.filter((algorithmId) => {
      const algorithm = algorithmById.get(algorithmId);
      return algorithm?.profileIds?.length ? !algorithm.profileIds.includes(profileId) : false;
    });

    if (unsupportedAlgorithms.length > 0) {
      unsupportedGroups.push({ profileId, devices: profileDevices, algorithmIds: unsupportedAlgorithms });
      continue;
    }

    executableGroups.push({ profileId, devices: profileDevices });
  }

  return { executableGroups, unsupportedGroups };
}

function buildProfileSupportFailures(task: InspectionTask, runId: string, profileId: string, devices: InspectionTask["devices"], algorithmIds: string[]) {
  return devices.flatMap((device) =>
    algorithmIds.map<InspectionFailure>((algorithmId) => ({
      id: slugId("failure"),
      runId,
      taskId: task.id,
      qrCode: device.qrCode,
      channelId: device.channelId,
      algorithmId,
      errorCode: -40001,
      message: `TP-LINK profile ${profileId} does not support algorithm ${algorithmId}.`
    }))
  );
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    const serialized = JSON.stringify(error);
    return serialized === undefined ? "Unknown execution error" : serialized;
  } catch {
    return "Unknown execution error";
  }
}

const getCachedTaskList = unstable_cache(
  async () => {
    const store = await getAppStore();
    if ("listTasksData" in store && typeof store.listTasksData === "function") {
      const tasks = await store.listTasksData();
      return tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    const snapshot = await store.snapshot(false);
    return snapshot.tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  ["task-list"],
  { revalidate: 5, tags: [CACHE_TAGS.tasks] }
);

export async function listTasks() {
  return getCachedTaskList();
}

export async function triggerDueTasks(now = new Date()) {
  const tasks = await listTasks();
  const reconciledTasks = await Promise.all(tasks.map((task) => reconcileRunningTaskState(task, now)));
  const dueTasks = reconciledTasks.filter(
    (task) =>
      ["enabled", "running"].includes(task.status) &&
      task.nextRunAt &&
      new Date(task.nextRunAt).getTime() - DUE_TASK_GRACE_MS <= now.getTime()
  );

  const completed: string[] = [];
  const failed: Array<{ taskId: string; error: string }> = [];
  for (const task of dueTasks) {
    try {
      await executeTask(task.id);
      completed.push(task.id);
    } catch (error) {
      failed.push({
        taskId: task.id,
        error: toErrorMessage(error)
      });
    }
  }

  const summary = {
    scannedAt: now.toISOString(),
    dueCount: dueTasks.length,
    completed,
    failed
  };

  const store = await getAppStore();
  if ("addSchedulerScan" in store && typeof store.addSchedulerScan === "function") {
    const scan: SchedulerScan = {
      id: slugId("scan"),
      scannedAt: summary.scannedAt,
      dueCount: summary.dueCount,
      completedCount: summary.completed.length,
      failedCount: summary.failed.length,
      errorSummary: summary.failed.map((item) => `${item.taskId}: ${item.error}`).join(" | ") || undefined
    };
    try {
      await store.addSchedulerScan(scan);
    } catch (error) {
      console.error("Failed to persist scheduler scan", error);
    }
  }

  return summary;
}

const getCachedTaskById = unstable_cache(
  async (id: string) => {
    const store = await getAppStore();

    if ("getTaskSummaryData" in store && typeof store.getTaskSummaryData === "function") {
      const [task, runs, results, failures, messagePayload] = await Promise.all([
        store.getTaskSummaryData(id),
        "getTaskRunsData" in store && typeof store.getTaskRunsData === "function" ? store.getTaskRunsData(id) : Promise.resolve([]),
        "getTaskResultsData" in store && typeof store.getTaskResultsData === "function" ? store.getTaskResultsData(id) : Promise.resolve([]),
        "getTaskFailuresData" in store && typeof store.getTaskFailuresData === "function" ? store.getTaskFailuresData(id) : Promise.resolve([]),
        "getTaskMessagesData" in store && typeof store.getTaskMessagesData === "function"
          ? store.getTaskMessagesData(id)
          : Promise.resolve({ messages: [], media: [], mediaByMessage: {} as Record<string, MediaAsset[]> })
      ]);

      if (!task) return null;

      return {
        task,
        runs,
        results,
        failures,
        messages: messagePayload.messages
      };
    }

    const snapshot = await getAppSnapshot({ includeDevices: false });
    const task = snapshot.tasks.find((item) => item.id === id) ?? null;
    if (!task) return null;

    return {
      task,
      runs: snapshot.runs.filter((item) => item.taskId === id),
      results: snapshot.results.filter((item) => item.taskId === id),
      failures: snapshot.failures.filter((item) => item.taskId === id),
      messages: snapshot.messages.filter((item) => item.taskId === id)
    };
  },
  ["task-detail"],
  { revalidate: 5, tags: [CACHE_TAGS.taskDetail, CACHE_TAGS.tasks, CACHE_TAGS.messages] }
);

export async function getTaskById(id: string) {
  return getCachedTaskById(id);
}

const getCachedTaskSummary = unstable_cache(
  async (id: string) => {
    const store = await getAppStore();
    if ("getTaskSummaryData" in store && typeof store.getTaskSummaryData === "function") {
      return store.getTaskSummaryData(id);
    }
    const detail = await getTaskById(id);
    return detail?.task ?? null;
  },
  ["task-detail-summary"],
  { revalidate: 5, tags: [CACHE_TAGS.taskDetail, CACHE_TAGS.tasks] }
);

export async function getTaskSummary(id: string) {
  return getCachedTaskSummary(id);
}

const getCachedTaskRuns = unstable_cache(
  async (id: string) => {
    const store = await getAppStore();
    if ("getTaskRunsData" in store && typeof store.getTaskRunsData === "function") {
      return store.getTaskRunsData(id);
    }
    const detail = await getTaskById(id);
    return detail?.runs ?? [];
  },
  ["task-detail-runs"],
  { revalidate: 5, tags: [CACHE_TAGS.taskDetail, CACHE_TAGS.tasks] }
);

export async function getTaskRuns(id: string) {
  return getCachedTaskRuns(id);
}

const getCachedTaskResults = unstable_cache(
  async (id: string) => {
    const store = await getAppStore();
    if ("getTaskResultsData" in store && typeof store.getTaskResultsData === "function") {
      return store.getTaskResultsData(id);
    }
    const detail = await getTaskById(id);
    return detail?.results ?? [];
  },
  ["task-detail-results"],
  { revalidate: 5, tags: [CACHE_TAGS.taskDetail, CACHE_TAGS.tasks, CACHE_TAGS.messages] }
);

export async function getTaskResults(id: string) {
  return getCachedTaskResults(id);
}

const getCachedTaskFailures = unstable_cache(
  async (id: string) => {
    const store = await getAppStore();
    if ("getTaskFailuresData" in store && typeof store.getTaskFailuresData === "function") {
      return store.getTaskFailuresData(id);
    }
    const detail = await getTaskById(id);
    return detail?.failures ?? [];
  },
  ["task-detail-failures"],
  { revalidate: 5, tags: [CACHE_TAGS.taskDetail, CACHE_TAGS.tasks] }
);

export async function getTaskFailures(id: string) {
  return getCachedTaskFailures(id);
}

const getCachedTaskMessages = unstable_cache(
  async (id: string) => {
    const store = await getAppStore();
    if ("getTaskMessagesData" in store && typeof store.getTaskMessagesData === "function") {
      return store.getTaskMessagesData(id);
    }
    const snapshot = await getAppSnapshot({ includeDevices: false });
    const messages = snapshot.messages.filter((item) => item.taskId === id);
    const media = snapshot.media.filter((item) => item.taskId === id || (item.messageId && messages.some((message) => message.id === item.messageId)));
    const mediaByMessage = media.reduce<Record<string, MediaAsset[]>>((accumulator, asset) => {
      if (!asset.messageId) return accumulator;
      (accumulator[asset.messageId] ??= []).push(asset);
      return accumulator;
    }, {});
    return { messages, media, mediaByMessage };
  },
  ["task-detail-messages"],
  { revalidate: 5, tags: [CACHE_TAGS.taskDetail, CACHE_TAGS.messages, CACHE_TAGS.tasks] }
);

export async function getTaskMessages(id: string) {
  return getCachedTaskMessages(id);
}

export async function upsertTask(input: Partial<TaskInput> & { id?: string }) {
  const store = await getAppStore();
  const snapshot = await store.snapshot(false);
  const now = new Date().toISOString();
  const previous = input.id ? snapshot.tasks.find((item) => item.id === input.id) ?? null : null;
  const merged = mergeTaskInput(previous, input);
  const status = calculateTaskStatus(merged);

  const task: InspectionTask = {
    id: merged.id ?? slugId("task"),
    name: merged.name,
    algorithmIds: merged.algorithmIds,
    algorithmVersions: merged.algorithmVersions,
    devices: dedupeDevices(merged.devices),
    schedules: dedupeSchedules(merged.schedules),
    inspectionRule: merged.inspectionRule,
    messageRule: merged.messageRule,
    regionsByQrCode: merged.regionsByQrCode,
    status,
    configErrorReason: status === "config_error" ? "任务中已无巡检设备" : undefined,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    nextRunAt: status === "enabled" ? getNextRunAt(merged.schedules, new Date()) : undefined,
    closedAt: previous?.closedAt
  };

  await store.upsertTask(task);
  revalidateTaskReadModels();
  return task;
}

export async function closeTask(id: string) {
  const details = await getTaskById(id);
  if (!details) return null;

  const store = await getAppStore();
  const task: InspectionTask = {
    ...details.task,
    status: "disabled",
    closedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await store.upsertTask(task);
  revalidateTaskReadModels();
  return task;
}

export async function deleteTask(id: string) {
  const store = await getAppStore();
  const snapshot = await store.snapshot(false);
  const task = snapshot.tasks.find((item) => item.id === id);
  if (!task) return null;

  if ("deleteTask" in store && typeof store.deleteTask === "function") {
    await store.deleteTask(id);
    revalidateTaskReadModels();
    return task;
  }

  throw new Error("Delete task is not supported by the current repository.");
}

export async function bootstrapTpLinkSubscriptions() {
  if (!env.tpLinkMessageSignSecret) {
    return { ok: false, reason: "TP_LINK_MESSAGE_SIGN_SECRET is not configured" };
  }

  const callbackUrl = `${env.appBaseUrl}/api/callbacks/tplink/messages`;
  const normalizedSignSecret = env.tpLinkMessageSignSecret.replace(/[^0-9a-zA-Z]/g, "").slice(0, 32);
  if (!normalizedSignSecret) {
    return { ok: false, reason: "TP_LINK_MESSAGE_SIGN_SECRET cannot be normalized to a valid TP-LINK secret" };
  }

  const result = await bootstrapTpLinkMessageSubscription({
    callbackUrl,
    signSecret: normalizedSignSecret
  });

  return { ok: true, callbackUrl, signSecretApplied: normalizedSignSecret, result };
}

async function simulateTaskExecution(task: InspectionTask, chargeUnitsCount: number) {
  await chargeUnits(task.id, chargeUnitsCount);

  const startedAt = new Date().toISOString();
  const run: InspectionRun = {
    id: slugId("run"),
    taskId: task.id,
    startedAt,
    completedAt: startedAt,
    status: task.devices.length > 1 ? "partial_success" : "completed",
    totalChecks: chargeUnitsCount,
    successfulChecks: 1,
    failedChecks: task.devices.length > 1 ? 1 : 0,
    chargedUnits: chargeUnitsCount,
    refundedUnits: task.devices.length > 1 ? 1 : 0,
    tpLinkTaskId: slugId("tplink"),
    profileId: task.devices[0]?.profileId
  };

  const results: InspectionResult[] = [
    {
      id: slugId("result"),
      runId: run.id,
      taskId: task.id,
      qrCode: task.devices[0].qrCode,
      channelId: task.devices[0].channelId,
      algorithmId: task.algorithmIds[0],
      algorithmVersion: task.algorithmVersions[task.algorithmIds[0]] ?? "latest",
      imageUrl: task.devices[0].previewImage,
      imageTime: startedAt,
      result: "UNQUALIFIED",
      profileId: task.devices[0].profileId
    }
  ];

  const failures: InspectionFailure[] =
    task.devices.length > 1
      ? [
          {
            id: slugId("failure"),
            runId: run.id,
            taskId: task.id,
            qrCode: task.devices[1].qrCode,
            channelId: task.devices[1].channelId,
            algorithmId: task.algorithmIds[0],
            errorCode: -20571,
            message: "Device capture failed during simulated execution."
          }
        ]
      : [];

  const messages = results.map((result) => buildUnqualifiedMessage(task, run.id, result)).filter(Boolean) as MessageItem[];

  const mediaAssets: MediaAsset[] = messages.flatMap((message) =>
    message.imageId && message.imageUrl
      ? [
          {
            id: message.imageId,
            kind: "image",
            messageId: message.id,
            taskId: task.id,
            url: message.imageUrl,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString()
          }
        ]
      : []
  );

  const store = await getAppStore();
  await store.addRun(run);
  await store.addResults(results);
  await store.addFailures(failures);
  await store.addMessages(messages);
  for (const asset of mediaAssets) {
    await store.addMedia(asset);
  }
  await store.upsertTask({
    ...task,
    status: "enabled",
    updatedAt: new Date().toISOString(),
    nextRunAt: getNextRunAt(task.schedules, new Date(Date.now() + 1_000))
  });
  revalidateTaskReadModels();

  if (failures.length > 0) {
    await refundUnits(task.id, failures.length);
  }

  return { run, results, failures, messages };
}

export async function executeTask(taskId: string) {
  const details = await getTaskById(taskId);
  if (!details) throw new Error("Task not found.");

  const { task } = details;
  if (task.status === "config_error") {
    throw new Error(task.configErrorReason ?? "Task configuration is invalid.");
  }

  const resolvedDevices = await resolveTaskDevicesForExecution(task);
  const algorithms = await getAlgorithms();
  const { executableGroups, unsupportedGroups } = computeExecutableGroups(task, resolvedDevices, algorithms);
  const executableDevices = executableGroups.flatMap((group) => group.devices);
  const chargeUnitsCount = executableDevices.length * task.algorithmIds.length;
  const balance = await getServiceBalance();

  if (balance.remaining < chargeUnitsCount) {
    throw new Error("Insufficient remaining analysis balance.");
  }

  if (process.env.VITEST || process.env.NODE_ENV === "test" || !env.tpLinkAk || !env.tpLinkSk) {
    return simulateTaskExecution(
      { ...task, devices: executableDevices.length > 0 ? executableDevices : resolvedDevices },
      chargeUnitsCount
    );
  }

  if (chargeUnitsCount > 0) {
    await chargeUnits(task.id, chargeUnitsCount);
  }

  try {
    const store = await getAppStore();
    const runs: InspectionRun[] = [];
    const unsupportedFailures: InspectionFailure[] = [];

    for (const unsupportedGroup of unsupportedGroups) {
      const failedRun: InspectionRun = {
        id: slugId("run"),
        taskId: task.id,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: "failed",
        totalChecks: 0,
        successfulChecks: 0,
        failedChecks: unsupportedGroup.devices.length * unsupportedGroup.algorithmIds.length,
        chargedUnits: 0,
        refundedUnits: 0,
        profileId: unsupportedGroup.profileId
      };

      await store.addRun(failedRun);
      runs.push(failedRun);
      unsupportedFailures.push(
        ...buildProfileSupportFailures(
          task,
          failedRun.id,
          unsupportedGroup.profileId,
          unsupportedGroup.devices,
          unsupportedGroup.algorithmIds
        )
      );
    }

    if (unsupportedFailures.length > 0) {
      await store.addFailures(unsupportedFailures);
    }

    for (const { profileId, devices: profileDevices } of executableGroups) {
      const versionResponse = await setTpLinkAlgorithmVersions(
        {
          algorithmInfoList: Object.entries(task.algorithmVersions).map(([algorithmId, algorithmVersion]) => ({
            algorithmId,
            algorithmVersion
          }))
        },
        profileId
      );

      if (versionResponse.error_code !== 0) {
        throw new Error(`TP-LINK algorithm version setup failed: profile=${profileId}, error_code=${versionResponse.error_code}`);
      }

      if ((versionResponse.result?.failList?.length ?? 0) > 0) {
        const failSummary = versionResponse.result?.failList
          ?.map((item) => `${item.algorithmId}@${item.algorithmVersion}: ${item.error_code}`)
          .join("; ");
        throw new Error(`TP-LINK algorithm version setup partially failed: profile=${profileId}; ${failSummary}`);
      }

      const response = await startTpLinkInspectionTask(
        {
          callbackAddress: `${env.appBaseUrl}/api/callbacks/tplink/ai-task`,
          algorithmIdList: task.algorithmIds,
          type: 1,
          devList: buildTpLinkDevList({ ...task, devices: profileDevices })
        },
        profileId
      );

      if (response.error_code !== 0) {
        throw new Error(`TP-LINK inspection start failed: profile=${profileId}, error_code=${response.error_code}`);
      }

      if (!response.result?.taskId) {
        throw new Error(`TP-LINK did not return a taskId for profile=${profileId}: ${JSON.stringify(response)}`);
      }

      const run: InspectionRun = {
        id: slugId("run"),
        taskId: task.id,
        startedAt: new Date().toISOString(),
        status: "running",
        totalChecks: profileDevices.length * task.algorithmIds.length,
        successfulChecks: 0,
        failedChecks: 0,
        chargedUnits: profileDevices.length * task.algorithmIds.length,
        refundedUnits: 0,
        tpLinkTaskId: response.result.taskId,
        profileId
      };

      await store.addRun(run);
      runs.push(run);
    }

    await store.upsertTask({
      ...task,
      devices: resolvedDevices,
      status: executableGroups.length > 0 ? "running" : "enabled",
      updatedAt: new Date().toISOString(),
      nextRunAt: getNextRunAt(task.schedules, new Date(Date.now() + 1_000))
    });
    revalidateTaskReadModels();

    return { run: runs[0], runs, results: [], failures: unsupportedFailures, messages: [] };
  } catch (error) {
    if (chargeUnitsCount > 0) {
      await refundUnits(task.id, chargeUnitsCount);
    }
    throw error;
  }
}

export async function refreshTaskResults(taskId: string) {
  const details = await getTaskById(taskId);
  if (!details) {
    throw new Error("Task not found.");
  }

  if (details.task.status === "enabled") {
    return executeTask(taskId);
  }

  const targetRuns = details.runs.filter((item) => item.tpLinkTaskId && item.status === "running");
  if (targetRuns.length === 0) {
    return { ok: true, skipped: true, reason: "No running TP-LINK task." };
  }

  const callbackResults = [];
  for (const targetRun of targetRuns) {
    const response = await getTpLinkInspectionTaskResult(targetRun.tpLinkTaskId!, targetRun.profileId);
    const resultList =
      response.result?.taskResult?.map((item) => ({
        qrCode: item.qrCode,
        mac: item.mac,
        channelId: item.channelId,
        imageUrl: item.imageUrl,
        imageTime: item.imageTime,
        algorithmId: item.algorithmId,
        algorithmResult: item.algorithmResult
      })) ?? [];

    callbackResults.push(await handleTpLinkTaskCallback({ taskId: targetRun.tpLinkTaskId!, resultList }));
  }

  return { ok: true, callbacks: callbackResults };
}

export async function handleTpLinkTaskCallback(payload: {
  taskId: string;
  resultList?: Array<{
    mac?: string;
    qrCode?: string;
    qrcode?: string;
    channelId: number;
    imageUrl?: string;
    imageTime?: string;
    algorithmId: string;
    algorithmResult: "QUALIFIED" | "UNQUALIFIED" | "UNAVAILABLE";
    error_code?: number;
  }>;
}) {
  const snapshot = await getAppSnapshot({ includeDevices: false });
  const run = snapshot.runs.find((item) => item.tpLinkTaskId === payload.taskId);
  if (!run) {
    return { ok: false, reason: "Run not found for TP-LINK taskId." };
  }

  const task = snapshot.tasks.find((item) => item.id === run.taskId);
  if (!task) {
    return { ok: false, reason: "Task not found for callback run." };
  }

  const results: InspectionResult[] = [];
  const failures: InspectionFailure[] = [];
  const messages: MessageItem[] = [];
  const mediaAssets: MediaAsset[] = [];

  for (const item of payload.resultList ?? []) {
    const qrCode = item.qrCode ?? item.qrcode ?? "";
    if (item.error_code && item.error_code !== 0) {
      failures.push({
        id: slugId("failure"),
        runId: run.id,
        taskId: task.id,
        qrCode,
        channelId: item.channelId,
        algorithmId: item.algorithmId,
        errorCode: item.error_code,
        message: `TP-LINK callback execution failed, error code ${item.error_code}`
      });
      continue;
    }

    const result: InspectionResult = {
      id: slugId("result"),
      runId: run.id,
      taskId: task.id,
      qrCode,
      channelId: item.channelId,
      algorithmId: item.algorithmId,
      algorithmVersion: task.algorithmVersions[item.algorithmId] ?? "latest",
      imageUrl: item.imageUrl?.trim() ?? "",
      imageTime: parseTpLinkTime(item.imageTime),
      result: item.algorithmResult,
      profileId: run.profileId
    };
    results.push(result);

    const message = buildUnqualifiedMessage(task, run.id, result);
    if (message) {
      messages.push(message);
      if (message.imageId && message.imageUrl) {
        mediaAssets.push({
          id: message.imageId,
          kind: "image",
          messageId: message.id,
          taskId: task.id,
          url: message.imageUrl,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString()
        });
      }
    }
  }

  const refundedUnits = failures.length;
  if (refundedUnits > 0) {
    await refundUnits(task.id, refundedUnits);
  }

  const finalRun: InspectionRun = {
    ...run,
    completedAt: new Date().toISOString(),
    status: failures.length > 0 ? (results.length > 0 ? "partial_success" : "failed") : "completed",
    successfulChecks: results.length,
    failedChecks: failures.length,
    chargedUnits: run.chargedUnits,
    refundedUnits
  };

  const store = await getAppStore();
  await store.addResults(results);
  await store.addFailures(failures);
  await store.addMessages(messages);
  for (const asset of mediaAssets) {
    await store.addMedia(asset);
  }
  await store.updateRun(finalRun);

  const latestRuns =
    "getTaskRunsData" in store && typeof store.getTaskRunsData === "function"
      ? await store.getTaskRunsData(task.id)
      : (await store.snapshot(false)).runs.filter((item) => item.taskId === task.id);

  const hasOtherRunningRuns = latestRuns.some((item) => item.id !== run.id && item.status === "running");

  await store.upsertTask({
    ...task,
    status: hasOtherRunningRuns ? "running" : "enabled",
    updatedAt: new Date().toISOString(),
    nextRunAt: hasOtherRunningRuns ? task.nextRunAt : getNextRunAt(task.schedules, new Date(Date.now() + 1_000))
  });
  revalidateTaskReadModels();

  return { ok: true, resultCount: results.length, failureCount: failures.length, messageCount: messages.length };
}
