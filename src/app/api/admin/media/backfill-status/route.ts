import { NextRequest, NextResponse } from "next/server";

import { getImageBackfillStatus } from "@/lib/domain/image-retention";
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

  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 20);
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 20;

  const status = await getImageBackfillStatus(safeLimit);
  return NextResponse.json(status);
}
