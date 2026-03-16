import { NextRequest, NextResponse } from "next/server";

import { deleteLocalizedTpLinkResults } from "@/lib/domain/image-retention";
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
  const limit = Number.isFinite(payload.limit) ? Math.min(Math.max(Number(payload.limit), 1), 100) : 20;
  const result = await deleteLocalizedTpLinkResults(limit);
  return NextResponse.json(result);
}
