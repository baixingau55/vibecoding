import { createMockSnapshot } from "@/lib/mock-data";
import { getAlgorithms } from "@/lib/domain/algorithms";
import { getAppSnapshot } from "@/lib/domain/store";
import { upsertTask } from "@/lib/domain/tasks";
import { dedupeDevicesByIdentity } from "@/lib/domain/device-reconciliation";
import { slugId } from "@/lib/utils";
import type { Algorithm, DeviceRef, InspectionRule, InspectionSchedule, MessageRule } from "@/lib/types";

export type AgentUserAction = "cancel" | "confirm" | "continue";

export type CreateTaskDraftRequest = {
  rawUserQuery: string;
  userAction: AgentUserAction;
  draftId?: string;
  draftState?: string;
};

export type CreateTaskDraftResponse = {
  status: "needs_more_info" | "ready_to_confirm" | "error";
  draftId: string;
  suggestedReply: string;
  draftState: string;
};

export type ConfirmCreateTaskRequest = {
  rawUserQuery: string;
  userAction: AgentUserAction;
  draftId?: string;
  draftState?: string;
};

export type ConfirmCreateTaskResponse = {
  status: "success" | "error";
  taskId: string;
  taskName: string;
  detailPath: string;
  nextRunAt: string;
  suggestedReply: string;
};

type CreateTaskDraftState = {
  taskName?: string;
  algorithmId?: string;
  algorithmName?: string;
  algorithmVersion?: string;
  scheduleText?: string;
  schedules?: InspectionSchedule[];
  devices?: DeviceRef[];
  inspectionRule?: InspectionRule;
  messageRule?: MessageRule;
};

type AlgorithmPreset = {
  id: string;
  fallbackName: string;
  keywords: string[];
  messageContent: string;
};

type AlgorithmCatalogItem = {
  id: string;
  name: string;
  latestVersion: string;
  keywords: string[];
  messageContent: string;
};

const EVERYDAY_REPEAT_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WORKDAY_REPEAT_DAYS = [1, 2, 3, 4, 5];
const WEEKEND_REPEAT_DAYS = [0, 6];

const ALGORITHM_PRESETS: Record<string, AlgorithmPreset> = {
  "away-from-post-detection": {
    id: "away-from-post-detection",
    fallbackName: "离岗检测",
    keywords: ["离岗", "空岗", "脱岗"],
    messageContent: "检测到离岗行为"
  },
  "smoking-detection": {
    id: "smoking-detection",
    fallbackName: "吸烟检测",
    keywords: ["吸烟", "抽烟", "香烟"],
    messageContent: "检测到吸烟行为"
  },
  "helmet-detection": {
    id: "helmet-detection",
    fallbackName: "安全帽检测",
    keywords: ["安全帽", "未佩戴安全帽", "不戴安全帽"],
    messageContent: "检测到未佩戴安全帽行为"
  },
  "vehicle-parking-detection-algorithm": {
    id: "vehicle-parking-detection-algorithm",
    fallbackName: "停车检测",
    keywords: ["停车", "车辆停放", "违停"],
    messageContent: "检测到车辆停放行为"
  }
};

const WEEKDAY_LABELS: Record<number, string> = {
  0: "周日",
  1: "周一",
  2: "周二",
  3: "周三",
  4: "周四",
  5: "周五",
  6: "周六"
};

const CHINESE_WEEKDAY_TO_NUMBER: Record<string, number> = {
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6
};

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").replace(/[，。；、,.!！?？:：/\\\-()（）]/g, "");
}

function collectMatchTokens(value: string) {
  return Array.from(new Set(value.match(/[A-Za-z]+\d+|[A-Za-z]+|\d+|[\u4e00-\u9fa5]{2,}/g) ?? [])).filter(
    (token) => token.trim().length >= 2
  );
}

function formatTime(hour: number, minute: number) {
  return `${`${hour}`.padStart(2, "0")}:${`${minute}`.padStart(2, "0")}`;
}

function formatReadableDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${valueByType.year}-${valueByType.month}-${valueByType.day} ${valueByType.hour}:${valueByType.minute}`;
}

function serializeDraftState(draftState: CreateTaskDraftState) {
  return JSON.stringify(draftState);
}

function parseDraftState(rawDraftState: string | undefined) {
  if (!rawDraftState?.trim()) {
    return {} as CreateTaskDraftState;
  }

  const parsed = JSON.parse(rawDraftState) as CreateTaskDraftState;
  return {
    ...parsed,
    schedules: parsed.schedules ?? [],
    devices: parsed.devices ?? []
  };
}

async function getAlgorithmCatalog(): Promise<AlgorithmCatalogItem[]> {
  const liveAlgorithms = await getAlgorithms();
  const fallbackAlgorithms = createMockSnapshot().algorithms;
  const algorithms = liveAlgorithms.length > 0 ? liveAlgorithms : fallbackAlgorithms;

  return algorithms.map((algorithm: Algorithm) => {
    const preset = ALGORITHM_PRESETS[algorithm.id];
    return {
      id: algorithm.id,
      name: algorithm.name,
      latestVersion: algorithm.latestVersion,
      keywords: Array.from(new Set([algorithm.name, algorithm.id, ...(preset?.keywords ?? [])])),
      messageContent: preset?.messageContent ?? `检测到${algorithm.name}异常`
    };
  });
}

function matchAlgorithm(rawUserQuery: string, algorithms: AlgorithmCatalogItem[]) {
  const normalizedQuery = normalizeText(rawUserQuery);
  let bestMatch: AlgorithmCatalogItem | null = null;
  let bestScore = 0;

  for (const algorithm of algorithms) {
    let score = 0;

    for (const keyword of algorithm.keywords) {
      const normalizedKeyword = normalizeText(keyword);
      if (!normalizedKeyword) continue;
      if (normalizedQuery.includes(normalizedKeyword)) {
        score = Math.max(score, normalizedKeyword.length * 10);
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = algorithm;
    }
  }

  return bestMatch;
}

function parseSchedule(rawUserQuery: string) {
  const timeMatch = rawUserQuery.match(
    /(早上|上午|中午|下午|晚上|傍晚)?\s*(\d{1,2})(?:(?:[:：](\d{1,2}))|(?:(?:点|时)(\d{1,2})?分?)|点半)/
  );
  if (!timeMatch) return null;

  const period = timeMatch[1] ?? "";
  let hour = Number(timeMatch[2]);
  let minute = 0;
  if (timeMatch[3]) minute = Number(timeMatch[3]);
  if (timeMatch[4]) minute = Number(timeMatch[4]);
  if (timeMatch[0].includes("点半")) minute = 30;
  if (Number.isNaN(hour) || Number.isNaN(minute) || hour > 23 || minute > 59) {
    return null;
  }

  if (["下午", "晚上", "傍晚"].includes(period) && hour < 12) hour += 12;
  if (period === "中午" && hour < 11) hour += 12;

  let repeatDays = EVERYDAY_REPEAT_DAYS;
  let repeatLabel = "每天";

  if (/工作日/.test(rawUserQuery)) {
    repeatDays = WORKDAY_REPEAT_DAYS;
    repeatLabel = "工作日";
  } else if (/周末/.test(rawUserQuery)) {
    repeatDays = WEEKEND_REPEAT_DAYS;
    repeatLabel = "周末";
  } else {
    const dayMatch = rawUserQuery.match(/(?:周|星期)([一二三四五六日天])/);
    if (dayMatch) {
      const day = CHINESE_WEEKDAY_TO_NUMBER[dayMatch[1]];
      repeatDays = [day];
      repeatLabel = `每${WEEKDAY_LABELS[day]}`;
    }
  }

  const startTime = formatTime(hour, minute);
  return {
    schedules: [{ type: "time_point" as const, startTime, repeatDays }],
    scheduleText: `${repeatLabel} ${startTime}`
  };
}

function scoreDeviceMatch(rawUserQuery: string, device: DeviceRef) {
  const normalizedQuery = normalizeText(rawUserQuery);
  const normalizedName = normalizeText(device.name);
  const normalizedGroup = normalizeText(device.groupName);

  let score = 0;
  if (normalizedQuery.includes(normalizeText(device.qrCode))) score += 120;
  if (normalizedName && normalizedQuery.includes(normalizedName)) score += 80;
  if (normalizedGroup && normalizedQuery.includes(normalizedGroup)) score += 50;

  for (const token of collectMatchTokens(`${device.name} ${device.groupName} ${device.qrCode}`)) {
    if (normalizedQuery.includes(normalizeText(token))) score += 10;
  }

  return score;
}

function matchDevices(rawUserQuery: string, devices: DeviceRef[]) {
  if (!rawUserQuery.trim()) return [];
  if (/全部设备|所有设备/.test(rawUserQuery)) {
    return dedupeDevicesByIdentity(devices);
  }

  const scored = devices
    .map((device) => ({ device, score: scoreDeviceMatch(rawUserQuery, device) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  if (scored.length === 0) return [];
  const topScore = scored[0].score;
  return dedupeDevicesByIdentity(
    scored.filter((item) => item.score >= Math.max(10, topScore - 20)).map((item) => item.device)
  );
}

function extractExplicitTaskName(rawUserQuery: string) {
  const match = rawUserQuery.match(/(?:叫|名为|命名为)([^，。；,;]+?)(?:任务|$)/);
  return match?.[1]?.trim() ?? "";
}

function deriveTaskName(draftState: CreateTaskDraftState) {
  if (draftState.taskName?.trim()) return draftState.taskName.trim();

  const parts = [draftState.scheduleText?.trim(), draftState.algorithmName?.trim()].filter(Boolean);
  if (parts.length === 0) return "";
  return `${parts.join(" ")}任务`;
}

function buildSuggestedReplyForMissingFields(missingFields: string[]) {
  const labels = missingFields.map((field) => {
    switch (field) {
      case "algorithm":
        return "巡检目标";
      case "schedule":
        return "执行时间";
      case "device":
        return "设备范围";
      default:
        return field;
    }
  });

  const suffixByField: Record<string, string> = {
    algorithm: "想检查什么行为",
    schedule: "希望什么时候执行",
    device: "要检查哪些设备"
  };

  const followUps = missingFields.map((field) => suffixByField[field]).filter(Boolean);
  return `还差${labels.join("、")}。${followUps.join("，")}？`;
}

function buildPreviewReply(draftState: CreateTaskDraftState) {
  const deviceSummary = draftState.devices?.map((device) => device.name).join("、") ?? "未匹配设备";
  return `我已经整理好待创建任务：任务名称：${draftState.taskName}；巡检目标：${draftState.algorithmName}；执行时间：${draftState.scheduleText}；检查设备：${deviceSummary}。若确认无误，请回复“确认创建”。`;
}

function buildDefaultMessageRule(algorithmName: string, messageContent: string): MessageRule {
  return {
    enabled: true,
    triggerMode: "every_unqualified",
    customMessageType: algorithmName,
    customMessageContent: messageContent
  };
}

function listMissingDraftFields(draftState: CreateTaskDraftState) {
  const missingFields: string[] = [];
  if (!draftState.algorithmId) missingFields.push("algorithm");
  if (!draftState.schedules || draftState.schedules.length === 0 || !draftState.scheduleText) missingFields.push("schedule");
  if (!draftState.devices || draftState.devices.length === 0) missingFields.push("device");
  return missingFields;
}

function validateCompleteDraftState(draftState: CreateTaskDraftState) {
  const missingFields = listMissingDraftFields(draftState);
  if (missingFields.length > 0) {
    return { ok: false as const, missingFields };
  }

  return { ok: true as const };
}

export async function createTaskDraft(input: CreateTaskDraftRequest): Promise<CreateTaskDraftResponse> {
  try {
    const snapshot = await getAppSnapshot({ includeDevices: true });
    const algorithms = await getAlgorithmCatalog();
    const draftState = parseDraftState(input.draftState);

    const explicitTaskName = extractExplicitTaskName(input.rawUserQuery);
    if (explicitTaskName) {
      draftState.taskName = explicitTaskName;
    }

    const matchedAlgorithm = matchAlgorithm(input.rawUserQuery, algorithms);
    if (matchedAlgorithm) {
      draftState.algorithmId = matchedAlgorithm.id;
      draftState.algorithmName = matchedAlgorithm.name;
      draftState.algorithmVersion = matchedAlgorithm.latestVersion;
      draftState.inspectionRule = { resultMode: "detect_target" };
      draftState.messageRule = buildDefaultMessageRule(matchedAlgorithm.name, matchedAlgorithm.messageContent);
    }

    const matchedSchedule = parseSchedule(input.rawUserQuery);
    if (matchedSchedule) {
      draftState.schedules = matchedSchedule.schedules;
      draftState.scheduleText = matchedSchedule.scheduleText;
    }

    const matchedDevices = matchDevices(input.rawUserQuery, snapshot.devices);
    if (matchedDevices.length > 0) {
      draftState.devices = matchedDevices;
    }

    draftState.taskName = deriveTaskName(draftState);
    const nextDraftId = input.draftId?.trim() || slugId("draft");
    const missingFields = listMissingDraftFields(draftState);

    if (missingFields.length > 0) {
      return {
        status: "needs_more_info",
        draftId: nextDraftId,
        suggestedReply: buildSuggestedReplyForMissingFields(missingFields),
        draftState: serializeDraftState(draftState)
      };
    }

    return {
      status: "ready_to_confirm",
      draftId: nextDraftId,
      suggestedReply: buildPreviewReply(draftState),
      draftState: serializeDraftState(draftState)
    };
  } catch (error) {
    console.error("[agent/tasks/create-draft] failed to build draft", error);
    return {
      status: "error",
      draftId: "",
      suggestedReply: "任务草稿生成失败，请稍后重试。",
      draftState: ""
    };
  }
}

export async function confirmCreateTask(input: ConfirmCreateTaskRequest): Promise<ConfirmCreateTaskResponse> {
  try {
    if (input.userAction !== "confirm") {
      return {
        status: "error",
        taskId: "",
        taskName: "",
        detailPath: "",
        nextRunAt: "",
        suggestedReply: "当前还没有收到明确的确认创建指令。"
      };
    }

    if (!input.draftId?.trim() || !input.draftState?.trim()) {
      return {
        status: "error",
        taskId: "",
        taskName: "",
        detailPath: "",
        nextRunAt: "",
        suggestedReply: "任务创建失败，请检查配置后重试。"
      };
    }

    const draftState = parseDraftState(input.draftState);
    const validation = validateCompleteDraftState(draftState);
    if (!validation.ok) {
      return {
        status: "error",
        taskId: "",
        taskName: "",
        detailPath: "",
        nextRunAt: "",
        suggestedReply: "任务信息还不完整，请先补全后再确认创建。"
      };
    }

    const task = await upsertTask({
      name: deriveTaskName(draftState),
      algorithmIds: [draftState.algorithmId!],
      algorithmVersions: { [draftState.algorithmId!]: draftState.algorithmVersion ?? "latest" },
      devices: draftState.devices ?? [],
      schedules: draftState.schedules ?? [],
      inspectionRule: draftState.inspectionRule ?? { resultMode: "detect_target" },
      messageRule:
        draftState.messageRule ??
        buildDefaultMessageRule(draftState.algorithmName ?? draftState.algorithmId!, "检测到异常行为"),
      regionsByQrCode: {}
    });

    const detailPath = `/tasks/${task.id}`;
    const nextRunAt = task.nextRunAt ?? "";
    const readableNextRunAt = nextRunAt ? formatReadableDateTime(nextRunAt) : "待计算";

    return {
      status: "success",
      taskId: task.id,
      taskName: task.name,
      detailPath,
      nextRunAt,
      suggestedReply: `任务已创建成功。任务名称：${task.name}；下次执行时间：${readableNextRunAt}。你可以到 ${detailPath} 查看详情。`
    };
  } catch (error) {
    console.error("[agent/tasks/confirm-create] failed to create task", error);
    return {
      status: "error",
      taskId: "",
      taskName: "",
      detailPath: "",
      nextRunAt: "",
      suggestedReply: "任务创建失败，请检查配置后重试。"
    };
  }
}
