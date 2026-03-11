import { getMemoryStore } from "@/lib/repositories/memory-store";
import type { AppSnapshot } from "@/lib/types";

export async function getAppSnapshot(): Promise<AppSnapshot> {
  return getMemoryStore().snapshot();
}
