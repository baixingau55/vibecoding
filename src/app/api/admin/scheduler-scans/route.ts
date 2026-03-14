import { NextRequest, NextResponse } from "next/server";

import env from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase/client";

function isAuthorized(request: NextRequest) {
  if (!env.internalAdminToken) return true;

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const headerToken = request.headers.get("x-internal-admin-token");
  const queryToken = request.nextUrl.searchParams.get("token");
  const candidate = bearer || headerToken || queryToken;

  return candidate === env.internalAdminToken;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50;

  const client = getSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ scans: [] });
  }

  const { data, error } = await client
    .from("scheduler_scans")
    .select("*")
    .order("scanned_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    const missingTable =
      error.message.includes("Could not find the table") ||
      error.message.includes("schema cache");
    if (missingTable) {
      return NextResponse.json({ scans: [], warning: error.message });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    scans:
      (data ?? []).map((row) => ({
        id: row.id,
        scannedAt: row.scanned_at,
        dueCount: row.due_count,
        completedCount: row.completed_count,
        failedCount: row.failed_count,
        errorSummary: row.error_summary ?? undefined
      }))
  });
}
