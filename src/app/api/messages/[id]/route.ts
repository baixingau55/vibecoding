import { NextRequest, NextResponse } from "next/server";

import { getMessageById } from "@/lib/domain/messages";
import { getMediaForMessage } from "@/lib/domain/media";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const message = await getMessageById(params.id);
  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const media = await getMediaForMessage(message.id);
  return NextResponse.json({ message, media });
}

