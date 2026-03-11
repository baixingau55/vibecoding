const env = {
  tpLinkAk: process.env.TP_LINK_AK ?? "",
  tpLinkSk: process.env.TP_LINK_SK ?? "",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  tpLinkMessageSignSecret: process.env.TP_LINK_MESSAGE_SIGN_SECRET ?? "",
  internalAdminToken: process.env.INTERNAL_ADMIN_TOKEN ?? ""
};

export function hasTpLinkEnv() {
  return Boolean(env.tpLinkAk && env.tpLinkSk);
}

export function hasSupabaseEnv() {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

export default env;
