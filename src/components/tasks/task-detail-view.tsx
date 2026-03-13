"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, RefreshCw, X } from "lucide-react";

import { TrendChart } from "@/components/charts/trend-chart";
import { RegionGroupSelectorModal } from "@/components/shared/selection-modals";
import { TaskBuilder } from "@/components/tasks/task-builder";
import type { Algorithm, InspectionFailure, InspectionResult, InspectionRun, InspectionTask, MediaAsset, MessageItem } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function buildTrend(results: InspectionResult[], messages: MessageItem[]) {
  const grouped = new Map<
    string,
    { label: string; qualifiedCount: number; unqualifiedCount: number; messageCount: number; qualifiedRate: number; unqualifiedRate: number }
  >();

  for (const result of results) {
    if (result.result === "UNAVAILABLE") continue;
    const key = result.imageTime.slice(5, 10);
    const current = grouped.get(key) ?? { label: key, qualifiedCount: 0, unqualifiedCount: 0, messageCount: 0, qualifiedRate: 0, unqualifiedRate: 0 };
    if (result.result === "QUALIFIED") current.qualifiedCount += 1;
    if (result.result === "UNQUALIFIED") current.unqualifiedCount += 1;
    grouped.set(key, current);
  }

  for (const message of messages) {
    const key = message.createdAt.slice(5, 10);
    const current = grouped.get(key) ?? { label: key, qualifiedCount: 0, unqualifiedCount: 0, messageCount: 0, qualifiedRate: 0, unqualifiedRate: 0 };
    current.messageCount += 1;
    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((item) => ({
      ...item,
      qualifiedRate: item.qualifiedCount + item.unqualifiedCount === 0 ? 0 : (item.qualifiedCount / (item.qualifiedCount + item.unqualifiedCount)) * 100,
      unqualifiedRate: item.qualifiedCount + item.unqualifiedCount === 0 ? 0 : (item.unqualifiedCount / (item.qualifiedCount + item.unqualifiedCount)) * 100
    }));
}

export function TaskDetailView({
  task,
  runs,
  results,
  failures,
  messages,
  mediaByMessage,
  algorithms,
  devices
}: {
  task: InspectionTask;
  runs: InspectionRun[];
  results: InspectionResult[];
  failures: InspectionFailure[];
  messages: MessageItem[];
  mediaByMessage: Record<string, MediaAsset[]>;
  algorithms: Algorithm[];
  devices: InspectionTask["devices"];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [metric, setMetric] = useState<"unqualifiedRate" | "qualifiedRate" | "messageCount">("unqualifiedRate");
  const [recordTab, setRecordTab] = useState<"all" | "qualified" | "unqualified">("all");
  const [notice, setNotice] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedRange, setAppliedRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [selectedResultId, setSelectedResultId] = useState("");
  const [replayUrl, setReplayUrl] = useState("");
  const [replayError, setReplayError] = useState("");
  const [replayLoading, setReplayLoading] = useState(false);

  const algorithmName = algorithms.find((item) => item.id === task.algorithmIds[0])?.name ?? task.algorithmIds[0];

  const rangeFilteredResults = useMemo(() => {
    return results.filter((item) => {
      const day = item.imageTime.slice(0, 10);
      if (appliedRange.start && day < appliedRange.start) return false;
      if (appliedRange.end && day > appliedRange.end) return false;
      return true;
    });
  }, [appliedRange.end, appliedRange.start, results]);

  const rangeFilteredMessages = useMemo(() => {
    return messages.filter((item) => {
      const day = item.createdAt.slice(0, 10);
      if (appliedRange.start && day < appliedRange.start) return false;
      if (appliedRange.end && day > appliedRange.end) return false;
      return true;
    });
  }, [appliedRange.end, appliedRange.start, messages]);

  const visibleResults = useMemo(() => {
    const byStatus =
      recordTab === "qualified"
        ? rangeFilteredResults.filter((item) => item.result === "QUALIFIED")
        : recordTab === "unqualified"
          ? rangeFilteredResults.filter((item) => item.result === "UNQUALIFIED")
          : rangeFilteredResults;

    if (selectedGroups.length === 0) return byStatus;
    return byStatus.filter((item) => selectedGroups.some((group) => item.qrCode.includes(group) || item.algorithmId.includes(group)));
  }, [rangeFilteredResults, recordTab, selectedGroups]);

  const trendData = useMemo(() => buildTrend(rangeFilteredResults, rangeFilteredMessages), [rangeFilteredMessages, rangeFilteredResults]);
  const qualifiedCount = visibleResults.filter((item) => item.result === "QUALIFIED").length;
  const unqualifiedCount = visibleResults.filter((item) => item.result === "UNQUALIFIED").length;
  const totalChecks = qualifiedCount + unqualifiedCount;
  const selectedResult = visibleResults.find((item) => item.id === selectedResultId) ?? null;
  const relatedMessage = selectedResult
    ? rangeFilteredMessages.find((item) => item.qrCode === selectedResult.qrCode && item.algorithmId === selectedResult.algorithmId)
    : null;
  const relatedMedia = relatedMessage ? mediaByMessage[relatedMessage.id] ?? [] : [];
  const relatedVideoMedia = relatedMedia.find((item) => item.kind === "video");

  useEffect(() => {
    setReplayUrl(relatedVideoMedia?.url ?? "");
    setReplayError("");
    setReplayLoading(false);
  }, [selectedResultId, relatedVideoMedia?.url]);

  if (editing) {
    return (
      <TaskBuilder
        algorithms={algorithms}
        devices={devices}
        initialTask={task}
        submitUrl={`/api/tasks/${task.id}`}
        method="PATCH"
        redirectTo={`/tasks/${task.id}`}
      />
    );
  }

  async function refreshTask() {
    const response = await fetch(`/api/tasks/${task.id}/refresh`, { method: "POST" });
    const payload = (await response.json()) as { error?: string };
    setNotice(response.ok ? "任务数据已刷新。" : payload.error ?? "刷新失败");
    router.refresh();
  }

  async function closeTask() {
    const response = await fetch(`/api/tasks/${task.id}/close`, { method: "POST" });
    const payload = (await response.json()) as { error?: string };
    setClosing(false);
    setNotice(response.ok ? "任务已关闭，历史数据与消息仍可查看。" : payload.error ?? "关闭失败");
    router.refresh();
  }

  async function loadReplayForResult(id: string) {
    setReplayLoading(true);
    setReplayError("");
    try {
      const response = await fetch(`/api/results/${id}/replay`, { cache: "no-store" });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Replay fetch failed");
      }
      setReplayUrl(payload.url);
    } catch (error) {
      setReplayError(error instanceof Error ? error.message : "Replay fetch failed");
      setReplayUrl("");
    } finally {
      setReplayLoading(false);
    }
  }

  return (
    <div className="ai-page ai-task-detail-page">
      <div className="ai-page-breadcrumb ai-page-breadcrumb-tight">
        <Link href="/tasks">巡检任务</Link>
        <span>/</span>
        <span>查看任务详情</span>
      </div>

      <section className="ai-summary-strip ai-task-detail-summary">
        <div className="ai-summary-strip-header">
          <h1 className="ai-panel-title">任务信息</h1>
          <button type="button" className="ai-text-button" onClick={() => setEditing(true)}>
            编辑任务配置
          </button>
        </div>

        <div className="ai-task-detail-strip-grid">
          <div><span>任务名称</span><strong>{task.name}</strong></div>
          <div><span>任务启用状态</span><strong className="ai-success-text">{task.status === "disabled" ? "已关闭" : task.status === "running" ? "执行中" : "已开启"}</strong></div>
          <div><span>使用算法</span><strong>{algorithmName}</strong></div>
          <div><span>巡检设备</span><strong>{task.devices.length}台</strong></div>
          <div><span>巡检时间</span><strong>{task.schedules.map((item) => (item.endTime ? `${item.startTime}-${item.endTime}` : item.startTime)).join("、") || "未配置"}</strong></div>
          <div><span>消息提醒</span><strong>{task.messageRule.enabled ? "已开启" : "未开启"}</strong></div>
        </div>
      </section>

      {notice ? <div className="ai-inline-notice">{notice}</div> : null}

      <section className="ai-panel ai-detail-result-panel ai-detail-result-panel-tight">
        <div className="ai-detail-result-head">
          <h2 className="ai-panel-title">巡检结果</h2>
          <div className="ai-detail-head-actions">
            <button type="button" className="ai-text-button" onClick={refreshTask}>
              <RefreshCw size={14} strokeWidth={1.8} />
              刷新
            </button>
            <button type="button" className="ai-text-button" onClick={() => setLogsOpen(true)}>
              <FileText size={14} strokeWidth={1.8} />
              任务执行日志
            </button>
          </div>
        </div>

        <div className="ai-detail-filter-row ai-detail-filter-row-compact">
          <button type="button" className="ai-filter-trigger ai-filter-trigger-detail" onClick={() => setGroupModalOpen(true)}>
            <span className="ai-filter-caption">区域/分组</span>
            <span className="ai-filter-value">{selectedGroups.length > 0 ? `已选 ${selectedGroups.length} 项` : "全部"}</span>
          </button>
          <input className="ai-input ai-date-input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <input className="ai-input ai-date-input" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          <button type="button" className="ai-button ai-button-primary ai-toolbar-button" onClick={() => setAppliedRange({ start: startDate, end: endDate })}>
            查询数据
          </button>
          <button
            type="button"
            className="ai-button ai-button-light ai-toolbar-button"
            onClick={() => {
              setStartDate("");
              setEndDate("");
              setAppliedRange({ start: "", end: "" });
            }}
          >
            恢复默认
          </button>
        </div>

        <div className="ai-detail-overview-grid ai-detail-overview-grid-wide">
          <div className="ai-detail-metrics ai-detail-metrics-plain">
            <h3>巡检数据概览</h3>
            <div className="ai-detail-metrics-cards ai-detail-metrics-cards-plain">
              <div><span>任务执行完成次数</span><strong>{runs.filter((item) => item.status !== "running").length}</strong></div>
              <div><span>总检测次数</span><strong>{totalChecks}</strong></div>
              <div><span>合格次数</span><strong>{qualifiedCount}</strong></div>
              <div><span>不合格次数</span><strong className="ai-danger-text">{unqualifiedCount}</strong></div>
              <div><span>消息提醒次数</span><strong>{rangeFilteredMessages.length}</strong></div>
              <div><span>不合格率</span><strong className="ai-danger-text">{totalChecks === 0 ? "0.00%" : `${((unqualifiedCount / totalChecks) * 100).toFixed(2)}%`}</strong></div>
            </div>
          </div>

          <div className="ai-detail-chart-card ai-detail-chart-card-plain">
            <div className="ai-detail-chart-head">
              <strong>{algorithmName}趋势</strong>
              <div className="ai-chart-segmented">
                <button type="button" className={cn("ai-chart-tab", metric === "unqualifiedRate" && "ai-chart-tab-active")} onClick={() => setMetric("unqualifiedRate")}>
                  不合格率
                </button>
                <button type="button" className={cn("ai-chart-tab", metric === "qualifiedRate" && "ai-chart-tab-active")} onClick={() => setMetric("qualifiedRate")}>
                  合格率
                </button>
                <button type="button" className={cn("ai-chart-tab", metric === "messageCount" && "ai-chart-tab-active")} onClick={() => setMetric("messageCount")}>
                  提醒次数
                </button>
              </div>
            </div>
            <TrendChart data={trendData} metric={metric} />
          </div>
        </div>

        <div className="ai-records-section">
          <h3>巡检抓拍记录</h3>
          <div className="ai-record-tabs">
            <button type="button" className={cn("ai-record-tab", recordTab === "all" && "ai-record-tab-active")} onClick={() => setRecordTab("all")}>
              全部（{rangeFilteredResults.length}）
            </button>
            <button type="button" className={cn("ai-record-tab", recordTab === "qualified" && "ai-record-tab-active")} onClick={() => setRecordTab("qualified")}>
              巡检合格（{rangeFilteredResults.filter((item) => item.result === "QUALIFIED").length}）
            </button>
            <button type="button" className={cn("ai-record-tab", recordTab === "unqualified" && "ai-record-tab-active")} onClick={() => setRecordTab("unqualified")}>
              巡检不合格（{rangeFilteredResults.filter((item) => item.result === "UNQUALIFIED").length}）
            </button>
          </div>

          <div className="ai-record-grid ai-record-grid-detail">
            {visibleResults.map((result) => (
              <article key={result.id} className="ai-record-card ai-record-card-detail">
                <div className="ai-record-image-wrap">
                  {result.imageUrl ? <img src={result.imageUrl} alt={algorithmName} className="ai-record-image-native" /> : <div className="ai-record-image-placeholder" />}
                </div>
                <div className="ai-record-meta">
                  <div>检测结果 <strong className={result.result === "UNQUALIFIED" ? "ai-danger-text" : "ai-success-text"}>{result.result === "UNQUALIFIED" ? "不合格" : "合格"}</strong></div>
                  <div>{formatDateTime(result.imageTime)}</div>
                  <button type="button" className="ai-text-button ai-detail-inline-link" onClick={() => setSelectedResultId(result.id)}>
                    详情
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ai-panel ai-failure-panel">
        <h2 className="ai-panel-title">异常设备</h2>
        <table className="ai-table">
          <thead>
            <tr>
              <th>设备</th>
              <th>算法</th>
              <th>错误码</th>
              <th>失败原因</th>
            </tr>
          </thead>
          <tbody>
            {failures.map((failure) => (
              <tr key={failure.id}>
                <td>{failure.qrCode}</td>
                <td>{failure.algorithmId}</td>
                <td>{failure.errorCode}</td>
                <td>{failure.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <button type="button" className="ai-detail-close-trigger" onClick={() => setClosing(true)}>
        关闭任务
      </button>

      <RegionGroupSelectorModal
        open={groupModalOpen}
        initialValues={selectedGroups}
        onClose={() => setGroupModalOpen(false)}
        onConfirm={(values) => {
          setSelectedGroups(values);
          setGroupModalOpen(false);
        }}
      />

      {logsOpen ? (
        <div className="ai-overlay">
          <div className="ai-modal ai-log-modal ai-log-modal-wide">
            <div className="ai-modal-header">
              <strong>任务执行日志</strong>
              <button type="button" className="ai-close-button" onClick={() => setLogsOpen(false)}>
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>
            <div className="ai-modal-body ai-modal-stack">
              <table className="ai-table">
                <thead>
                  <tr>
                    <th>执行时间</th>
                    <th>执行状态</th>
                    <th>总检测次数</th>
                    <th>失败设备数</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td>{formatDateTime(run.startedAt)}</td>
                      <td>{run.status}</td>
                      <td>{run.totalChecks}</td>
                      <td>{run.failedChecks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {selectedResult ? (
        <div className="ai-overlay ai-overlay-right" onClick={() => setSelectedResultId("")}>
          <aside className="ai-message-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="ai-message-drawer-header">
              <strong>抓拍详情</strong>
              <button type="button" className="ai-close-button" onClick={() => setSelectedResultId("")}>
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>

            <div className="ai-message-drawer-section">
              <dl className="ai-message-detail-grid">
                <dt>算法名称</dt>
                <dd>{selectedResult.algorithmId}</dd>
                <dt>检测结果</dt>
                <dd>{selectedResult.result === "UNQUALIFIED" ? "不合格" : "合格"}</dd>
                <dt>抓拍时间</dt>
                <dd>{formatDateTime(selectedResult.imageTime)}</dd>
                <dt>设备</dt>
                <dd>{selectedResult.qrCode}</dd>
              </dl>
            </div>

            {selectedResult.imageUrl ? (
              <div className="ai-message-drawer-section ai-message-drawer-result">
                <div className="ai-drawer-media">
                  <img src={selectedResult.imageUrl} alt={selectedResult.algorithmId} className="ai-drawer-media-native" />
                </div>
                <div className="ai-replay-panel">
                  {replayUrl ? (
                    <video className="ai-inline-video" src={replayUrl} controls playsInline preload="metadata" />
                  ) : (
                    <div className="ai-video-empty">{replayError || "当前暂无可预览回放，点击下方按钮尝试拉取。"}</div>
                  )}
                </div>
                <button
                  type="button"
                  className="ai-button ai-button-light"
                  disabled={replayLoading}
                  onClick={() => void loadReplayForResult(selectedResult.id)}
                >
                  {replayLoading ? "正在拉取回放..." : "查看回放"}
                </button>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}

      {closing ? (
        <div className="ai-overlay">
          <div className="ai-modal ai-confirm-modal">
            <div className="ai-modal-header">
              <strong>关闭巡检任务</strong>
              <button type="button" className="ai-close-button" onClick={() => setClosing(false)}>
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>
            <div className="ai-modal-body">
              <p>确认关闭此巡检任务吗？关闭期间，任务将不再开始新的巡检。</p>
            </div>
            <div className="ai-modal-footer">
              <button type="button" className="ai-button ai-button-light" onClick={() => setClosing(false)}>
                取消
              </button>
              <button type="button" className="ai-button ai-button-primary" onClick={closeTask}>
                确认关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
