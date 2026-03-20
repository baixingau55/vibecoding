import { MessagesPageClient } from "@/components/pages/messages-page-client";
import { getMessagesPageData } from "@/lib/domain/messages";

export default async function MessagesPage() {
  const payload = await getMessagesPageData();
  return <MessagesPageClient initialPayload={payload} />;
}
