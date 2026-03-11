import { NextRequest, NextResponse } from "next/server";

import { purchaseServiceUnits } from "@/lib/domain/service-balance";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { amount?: number };
  const amount = body.amount ?? 1000;
  const result = await purchaseServiceUnits({ amount });
  return NextResponse.json(result);
}

