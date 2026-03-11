import { NextRequest, NextResponse } from "next/server";

import { getMediaAsset } from "@/lib/domain/media";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const media = await getMediaAsset(params.id);
  if (!media) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }
  return NextResponse.redirect(media.url, { status: 302 });
}
