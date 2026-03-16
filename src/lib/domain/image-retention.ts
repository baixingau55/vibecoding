import { revalidateMessageReadModels, revalidateTaskReadModels } from "@/lib/domain/cache-tags";
import { getAppStore, invalidateRepositoryReadCache } from "@/lib/repositories/app-store";
import { ensureInspectionMediaBucket, getSupabaseAdminClient } from "@/lib/supabase/client";
import { deleteTpLinkInspectionTaskResults } from "@/lib/tplink/client";
import type { InspectionResult, InspectionRun, MediaAsset, MessageItem } from "@/lib/types";

const IMAGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const RECORD_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

function inferExtension(contentType: string | null, url: string) {
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("gif")) return "gif";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return "jpg";

  const fromUrl = /\.(png|jpg|jpeg|webp|gif)(?:\?|$)/i.exec(url)?.[1]?.toLowerCase();
  if (fromUrl === "jpeg") return "jpg";
  return fromUrl ?? "jpg";
}

function buildResultImagePath(result: InspectionResult, contentType: string | null) {
  const ext = inferExtension(contentType, result.remoteImageUrl ?? result.imageUrl);
  return `results/${result.taskId}/${result.runId}/${result.id}.${ext}`;
}

function buildMessageImagePath(message: MessageItem, contentType: string | null) {
  const ext = inferExtension(contentType, message.remoteImageUrl ?? message.imageUrl ?? "");
  return `messages/${message.taskId}/${message.id}.${ext}`;
}

function toImageExpiry(now = new Date()) {
  return new Date(now.getTime() + IMAGE_RETENTION_MS).toISOString();
}

async function downloadRemoteImage(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to download remote image: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type");
  return { buffer, contentType };
}

async function uploadImageToStorage(path: string, buffer: Buffer, contentType: string | null) {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase admin client is not configured.");
  }

  await ensureInspectionMediaBucket();
  const { error } = await client.storage.from(process.env.SUPABASE_INSPECTION_MEDIA_BUCKET ?? "inspection-media").upload(path, buffer, {
    contentType: contentType ?? "image/jpeg",
    upsert: true
  });
  if (error) {
    throw error;
  }
}

async function deleteStoredPaths(paths: string[]) {
  const normalized = Array.from(new Set(paths.filter(Boolean)));
  if (normalized.length === 0) return;

  const client = getSupabaseAdminClient();
  if (!client) return;

  await ensureInspectionMediaBucket();
  const { error } = await client.storage.from(process.env.SUPABASE_INSPECTION_MEDIA_BUCKET ?? "inspection-media").remove(normalized);
  if (error) {
    throw error;
  }
}

async function readStoredImage(path: string) {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase admin client is not configured.");
  }

  await ensureInspectionMediaBucket();
  const { data, error } = await client.storage.from(process.env.SUPABASE_INSPECTION_MEDIA_BUCKET ?? "inspection-media").download(path);
  if (error || !data) {
    throw error ?? new Error("Stored image not found.");
  }

  return {
    bytes: Buffer.from(await data.arrayBuffer()),
    contentType: data.type || "image/jpeg"
  };
}

async function getFreshSnapshot() {
  const store = await getAppStore();
  return store.snapshot(false);
}

function findRelatedMessages(snapshot: Awaited<ReturnType<typeof getFreshSnapshot>>, result: InspectionResult) {
  return snapshot.messages.filter(
    (message) =>
      message.resultId === result.id ||
      (message.taskId === result.taskId &&
        message.qrCode === result.qrCode &&
        message.channelId === result.channelId &&
        message.algorithmId === result.algorithmId &&
        message.createdAt.slice(0, 16) === result.imageTime.slice(0, 16))
  );
}

async function updateResultImageMetadata(result: InspectionResult, patch: Partial<InspectionResult>) {
  const store = await getAppStore();
  if ("updateResult" in store && typeof store.updateResult === "function") {
    await store.updateResult({ ...result, ...patch });
  }
}

async function updateMessageImageMetadata(message: MessageItem, patch: Partial<MessageItem>) {
  const store = await getAppStore();
  await store.updateMessage({ ...message, ...patch });
}

async function updateMediaImageMetadata(media: MediaAsset, patch: Partial<MediaAsset>) {
  const store = await getAppStore();
  if ("updateMedia" in store && typeof store.updateMedia === "function") {
    await store.updateMedia({ ...media, ...patch });
  } else {
    await store.addMedia({ ...media, ...patch });
  }
}

async function markRunImagesDeleted(run: InspectionRun, deletedAt = new Date().toISOString()) {
  const store = await getAppStore();
  await store.updateRun({ ...run, tpLinkResultsDeletedAt: deletedAt });
}

async function maybeDeleteTpLinkImagesForRun(run: InspectionRun) {
  if (!run.tpLinkTaskId || !run.profileId || run.tpLinkResultsDeletedAt) return false;

  const snapshot = await getFreshSnapshot();
  const runResults = snapshot.results.filter((item) => item.runId === run.id);
  const imageResults = runResults.filter((item) => item.remoteImageUrl);
  if (imageResults.length === 0) return false;

  const allReady = imageResults.every((item) => item.imageStoragePath && item.imageSource === "supabase_storage");
  if (!allReady) return false;

  const response = await deleteTpLinkInspectionTaskResults([run.tpLinkTaskId], run.profileId);
  if (response.error_code !== 0) {
    throw new Error(`TP-LINK batchDeleteAiTaskResult failed: profile=${run.profileId}, error_code=${response.error_code}`);
  }

  await markRunImagesDeleted(run);
  return true;
}

export async function persistResultImage(resultId: string) {
  const snapshot = await getFreshSnapshot();
  const result = snapshot.results.find((item) => item.id === resultId);
  if (!result) {
    return { ok: false, reason: "Result not found" as const };
  }

  if (!result.remoteImageUrl) {
    return { ok: false, reason: "Result has no remote image" as const };
  }

  if (result.imageStoragePath && result.imageSource === "supabase_storage") {
    return { ok: true, skipped: true as const };
  }

  const { buffer, contentType } = await downloadRemoteImage(result.remoteImageUrl);
  const storagePath = buildResultImagePath(result, contentType);
  await uploadImageToStorage(storagePath, buffer, contentType);

  const nowIso = new Date().toISOString();
  const expiresAt = toImageExpiry();
  await updateResultImageMetadata(result, {
    imageStoragePath: storagePath,
    imageSource: "supabase_storage",
    imageSyncedAt: nowIso,
    imageExpiresAt: expiresAt
  });

  const nextSnapshot = await getFreshSnapshot();
  const refreshedResult = nextSnapshot.results.find((item) => item.id === result.id) ?? { ...result, imageStoragePath: storagePath, imageSource: "supabase_storage", imageSyncedAt: nowIso, imageExpiresAt: expiresAt };
  const relatedMessages = findRelatedMessages(nextSnapshot, refreshedResult);
  for (const message of relatedMessages) {
    await updateMessageImageMetadata(message, {
      imageStoragePath: storagePath,
      imageSource: "supabase_storage",
      imageExpiresAt: expiresAt
    });

    const media = nextSnapshot.media.filter((item) => item.messageId === message.id && item.kind === "image");
    for (const asset of media) {
      await updateMediaImageMetadata(asset, {
        storagePath,
        source: "supabase_storage",
        expiresAt,
        contentType: contentType ?? asset.contentType
      });
    }
  }

  const run = nextSnapshot.runs.find((item) => item.id === result.runId);
  if (run) {
    await maybeDeleteTpLinkImagesForRun(run);
  }

  invalidateRepositoryReadCache();
  revalidateTaskReadModels();
  revalidateMessageReadModels();
  return { ok: true, storagePath, expiresAt };
}

export async function persistImagesForRun(runId: string) {
  const snapshot = await getFreshSnapshot();
  const results = snapshot.results.filter((item) => item.runId === runId && item.remoteImageUrl && (!item.imageStoragePath || item.imageSource !== "supabase_storage"));

  const synced: string[] = [];
  const failed: Array<{ resultId: string; error: string }> = [];

  for (const result of results) {
    try {
      await persistResultImage(result.id);
      synced.push(result.id);
    } catch (error) {
      failed.push({
        resultId: result.id,
        error: error instanceof Error ? error.message : "Unknown image persistence error"
      });
    }
  }

  return { synced, failed };
}

export async function persistMessageImage(messageId: string) {
  const snapshot = await getFreshSnapshot();
  const message = snapshot.messages.find((item) => item.id === messageId);
  if (!message) {
    return { ok: false, reason: "Message not found" as const };
  }

  if (!message.remoteImageUrl) {
    return { ok: false, reason: "Message has no remote image" as const };
  }

  if (message.imageStoragePath && message.imageSource === "supabase_storage") {
    return { ok: true, skipped: true as const };
  }

  if (message.resultId) {
    return persistResultImage(message.resultId);
  }

  const { buffer, contentType } = await downloadRemoteImage(message.remoteImageUrl);
  const storagePath = buildMessageImagePath(message, contentType);
  await uploadImageToStorage(storagePath, buffer, contentType);

  const expiresAt = toImageExpiry();
  await updateMessageImageMetadata(message, {
    imageStoragePath: storagePath,
    imageSource: "supabase_storage",
    imageExpiresAt: expiresAt
  });

  const media = snapshot.media.filter((item) => item.messageId === message.id && item.kind === "image");
  for (const asset of media) {
    await updateMediaImageMetadata(asset, {
      storagePath,
      source: "supabase_storage",
      expiresAt,
      contentType: contentType ?? asset.contentType
    });
  }

  invalidateRepositoryReadCache();
  revalidateMessageReadModels();
  return { ok: true, storagePath, expiresAt };
}

export async function backfillImages(limit = 200) {
  const snapshot = await getFreshSnapshot();
  const candidates = snapshot.results.filter((item) => item.remoteImageUrl && (!item.imageStoragePath || item.imageSource !== "supabase_storage")).slice(0, limit);

  const synced: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const result of candidates) {
    try {
      await persistResultImage(result.id);
      synced.push(result.id);
    } catch (error) {
      failed.push({
        id: result.id,
        error: error instanceof Error ? error.message : "Unknown image persistence error"
      });
    }
  }

  const standaloneMessages = snapshot.messages
    .filter((item) => !item.resultId && item.remoteImageUrl && (!item.imageStoragePath || item.imageSource !== "supabase_storage"))
    .slice(0, limit);

  for (const message of standaloneMessages) {
    try {
      await persistMessageImage(message.id);
      synced.push(message.id);
    } catch (error) {
      failed.push({
        id: message.id,
        error: error instanceof Error ? error.message : "Unknown message image persistence error"
      });
    }
  }

  return { syncedCount: synced.length, failed };
}

export async function pruneExpiredImages(now = new Date()) {
  const snapshot = await getFreshSnapshot();
  const expiredResults = snapshot.results.filter(
    (item) => item.imageStoragePath && item.imageExpiresAt && Date.parse(item.imageExpiresAt) <= now.getTime()
  );
  const expiredMessages = snapshot.messages.filter(
    (item) => item.imageStoragePath && item.imageExpiresAt && Date.parse(item.imageExpiresAt) <= now.getTime()
  );
  const expiredMedia = snapshot.media.filter(
    (item) => item.kind === "image" && item.storagePath && item.expiresAt && Date.parse(item.expiresAt) <= now.getTime()
  );

  await deleteStoredPaths([
    ...expiredResults.map((item) => item.imageStoragePath ?? ""),
    ...expiredMessages.map((item) => item.imageStoragePath ?? ""),
    ...expiredMedia.map((item) => item.storagePath ?? "")
  ]);

  for (const result of expiredResults) {
    await updateResultImageMetadata(result, {
      imageStoragePath: undefined,
      imageSource: "expired",
      imageExpiresAt: result.imageExpiresAt
    });
  }

  for (const message of expiredMessages) {
    await updateMessageImageMetadata(message, {
      imageStoragePath: undefined,
      imageSource: "expired",
      imageExpiresAt: message.imageExpiresAt
    });
  }

  for (const media of expiredMedia) {
    await updateMediaImageMetadata(media, {
      storagePath: undefined,
      source: "expired"
    });
  }

  invalidateRepositoryReadCache();
  revalidateTaskReadModels();
  revalidateMessageReadModels();
  return {
    prunedResultImages: expiredResults.length,
    prunedMessageImages: expiredMessages.length,
    prunedMediaAssets: expiredMedia.length
  };
}

export async function pruneExpiredRecords(now = new Date()) {
  const cutoffIso = new Date(now.getTime() - RECORD_RETENTION_MS).toISOString();
  const client = getSupabaseAdminClient();
  if (!client) {
    return { deletedRuns: 0, deletedResults: 0, deletedMessages: 0, deletedFailures: 0, deletedMedia: 0 };
  }

  const snapshot = await getFreshSnapshot();
  const resultIds = snapshot.results.filter((item) => item.imageTime < cutoffIso).map((item) => item.id);
  const runIds = snapshot.runs.filter((item) => item.startedAt < cutoffIso).map((item) => item.id);
  const messageIds = snapshot.messages.filter((item) => item.createdAt < cutoffIso).map((item) => item.id);
  const failureIds = snapshot.failures.filter((item) => {
    const run = snapshot.runs.find((runItem) => runItem.id === item.runId);
    return run?.startedAt ? run.startedAt < cutoffIso : false;
  }).map((item) => item.id);
  const mediaIds = snapshot.media.filter((item) => {
    if (item.messageId && messageIds.includes(item.messageId)) return true;
    if (item.taskId && !item.messageId && item.expiresAt < cutoffIso) return true;
    return false;
  }).map((item) => item.id);

  await deleteStoredPaths(
    [
      ...snapshot.media.filter((item) => mediaIds.includes(item.id) && item.storagePath).map((item) => item.storagePath!),
      ...snapshot.results.filter((item) => resultIds.includes(item.id) && item.imageStoragePath).map((item) => item.imageStoragePath!),
      ...snapshot.messages.filter((item) => messageIds.includes(item.id) && item.imageStoragePath).map((item) => item.imageStoragePath!)
    ]
  );

  if (mediaIds.length > 0) {
    await client.from("message_media").delete().in("id", mediaIds);
  }
  if (messageIds.length > 0) {
    await client.from("messages").delete().in("id", messageIds);
  }
  if (failureIds.length > 0) {
    await client.from("inspection_failures").delete().in("id", failureIds);
  }
  if (resultIds.length > 0) {
    await client.from("inspection_results").delete().in("id", resultIds);
  }
  if (runIds.length > 0) {
    await client.from("inspection_runs").delete().in("id", runIds);
  }

  invalidateRepositoryReadCache();
  revalidateTaskReadModels();
  revalidateMessageReadModels();
  return {
    deletedRuns: runIds.length,
    deletedResults: resultIds.length,
    deletedMessages: messageIds.length,
    deletedFailures: failureIds.length,
    deletedMedia: mediaIds.length
  };
}

export async function getStoredResultImage(id: string) {
  const snapshot = await getFreshSnapshot();
  const result = snapshot.results.find((item) => item.id === id);
  if (!result) {
    throw new Error("Result not found.");
  }

  if (result.imageStoragePath && result.imageSource === "supabase_storage") {
    return readStoredImage(result.imageStoragePath);
  }

  if (result.imageSource === "expired") {
    throw new Error("Image expired.");
  }

  if (result.remoteImageUrl) {
    const { buffer, contentType } = await downloadRemoteImage(result.remoteImageUrl);
    return { bytes: buffer, contentType: contentType ?? "image/jpeg" };
  }

  throw new Error("Image not found.");
}

export async function getStoredMessageImage(id: string) {
  const snapshot = await getFreshSnapshot();
  const message = snapshot.messages.find((item) => item.id === id);
  if (!message) {
    throw new Error("Message not found.");
  }

  if (message.imageStoragePath && message.imageSource === "supabase_storage") {
    return readStoredImage(message.imageStoragePath);
  }

  if (message.imageSource === "expired") {
    throw new Error("Image expired.");
  }

  if (message.remoteImageUrl) {
    const { buffer, contentType } = await downloadRemoteImage(message.remoteImageUrl);
    return { bytes: buffer, contentType: contentType ?? "image/jpeg" };
  }

  throw new Error("Image not found.");
}

export async function getStoredMediaImage(id: string) {
  const snapshot = await getFreshSnapshot();
  const media = snapshot.media.find((item) => item.id === id && item.kind === "image");
  if (!media) {
    throw new Error("Media not found.");
  }

  if (media.storagePath && media.source === "supabase_storage") {
    return readStoredImage(media.storagePath);
  }

  if (media.source === "expired") {
    throw new Error("Image expired.");
  }

  if (media.remoteUrl) {
    const { buffer, contentType } = await downloadRemoteImage(media.remoteUrl);
    return { bytes: buffer, contentType: contentType ?? media.contentType ?? "image/jpeg" };
  }

  throw new Error("Image not found.");
}
