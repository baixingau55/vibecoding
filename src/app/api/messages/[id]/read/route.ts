import { NextRequest, NextResponse } from "next/server";

import { markMessageRead } from "@/lib/domain/messages";

export async function POST(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const message = await markMessageRead(params.id);
  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }
  return NextResponse.json({ message });
}

