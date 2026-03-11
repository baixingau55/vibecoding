"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const RELOAD_FLAG = "ai-xunjian-chunk-reload";

function isChunkErrorMessage(message: string) {
  return (
    /ChunkLoadError/i.test(message) ||
    /Loading chunk [\d]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message)
  );
}

export function ChunkReloadGuard() {
  const pathname = usePathname();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      sessionStorage.removeItem(RELOAD_FLAG);
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    const tryReload = (message: string) => {
      if (!isChunkErrorMessage(message)) return;
      if (sessionStorage.getItem(RELOAD_FLAG) === "1") return;
      sessionStorage.setItem(RELOAD_FLAG, "1");
      window.location.reload();
    };

    const onError = (event: ErrorEvent) => {
      tryReload(event.message ?? "");
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        typeof reason === "string"
          ? reason
          : reason instanceof Error
            ? `${reason.name}: ${reason.message}`
            : String(reason ?? "");

      tryReload(message);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
