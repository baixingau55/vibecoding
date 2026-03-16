import { createClient } from "@supabase/supabase-js";

import env, { hasSupabaseEnv } from "@/lib/env";

export function getSupabaseAdminClient() {
  if (!hasSupabaseEnv()) {
    return null;
  }

  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false }
  });
}

let bucketReadyAt = 0;
let bucketReadyPromise: Promise<void> | null = null;
const BUCKET_CACHE_TTL_MS = 5 * 60 * 1000;

export async function ensureInspectionMediaBucket() {
  const client = getSupabaseAdminClient();
  if (!client) return;

  const now = Date.now();
  if (now - bucketReadyAt < BUCKET_CACHE_TTL_MS) {
    return;
  }

  if (bucketReadyPromise) {
    return bucketReadyPromise;
  }

  bucketReadyPromise = (async () => {
    const { data: buckets, error: listError } = await client.storage.listBuckets();
    if (listError) {
      throw listError;
    }

    const exists = (buckets ?? []).some((bucket) => bucket.name === env.supabaseInspectionMediaBucket);
    if (!exists) {
      const { error: createError } = await client.storage.createBucket(env.supabaseInspectionMediaBucket, {
        public: false,
        fileSizeLimit: "20MB"
      });
      if (createError && !/already exists/i.test(createError.message)) {
        throw createError;
      }
    }

    bucketReadyAt = Date.now();
  })().finally(() => {
    bucketReadyPromise = null;
  });

  return bucketReadyPromise;
}
