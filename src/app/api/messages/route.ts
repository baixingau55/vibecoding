import { NextResponse } from "next/server";

import { getMessages } from "@/lib/domain/messages";
import { getAppStore } from "@/lib/repositories/app-store";

export async function GET() {
  const store = await getAppStore();
  const payload =
    "getMessagesData" in store && typeof store.getMessagesData === "function"
      ? await store.getMessagesData()
      : { messages: await getMessages(), media: (await store.snapshot(false)).media };

  const mediaByMessage = payload.media.reduce<Record<string, typeof payload.media>>((accumulator, media) => {
    if (!media.messageId) return accumulator;
    (accumulator[media.messageId] ??= []).push(media);
    return accumulator;
  }, {});

  return NextResponse.json({
    messages: payload.messages.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    mediaByMessage
  });
}
