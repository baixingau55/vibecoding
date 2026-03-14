import { NextResponse } from "next/server";

import { getAlgorithms } from "@/lib/domain/algorithms";
import { getAppSnapshot } from "@/lib/domain/store";

export async function GET() {
  const [algorithms, snapshot] = await Promise.all([getAlgorithms(), getAppSnapshot({ includeDevices: true })]);
  return NextResponse.json({
    algorithms,
    devices: snapshot.devices
  });
}
