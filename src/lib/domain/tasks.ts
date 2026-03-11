import { getMemoryStore } from "@/lib/repositories/memory-store";
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
  const store = getMemoryStore();
  const now = new Date().toISOString();
  const previous = input.id ? store.snapshot().tasks.find((item) => item.id === input.id) : null;
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
    nextRunAt: status === "enabled" ? new Date(Date.now() + 1000 * 60 * 30).toISOString() : undefined
  };

  store.upsertTask(task);
  return task;
}

export async function closeTask(id: string) {
  const details = await getTaskById(id);
  if (!details) return null;

  const task = {
    ...details.task,
    status: "disabled" as const,
    closedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  getMemoryStore().upsertTask(task);
  return task;
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

  const run: InspectionRun = {
    id: slugId("run"),
    taskId: task.id,
    startedAt: new Date().toISOString(),
    status: "running",
    totalChecks: chargeUnitsCount,
    successfulChecks: 0,
    failedChecks: 0,
    chargedUnits: 0,
    refundedUnits: 0
  };
  getMemoryStore().addRun(run);

  try {
    await setTpLinkAlgorithmVersions({
      algorithmInfoList: Object.entries(task.algorithmVersions).map(([algorithmId, algorithmVersion]) => ({
        algorithmId,
        algorithmVersion
      }))
    });
  } catch {
    // Keep offline/demo flow working when TP-LINK configuration is not available.
  }

  let tpLinkTaskId = "";
  try {
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

    tpLinkTaskId = response.result?.taskId ?? "";
  } catch {
    // Use local simulated execution if TP-LINK call cannot be completed yet.
  }

  await chargeUnits(task.id, chargeUnitsCount);

  const simulatedResults: InspectionResult[] = [];
  const simulatedFailures: InspectionFailure[] = [];
  const simulatedMessages: MessageItem[] = [];

  for (const device of task.devices) {
    for (const algorithmId of task.algorithmIds) {
      const resultValue = simulatedResults.length % 3 === 1 ? "UNQUALIFIED" : "QUALIFIED";
      simulatedResults.push({
        id: slugId("result"),
        runId: run.id,
        taskId: task.id,
        qrCode: device.qrCode,
        channelId: device.channelId,
        algorithmId,
        algorithmVersion: task.algorithmVersions[algorithmId] ?? "latest",
        imageUrl: device.previewImage,
        imageTime: new Date().toISOString(),
        result: resultValue
      });

      if (resultValue === "UNQUALIFIED" && task.messageRule.enabled) {
        simulatedMessages.push({
          id: slugId("msg"),
          taskId: task.id,
          runId: run.id,
          type: "inspection_unqualified",
          read: false,
          title: `${task.name} 巡检不合格`,
          description:
            task.messageRule.triggerMode === "continuous_unqualified"
              ? `同一监控点一天内连续 ${task.messageRule.continuousCount ?? 3} 次被巡检为不合格时推送消息`
              : "监控点每次被巡检为不合格时推送消息",
          result: "UNQUALIFIED",
          qrCode: device.qrCode,
          channelId: device.channelId,
          algorithmId,
          createdAt: new Date().toISOString(),
          imageUrl: device.previewImage,
          imageId: slugId("image"),
          videoTaskId: slugId("video")
        });
      }
    }
  }

  if (task.devices.length > 1) {
    const failedDevice = task.devices.at(-1);
    if (failedDevice) {
      simulatedFailures.push({
        id: slugId("failure"),
        runId: run.id,
        taskId: task.id,
        qrCode: failedDevice.qrCode,
        channelId: failedDevice.channelId,
        algorithmId: task.algorithmIds[0],
        errorCode: -20571,
        message: "设备抓图失败，已返还次数"
      });
    }
  }

  if (simulatedFailures.length > 0) {
    await refundUnits(task.id, simulatedFailures.length);
  }

  const finalRun: InspectionRun = {
    ...run,
    completedAt: new Date().toISOString(),
    status: simulatedFailures.length > 0 ? "partial_success" : "completed",
    successfulChecks: simulatedResults.length,
    failedChecks: simulatedFailures.length,
    chargedUnits: chargeUnitsCount,
    refundedUnits: simulatedFailures.length,
    tpLinkTaskId
  };

  const store = getMemoryStore();
  store.updateRun(finalRun);
  store.addResults(simulatedResults);
  store.addFailures(simulatedFailures);
  store.addMessages(simulatedMessages);
  store.upsertTask({
    ...task,
    status: "enabled",
    updatedAt: new Date().toISOString(),
    nextRunAt: new Date(Date.now() + 1000 * 60 * 60).toISOString()
  });

  if (tpLinkTaskId) {
    try {
      await getTpLinkInspectionTaskResult(tpLinkTaskId);
    } catch {
      // Safe to ignore in demo mode; callback or polling can be retried later.
    }
  }

  return { run: finalRun, results: simulatedResults, failures: simulatedFailures, messages: simulatedMessages };
}
