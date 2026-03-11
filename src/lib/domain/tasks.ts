import { getAppStore } from "@/lib/repositories/app-store";
import {
  bootstrapTpLinkMessageSubscription,
  getTpLinkInspectionTaskResult,
  setTpLinkAlgorithmVersions,
  startTpLinkInspectionTask
} from "@/lib/tplink/client";
import env from "@/lib/env";
import { slugId } from "@/lib/utils";

import { chargeUnits, getServiceBalance, refundUnits } from "@/lib/domain/service-balance";
import { getAppSnapshot } from "@/lib/domain/store";
import type {
  InspectionFailure,
  InspectionResult,
  InspectionRun,
  InspectionTask,
  MediaAsset,
  MessageItem,
  RegionShape
} from "@/lib/types";

type TaskInput = Pick<
  InspectionTask,
  "name" | "algorithmIds" | "algorithmVersions" | "devices" | "schedules" | "inspectionRule" | "messageRule" | "regionsByQrCode"
> & { id?: string };

function calculateTaskStatus(task: TaskInput): InspectionTask["status"] {
  if (task.devices.length === 0) return "config_error";
  return "enabled";
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

  return {
    id: slugId("msg"),
    taskId: task.id,
    runId,
    type: "inspection_unqualified",
    read: false,
    title: `${task.name}巡检不合格`,
    description:
      task.messageRule.triggerMode === "continuous_unqualified"
        ? `同一监控点一天内连续 ${task.messageRule.continuousCount ?? 3} 次被巡检为不合格时推送消息`
        : "监控点每次被巡检为不合格时推送消息",
    result: "UNQUALIFIED",
    qrCode: result.qrCode,
    channelId: result.channelId,
    algorithmId: result.algorithmId,
    createdAt: result.imageTime,
    imageUrl: result.imageUrl,
    imageId: result.imageUrl ? slugId("image") : undefined,
    videoTaskId: undefined
  };
}

export async function listTasks() {
  const snapshot = await getAppSnapshot();
  return snapshot.tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getTaskById(id: string) {
  const snapshot = await getAppSnapshot();
  const task = snapshot.tasks.find((item) => item.id === id) ?? null;
  if (!task) return null;

  return {
    task,
    runs: snapshot.runs.filter((item) => item.taskId === id),
    results: snapshot.results.filter((item) => item.taskId === id),
    failures: snapshot.failures.filter((item) => item.taskId === id),
    messages: snapshot.messages.filter((item) => item.taskId === id)
  };
}

export async function upsertTask(input: TaskInput) {
  const store = await getAppStore();
  const snapshot = await store.snapshot();
  const now = new Date().toISOString();
  const previous = input.id ? snapshot.tasks.find((item) => item.id === input.id) : null;
  const status = calculateTaskStatus(input);

  const task: InspectionTask = {
    id: input.id ?? slugId("task"),
    name: input.name,
    algorithmIds: input.algorithmIds,
    algorithmVersions: input.algorithmVersions,
    devices: input.devices,
    schedules: input.schedules,
    inspectionRule: input.inspectionRule,
    messageRule: input.messageRule,
    regionsByQrCode: input.regionsByQrCode,
    status,
    configErrorReason: status === "config_error" ? "任务中已无巡检设备" : undefined,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    nextRunAt: status === "enabled" ? new Date(Date.now() + 1000 * 60 * 30).toISOString() : undefined,
    closedAt: previous?.closedAt
  };

  await store.upsertTask(task);
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
  return task;
}

export async function deleteTask(id: string) {
  const store = await getAppStore();
  const snapshot = await store.snapshot();
  const task = snapshot.tasks.find((item) => item.id === id);
  if (!task) return null;

  if ("deleteTask" in store && typeof store.deleteTask === "function") {
    await store.deleteTask(id);
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
    tpLinkTaskId: slugId("tplink")
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
      result: "UNQUALIFIED"
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

  const messages = results
    .map((result) => buildUnqualifiedMessage(task, run.id, result))
    .filter((item): item is MessageItem => Boolean(item));

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
    nextRunAt: new Date(Date.now() + 1000 * 60 * 60).toISOString()
  });

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
    throw new Error(task.configErrorReason ?? "任务配置异常，无法执行。");
  }

  const balance = await getServiceBalance();
  const chargeUnitsCount = task.devices.length * task.algorithmIds.length;
  if (balance.remaining < chargeUnitsCount) {
    throw new Error("剩余分析次数不足，任务无法执行。");
  }

  if (process.env.VITEST || process.env.NODE_ENV === "test" || !env.tpLinkAk || !env.tpLinkSk) {
    return simulateTaskExecution(task, chargeUnitsCount);
  }

  await setTpLinkAlgorithmVersions({
    algorithmInfoList: Object.entries(task.algorithmVersions).map(([algorithmId, algorithmVersion]) => ({
      algorithmId,
      algorithmVersion
    }))
  });

  const response = await startTpLinkInspectionTask({
    callbackAddress: `${env.appBaseUrl}/api/callbacks/tplink/ai-task`,
    algorithmIdList: task.algorithmIds,
    type: 1,
    devList: task.devices.map((device) => ({
      qrCode: device.qrCode,
      channelId: device.channelId,
      regionConfig: toRegionConfig(task.regionsByQrCode[device.qrCode] ?? [])
    }))
  });

  const tpLinkTaskId = response.result?.taskId;
  if (!tpLinkTaskId) {
    throw new Error("TP-LINK 未返回 taskId。");
  }

  await chargeUnits(task.id, chargeUnitsCount);

  const run: InspectionRun = {
    id: slugId("run"),
    taskId: task.id,
    startedAt: new Date().toISOString(),
    status: "running",
    totalChecks: chargeUnitsCount,
    successfulChecks: 0,
    failedChecks: 0,
    chargedUnits: chargeUnitsCount,
    refundedUnits: 0,
    tpLinkTaskId
  };

  const store = await getAppStore();
  await store.addRun(run);
  await store.upsertTask({
    ...task,
    status: "running",
    updatedAt: new Date().toISOString(),
    nextRunAt: new Date(Date.now() + 1000 * 60 * 60).toISOString()
  });

  return { run, results: [], failures: [], messages: [] };
}

export async function refreshTaskResults(taskId: string) {
  const details = await getTaskById(taskId);
  if (!details) {
    throw new Error("Task not found.");
  }

  const targetRun = details.runs.find((item) => item.tpLinkTaskId && item.status === "running");
  if (!targetRun?.tpLinkTaskId) {
    return { ok: true, skipped: true, reason: "No running TP-LINK task." };
  }

  const response = await getTpLinkInspectionTaskResult(targetRun.tpLinkTaskId);
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

  return handleTpLinkTaskCallback({ taskId: targetRun.tpLinkTaskId, resultList });
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
  const snapshot = await getAppSnapshot();
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
        message: `TP-LINK 回调执行失败，错误码 ${item.error_code}`
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
      result: item.algorithmResult
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
  await store.upsertTask({
    ...task,
    status: "enabled",
    updatedAt: new Date().toISOString()
  });

  return { ok: true, resultCount: results.length, failureCount: failures.length, messageCount: messages.length };
}
