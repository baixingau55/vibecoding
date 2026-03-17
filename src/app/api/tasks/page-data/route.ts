import { NextResponse } from "next/server";

import { getAlgorithms } from "@/lib/domain/algorithms";
import { getPurchaseHistory, getServiceBalance } from "@/lib/domain/service-balance";
import { listTasks } from "@/lib/domain/tasks";
import { getAppStore } from "@/lib/repositories/app-store";

export async function GET() {
  const store = await getAppStore();

  const [previewRowsResult, balance, purchaseHistory, algorithms, tasks] = await Promise.all([
    "getTaskPreviewData" in store && typeof store.getTaskPreviewData === "function"
      ? store.getTaskPreviewData().catch((error) => {
          console.error("[tasks/page-data] failed to load previews", error);
          return [];
        })
      : Promise.resolve([]),
    getServiceBalance(),
    getPurchaseHistory(),
    getAlgorithms(),
    listTasks()
  ]);

  const previewByTaskId = previewRowsResult.reduce<Record<string, Array<{ qrCode: string; imageUrl: string }>>>((accumulator, item) => {
    if (!item.imageUrl) return accumulator;
    const bucket = accumulator[item.taskId] ?? [];
    if (!bucket.some((capture) => capture.qrCode === item.qrCode && capture.imageUrl === item.imageUrl)) {
      bucket.push({ qrCode: item.qrCode, imageUrl: item.imageUrl });
    }
    accumulator[item.taskId] = bucket.slice(0, 3);
    return accumulator;
  }, {});

  return NextResponse.json({
    balance,
    purchaseHistory,
    algorithms,
    tasks,
    previewByTaskId
  });
}
