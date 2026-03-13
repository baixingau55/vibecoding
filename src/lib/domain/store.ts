import { cache } from "react";

import { getAppStore } from "@/lib/repositories/app-store";
import type { AppSnapshot } from "@/lib/types";

export const getAppSnapshot = cache(async (): Promise<AppSnapshot> => {
  const store = await getAppStore();
  return store.snapshot();
});
