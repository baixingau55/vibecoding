import { getMemoryStore } from "@/lib/repositories/memory-store";

import { getAppSnapshot } from "@/lib/domain/store";

export async function getMessages() {
  const snapshot = await getAppSnapshot();
  return snapshot.messages.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getMessageById(id: string) {
  const snapshot = await getAppSnapshot();
  return snapshot.messages.find((item) => item.id === id) ?? null;
}

export async function markMessageRead(id: string) {
  const store = getMemoryStore();
  const snapshot = store.snapshot();
  const message = snapshot.messages.find((item) => item.id === id);
  if (!message) {
    return null;
  }
  const nextMessage = { ...message, read: true };
  store.updateMessage(nextMessage);
  return nextMessage;
}

