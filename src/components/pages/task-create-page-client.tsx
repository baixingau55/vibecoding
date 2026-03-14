"use client";

import { useEffect, useState } from "react";

import { TaskDetailSkeleton } from "@/components/loading/page-skeletons";
import { TaskBuilder } from "@/components/tasks/task-builder";
import type { Algorithm, DeviceRef } from "@/lib/types";

type CreatePayload = {
  algorithms: Algorithm[];
  devices: DeviceRef[];
};

async function fetchCreatePayload() {
  const response = await fetch("/api/tasks/create-data", { cache: "no-store" });
  const rawBody = await response.text();

  let payload: (CreatePayload & { error?: string }) | null = null;
  if (rawBody.trim()) {
    try {
      payload = JSON.parse(rawBody) as CreatePayload & { error?: string };
    } catch {
      throw new Error(rawBody.slice(0, 200) || "创建任务数据加载失败");
    }
  }

  if (!response.ok) {
    throw new Error(payload?.error ?? (rawBody.slice(0, 200) || "创建任务数据加载失败"));
  }

  return {
    algorithms: payload?.algorithms ?? [],
    devices: payload?.devices ?? []
  };
}

export function TaskCreatePageClient({ selectedAlgorithmId }: { selectedAlgorithmId?: string }) {
  const [payload, setPayload] = useState<CreatePayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const nextPayload = await fetchCreatePayload();
        if (!cancelled) {
          setPayload(nextPayload);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "创建任务数据加载失败");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!payload && !error) {
    return <TaskDetailSkeleton />;
  }

  if (!payload) {
    return (
      <div className="ai-page ai-task-detail-page">
        <div className="ai-panel ai-module-error-card">
          <h2 className="ai-panel-title">创建任务数据加载失败</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return <TaskBuilder algorithms={payload.algorithms} devices={payload.devices} selectedAlgorithmId={selectedAlgorithmId} />;
}
