import { NextResponse } from "next/server";

import { dedupeDevicesByIdentity } from "@/lib/domain/device-reconciliation";
import { getAppStore } from "@/lib/repositories/app-store";

export async function GET() {
  const store = await getAppStore();
  const snapshot = await store.snapshot(true);

  return NextResponse.json({
    devices: dedupeDevicesByIdentity(snapshot.devices).sort((left, right) =>
      `${left.groupName}-${left.name}-${left.qrCode}`.localeCompare(`${right.groupName}-${right.name}-${right.qrCode}`, "zh-CN")
    )
  });
}
