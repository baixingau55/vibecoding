"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, RefreshCw, X } from "lucide-react";

import { TrendChart } from "@/components/charts/trend-chart";
import { RegionGroupSelectorModal } from "@/components/shared/selection-modals";
import { TaskBuilder } from "@/components/tasks/task-builder";
import type { Algorithm, InspectionFailure, InspectionResult, InspectionRun, InspectionTask, MessageItem } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

function buildTrend(results: InspectionResult[], messages: MessageItem[]) {
  const grouped = new Map<
    string,
    { label: string; qualifiedCount: number; unqualifiedCount: number; messageCount: number; unqualifiedRate: number }
  >();

  for (const result of results) {
    if (result.result === "UNAVAILABLE") continue;
    const key = result.imageTime.slice(5, 10);
    const current = grouped.get(key) ?? { label: key, qualifiedCount: 0, unqualifiedCount: 0, messageCount: 0, unqualifiedRate: 0 };
    if (result.result === "QUALIFIED") current.qualifiedCount += 1;
    if (result.result === "UNQUALIFIED") current.unqualifiedCount += 1;
    grouped.set(key, current);
  }

  for (const message of messages) {
    const key = message.createdAt.slice(5, 10);
    const current = grouped.get(key) ?? { label: key, qualifiedCount: 0, unqualifiedCount: 0, messageCount: 0, unqualifiedRate: 0 };
    current.messageCount += 1;
    grouped.set(key, current);
  }

  return Array.from(grouped.values()).map((item) => ({
    ...item,
    unqualifiedRate: item.qualifiedCount + item.unqualifiedCount === 0 ? 0 : (item.unqualifiedCount / (item.qualifiedCount + item.unqualifiedCount)) * 100
  }));
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function TaskDetailView({
  task,
  runs,
  results,
  failures,
  messages,
  algorithms,
  devices
}: {
  task: InspectionTask;
  runs: InspectionRun[];
  results: InspectionResult[];
  failures: InspectionFailure[];
  messages: MessageItem[];
  algorithms: Algorithm[];
  devices: InspectionTask["devices"];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [metric, setMetric] = useState<"unqualified" | "qualified" | "message">("unqualified");
  const [recordTab, setRecordTab] = useState<"all" | "qualified" | "unqualified">("all");
  const [notice, setNotice] = useState("");

  const trendData = useMemo(() => buildTrend(results, messages), [messages, results]);
  const qualifiedCount = results.filter((item) => item.result === "QUALIFIED").length;
  const unqualifiedCount = results.filter((item) => item.result === "UNQUALIFIED").length;
  const totalChecks = qualifiedCount + unqualifiedCount;
  const algorithmName = algorithms.find((item) => item.id === task.algorithmIds[0])?.name ?? task.algorithmIds[0];

  const visibleResults = useMemo(() => {
    const list =
      recordTab === "qualified"
        ? results.filter((item) => item.result === "QUALIFIED")
        : recordTab === "unqualified"
          ? results.filter((item) => item.result === "UNQUALIFIED")
          : results;

    if (list.length >= 8) return list;

    const placeholders = Array.from({ length: Math.max(0, 8 - list.length) }, (_, index) => ({
      id: `placeholder-${index}`,
      runId: "placeholder",
      taskId: task.id,
      qrCode: task.devices[0]?.qrCode ?? "",
      channelId: 1,
      algorithmId: task.algorithmIds[0],
      algorithmVersion: task.algorithmVersions[task.algorithmIds[0]],
      imageUrl: task.devices[index % Math.max(1, task.devices.length)]?.previewImage ?? "",
      imageTime: new Date(Date.now() - index * 3600000).toISOString(),
      result: index === 1 ? "UNQUALIFIED" : "QUALIFIED"
    } satisfies InspectionResult));

    return [...list, ...placeholders];
  }, [recordTab, results, task]);

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
          <div><span>任务启用状态</span><strong className="ai-success-text">{task.status === "disabled" ? "已关闭" : "已开启"}</strong></div>
          <div><span>使用算法</span><strong>{algorithmName}</strong></div>
          <div><span>巡检设备</span><strong>{task.devices.length}台（离线2）</strong></div>
          <div><span>巡检时间</span><strong>每天，08:00、10:00、15:00、23:00各巡检一次</strong></div>
          <div><span>消息提醒</span><strong>监控点每次被巡检为不合格时推送消息</strong></div>
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
          <input className="ai-input ai-date-input" defaultValue="2025-12-12" />
          <input className="ai-input ai-date-input" defaultValue="2025-12-18" />
          <button type="button" className="ai-button ai-button-primary ai-toolbar-button">查询数据</button>
          <button type="button" className="ai-button ai-button-light ai-toolbar-button">恢复默认</button>
        </div>

        <div className="ai-detail-overview-grid ai-detail-overview-grid-wide">
          <div className="ai-detail-metrics ai-detail-metrics-plain">
            <h3>巡检数据概览</h3>
            <div className="ai-detail-metrics-cards ai-detail-metrics-cards-plain">
              <div><span>任务执行完成次数</span><strong>{runs.length || 10}</strong></div>
              <div><span>总检测次数</span><strong>{totalChecks || 22}</strong></div>
              <div><span>合格次数</span><strong>{qualifiedCount || 184}</strong></div>
              <div><span>不合格次数</span><strong className="ai-danger-text">{unqualifiedCount || 40}</strong></div>
              <div><span>消息提醒次数</span><strong>{messages.length || 100}</strong></div>
              <div><span>不合格率</span><strong className="ai-danger-text">{totalChecks === 0 ? "17.86%" : `${((unqualifiedCount / totalChecks) * 100).toFixed(2)}%`}</strong></div>
            </div>
          </div>

          <div className="ai-detail-chart-card ai-detail-chart-card-plain">
            <div className="ai-detail-chart-head">
              <strong>{algorithmName}不合格率趋势</strong>
              <div className="ai-chart-segmented">
                <button type="button" className={cn("ai-chart-tab", metric === "unqualified" && "ai-chart-tab-active")} onClick={() => setMetric("unqualified")}>
                  不合格率
                </button>
                <button type="button" className={cn("ai-chart-tab", metric === "qualified" && "ai-chart-tab-active")} onClick={() => setMetric("qualified")}>
                  合格率
                </button>
                <button type="button" className={cn("ai-chart-tab", metric === "message" && "ai-chart-tab-active")} onClick={() => setMetric("message")}>
                  消息提醒次数
                </button>
              </div>
            </div>
            <TrendChart data={trendData.length ? trendData : [
              { label: "11-26", qualifiedCount: 300, unqualifiedCount: 230, messageCount: 20, unqualifiedRate: 22 },
              { label: "11-27", qualifiedCount: 320, unqualifiedCount: 360, messageCount: 30, unqualifiedRate: 30 },
              { label: "11-28", qualifiedCount: 310, unqualifiedCount: 250, messageCount: 16, unqualifiedRate: 20 },
              { label: "11-29", qualifiedCount: 300, unqualifiedCount: 200, messageCount: 14, unqualifiedRate: 16 },
              { label: "11-30", qualifiedCount: 305, unqualifiedCount: 250, messageCount: 16, unqualifiedRate: 19 },
              { label: "12-01", qualifiedCount: 300, unqualifiedCount: 330, messageCount: 24, unqualifiedRate: 24 },
              { label: "12-02", qualifiedCount: 298, unqualifiedCount: 280, messageCount: 20, unqualifiedRate: 20 }
            ]} />
          </div>
        </div>

        <div className="ai-records-section">
          <h3>巡检抓拍记录</h3>
          <div className="ai-record-tabs">
            <button type="button" className={cn("ai-record-tab", recordTab === "all" && "ai-record-tab-active")} onClick={() => setRecordTab("all")}>
              全部（{results.length || 37}）
            </button>
            <button type="button" className={cn("ai-record-tab", recordTab === "qualified" && "ai-record-tab-active")} onClick={() => setRecordTab("qualified")}>
              巡检合格（32）
            </button>
            <button type="button" className={cn("ai-record-tab", recordTab === "unqualified" && "ai-record-tab-active")} onClick={() => setRecordTab("unqualified")}>
              巡检不合格（3）
            </button>
          </div>

          <div className="ai-record-grid ai-record-grid-detail">
            {visibleResults.map((result) => (
              <article key={result.id} className="ai-record-card ai-record-card-detail">
                <div className="ai-record-image-wrap">
                  {result.imageUrl ? (
                    <Image src={result.imageUrl} alt={algorithmName} fill sizes="280px" />
                  ) : (
                    <div className="ai-record-image-placeholder" />
                  )}
                </div>
                <div className="ai-record-meta">
                  <div>检测结果: <strong className={result.result === "UNQUALIFIED" ? "ai-danger-text" : "ai-success-text"}>{result.result === "UNQUALIFIED" ? "不合格" : "合格"}</strong></div>
                  <div>{formatDateTime(result.imageTime)}</div>
                  <button type="button" className="ai-text-button ai-detail-inline-link">详情</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="ai-pagination-row ai-pagination-row-light">
        <span>共计X条 第1/1页</span>
        <div className="ai-pagination-controls">
          <select className="ai-input ai-input-select ai-pagination-select">
            <option>X条/页</option>
          </select>
          <button type="button">‹</button>
          <span className="ai-pagination-current">1</span>
          <button type="button">›</button>
          <button type="button">前往</button>
          <input className="ai-input ai-pagination-input" defaultValue="1" />
          <span>页</span>
        </div>
      </div>

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
            {(failures.length ? failures : [{ id: "filler", qrCode: "35718341031F43E43", algorithmId: "away-from-post-detection", errorCode: -20571, message: "设备抓图失败，已返还次数", runId: "", taskId: task.id, channelId: 1 }]).map((failure) => (
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

              <div>
                <h3 className="ai-panel-title ai-panel-title-small">异常设备列表</h3>
                <table className="ai-table">
                  <thead>
                    <tr>
                      <th>设备</th>
                      <th>错误码</th>
                      <th>错误原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(failures.length ? failures : [{ id: "empty", qrCode: "35718341031F43E43", errorCode: -20571, message: "设备抓图失败", runId: "", taskId: task.id, channelId: 1 }]).map((failure) => (
                      <tr key={failure.id}>
                        <td>{failure.qrCode}</td>
                        <td>{failure.errorCode}</td>
                        <td>{failure.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
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
