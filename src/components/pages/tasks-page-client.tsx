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
  const taskIdsKey = tasks.data.map((task) => task.id).join(",");
  const hasTasks = tasks.data.length > 0;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [balanceResult, algorithmsResult, tasksResult] = await Promise.allSettled([
        fetchJson<{ balance: ServiceBalance }>("/api/service/balance"),
        fetchJson<{ algorithms: Algorithm[] }>("/api/algorithms"),
        fetchJson<{ tasks: InspectionTask[] }>("/api/tasks")
      ]);

      if (cancelled) return;

      setBalance(
        balanceResult.status === "fulfilled"
          ? { data: balanceResult.value.balance, loading: false, error: "" }
          : { data: null, loading: false, error: balanceResult.reason instanceof Error ? balanceResult.reason.message : "服务概况加载失败" }
      );
      setAlgorithms(
        algorithmsResult.status === "fulfilled"
          ? { data: algorithmsResult.value.algorithms, loading: false, error: "" }
          : { data: [], loading: false, error: algorithmsResult.reason instanceof Error ? algorithmsResult.reason.message : "算法列表加载失败" }
      );
      setTasks(
        tasksResult.status === "fulfilled"
          ? { data: tasksResult.value.tasks, loading: false, error: "" }
          : { data: [], loading: false, error: tasksResult.reason instanceof Error ? tasksResult.reason.message : "任务列表加载失败" }
      );
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (tasks.loading || !!tasks.error) {
      return () => {
        cancelled = true;
      };
    }

    if (!hasTasks) {
      setPreviews({ data: {}, loading: false, error: "" });
      return () => {
        cancelled = true;
      };
    }

    setPreviews((current) => ({ data: current.data, loading: true, error: "" }));

    (async () => {
      try {
        const payload = await fetchJson<{ previewByTaskId: Record<string, Array<{ qrCode: string; imageUrl: string }>> }>("/api/tasks/previews");
        if (cancelled) return;
        setPreviews({ data: payload.previewByTaskId, loading: false, error: "" });
      } catch (error) {
        if (cancelled) return;
        setPreviews({ data: {}, loading: false, error: error instanceof Error ? error.message : "任务预览加载失败" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasTasks, taskIdsKey, tasks.error, tasks.loading]);

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
