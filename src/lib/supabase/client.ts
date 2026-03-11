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

