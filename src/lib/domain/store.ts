import { getAppStore } from "@/lib/repositories/app-store";
import type { AppSnapshot } from "@/lib/types";

export async function getAppSnapshot(): Promise<AppSnapshot> {
  const store = await getAppStore();
  return store.snapshot();
}
