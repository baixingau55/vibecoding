import { getAppSnapshot } from "@/lib/domain/store";

export async function getMediaAsset(id: string) {
  const snapshot = await getAppSnapshot();
  return snapshot.media.find((item) => item.id === id) ?? null;
}

export async function getMediaForMessage(messageId: string) {
  const snapshot = await getAppSnapshot();
  return snapshot.media.filter((item) => item.messageId === messageId);
}
