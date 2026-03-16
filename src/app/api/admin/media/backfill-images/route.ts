import { after, NextRequest, NextResponse } from "next/server";

import { backfillImages, getImageRetentionSchemaStatus } from "@/lib/domain/image-retention";
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
  const schema = await getImageRetentionSchemaStatus();

  after(async () => {
    try {
      await backfillImages(limit);
    } catch (error) {
      console.error("Backfill images failed", error);
    }
  });

  return NextResponse.json(
    {
      accepted: true,
      limit,
      schema
    },
    { status: 202 }
  );
}
