import { MessageCenter } from "@/components/messages/message-center";
import { getAppStore } from "@/lib/repositories/app-store";

export default async function MessagesPage() {
  const store = await getAppStore();
  const fallbackSnapshot =
    "getMessagesData" in store && typeof store.getMessagesData === "function" ? null : await store.snapshot(false);
  const { messages, media } =
    "getMessagesData" in store && typeof store.getMessagesData === "function"
      ? await store.getMessagesData()
      : { messages: fallbackSnapshot!.messages, media: fallbackSnapshot!.media };
  const sortedMessages = [...messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const mediaByMessage = Object.fromEntries(
    sortedMessages.map((message) => [message.id, media.filter((item) => item.messageId === message.id)])
  );

  return <MessageCenter initialMessages={sortedMessages} mediaByMessage={mediaByMessage} />;
}
