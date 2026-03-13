"use client";

import { useEffect, useState } from "react";

import { TasksWorkspace } from "@/components/tasks/tasks-workspace";
import type { Algorithm, InspectionTask, ServiceBalance } from "@/lib/types";

type ModuleState<T> = {
  data: T;
  loading: boolean;
  error: string;
};

function createModuleState<T>(initial: T): ModuleState<T> {
  return { data: initial, loading: true, error: "" };
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }
  return payload;
}

export function TasksPageClient() {
  const [balance, setBalance] = useState<ModuleState<ServiceBalance | null>>(createModuleState<ServiceBalance | null>(null));
  const [algorithms, setAlgorithms] = useState<ModuleState<Algorithm[]>>(createModuleState<Algorithm[]>([]));
  const [tasks, setTasks] = useState<ModuleState<InspectionTask[]>>(createModuleState<InspectionTask[]>([]));
  const [previews, setPreviews] = useState<ModuleState<Record<string, Array<{ qrCode: string; imageUrl: string }>>>>(
    createModuleState<Record<string, Array<{ qrCode: string; imageUrl: string }>>>({})
  );

  useEffect(() => {
    let cancelled = false;

    async function loadModule<TPayload, TData>(
      url: string,
      setter: (next: ModuleState<TData>) => void,
      select: (payload: TPayload) => TData,
      fallback: TData,
      defaultError: string
    ) {
      try {
        const payload = await fetchJson<TPayload>(url);
        if (cancelled) return;
        setter({ data: select(payload), loading: false, error: "" });
      } catch (error) {
        if (cancelled) return;
        setter({ data: fallback, loading: false, error: error instanceof Error ? error.message : defaultError });
      }
    }

    void loadModule<{ balance: ServiceBalance }, ServiceBalance | null>("/api/service/balance", setBalance, (payload) => payload.balance, null, "服务概况加载失败");
    void loadModule<{ algorithms: Algorithm[] }, Algorithm[]>("/api/algorithms", setAlgorithms, (payload) => payload.algorithms, [], "算法列表加载失败");
    void loadModule<{ tasks: InspectionTask[] }, InspectionTask[]>("/api/tasks", setTasks, (payload) => payload.tasks, [], "任务列表加载失败");
    void loadModule<{ previewByTaskId: Record<string, Array<{ qrCode: string; imageUrl: string }>> }, Record<string, Array<{ qrCode: string; imageUrl: string }>>>(
      "/api/tasks/previews",
      setPreviews,
      (payload) => payload.previewByTaskId,
      {},
      "任务预览加载失败"
    );

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <TasksWorkspace
      balance={balance.data}
      algorithms={algorithms.data}
      tasks={tasks.data}
      previewByTaskId={previews.data}
      loadingBalance={balance.loading}
      loadingTasks={tasks.loading}
      loadingPreviews={previews.loading}
      loadingAlgorithms={algorithms.loading}
      balanceError={balance.error}
      tasksError={tasks.error}
      previewsError={previews.error}
      algorithmsError={algorithms.error}
    />
  );
}
