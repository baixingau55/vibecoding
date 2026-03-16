import { NextRequest, NextResponse } from "next/server";

import { getStoredMediaImage } from "@/lib/domain/image-retention";
import { getMediaAsset } from "@/lib/domain/media";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const media = await getMediaAsset(params.id);
  if (!media) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  if (media.kind === "image") {
    try {
      const image = await getStoredMediaImage(params.id);
      return new NextResponse(image.bytes, {
        status: 200,
        headers: {
          "Content-Type": image.contentType,
          "Cache-Control": "private, max-age=300"
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image not found";
      const status = /expired/i.test(message) ? 410 : 404;
      return NextResponse.json({ error: message }, { status });
    }
  }

  return NextResponse.redirect(media.url, { status: 302 });
}
