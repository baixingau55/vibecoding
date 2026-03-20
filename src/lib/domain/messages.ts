import { unstable_cache } from "next/cache";

import { CACHE_TAGS, revalidateMessageReadModels } from "@/lib/domain/cache-tags";
import { getImageRetentionExpiresAt, persistMessageImage } from "@/lib/domain/image-retention";
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

const getCachedMessages = unstable_cache(
  async () => {
    const store = await getAppStore();
    if ("getMessagesData" in store && typeof store.getMessagesData === "function") {
      const { messages } = await store.getMessagesData();
      return messages.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    const snapshot = await store.snapshot(false);
    return snapshot.messages.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  ["messages-list"],
  { revalidate: 20, tags: [CACHE_TAGS.messages] }
);

const getCachedMessagePayload = unstable_cache(
  async () => {
    const store = await getAppStore();
    const payload =
      "getMessagesData" in store && typeof store.getMessagesData === "function"
        ? await store.getMessagesData()
        : { messages: await getMessages(), media: (await store.snapshot(false)).media };

    const mediaByMessage = payload.media.reduce<Record<string, MediaAsset[]>>((accumulator, media) => {
      if (!media.messageId) return accumulator;
      (accumulator[media.messageId] ??= []).push(media);
      return accumulator;
    }, {});

    return {
      messages: payload.messages.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      mediaByMessage
    };
  },
  ["messages-page-data"],
  { revalidate: 20, tags: [CACHE_TAGS.messages] }
);

const getCachedMessageById = unstable_cache(
  async (id: string) => {
    const store = await getAppStore();
    if ("getMessagesData" in store && typeof store.getMessagesData === "function") {
      const { messages } = await store.getMessagesData();
      return messages.find((item) => item.id === id) ?? null;
    }
    const snapshot = await store.snapshot(false);
    return snapshot.messages.find((item) => item.id === id) ?? null;
  },
  ["message-by-id"],
  { revalidate: 20, tags: [CACHE_TAGS.messages] }
);

export async function getMessages() {
  return getCachedMessages();
}

export async function getMessagesPageData() {
  return getCachedMessagePayload();
}

export async function getMessageById(id: string) {
  return getCachedMessageById(id);
}

export async function markMessageRead(id: string) {
  const store = await getAppStore();
  const snapshot = await store.snapshot(false);
  const message = snapshot.messages.find((item) => item.id === id);
  if (!message) {
    return null;
  }
  const nextMessage = { ...message, read: true };
  await store.updateMessage(nextMessage);
  revalidateMessageReadModels();
  return nextMessage;
}

export async function handleTpLinkMessageCallback(payload: unknown) {
  const store = await getAppStore();
  const snapshot = await store.snapshot(false);
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
      profileId,
      imageSource: imageUrl ? "tplink_remote" : undefined,
      remoteImageUrl: imageUrl
    });

    if (imageUrl && imageId) {
      nextMedia.push({
        id: imageId,
        kind: "image",
        messageId,
        taskId,
        url: imageUrl,
        expiresAt: getImageRetentionExpiresAt(),
        source: "tplink_remote",
        remoteUrl: imageUrl
      });
    }

    if (videoUrl && videoId) {
      nextMedia.push({
        id: videoId,
        kind: "video",
        messageId,
        taskId,
        url: videoUrl,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        source: "video_remote",
        remoteUrl: videoUrl
      });
    }
  }

  if (nextMessages.length > 0) {
    await store.addMessages(nextMessages);
    revalidateMessageReadModels();
  }

  for (const asset of nextMedia) {
    await store.addMedia(asset);
  }

  const imageSyncFailures: Array<{ messageId: string; error: string }> = [];
  for (const message of nextMessages.filter((item) => item.imageUrl)) {
    try {
      await persistMessageImage(message.id);
    } catch (error) {
      imageSyncFailures.push({
        messageId: message.id,
        error: error instanceof Error ? error.message : "Unknown message image sync error"
      });
    }
  }

  return { ok: true, messageCount: nextMessages.length, mediaCount: nextMedia.length, imageSyncFailures };
}
