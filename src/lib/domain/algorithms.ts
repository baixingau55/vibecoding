import { fetchTpLinkAlgorithms } from "@/lib/tplink/client";

export async function getAlgorithms() {
  try {
    const algorithms = await fetchTpLinkAlgorithms();
    if (algorithms.length > 0) return algorithms;
  } catch {
    // Return an empty list when TP-LINK credentials or permissions are invalid.
  }

  return [];
}
