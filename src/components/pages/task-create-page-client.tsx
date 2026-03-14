"use client";

import { useEffect, useState } from "react";

import { TaskBuilder } from "@/components/tasks/task-builder";
import { TaskDetailSkeleton } from "@/components/loading/page-skeletons";
import type { Algorithm, DeviceRef } from "@/lib/types";

type CreatePayload = {
  algorithms: Algorithm[];
  devices: DeviceRef[];
};

export function TaskCreatePageClient({ selectedAlgorithmId }: { selectedAlgorithmId?: string }) {
  const [payload, setPayload] = useState<CreatePayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/tasks/create-data", { cache: "no-store" });
        const data = (await response.json()) as CreatePayload & { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "创建任务数据加载失败");
        }
        if (!cancelled) {
          setPayload({ algorithms: data.algorithms, devices: data.devices });
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
