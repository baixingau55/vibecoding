import { NextRequest, NextResponse } from "next/server";

import { handleTpLinkMessageCallback } from "@/lib/domain/messages";

export async function POST(request: NextRequest) {
  const payload = await request.json();
  const result = await handleTpLinkMessageCallback(payload);
  return NextResponse.json({ received: true, result });
}
