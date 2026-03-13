import { NextRequest, NextResponse } from "next/server";

import { getLatestPreviewForDevice } from "@/lib/domain/media";

export async function GET(request: NextRequest, context: { params: Promise<{ qrCode: string }> }) {
  const params = await context.params;
  const profileId = request.nextUrl.searchParams.get("profileId") ?? undefined;
  const preview = await getLatestPreviewForDevice(params.qrCode, profileId);

  if (!preview) {
    return NextResponse.json({ error: "Preview not found" }, { status: 404 });
  }

  return NextResponse.json(preview);
}
