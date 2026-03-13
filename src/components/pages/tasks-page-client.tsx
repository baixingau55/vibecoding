"use client";

import { useEffect, useState } from "react";

import { TasksPageSkeleton } from "@/components/loading/page-skeletons";
import { TasksWorkspace } from "@/components/tasks/tasks-workspace";
import type { Algorithm, InspectionTask, PurchaseRecord, ServiceBalance } from "@/lib/types";

type TasksPayload = {
  balance: ServiceBalance;
  purchaseHistory: PurchaseRecord[];
  algorithms: Algorithm[];
  tasks: InspectionTask[];
  previewByTaskId: Record<string, Array<{ qrCode: string; imageUrl: string }>>;
};

export function TasksPageClient() {
  const [payload, setPayload] = useState<TasksPayload | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const response = await fetch("/api/tasks/page-data", { cache: "no-store" });
      const data = (await response.json()) as TasksPayload;

      if (cancelled) return;

      setPayload(data);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!payload) {
    return <TasksPageSkeleton />;
  }

  return (
    <TasksWorkspace
      balance={payload.balance}
      purchaseHistory={payload.purchaseHistory}
      algorithms={payload.algorithms}
      tasks={payload.tasks}
      previewByTaskId={payload.previewByTaskId}
    />
  );
}
