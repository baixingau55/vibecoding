import { getAlgorithms } from "@/lib/domain/algorithms";
import { upsertTask } from "@/lib/domain/tasks";
import { createMockSnapshot } from "@/lib/mock-data";
import { getAppStore } from "@/lib/repositories/app-store";
import { dedupeDevicesByIdentity } from "@/lib/domain/device-reconciliation";
import type {
  Algorithm,
  CreateTaskConversationDraft,
  DeviceRef,
  InspectionRule,
  InspectionSchedule,
  MessageRule
} from "@/lib/types";

export type AgentUserAction = "cancel" | "confirm" | "continue";

export type CreateTaskDraftRequest = {
  conversationId: string;
  rawUserQuery: string;
  userAction: AgentUserAction;
};

export type CreateTaskDraftResponse = {
  status: "needs_more_info" | "ready_to_confirm" | "error";
  conversationId: string;
  suggestedReply: string;
};

export type ConfirmCreateTaskRequest = {
  conversationId: string;
  rawUserQuery: string;
  userAction: AgentUserAction;
};

export type ConfirmCreateTaskResponse = {
  status: "success" | "error";
  conversationId: string;
  taskId: string;
  taskName: string;
  detailPath: string;
  nextRunAt: string;
  suggestedReply: string;
};

type AlgorithmPreset = {
  keywords: string[];
  fallbackName: string;
  messageContent: string;
};

type AlgorithmCatalogItem = {
  id: string;
  name: string;
  latestVersion: string;
  keywords: string[];
  aliases: string[];
  messageContent: string;
};

const EVERYDAY_REPEAT_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WORKDAY_REPEAT_DAYS = [1, 2, 3, 4, 5];
const WEEKEND_REPEAT_DAYS = [0, 6];

const ALGORITHM_PRESETS: Record<string, AlgorithmPreset> = {
  "away-from-post-detection": {
    fallbackName: "离岗检测",
    keywords: ["离岗", "空岗", "脱岗", "在岗"],
    messageContent: "检测到离岗行为"
  },
  "smoking-detection": {
    fallbackName: "吸烟检测",
    keywords: ["吸烟", "抽烟", "香烟"],
    messageContent: "检测到吸烟行为"
  },
  "helmet-detection": {
    fallbackName: "安全帽检测",
    keywords: ["安全帽", "未戴安全帽", "没戴安全帽"],
    messageContent: "检测到未佩戴安全帽行为"
  },
  "vehicle-parking-detection-algorithm": {
    fallbackName: "停车检测",
    keywords: ["停车", "违停", "停放"],
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
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。；、,.!?？！（）()【】\[\]:'"“”‘’\-]/g, "");
}

function collectMatchTokens(value: string) {
  return Array.from(new Set(value.match(/[A-Za-z]+\d+|[A-Za-z]+|\d+|[\u4e00-\u9fa5]{2,}/g) ?? [])).filter(
    (token) => token.trim().length >= 2
  );
}

function buildAlgorithmAliases(algorithm: Algorithm, fallbackName?: string) {
  return Array.from(
    new Set(
      [
        algorithm.name,
        fallbackName ?? "",
        algorithm.id,
        ...(algorithm.profileNames ?? []),
        ...collectMatchTokens(algorithm.name),
        ...collectMatchTokens(fallbackName ?? ""),
        ...collectMatchTokens(algorithm.id),
        ...(algorithm.profileNames ?? []).flatMap((value) => collectMatchTokens(value))
      ].filter((value) => value.trim().length > 0)
    )
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

async function getAlgorithmCatalog(): Promise<AlgorithmCatalogItem[]> {
  const liveAlgorithms = await getAlgorithms();
  const fallbackAlgorithms = createMockSnapshot().algorithms;
  const algorithms = liveAlgorithms.length > 0 ? liveAlgorithms : fallbackAlgorithms;

  return algorithms.map((algorithm: Algorithm) => {
    const preset = ALGORITHM_PRESETS[algorithm.id];
    const aliases = buildAlgorithmAliases(algorithm, preset?.fallbackName);
    return {
      id: algorithm.id,
      name: preset?.fallbackName ?? algorithm.name,
      latestVersion: algorithm.latestVersion,
      keywords: Array.from(new Set([...aliases, ...(preset?.keywords ?? [])])).filter(Boolean),
      aliases,
      messageContent: preset?.messageContent ?? `?????${preset?.fallbackName ?? algorithm.name}???`
    };
  });
}

function matchAlgorithm(rawUserQuery: string, algorithms: AlgorithmCatalogItem[]) {
  const normalizedQuery = normalizeText(rawUserQuery);
  let bestMatch: AlgorithmCatalogItem | null = null;
  let bestScore = 0;

  for (const algorithm of algorithms) {
    let score = 0;

    for (const alias of algorithm.aliases) {
      const normalizedAlias = normalizeText(alias);
      if (!normalizedAlias) continue;

      if (normalizedQuery === normalizedAlias) {
        score = Math.max(score, normalizedAlias.length * 40);
        continue;
      }

      if (normalizedQuery.includes(normalizedAlias)) {
        score = Math.max(score, normalizedAlias.length * 25);
      }
    }

    for (const keyword of algorithm.keywords) {
      const normalizedKeyword = normalizeText(keyword);
      if (!normalizedKeyword) continue;
      if (normalizedQuery.includes(normalizedKeyword)) {
        score = Math.max(score, normalizedKeyword.length * 10);
      }
    }
    if (score > bestScore) {
      bestMatch = algorithm;
      bestScore = score;
    }
  }

  return bestMatch;
}

function parseSchedule(rawUserQuery: string) {
  const halfHourMatch = rawUserQuery.match(/(早上|上午|中午|下午|晚上|傍晚)?\s*(\d{1,2})点半/);
  const timeMatch =
    halfHourMatch ??
    rawUserQuery.match(/(早上|上午|中午|下午|晚上|傍晚)?\s*(\d{1,2})(?:[:：](\d{1,2})|点(?:(\d{1,2})分?)?)?/);

  if (!timeMatch) return null;

  const period = timeMatch[1] ?? "";
  let hour = Number(timeMatch[2]);
  let minute = 0;

  if (halfHourMatch) {
    minute = 30;
  } else {
    if (timeMatch[3]) minute = Number(timeMatch[3]);
    if (timeMatch[4]) minute = Number(timeMatch[4]);
  }

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
  const match = rawUserQuery.match(/(?:任务名为|命名为)([^，。；,;]+?)(?:任务|$)/);
  return match?.[1]?.trim() ?? "";
}

function deriveTaskName(draft: Partial<CreateTaskConversationDraft>) {
  if (draft.taskName?.trim()) return draft.taskName.trim();

  const parts = [draft.scheduleText?.trim(), draft.algorithmName?.trim()].filter(Boolean);
  if (parts.length === 0) return "";
  return `${parts.join(" ")}任务`;
}

function buildDefaultMessageRule(algorithmName: string, messageContent: string): MessageRule {
  return {
    enabled: true,
    triggerMode: "every_unqualified",
    customMessageType: algorithmName,
    customMessageContent: messageContent
  };
}

function listMissingDraftFields(draft: Partial<CreateTaskConversationDraft>) {
  const missingFields: string[] = [];
  if (!draft.algorithmId) missingFields.push("algorithm");
  if (!draft.schedules || draft.schedules.length === 0 || !draft.scheduleText) missingFields.push("schedule");
  if (!draft.devices || draft.devices.length === 0) missingFields.push("device");
  return missingFields;
}

function buildMissingFieldsReply(missingFields: string[]) {
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

  const followUps = missingFields.map((field) => {
    switch (field) {
      case "algorithm":
        return "想检查什么行为";
      case "schedule":
        return "希望什么时候执行";
      case "device":
        return "要检查哪些设备";
      default:
        return "";
    }
  }).filter(Boolean);

  return `还差${labels.join("、")}。${followUps.join("，")}？`;
}

function buildPreviewReply(draft: Partial<CreateTaskConversationDraft>) {
  const deviceSummary = draft.devices?.map((device) => device.name).join("、") ?? "未匹配设备";
  return `我已经整理好待创建任务：任务名称：${draft.taskName}；巡检目标：${draft.algorithmName}；执行时间：${draft.scheduleText}；检查设备：${deviceSummary}。若确认无误，请回复“确认创建”。`;
}

function createEmptyDraft(conversationId: string): CreateTaskConversationDraft {
  return {
    conversationId,
    schedules: [],
    devices: [],
    updatedAt: new Date().toISOString()
  };
}

function validateCompleteDraft(draft: Partial<CreateTaskConversationDraft>) {
  const missingFields = listMissingDraftFields(draft);
  if (missingFields.length > 0) {
    return { ok: false as const, missingFields };
  }
  return { ok: true as const };
}

export async function createTaskDraft(input: CreateTaskDraftRequest): Promise<CreateTaskDraftResponse> {
  try {
    const store = await getAppStore();

    if (input.userAction === "cancel") {
      await store.deleteCreateTaskDraft(input.conversationId);
      return {
        status: "error",
        conversationId: input.conversationId,
        suggestedReply: "已取消本次创建任务。"
      };
    }

    const snapshot = await store.snapshot(true);
    const algorithms = await getAlgorithmCatalog();
    const persistedDraft = await store.getCreateTaskDraft(input.conversationId);
    const draft: CreateTaskConversationDraft = {
      ...createEmptyDraft(input.conversationId),
      ...(persistedDraft ?? {})
    };

    const explicitTaskName = extractExplicitTaskName(input.rawUserQuery);
    if (explicitTaskName) {
      draft.taskName = explicitTaskName;
    }

    const matchedAlgorithm = matchAlgorithm(input.rawUserQuery, algorithms);
    if (matchedAlgorithm) {
      draft.algorithmId = matchedAlgorithm.id;
      draft.algorithmName = matchedAlgorithm.name;
      draft.algorithmVersion = matchedAlgorithm.latestVersion;
      draft.inspectionRule = { resultMode: "detect_target" };
      draft.messageRule = buildDefaultMessageRule(matchedAlgorithm.name, matchedAlgorithm.messageContent);
    }

    const matchedSchedule = parseSchedule(input.rawUserQuery);
    if (matchedSchedule) {
      draft.schedules = matchedSchedule.schedules;
      draft.scheduleText = matchedSchedule.scheduleText;
    }

    const matchedDevices = matchDevices(input.rawUserQuery, snapshot.devices);
    if (matchedDevices.length > 0) {
      draft.devices = matchedDevices;
    }

    draft.taskName = deriveTaskName(draft);
    draft.updatedAt = new Date().toISOString();

    const missingFields = listMissingDraftFields(draft);
    await store.upsertCreateTaskDraft(draft);

    if (missingFields.length > 0) {
      return {
        status: "needs_more_info",
        conversationId: input.conversationId,
        suggestedReply: buildMissingFieldsReply(missingFields)
      };
    }

    return {
      status: "ready_to_confirm",
      conversationId: input.conversationId,
      suggestedReply: buildPreviewReply(draft)
    };
  } catch (error) {
    console.error("[agent/tasks/create-draft] failed to build draft", error);
    return {
      status: "error",
      conversationId: input.conversationId,
      suggestedReply: "任务草稿生成失败，请稍后重试。"
    };
  }
}

export async function confirmCreateTask(input: ConfirmCreateTaskRequest): Promise<ConfirmCreateTaskResponse> {
  try {
    if (input.userAction !== "confirm") {
      return {
        status: "error",
        conversationId: input.conversationId,
        taskId: "",
        taskName: "",
        detailPath: "",
        nextRunAt: "",
        suggestedReply: "当前还没有收到明确的确认创建指令。"
      };
    }

    const store = await getAppStore();
    const draft = await store.getCreateTaskDraft(input.conversationId);
    if (!draft) {
      return {
        status: "error",
        conversationId: input.conversationId,
        taskId: "",
        taskName: "",
        detailPath: "",
        nextRunAt: "",
        suggestedReply: "未找到待确认的任务草稿，请先描述要创建的任务。"
      };
    }

    const validation = validateCompleteDraft(draft);
    if (!validation.ok) {
      return {
        status: "error",
        conversationId: input.conversationId,
        taskId: "",
        taskName: "",
        detailPath: "",
        nextRunAt: "",
        suggestedReply: "任务信息还不完整，请先补全后再确认创建。"
      };
    }

    const task = await upsertTask({
      name: deriveTaskName(draft),
      algorithmIds: [draft.algorithmId!],
      algorithmVersions: { [draft.algorithmId!]: draft.algorithmVersion ?? "latest" },
      devices: draft.devices ?? [],
      schedules: draft.schedules ?? [],
      inspectionRule: draft.inspectionRule ?? ({ resultMode: "detect_target" } satisfies InspectionRule),
      messageRule:
        draft.messageRule ??
        buildDefaultMessageRule(draft.algorithmName ?? draft.algorithmId!, "检测到异常行为"),
      regionsByQrCode: {}
    });

    await store.deleteCreateTaskDraft(input.conversationId);

    const detailPath = `/tasks/${task.id}`;
    const nextRunAt = task.nextRunAt ?? "";
    const readableNextRunAt = nextRunAt ? formatReadableDateTime(nextRunAt) : "待计算";

    return {
      status: "success",
      conversationId: input.conversationId,
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
      conversationId: input.conversationId,
      taskId: "",
      taskName: "",
      detailPath: "",
      nextRunAt: "",
      suggestedReply: "任务创建失败，请检查配置后重试。"
    };
  }
}
