import { getAppSnapshot } from "@/lib/domain/store";
import { getAppStore } from "@/lib/repositories/app-store";
import { getTpLinkVideoTaskFilePage, getTpLinkVideoTaskInfo, submitTpLinkCaptureVideoTask } from "@/lib/tplink/client";
import type { DeviceRef, MediaAsset } from "@/lib/types";

export async function getMediaAsset(id: string) {
  const snapshot = await getAppSnapshot();
  return snapshot.media.find((item) => item.id === id) ?? null;
}

export async function getMediaForMessage(messageId: string) {
  const snapshot = await getAppSnapshot();
  return snapshot.media.filter((item) => item.messageId === messageId);
}

export async function getLatestPreviewForDevice(qrCode: string, profileId?: string) {
  const snapshot = await getAppSnapshot();
  const latestResult = snapshot.results
    .filter((item) => item.qrCode === qrCode && (!profileId || item.profileId === profileId) && item.imageUrl)
    .sort((a, b) => b.imageTime.localeCompare(a.imageTime))[0];

  if (latestResult?.imageUrl) {
    return {
      url: latestResult.imageUrl,
      source: "latest-result" as const,
      imageTime: latestResult.imageTime
    };
  }

  const device = snapshot.devices.find(
    (item: DeviceRef) => item.qrCode === qrCode && (!profileId || item.profileId === profileId)
  );

  if (device?.previewImage) {
    return {
      url: device.previewImage,
      source: "fallback-device" as const,
      imageTime: undefined
    };
  }

  return null;
}

function formatTpLinkDateTime(value: Date) {
  const shifted = new Date(value.getTime() + 8 * 60 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = `${shifted.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${shifted.getUTCDate()}`.padStart(2, "0");
  const hour = `${shifted.getUTCHours()}`.padStart(2, "0");
  const minute = `${shifted.getUTCMinutes()}`.padStart(2, "0");
  const second = `${shifted.getUTCSeconds()}`.padStart(2, "0");
  return `${year}${month}${day}${hour}${minute}${second}`;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureReplayMediaForSource(input: {
  cacheId: string;
  taskId: string;
  qrCode: string;
  channelId: number;
  imageTime: string;
  profileId?: string;
}): Promise<MediaAsset> {
  const snapshot = await getAppSnapshot();
  const cached = snapshot.media.find((item) => item.kind === "video" && item.id === input.cacheId);
  if (cached) {
    return cached;
  }

  const center = new Date(input.imageTime);
  const start = new Date(center.getTime() - 30 * 1000);
  const end = new Date(center.getTime() + 30 * 1000);

  const submitResponse = await submitTpLinkCaptureVideoTask(
    {
      qrCode: input.qrCode,
      channelId: input.channelId,
      playbackStartTime: formatTpLinkDateTime(start),
      playbackEndTime: formatTpLinkDateTime(end),
      expireDays: 1
    },
    input.profileId
  );

  if (submitResponse.error_code !== 0 || !submitResponse.result?.taskId) {
    throw new Error(`TP-LINK replay task submit failed: ${JSON.stringify(submitResponse)}`);
  }

  const taskId = submitResponse.result.taskId;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const info = await getTpLinkVideoTaskInfo(taskId, input.profileId);
    if (info.error_code !== 0) {
      throw new Error(`TP-LINK replay task info failed: error_code=${info.error_code}`);
    }

    const state = info.result?.state;
    if (state === 10) {
      const files = await getTpLinkVideoTaskFilePage(taskId, input.profileId);
      if (files.error_code !== 0) {
        throw new Error(`TP-LINK replay file query failed: error_code=${files.error_code}`);
      }

      const url = files.result?.list?.[0]?.urls?.[0];
      if (!url) {
        throw new Error("TP-LINK did not return a replay file URL.");
      }

      const asset: MediaAsset = {
        id: input.cacheId,
        kind: "video",
        taskId: input.taskId,
        url,
        expiresAt: files.result?.list?.[0]?.expireTime ?? new Date(Date.now() + 10 * 60 * 1000).toISOString()
      };

      const store = await getAppStore();
      await store.addMedia(asset);
      return asset;
    }

    if (state === 11) {
      throw new Error(info.result?.errorMsg || `TP-LINK replay task failed: error_code=${info.result?.error_code ?? "unknown"}`);
    }

    await sleep(1500);
  }

  throw new Error("TP-LINK replay task timed out. Please try again later.");
}

export async function ensureReplayMediaForResult(resultId: string): Promise<MediaAsset> {
  const snapshot = await getAppSnapshot();
  const result = snapshot.results.find((item) => item.id === resultId);
  if (!result) {
    throw new Error("Result not found.");
  }
  return ensureReplayMediaForSource({
    cacheId: `video_result_${resultId}`,
    taskId: result.taskId,
    qrCode: result.qrCode,
    channelId: result.channelId,
    imageTime: result.imageTime,
    profileId: result.profileId
  });
}

export async function ensureReplayMediaForMessage(messageId: string): Promise<MediaAsset> {
  const snapshot = await getAppSnapshot();
  const message = snapshot.messages.find((item) => item.id === messageId);
  if (!message) {
    throw new Error("Message not found.");
  }

  const matchedResult =
    (message.resultId ? snapshot.results.find((item) => item.id === message.resultId) : null) ??
    snapshot.results.find(
      (item) =>
        item.taskId === message.taskId &&
        item.qrCode === message.qrCode &&
        item.algorithmId === message.algorithmId &&
        item.imageTime.slice(0, 16) === message.createdAt.slice(0, 16)
    ) ??
    snapshot.results.find(
      (item) => item.taskId === message.taskId && item.qrCode === message.qrCode && item.algorithmId === message.algorithmId
    );

  if (matchedResult) {
    return ensureReplayMediaForResult(matchedResult.id);
  }

  if (!message.createdAt) {
    throw new Error("No replay data to fetch for this message.");
  }

  return ensureReplayMediaForSource({
    cacheId: `video_message_${messageId}`,
    taskId: message.taskId,
    qrCode: message.qrCode,
    channelId: message.channelId,
    imageTime: message.createdAt,
    profileId: message.profileId
  });
}
