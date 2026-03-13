import { NextResponse } from "next/server";

import { getAppStore } from "@/lib/repositories/app-store";

export async function GET() {
  const store = await getAppStore();
  const previewRows =
    "getTaskPreviewData" in store && typeof store.getTaskPreviewData === "function"
      ? await store.getTaskPreviewData()
      : [];

  const previewByTaskId = previewRows.reduce<Record<string, Array<{ qrCode: string; imageUrl: string }>>>((accumulator, item) => {
    if (!item.imageUrl) return accumulator;
    const bucket = accumulator[item.taskId] ?? [];
    if (!bucket.some((capture) => capture.qrCode === item.qrCode && capture.imageUrl === item.imageUrl)) {
      bucket.push({ qrCode: item.qrCode, imageUrl: item.imageUrl });
    }
    accumulator[item.taskId] = bucket.slice(0, 3);
    return accumulator;
  }, {});

  return NextResponse.json({ previewByTaskId });
}
