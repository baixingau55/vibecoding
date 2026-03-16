import { NextRequest, NextResponse } from "next/server";

import { getStoredResultImage } from "@/lib/domain/image-retention";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const image = await getStoredResultImage(id);
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
