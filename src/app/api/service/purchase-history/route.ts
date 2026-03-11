import { NextResponse } from "next/server";

import { getPurchaseHistory } from "@/lib/domain/service-balance";

export async function GET() {
  const records = await getPurchaseHistory();
  return NextResponse.json({ records });
}

