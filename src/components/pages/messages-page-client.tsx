"use client";

import { useEffect, useState } from "react";

import { MessagesPageSkeleton } from "@/components/loading/page-skeletons";
import { MessageCenter } from "@/components/messages/message-center";
import type { MediaAsset, MessageItem } from "@/lib/types";
import { readJsonResponse } from "@/lib/utils";

type MessagesPagePayload = { messages: MessageItem[]; mediaByMessage: Record<string, MediaAsset[]> };

export function MessagesPageClient({ initialPayload }: { initialPayload?: MessagesPagePayload | null }) {
  const [payload, setPayload] = useState<MessagesPagePayload | null>(initialPayload ?? null);

  useEffect(() => {
    if (initialPayload) {
      return;
    }

    let cancelled = false;

    (async () => {
      const response = await fetch("/api/messages", { cache: "no-store" });
      const data = await readJsonResponse<{ messages: MessageItem[]; mediaByMessage: Record<string, MediaAsset[]> }>(
        response,
        "消息列表加载失败"
      );
      if (cancelled) return;

      setPayload({ messages: data.messages, mediaByMessage: data.mediaByMessage });
    })();

    return () => {
      cancelled = true;
    };
  }, [initialPayload]);

  if (!payload) {
    return <MessagesPageSkeleton />;
  }

  return <MessageCenter initialMessages={payload.messages} mediaByMessage={payload.mediaByMessage} />;
}
