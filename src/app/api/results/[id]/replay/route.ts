import { NextRequest, NextResponse } from "next/server";

import { ensureReplayMediaForResult } from "@/lib/domain/media";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;

  try {
    const media = await ensureReplayMediaForResult(params.id);
    if (request.nextUrl.searchParams.get("redirect") === "1") {
      return NextResponse.redirect(media.url, { status: 302 });
    }

    return NextResponse.json({
      id: media.id,
      url: media.url,
      expiresAt: media.expiresAt
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Replay fetch failed" },
      { status: 400 }
    );
  }
}
