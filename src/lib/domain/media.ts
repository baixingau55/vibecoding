import { getAppSnapshot } from "@/lib/domain/store";
import { getAppStore } from "@/lib/repositories/app-store";
import { getTpLinkVideoTaskFilePage, getTpLinkVideoTaskInfo, submitTpLinkCaptureVideoTask } from "@/lib/tplink/client";
import { slugId } from "@/lib/utils";
import type { MediaAsset } from "@/lib/types";

export async function getMediaAsset(id: string) {
  const snapshot = await getAppSnapshot();
  return snapshot.media.find((item) => item.id === id) ?? null;
}

export async function getMediaForMessage(messageId: string) {
  const snapshot = await getAppSnapshot();
  return snapshot.media.filter((item) => item.messageId === messageId);
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

export async function ensureReplayMediaForResult(resultId: string): Promise<MediaAsset> {
  const snapshot = await getAppSnapshot();
  const cached = snapshot.media.find((item) => item.kind === "video" && item.id === `video_result_${resultId}`);
  if (cached) {
    return cached;
  }

  const result = snapshot.results.find((item) => item.id === resultId);
  if (!result) {
    throw new Error("Result not found.");
  }

  const center = new Date(result.imageTime);
  const start = new Date(center.getTime() - 30 * 1000);
  const end = new Date(center.getTime() + 30 * 1000);

  const submitResponse = await submitTpLinkCaptureVideoTask({
    qrCode: result.qrCode,
    channelId: result.channelId,
    playbackStartTime: formatTpLinkDateTime(start),
    playbackEndTime: formatTpLinkDateTime(end),
    expireDays: 1
  });

  if (submitResponse.error_code !== 0 || !submitResponse.result?.taskId) {
    throw new Error(`TP-LINK 回放任务提交失败，响应=${JSON.stringify(submitResponse)}`);
  }

  const taskId = submitResponse.result.taskId;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const info = await getTpLinkVideoTaskInfo(taskId);
    if (info.error_code !== 0) {
      throw new Error(`TP-LINK 回放任务查询失败，error_code=${info.error_code}`);
    }

    const state = info.result?.state;
    if (state === 10) {
      const files = await getTpLinkVideoTaskFilePage(taskId);
      if (files.error_code !== 0) {
        throw new Error(`TP-LINK 回放文件查询失败，error_code=${files.error_code}`);
      }

      const url = files.result?.list?.[0]?.urls?.[0];
      if (!url) {
        throw new Error("TP-LINK 未返回回放文件地址。");
      }

      const asset: MediaAsset = {
        id: `video_result_${resultId}`,
        kind: "video",
        taskId: result.taskId,
        url,
        expiresAt: files.result?.list?.[0]?.expireTime ?? new Date(Date.now() + 10 * 60 * 1000).toISOString()
      };

      const store = await getAppStore();
      await store.addMedia(asset);
      return asset;
    }

    if (state === 11) {
      throw new Error(info.result?.errorMsg || `TP-LINK 回放任务失败，error_code=${info.result?.error_code ?? "unknown"}`);
    }

    await sleep(1500);
  }

  throw new Error("TP-LINK 回放任务处理超时，请稍后重试。");
}

export async function ensureReplayMediaForMessage(messageId: string): Promise<MediaAsset> {
  const snapshot = await getAppSnapshot();
  const message = snapshot.messages.find((item) => item.id === messageId);
  if (!message) {
    throw new Error("Message not found.");
  }

  const matchedResult =
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

  if (!matchedResult) {
    throw new Error("No replayable result found for this message.");
  }

  return ensureReplayMediaForResult(matchedResult.id);
}
