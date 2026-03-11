import { createMockSnapshot } from "@/lib/mock-data";
import { fetchTpLinkAlgorithms } from "@/lib/tplink/client";

export async function getAlgorithms() {
  try {
    const algorithms = await fetchTpLinkAlgorithms();
    if (algorithms.length > 0) return algorithms;
  } catch {
    // Fall back to the local seeded algorithms so the project remains usable offline.
  }

  return createMockSnapshot().algorithms;
}

