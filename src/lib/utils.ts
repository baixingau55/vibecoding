export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function formatDateTime(value: string | number | Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function slugId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}

export async function readJsonResponse<T>(response: Response, fallbackMessage = "Request failed") {
  const rawBody = await response.text();
  let payload: (T & { error?: string }) | null = null;

  if (rawBody.trim()) {
    try {
      payload = JSON.parse(rawBody) as T & { error?: string };
    } catch {
      if (!response.ok) {
        throw new Error(rawBody.slice(0, 200) || fallbackMessage);
      }
      throw new Error(rawBody.slice(0, 200) || fallbackMessage);
    }
  }

  if (!response.ok) {
    throw new Error(payload?.error ?? (rawBody.slice(0, 200) || fallbackMessage));
  }

  return payload as T;
}
