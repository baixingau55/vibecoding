import { fetchTpLinkAlgorithms } from "@/lib/tplink/client";

const ALGORITHM_CACHE_TTL_MS = 60 * 1000;

let cachedAlgorithms: Awaited<ReturnType<typeof fetchTpLinkAlgorithms>> | null = null;
let cachedAt = 0;
let inFlight: Promise<Awaited<ReturnType<typeof fetchTpLinkAlgorithms>>> | null = null;

export async function getAlgorithms() {
  if (cachedAlgorithms && Date.now() - cachedAt < ALGORITHM_CACHE_TTL_MS) {
    return cachedAlgorithms;
  }

  if (inFlight) {
    return inFlight;
  }

  inFlight = (async () => {
    try {
      const algorithms = await fetchTpLinkAlgorithms();
      if (algorithms.length > 0) {
        cachedAlgorithms = algorithms;
        cachedAt = Date.now();
        return algorithms;
      }
    } catch {
      // Return an empty list when TP-LINK credentials or permissions are invalid.
    } finally {
      inFlight = null;
    }

    cachedAlgorithms = [];
    cachedAt = Date.now();
    return [];
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
