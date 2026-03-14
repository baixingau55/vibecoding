"use client";

import { useEffect, useState } from "react";

import { TaskDetailSkeleton } from "@/components/loading/page-skeletons";
import { TaskDetailView } from "@/components/tasks/task-detail-view";
import type { Algorithm, DeviceRef, InspectionFailure, InspectionResult, InspectionRun, InspectionTask, MediaAsset, MessageItem } from "@/lib/types";

type SummaryPayload = { task: InspectionTask };
type RunsPayload = { runs: InspectionRun[] };
type ResultsPayload = { results: InspectionResult[] };
type FailuresPayload = { failures: InspectionFailure[] };
type MessagesPayload = { messages: MessageItem[]; mediaByMessage: Record<string, MediaAsset[]> };
type EditPayload = { algorithms: Algorithm[]; devices: DeviceRef[] };

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
  const rawBody = await response.text();

  let payload: (T & { error?: string }) | null = null;
  if (rawBody.trim()) {
    try {
      payload = JSON.parse(rawBody) as T & { error?: string };
    } catch {
      throw new Error(rawBody.slice(0, 200) || "Request failed");
    }
  }

  if (!response.ok) {
    throw new Error(payload?.error ?? (rawBody.slice(0, 200) || "Request failed"));
  }

  return payload as T;
}

export function TaskDetailPageClient({ taskId }: { taskId: string }) {
  const [summary, setSummary] = useState<ModuleState<InspectionTask | null>>(createModuleState<InspectionTask | null>(null));
  const [runs, setRuns] = useState<ModuleState<InspectionRun[]>>(createModuleState<InspectionRun[]>([]));
  const [results, setResults] = useState<ModuleState<InspectionResult[]>>(createModuleState<InspectionResult[]>([]));
  const [failures, setFailures] = useState<ModuleState<InspectionFailure[]>>(createModuleState<InspectionFailure[]>([]));
  const [messages, setMessages] = useState<ModuleState<{ messages: MessageItem[]; mediaByMessage: Record<string, MediaAsset[]> }>>(
    createModuleState<{ messages: MessageItem[]; mediaByMessage: Record<string, MediaAsset[]> }>({ messages: [], mediaByMessage: {} })
  );

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      try {
        const payload = await fetchJson<SummaryPayload>(`/api/tasks/${taskId}/summary`);
        if (cancelled) return;
        setSummary({ data: payload.task, loading: false, error: "" });
      } catch (error) {
        if (cancelled) return;
        setSummary({ data: null, loading: false, error: error instanceof Error ? error.message : "任务摘要加载失败" });
      }
    }

    void loadSummary();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

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

    void loadModule<RunsPayload, InspectionRun[]>(`/api/tasks/${taskId}/runs`, setRuns, (payload) => payload.runs, [], "任务日志加载失败");
    void loadModule<ResultsPayload, InspectionResult[]>(`/api/tasks/${taskId}/results`, setResults, (payload) => payload.results, [], "抓拍记录加载失败");
    void loadModule<FailuresPayload, InspectionFailure[]>(`/api/tasks/${taskId}/failures`, setFailures, (payload) => payload.failures, [], "异常设备加载失败");
    void loadModule<MessagesPayload, { messages: MessageItem[]; mediaByMessage: Record<string, MediaAsset[]> }>(
      `/api/tasks/${taskId}/messages`,
      setMessages,
      (payload) => ({ messages: payload.messages, mediaByMessage: payload.mediaByMessage }),
      { messages: [], mediaByMessage: {} },
      "消息与媒体加载失败"
    );

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  async function loadEditData(): Promise<EditPayload> {
    const payload = await fetchJson<EditPayload>(`/api/tasks/${taskId}/edit-data`);
    return {
      algorithms: payload.algorithms ?? [],
      devices: payload.devices ?? []
    };
  }

  if (summary.loading) {
    return <TaskDetailSkeleton />;
  }

  if (!summary.data) {
    return (
      <div className="ai-page ai-task-detail-page">
        <div className="ai-panel ai-module-error-card">
          <h2 className="ai-panel-title">任务摘要加载失败</h2>
          <p>{summary.error || "当前任务详情暂时不可用，请稍后刷新重试。"}</p>
        </div>
      </div>
    );
  }

  return (
    <TaskDetailView
      task={summary.data}
      runs={runs.data}
      results={results.data}
      failures={failures.data}
      messages={messages.data.messages}
      mediaByMessage={messages.data.mediaByMessage}
      loadingRuns={runs.loading}
      loadingResults={results.loading}
      loadingFailures={failures.loading}
      loadingMessages={messages.loading}
      runsError={runs.error}
      resultsError={results.error}
      failuresError={failures.error}
      messagesError={messages.error}
      editDataLoader={loadEditData}
    />
  );
}
