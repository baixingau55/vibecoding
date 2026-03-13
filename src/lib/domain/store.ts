import { cache } from "react";

import { getAppStore } from "@/lib/repositories/app-store";
import type { AppSnapshot } from "@/lib/types";

const getCachedSnapshot = cache(async (includeDevices: boolean): Promise<AppSnapshot> => {
  const store = await getAppStore();
  return store.snapshot(includeDevices);
});

export async function getAppSnapshot(options?: { includeDevices?: boolean }): Promise<AppSnapshot> {
  return getCachedSnapshot(options?.includeDevices ?? true);
}
