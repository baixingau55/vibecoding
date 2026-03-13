import { NextRequest, NextResponse } from "next/server";

import { getTaskMessages } from "@/lib/domain/tasks";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const payload = await getTaskMessages(params.id);
  return NextResponse.json({
    messages: payload.messages,
    mediaByMessage: payload.mediaByMessage
  });
}
