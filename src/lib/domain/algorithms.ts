import { unstable_cache } from "next/cache";

import { CACHE_TAGS } from "@/lib/domain/cache-tags";
import { fetchTpLinkAlgorithms } from "@/lib/tplink/client";

const getCachedAlgorithms = unstable_cache(
  async () => {
    try {
      return await fetchTpLinkAlgorithms();
    } catch {
      return [];
    }
  },
  ["tplink-algorithms"],
  { revalidate: 15, tags: [CACHE_TAGS.algorithms] }
);

export async function getAlgorithms() {
  return getCachedAlgorithms();
}
