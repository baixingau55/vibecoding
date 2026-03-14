import { NextResponse } from "next/server";

import { getAlgorithms } from "@/lib/domain/algorithms";

export async function GET() {
  const algorithms = await getAlgorithms();
  return NextResponse.json({
    algorithms,
    devices: []
  });
}
