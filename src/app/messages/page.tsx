import { MessageCenter } from "@/components/messages/message-center";
import { getAppSnapshot } from "@/lib/domain/store";

export default async function MessagesPage() {
  const snapshot = await getAppSnapshot({ includeDevices: false });
  const messages = [...snapshot.messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const mediaByMessage = Object.fromEntries(
    messages.map((message) => [message.id, snapshot.media.filter((item) => item.messageId === message.id)])
  );

  return <MessageCenter initialMessages={messages} mediaByMessage={mediaByMessage} />;
}
