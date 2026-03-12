import { NextRequest, NextResponse } from "next/server";

import { ensureReplayMediaForResult } from "@/lib/domain/media";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;

  try {
    const media = await ensureReplayMediaForResult(params.id);
    return NextResponse.redirect(media.url, { status: 302 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Replay fetch failed" },
      { status: 400 }
    );
  }
}
