import { getAppStore } from "@/lib/repositories/app-store";
import { getAppSnapshot } from "@/lib/domain/store";
import type { MediaAsset, MessageItem } from "@/lib/types";
import { slugId } from "@/lib/utils";

function normalizeType(value: unknown): MessageItem["type"] {
  return "inspection_unqualified";
}

function normalizeTime(value: unknown) {
  if (typeof value === "number") {
    return new Date(value).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return new Date().toISOString();
}

function normalizeList(payload: Record<string, unknown>) {
  const candidates = [
    payload.messageList,
    payload.msgList,
    payload.dataList,
    payload.list,
    payload.messages
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [payload];
}

export async function getMessages() {
  const snapshot = await getAppSnapshot();
  return snapshot.messages.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getMessageById(id: string) {
  const snapshot = await getAppSnapshot();
  return snapshot.messages.find((item) => item.id === id) ?? null;
}

export async function markMessageRead(id: string) {
  const store = await getAppStore();
  const snapshot = await store.snapshot();
  const message = snapshot.messages.find((item) => item.id === id);
  if (!message) {
    return null;
  }
  const nextMessage = { ...message, read: true };
  await store.updateMessage(nextMessage);
  return nextMessage;
}

export async function handleTpLinkMessageCallback(payload: unknown) {
  const store = await getAppStore();
  const snapshot = await store.snapshot();
  const items = normalizeList((payload ?? {}) as Record<string, unknown>);
  const nextMessages: MessageItem[] = [];
  const nextMedia: MediaAsset[] = [];

  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const qrCode =
      (typeof item.qrCode === "string" && item.qrCode) ||
      (typeof item.qrcode === "string" && item.qrcode) ||
      (typeof item.deviceQrCode === "string" && item.deviceQrCode) ||
      "";

    const algorithmId =
      (typeof item.algorithmId === "string" && item.algorithmId) ||
      (typeof item.algorithm_id === "string" && item.algorithm_id) ||
      "unknown-algorithm";

    const taskId =
      (typeof item.taskId === "string" && item.taskId) ||
      snapshot.tasks.find((task) => task.devices.some((device) => device.qrCode === qrCode) && task.algorithmIds.includes(algorithmId))?.id;

    if (!taskId) continue;
    const matchedTask = snapshot.tasks.find((task) => task.id === taskId);
    const matchedResult =
      snapshot.results.find(
        (result) =>
          result.taskId === taskId &&
          result.qrCode === qrCode &&
          result.algorithmId === algorithmId &&
          result.channelId === (typeof item.channelId === "number" ? item.channelId : 1)
      ) ?? null;
    const profileId =
      matchedResult?.profileId ??
      matchedTask?.devices.find((device) => device.qrCode === qrCode && device.channelId === (typeof item.channelId === "number" ? item.channelId : 1))
        ?.profileId;

    const imageUrl =
      (typeof item.imageUrl === "string" && item.imageUrl) ||
      (typeof item.picUrl === "string" && item.picUrl) ||
      (typeof item.captureUrl === "string" && item.captureUrl) ||
      undefined;

    const videoUrl =
      (typeof item.videoUrl === "string" && item.videoUrl) ||
      (typeof item.video_url === "string" && item.video_url) ||
      (typeof item.replayUrl === "string" && item.replayUrl) ||
      undefined;

    const messageId = slugId("msg");
    const imageId = imageUrl ? slugId("image") : undefined;
    const videoId = videoUrl ? slugId("video") : undefined;

    nextMessages.push({
      id: messageId,
      taskId,
      runId: typeof item.runId === "string" ? item.runId : undefined,
      resultId: matchedResult?.id,
      type: normalizeType(item.msgType ?? item.type),
      read: false,
      title: typeof item.title === "string" && item.title ? item.title : "任务巡检不合格消息",
      description:
        (typeof item.description === "string" && item.description) ||
        (typeof item.msgContent === "string" && item.msgContent) ||
        "监控点巡检结果为不合格，请及时处理。",
      result: "UNQUALIFIED",
      qrCode,
      channelId: typeof item.channelId === "number" ? item.channelId : 1,
      algorithmId,
      createdAt: normalizeTime(item.createdAt ?? item.msgTime ?? item.timestamp),
      imageUrl,
      imageId,
      videoTaskId: videoId,
      profileId
    });

    if (imageUrl && imageId) {
      nextMedia.push({
        id: imageId,
        kind: "image",
        messageId,
        taskId,
        url: imageUrl,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString()
      });
    }

    if (videoUrl && videoId) {
      nextMedia.push({
        id: videoId,
        kind: "video",
        messageId,
        taskId,
        url: videoUrl,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString()
      });
    }
  }

  if (nextMessages.length > 0) {
    await store.addMessages(nextMessages);
  }

  for (const asset of nextMedia) {
    await store.addMedia(asset);
  }

  return { ok: true, messageCount: nextMessages.length, mediaCount: nextMedia.length };
}
