import type { TpLinkProfileId } from "@/lib/types";

export interface TpLinkProfile {
  id: TpLinkProfileId;
  name: string;
  accessKey: string;
  secretKey: string;
}

function collectTpLinkProfiles() {
  const profiles: TpLinkProfile[] = [];

  if (process.env.TP_LINK_AK && process.env.TP_LINK_SK) {
    profiles.push({
      id: "primary",
      name: process.env.TP_LINK_PROFILE_1_NAME ?? "TP-LINK 账号 1",
      accessKey: process.env.TP_LINK_AK,
      secretKey: process.env.TP_LINK_SK
    });
  }

  if (process.env.TP_LINK_AK_2 && process.env.TP_LINK_SK_2) {
    profiles.push({
      id: "secondary",
      name: process.env.TP_LINK_PROFILE_2_NAME ?? "TP-LINK 账号 2",
      accessKey: process.env.TP_LINK_AK_2,
      secretKey: process.env.TP_LINK_SK_2
    });
  }

  return profiles;
}

const tpLinkProfiles = collectTpLinkProfiles();

const env = {
  tpLinkAk: tpLinkProfiles[0]?.accessKey ?? "",
  tpLinkSk: tpLinkProfiles[0]?.secretKey ?? "",
  tpLinkProfiles,
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  tpLinkMessageSignSecret: process.env.TP_LINK_MESSAGE_SIGN_SECRET ?? "",
  internalAdminToken: process.env.INTERNAL_ADMIN_TOKEN ?? ""
};

export function hasTpLinkEnv() {
  return env.tpLinkProfiles.length > 0;
}

export function hasSupabaseEnv() {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

export function getTpLinkProfiles() {
  return env.tpLinkProfiles;
}

export default env;
