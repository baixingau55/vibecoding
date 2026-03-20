import { NextResponse } from "next/server";

import { getMessagesPageData } from "@/lib/domain/messages";

export async function GET() {
  const payload = await getMessagesPageData();

  return NextResponse.json({
    messages: payload.messages,
    mediaByMessage: payload.mediaByMessage
  });
}
