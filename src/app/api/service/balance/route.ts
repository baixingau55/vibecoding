import { NextResponse } from "next/server";

import { getServiceBalance } from "@/lib/domain/service-balance";

export async function GET() {
  const balance = await getServiceBalance();
  return NextResponse.json({ balance });
}

