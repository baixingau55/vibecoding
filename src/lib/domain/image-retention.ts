import { revalidateMessageReadModels, revalidateTaskReadModels } from "@/lib/domain/cache-tags";
import { getAppStore, invalidateRepositoryReadCache } from "@/lib/repositories/app-store";
import { ensureInspectionMediaBucket, getSupabaseAdminClient } from "@/lib/supabase/client";
import { deleteTpLinkInspectionTaskResults } from "@/lib/tplink/client";
import type { InspectionResult, InspectionRun, MediaAsset, MessageItem } from "@/lib/types";

export const IMAGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const RECORD_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const REMOTE_IMAGE_FETCH_TIMEOUT_MS = 30_000;

type ImageRetentionSchemaStatus = {
  ready: boolean;
  legacyFallback: boolean;
  missingColumns: string[];
  tables: {
    inspectionResults: boolean;
    messages: boolean;
    messageMedia: boolean;
    inspectionRuns: boolean;
  };
};

let imageRetentionSchemaCache:
  | {
      checkedAt: number;
      status: ImageRetentionSchemaStatus;
    }
  | null = null;
let imageRetentionSchemaPromise: Promise<ImageRetentionSchemaStatus> | null = null;
const IMAGE_RETENTION_SCHEMA_TTL_MS = 30_000;

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

function buildMediaImagePath(media: MediaAsset, contentType: string | null) {
  const ext = inferExtension(contentType, media.remoteUrl ?? media.url);
  return `media/${media.taskId ?? "unknown"}/${media.messageId ?? "standalone"}/${media.id}.${ext}`;
}

export function getImageRetentionExpiresAt(base: Date | string = new Date()) {
  const now = typeof base === "string" ? new Date(base) : base;
  return new Date(now.getTime() + IMAGE_RETENTION_MS).toISOString();
}

function getResultImageExpiresAt(result: InspectionResult) {
  return result.imageExpiresAt ?? getImageRetentionExpiresAt(result.imageTime);
}

function getMessageImageExpiresAt(message: MessageItem) {
  return message.imageExpiresAt ?? getImageRetentionExpiresAt(message.createdAt);
}

function getMediaImageExpiresAt(media: MediaAsset) {
  return media.expiresAt || getImageRetentionExpiresAt();
}

function toImageExpiry(now = new Date()) {
  return new Date(now.getTime() + IMAGE_RETENTION_MS).toISOString();
}

async function downloadRemoteImage(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_IMAGE_FETCH_TIMEOUT_MS);
  const response = await fetch(url, { cache: "no-store", signal: controller.signal }).finally(() => {
    clearTimeout(timeout);
  });
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

async function tryReadStoredImage(path: string) {
  try {
    return await readStoredImage(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found/i.test(message) || /object not found/i.test(message) || /404/.test(message)) {
      return null;
    }
    throw error;
  }
}

export async function getImageRetentionSchemaStatus(force = false): Promise<ImageRetentionSchemaStatus> {
  const now = Date.now();
  if (!force && imageRetentionSchemaCache && now - imageRetentionSchemaCache.checkedAt < IMAGE_RETENTION_SCHEMA_TTL_MS) {
    return imageRetentionSchemaCache.status;
  }

  if (!force && imageRetentionSchemaPromise) {
    return imageRetentionSchemaPromise;
  }

  imageRetentionSchemaPromise = (async () => {
    const client = getSupabaseAdminClient();
    if (!client) {
      return {
        ready: false,
        legacyFallback: false,
        missingColumns: ["supabase_admin_client"],
        tables: {
          inspectionResults: false,
          messages: false,
          messageMedia: false,
          inspectionRuns: false
        }
      };
    }

    const checks = await Promise.all([
      client.from("inspection_results").select("id,image_storage_path,image_source,image_synced_at,image_expires_at,tplink_task_id").limit(1),
      client.from("messages").select("id,result_id,image_storage_path,image_source,image_expires_at").limit(1),
      client.from("message_media").select("id,storage_path,source,content_type").limit(1),
      client.from("inspection_runs").select("id,tplink_results_deleted_at,tplink_results_delete_error").limit(1)
    ]);

    const missingColumns: string[] = [];
    const tables = {
      inspectionResults: !checks[0].error,
      messages: !checks[1].error,
      messageMedia: !checks[2].error,
      inspectionRuns: !checks[3].error
    };

    if (checks[0].error) missingColumns.push(`inspection_results: ${checks[0].error.message}`);
    if (checks[1].error) missingColumns.push(`messages: ${checks[1].error.message}`);
    if (checks[2].error) missingColumns.push(`message_media: ${checks[2].error.message}`);
    if (checks[3].error) missingColumns.push(`inspection_runs: ${checks[3].error.message}`);

    const status: ImageRetentionSchemaStatus = {
      ready: missingColumns.length === 0,
      legacyFallback: true,
      missingColumns,
      tables
    };

    imageRetentionSchemaCache = { checkedAt: Date.now(), status };
    return status;
  })().finally(() => {
    imageRetentionSchemaPromise = null;
  });

  return imageRetentionSchemaPromise;
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
  const schema = await getImageRetentionSchemaStatus();
  if (!schema.tables.inspectionRuns) return;
  await store.updateRun({ ...run, tpLinkResultsDeletedAt: deletedAt, tpLinkResultsDeleteError: undefined });
}

async function markRunImageDeletionError(run: InspectionRun, message: string) {
  const store = await getAppStore();
  const schema = await getImageRetentionSchemaStatus();
  if (!schema.tables.inspectionRuns) return;
  await store.updateRun({ ...run, tpLinkResultsDeleteError: message });
}

async function isResultLocalized(result: InspectionResult) {
  if (result.imageStoragePath && result.imageSource === "supabase_storage") {
    return true;
  }

  if (!result.remoteImageUrl) return false;
  const image = await tryReadStoredImage(buildResultImagePath(result, null));
  return Boolean(image);
}

function getRunProfileId(snapshot: Awaited<ReturnType<typeof getFreshSnapshot>>, run: InspectionRun) {
  if (run.profileId) return run.profileId;

  return (
    snapshot.results.find((item) => item.runId === run.id && item.profileId)?.profileId ??
    snapshot.messages.find((item) => item.runId === run.id && item.profileId)?.profileId
  );
}

async function maybeDeleteTpLinkImagesForRun(run: InspectionRun) {
  if (!run.tpLinkTaskId || run.tpLinkResultsDeletedAt) return false;

  const snapshot = await getFreshSnapshot();
  const profileId = getRunProfileId(snapshot, run);
  if (!profileId) return false;
  const runResults = snapshot.results.filter((item) => item.runId === run.id);
  const imageResults = runResults.filter((item) => item.remoteImageUrl);
  if (imageResults.length === 0) return false;

  const readiness = await Promise.all(imageResults.map((item) => isResultLocalized(item)));
  const allReady = readiness.every(Boolean);
  if (!allReady) return false;

  const response = await deleteTpLinkInspectionTaskResults([run.tpLinkTaskId], profileId);
  if (response.error_code !== 0) {
    const message = `TP-LINK batchDeleteAiTaskResult failed: profile=${profileId}, error_code=${response.error_code}`;
    await markRunImageDeletionError(run, message);
    throw new Error(message);
  }

  await markRunImagesDeleted(run);
  return true;
}

export async function getImageBackfillStatus(limit = 20) {
  const client = getSupabaseAdminClient();
  const bucketName = process.env.SUPABASE_INSPECTION_MEDIA_BUCKET ?? "inspection-media";
  const schema = await getImageRetentionSchemaStatus();
  let bucketExists = false;
  let bucketError: string | undefined;

  if (client) {
    try {
      const { data, error } = await client.storage.listBuckets();
      if (error) {
        bucketError = error.message;
      } else {
        bucketExists = (data ?? []).some((bucket) => bucket.name === bucketName);
      }
    } catch (error) {
      bucketError = error instanceof Error ? error.message : "Unknown bucket inspection error";
    }
  }

  const snapshot = await getFreshSnapshot();
  const results = snapshot.results.filter((item) => item.remoteImageUrl);
  const messages = snapshot.messages.filter((item) => item.remoteImageUrl);
  const localizedResults = results.filter((item) => item.imageStoragePath && item.imageSource === "supabase_storage");
  const pendingResults = results.filter((item) => !item.imageStoragePath || item.imageSource !== "supabase_storage");
  const localizedMessages = messages.filter((item) => item.imageStoragePath && item.imageSource === "supabase_storage");
  const pendingMessages = messages.filter((item) => !item.imageStoragePath || item.imageSource !== "supabase_storage");
  const candidateRuns = snapshot.runs.filter((run) => run.tpLinkTaskId).slice(0, Math.max(1, limit));
  const groupedRuns = (
    await Promise.all(
      candidateRuns.map(async (run) => {
        const runResults = results.filter((item) => item.runId === run.id);
        let localizedCount = 0;
        try {
          const localizedFlags = await Promise.all(runResults.map((item) => isResultLocalized(item)));
          localizedCount = localizedFlags.filter(Boolean).length;
        } catch (error) {
          localizedCount = 0;
        }
        const pendingCount = Math.max(0, runResults.length - localizedCount);
        return {
          runId: run.id,
          taskId: run.taskId,
          profileId: getRunProfileId(snapshot, run),
          tpLinkTaskId: run.tpLinkTaskId,
          totalImageCount: runResults.length,
          localizedCount,
          pendingCount,
          readyToDelete: runResults.length > 0 && pendingCount === 0,
          deletedAt: run.tpLinkResultsDeletedAt,
          deleteError: run.tpLinkResultsDeleteError
        };
      })
    )
  )
    .sort((left, right) => {
      const leftDeletedAt = left.deletedAt ? Date.parse(left.deletedAt) : 0;
      const rightDeletedAt = right.deletedAt ? Date.parse(right.deletedAt) : 0;
      return rightDeletedAt - leftDeletedAt;
    });

  return {
    storageConfigured: Boolean(client),
    bucketName,
    bucketExists,
    bucketError,
    schema,
    resultImages: {
      total: results.length,
      localized: localizedResults.length,
      pending: pendingResults.length,
      expired: results.filter((item) => item.imageSource === "expired").length
    },
    messageImages: {
      total: messages.length,
      localized: localizedMessages.length,
      pending: pendingMessages.length,
      expired: messages.filter((item) => item.imageSource === "expired").length
    },
    runs: groupedRuns.slice(0, Math.max(1, limit))
  };
}

export async function deleteLocalizedTpLinkResults(limit = 20) {
  const snapshot = await getFreshSnapshot();
  const candidateRuns = snapshot.runs.filter((run) => run.tpLinkTaskId).slice(0, Math.max(1, limit));
  const deleted: Array<{ runId: string; taskId: string; tpLinkTaskId: string; profileId: string }> = [];
  const skipped: Array<{ runId: string; reason: string }> = [];
  const failed: Array<{ runId: string; tpLinkTaskId?: string; error: string }> = [];

  for (const run of candidateRuns) {
    try {
      const deletedThisRun = await maybeDeleteTpLinkImagesForRun(run);
      if (deletedThisRun) {
        deleted.push({
          runId: run.id,
          taskId: run.taskId,
          tpLinkTaskId: run.tpLinkTaskId!,
          profileId: getRunProfileId(snapshot, run) ?? "unknown"
        });
      } else {
        skipped.push({
          runId: run.id,
          reason: "Run is not fully localized yet."
        });
      }
    } catch (error) {
      failed.push({
        runId: run.id,
        tpLinkTaskId: run.tpLinkTaskId,
        error: error instanceof Error ? error.message : "Unknown TP-LINK delete error"
      });
    }
  }

  return {
    deletedCount: deleted.length,
    skippedCount: skipped.length,
    failedCount: failed.length,
    deleted,
    skipped,
    failed
  };
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
  const schema = await getImageRetentionSchemaStatus();
  if (schema.tables.inspectionResults) {
    await updateResultImageMetadata(result, {
      imageStoragePath: storagePath,
      imageSource: "supabase_storage",
      imageSyncedAt: nowIso,
      imageExpiresAt: expiresAt
    });
  }

  const nextSnapshot = await getFreshSnapshot();
  const refreshedResult = nextSnapshot.results.find((item) => item.id === result.id) ?? { ...result, imageStoragePath: storagePath, imageSource: "supabase_storage", imageSyncedAt: nowIso, imageExpiresAt: expiresAt };
  const relatedMessages = findRelatedMessages(nextSnapshot, refreshedResult);
  if (schema.tables.messages || schema.tables.messageMedia) {
    for (const message of relatedMessages) {
      if (schema.tables.messages) {
        await updateMessageImageMetadata(message, {
          imageStoragePath: storagePath,
          imageSource: "supabase_storage",
          imageExpiresAt: expiresAt
        });
      }

      if (schema.tables.messageMedia) {
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
  const schema = await getImageRetentionSchemaStatus();
  if (schema.tables.messages) {
    await updateMessageImageMetadata(message, {
      imageStoragePath: storagePath,
      imageSource: "supabase_storage",
      imageExpiresAt: expiresAt
    });
  }

  if (schema.tables.messageMedia) {
    const media = snapshot.media.filter((item) => item.messageId === message.id && item.kind === "image");
    for (const asset of media) {
      await updateMediaImageMetadata(asset, {
        storagePath,
        source: "supabase_storage",
        expiresAt,
        contentType: contentType ?? asset.contentType
      });
    }
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
  const resultIsExpired = (item: InspectionResult) =>
    Date.parse(item.imageExpiresAt ?? getResultImageExpiresAt(item)) <= now.getTime();
  const messageIsExpired = (item: MessageItem) =>
    Date.parse(item.imageExpiresAt ?? getMessageImageExpiresAt(item)) <= now.getTime();
  const mediaIsExpired = (item: MediaAsset) =>
    item.kind === "image" && Date.parse(item.expiresAt ?? getMediaImageExpiresAt(item)) <= now.getTime();

  const expiredResults = snapshot.results.filter(
    (item) => item.remoteImageUrl && resultIsExpired(item)
  );
  const expiredMessages = snapshot.messages.filter(
    (item) => item.remoteImageUrl && messageIsExpired(item)
  );
  const expiredMedia = snapshot.media.filter(
    (item) => mediaIsExpired(item)
  );

  await deleteStoredPaths([
    ...expiredResults.map((item) => item.imageStoragePath ?? buildResultImagePath(item, null)),
    ...expiredMessages.map((item) => item.imageStoragePath ?? buildMessageImagePath(item, null)),
    ...expiredMedia.map((item) => item.storagePath ?? buildMediaImagePath(item, item.contentType ?? null))
  ]);

  const schema = await getImageRetentionSchemaStatus();
  if (schema.tables.inspectionResults) {
    for (const result of expiredResults) {
      await updateResultImageMetadata(result, {
        imageStoragePath: undefined,
        imageSource: "expired",
        imageExpiresAt: result.imageExpiresAt ?? getResultImageExpiresAt(result)
      });
    }
  }

  if (schema.tables.messages) {
    for (const message of expiredMessages) {
      await updateMessageImageMetadata(message, {
        imageStoragePath: undefined,
        imageSource: "expired",
        imageExpiresAt: message.imageExpiresAt ?? getMessageImageExpiresAt(message)
      });
    }
  }

  if (schema.tables.messageMedia) {
    for (const media of expiredMedia) {
      await updateMediaImageMetadata(media, {
        storagePath: undefined,
        source: "expired"
      });
    }
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

  const expiresAt = getResultImageExpiresAt(result);
  if (Date.parse(expiresAt) <= Date.now()) {
    throw new Error("Image expired.");
  }

  if (result.imageStoragePath && result.imageSource === "supabase_storage") {
    return readStoredImage(result.imageStoragePath);
  }

  const legacyStoredImage = await tryReadStoredImage(buildResultImagePath(result, null));
  if (legacyStoredImage) {
    return legacyStoredImage;
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

  const expiresAt = getMessageImageExpiresAt(message);
  if (Date.parse(expiresAt) <= Date.now()) {
    throw new Error("Image expired.");
  }

  if (message.resultId) {
    try {
      return await getStoredResultImage(message.resultId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!/not found/i.test(errorMessage)) {
        throw error;
      }
    }
  }

  if (message.imageStoragePath && message.imageSource === "supabase_storage") {
    return readStoredImage(message.imageStoragePath);
  }

  const legacyStoredImage = await tryReadStoredImage(buildMessageImagePath(message, null));
  if (legacyStoredImage) {
    return legacyStoredImage;
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

  if (media.messageId) {
    try {
      return await getStoredMessageImage(media.messageId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!/not found/i.test(errorMessage)) {
        throw error;
      }
    }
  }

  if (media.storagePath && media.source === "supabase_storage") {
    return readStoredImage(media.storagePath);
  }

  const legacyStoredImage = await tryReadStoredImage(buildMediaImagePath(media, media.contentType ?? null));
  if (legacyStoredImage) {
    return legacyStoredImage;
  }

  if (media.remoteUrl) {
    const { buffer, contentType } = await downloadRemoteImage(media.remoteUrl);
    return { bytes: buffer, contentType: contentType ?? media.contentType ?? "image/jpeg" };
  }

  throw new Error("Image not found.");
}
