import { NextRequest, NextResponse } from "next/server";

import { getAppSnapshot } from "@/lib/domain/store";
import env from "@/lib/env";

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

  const snapshot = await getAppSnapshot({ includeDevices: false });
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50;

  return NextResponse.json({
    scans: snapshot.schedulerScans.slice(0, safeLimit)
  });
}
