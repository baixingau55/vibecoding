import { NextResponse } from "next/server";

import { dedupeDevicesByIdentity } from "@/lib/domain/device-reconciliation";
import { fetchTpLinkDevices } from "@/lib/tplink/client";

export async function GET() {
  const devices = await fetchTpLinkDevices();

  return NextResponse.json({
    devices: dedupeDevicesByIdentity(devices).sort((left, right) =>
      `${left.groupName}-${left.name}-${left.qrCode}`.localeCompare(`${right.groupName}-${right.name}-${right.qrCode}`, "zh-CN")
    )
  });
}
