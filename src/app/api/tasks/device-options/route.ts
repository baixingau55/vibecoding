import { NextResponse } from "next/server";

import { getAppSnapshot } from "@/lib/domain/store";
import { dedupeDevicesByIdentity } from "@/lib/domain/device-reconciliation";

export async function GET() {
  const snapshot = await getAppSnapshot({ includeDevices: true });
  return NextResponse.json({
    devices: dedupeDevicesByIdentity(snapshot.devices).sort((left, right) =>
      `${left.groupName}-${left.name}-${left.qrCode}`.localeCompare(`${right.groupName}-${right.name}-${right.qrCode}`, "zh-CN")
    )
  });
}
