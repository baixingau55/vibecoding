"use client";

import { useEffect, useState } from "react";

import { MessagesPageSkeleton } from "@/components/loading/page-skeletons";
import { MessageCenter } from "@/components/messages/message-center";
import type { MediaAsset, MessageItem } from "@/lib/types";

export function MessagesPageClient() {
  const [payload, setPayload] = useState<{ messages: MessageItem[]; mediaByMessage: Record<string, MediaAsset[]> } | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const response = await fetch("/api/messages", { cache: "no-store" });
      const data = (await response.json()) as { messages: MessageItem[]; mediaByMessage: Record<string, MediaAsset[]> };
      if (cancelled) return;

      setPayload({ messages: data.messages, mediaByMessage: data.mediaByMessage });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!payload) {
    return <MessagesPageSkeleton />;
  }

  return <MessageCenter initialMessages={payload.messages} mediaByMessage={payload.mediaByMessage} />;
}
