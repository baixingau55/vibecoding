import { NextRequest, NextResponse } from "next/server";

import { backfillImages } from "@/lib/domain/image-retention";
import env from "@/lib/env";

function isAuthorized(request: NextRequest) {
  if (!env.internalAdminToken) return true;

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const headerToken = request.headers.get("x-internal-admin-token");
  const queryToken = request.nextUrl.searchParams.get("token");
  const candidate = bearer || headerToken || queryToken;

  return candidate === env.internalAdminToken;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as { limit?: number };
  const limit = Number.isFinite(payload.limit) ? Math.min(Math.max(Number(payload.limit), 1), 1000) : 200;
  const result = await backfillImages(limit);
  return NextResponse.json(result);
}
