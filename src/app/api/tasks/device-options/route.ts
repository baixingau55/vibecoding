import { NextResponse } from "next/server";

import { getAppSnapshot } from "@/lib/domain/store";

export async function GET() {
  const snapshot = await getAppSnapshot({ includeDevices: true });
  return NextResponse.json({ devices: snapshot.devices });
}
