import { MessageCenter } from "@/components/messages/message-center";
import { getMediaForMessage } from "@/lib/domain/media";
import { getMessages } from "@/lib/domain/messages";

export default async function MessagesPage() {
  const messages = await getMessages();
  const mediaEntries = await Promise.all(messages.map(async (message) => [message.id, await getMediaForMessage(message.id)] as const));
  const mediaByMessage = Object.fromEntries(mediaEntries);

  return <MessageCenter initialMessages={messages} mediaByMessage={mediaByMessage} />;
}
