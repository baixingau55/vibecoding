"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, MoreHorizontal, RefreshCw, X } from "lucide-react";

import type { Algorithm, InspectionTask, PurchaseRecord, ServiceBalance } from "@/lib/types";
import { formatDateTime, formatNumber } from "@/lib/utils";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function getStatusMeta(task: InspectionTask) {
  switch (task.status) {
    case "disabled":
      return { text: "任务已关闭", dot: "#B3B3B3", issue: "" };
    case "config_error":
      return {
        text: "任务异常",
        dot: "#FFC400",
        issue: task.configErrorReason ?? "任务配置异常"
      };
    case "running":
      return { text: "执行中", dot: "#1785E6", issue: "" };
    default:
      return { text: "任务已开启", dot: "#24B354", issue: "" };
  }
}

function TaskCardSkeleton() {
  return (
    <article className="ai-task-card ai-task-card-ui ai-skeleton-card">
      <div className="ai-skeleton-line ai-skeleton-title" />
      <div className="ai-skeleton-line ai-skeleton-medium" />
      <div className="ai-skeleton-line ai-skeleton-medium" />
      <div className="ai-task-preview-box ai-task-preview-box-ui">
        <div className="ai-skeleton-line ai-skeleton-short" />
        <div className="ai-task-preview-grid ai-task-preview-grid-ui">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="ai-task-preview-item ai-task-preview-item-ui">
              <div className="ai-task-preview-placeholder" />
            </div>
          ))}
        </div>
      </div>
      <div className="ai-skeleton-line ai-skeleton-medium" />
    </article>
  );
}

export function TasksWorkspace({
  balance,
  algorithms = [],
  tasks = [],
  previewByTaskId = {},
  loadingBalance = false,
  loadingTasks = false,
  loadingPreviews = false,
  loadingAlgorithms = false,
  balanceError,
  tasksError,
  previewsError,
  algorithmsError
}: {
  balance: ServiceBalance | null;
  algorithms?: Algorithm[];
  tasks?: InspectionTask[];
  previewByTaskId?: Record<string, Array<{ qrCode: string; imageUrl: string }>>;
  loadingBalance?: boolean;
  loadingTasks?: boolean;
  loadingPreviews?: boolean;
  loadingAlgorithms?: boolean;
  balanceError?: string;
  tasksError?: string;
  previewsError?: string;
  algorithmsError?: string;
}) {
  const router = useRouter();
  const [showConfigOnly, setShowConfigOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState("全部");
  const [query, setQuery] = useState("");
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [purchaseCount, setPurchaseCount] = useState(1);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [activeMenuTaskId, setActiveMenuTaskId] = useState<string | null>(null);
  const [loadingTaskId, setLoadingTaskId] = useState("");
  const [notice, setNotice] = useState("");

  const visibleTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (showConfigOnly && task.status !== "config_error") return false;
      if (statusFilter === "已开启" && !["enabled", "running", "partial_success", "completed"].includes(task.status)) return false;
      if (statusFilter === "已关闭" && task.status !== "disabled") return false;
      if (
        query.trim() &&
        !task.name.includes(query.trim()) &&
        !task.algorithmIds.some((item) => item.includes(query.trim())) &&
        !task.devices.some((item) => item.name.includes(query.trim()) || item.qrCode.includes(query.trim()))
      ) {
        return false;
      }
      return true;
    });
  }, [query, showConfigOnly, statusFilter, tasks]);

  function getAlgorithmName(id: string) {
    return algorithms.find((item) => item.id === id)?.name ?? id;
  }

  async function refreshTask(taskId: string) {
    setLoadingTaskId(taskId);
    setNotice("");
    const response = await fetch(`/api/tasks/${taskId}/refresh`, { method: "POST" });
    const payload = (await response.json()) as { error?: string };
    setLoadingTaskId("");
    setNotice(response.ok ? "任务已刷新，正在更新巡检结果。" : payload.error ?? "刷新失败");
    router.refresh();
  }

  async function closeTask(taskId: string) {
    setLoadingTaskId(taskId);
    setNotice("");
    const response = await fetch(`/api/tasks/${taskId}/close`, { method: "POST" });
    const payload = (await response.json()) as { error?: string };
    setLoadingTaskId("");
    setActiveMenuTaskId(null);
    setNotice(response.ok ? "任务已关闭，历史数据与消息仍可查看。" : payload.error ?? "关闭失败");
    router.refresh();
  }

  async function deleteTask(taskId: string) {
    setLoadingTaskId(taskId);
    setNotice("");
    const response = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    const payload = (await response.json()) as { error?: string };
    setLoadingTaskId("");
    setActiveMenuTaskId(null);
    setNotice(response.ok ? "任务已删除。" : payload.error ?? "删除失败");
    router.refresh();
  }

  async function purchaseTimes() {
    const amount = purchaseCount * 5000;
    const response = await fetch("/api/service/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount })
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setNotice(payload.error ?? "购买失败");
      return;
    }
    setPurchaseOpen(false);
    setNotice(`购买成功，已增加 ${formatNumber(amount)} 次算法分析次数。`);
    router.refresh();
  }

  async function openHistory() {
    setHistoryOpen(true);
    if (purchaseHistory.length > 0 || historyLoading) return;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetch("/api/service/purchase-history", { cache: "no-store" });
      const payload = (await response.json()) as { records?: PurchaseRecord[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "购买历史加载失败");
      }
      setPurchaseHistory(payload.records ?? []);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "购买历史加载失败");
    } finally {
      setHistoryLoading(false);
    }
  }

  const configErrorCount = tasks.filter((item) => item.status === "config_error").length;

  return (
    <div className="ai-page ai-task-list-page">
      <section className="ai-service-overview ai-service-overview-compact">
        <div className="ai-service-summary ai-service-summary-compact">
          {loadingBalance || !balance ? (
            <>
              <div className="ai-skeleton-stack">
                <div className="ai-skeleton-line ai-skeleton-title" />
                <div className="ai-skeleton-line ai-skeleton-wide" />
              </div>
              <div className="ai-skeleton-actions">
                <div className="ai-skeleton-line ai-skeleton-button" />
                <div className="ai-skeleton-line ai-skeleton-button ai-skeleton-button-primary" />
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="ai-section-title-row">
                  <h1 className="ai-section-title">AI算法服务概况</h1>
                  <span className="ai-help-dot">i</span>
                </div>
                <div className="ai-service-numbers ai-service-numbers-compact">
                  <span>
                    已购买服务量（算法分析次数）：<strong>{formatNumber(balance.total)}次</strong>
                  </span>
                  <span>
                    剩余可用次数：<strong className="ai-link-value">{formatNumber(balance.remaining)}次</strong>
                  </span>
                </div>
                {balanceError ? <div className="ai-module-error">{balanceError}</div> : null}
              </div>

              <div className="ai-service-actions">
                <button type="button" className="ai-button ai-button-light" onClick={() => void openHistory()}>
                  查看购买历史
                </button>
                <button type="button" className="ai-button ai-button-primary-outline" onClick={() => setPurchaseOpen(true)}>
                  购买算法分析次数
                </button>
              </div>
            </>
          )}
        </div>

        <div className="ai-task-list-toolbar ai-task-list-toolbar-compact">
          <Link href="/tasks/select" className="ai-button ai-button-primary ai-toolbar-add">
            添加巡检任务
          </Link>

          <div className="ai-filter-group ai-filter-group-compact">
            <label className="ai-checkbox ai-checkbox-compact">
              <input type="checkbox" checked={showConfigOnly} onChange={(event) => setShowConfigOnly(event.target.checked)} />
              <span>仅显示配置异常的任务（{configErrorCount}个）</span>
            </label>

            <label className="ai-field-label ai-field-label-compact">
              <span>任务开启状态</span>
              <select className="ai-input ai-input-select ai-toolbar-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option>全部</option>
                <option>已开启</option>
                <option>已关闭</option>
              </select>
            </label>

            <input className="ai-input ai-input-search ai-toolbar-search" placeholder="任务名称/算法名称" value={query} onChange={(event) => setQuery(event.target.value)} />

            <button type="button" className="ai-button ai-button-light ai-toolbar-button" onClick={() => router.refresh()}>
              刷新
            </button>
          </div>
        </div>
        {algorithmsError ? <div className="ai-module-error">{algorithmsError}</div> : null}
      </section>

      {notice ? <div className="ai-inline-notice">{notice}</div> : null}

      {loadingTasks ? (
        <section className="ai-task-grid ai-task-grid-ui">
          {Array.from({ length: 6 }).map((_, index) => (
            <TaskCardSkeleton key={`task-skeleton-${index}`} />
          ))}
        </section>
      ) : tasksError ? (
        <section className="ai-panel ai-module-error-card">
          <h2 className="ai-panel-title">任务列表加载失败</h2>
          <p>{tasksError}</p>
        </section>
      ) : visibleTasks.length === 0 ? (
        <section className="ai-empty-state">
          <h2>请添加巡检任务</h2>
          <p>当前还没有符合筛选条件的巡检任务，去选择算法并创建一个任务吧。</p>
          <Link href="/tasks/select" className="ai-button ai-button-primary">
            添加巡检任务
          </Link>
        </section>
      ) : (
        <section className="ai-task-grid ai-task-grid-ui">
          {visibleTasks.map((task) => {
            const status = getStatusMeta(task);
            const previewCaptures = previewByTaskId[task.id] ?? [];
            const previewDevices = task.devices.slice(0, 3).map((device) => ({ qrCode: device.qrCode, imageUrl: device.previewImage }));
            const previews = previewCaptures.length > 0 ? previewCaptures : previewDevices;

            return (
              <article key={task.id} className={cn("ai-task-card ai-task-card-ui", activeMenuTaskId === task.id && "ai-task-card-menu-open")}>
                <div className="ai-task-card-head">
                  <h2 className="ai-task-card-title">{task.name}</h2>
                  <div className="ai-task-card-status">
                    <span className="ai-status-dot" style={{ backgroundColor: status.dot }} />
                    <span>{status.text}</span>
                    <ChevronDown size={12} strokeWidth={1.8} />
                  </div>
                </div>

                <div className="ai-task-card-meta ai-task-card-meta-ui">
                  <p>巡检算法：{task.algorithmIds.map(getAlgorithmName).join("、")}</p>
                  <p>巡检时间：{task.schedules.map((item) => (item.endTime ? `${item.startTime}-${item.endTime}` : item.startTime)).join("、") || "未添加"}</p>
                  <p>
                    设备总数：{task.devices.length}
                    <span className="ai-danger-text"> 离线：{task.devices.filter((item) => item.status === "offline").length}</span>
                  </p>
                </div>

                {status.issue ? <div className="ai-task-card-warning">{status.issue}</div> : null}

                <div className="ai-task-preview-box ai-task-preview-box-ui">
                  <div className="ai-task-preview-label">任务执行完成次数：{task.status === "running" ? "执行中" : "查看详情"}</div>
                  <div className="ai-task-preview-grid ai-task-preview-grid-ui">
                    {loadingPreviews ? (
                      previews.length > 0 ? (
                        previews.map((item) => (
                          <div key={`${task.id}-${item.qrCode}-preview-skeleton`} className="ai-task-preview-item ai-task-preview-item-ui">
                            <div className="ai-task-preview-placeholder" />
                          </div>
                        ))
                      ) : (
                        <div className="ai-task-preview-empty">预览加载中</div>
                      )
                    ) : previews.length === 0 ? (
                      <div className="ai-task-preview-empty">等待巡检</div>
                    ) : (
                      previews.map((item) => (
                        <div key={`${task.id}-${item.qrCode}-${item.imageUrl}`} className="ai-task-preview-item ai-task-preview-item-ui">
                          <img src={item.imageUrl} alt={task.name} className="ai-task-preview-native" />
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="ai-task-card-foot">
                  <Link href={`/tasks/${task.id}`} className="ai-detail-link">
                    查看任务详情
                  </Link>

                  <div className="ai-task-card-menu-wrap">
                    <button type="button" className="ai-more-button" onClick={() => setActiveMenuTaskId(activeMenuTaskId === task.id ? null : task.id)}>
                      <MoreHorizontal size={18} strokeWidth={1.8} />
                    </button>

                    {activeMenuTaskId === task.id ? (
                      <div className="ai-task-menu">
                        <button type="button" onClick={() => void refreshTask(task.id)} disabled={loadingTaskId === task.id}>
                          <RefreshCw size={14} strokeWidth={1.8} />
                          <span>{loadingTaskId === task.id ? "刷新中" : "刷新"}</span>
                        </button>
                        <button type="button" onClick={() => router.push(`/tasks/${task.id}`)}>
                          <span>查看详情</span>
                        </button>
                        <button type="button" onClick={() => router.push(`/tasks/${task.id}`)}>
                          <span>编辑任务</span>
                        </button>
                        <button type="button" onClick={() => void closeTask(task.id)} disabled={loadingTaskId === task.id}>
                          <span>关闭任务</span>
                        </button>
                        <button type="button" onClick={() => void deleteTask(task.id)} disabled={loadingTaskId === task.id}>
                          <span>删除任务</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {previewsError ? <div className="ai-module-error">{previewsError}</div> : null}

      <div className="ai-pagination-row ai-pagination-row-light">
        <span>共计 {visibleTasks.length} 条</span>
      </div>

      {purchaseOpen ? (
        <div className="ai-overlay">
          <div className="ai-modal ai-purchase-modal">
            <div className="ai-modal-header">
              <strong>购买算法分析次数</strong>
              <button type="button" className="ai-close-button" onClick={() => setPurchaseOpen(false)}>
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>
            <div className="ai-modal-body">
              <div className="ai-modal-subtitle">购买算法分析次数（所有云端算法共用）</div>
              <div className="ai-purchase-box">
                <div className="ai-price-line">
                  收费标准 <strong>￥3.99</strong> / 千次
                </div>
                <div className="ai-stepper-row">
                  <span>购买服务量</span>
                  <div className="ai-stepper">
                    <button type="button" onClick={() => setPurchaseCount((current) => Math.max(1, current - 1))}>
                      -
                    </button>
                    <span>{purchaseCount}</span>
                    <button type="button" onClick={() => setPurchaseCount((current) => current + 1)}>+</button>
                  </div>
                  <span>千次</span>
                </div>
              </div>
            </div>
            <div className="ai-modal-footer">
              <div className="ai-modal-total">
                合计 <strong>￥{(purchaseCount * 3.99).toFixed(2)}</strong>
              </div>
              <button type="button" className="ai-button ai-button-primary" onClick={() => void purchaseTimes()}>
                余额支付
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyOpen ? (
        <div className="ai-overlay ai-overlay-right" onClick={() => setHistoryOpen(false)}>
          <aside className="ai-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="ai-drawer-header">
              <strong>购买历史</strong>
              <button type="button" className="ai-close-button" onClick={() => setHistoryOpen(false)}>
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>
            <div className="ai-drawer-body">
              {historyLoading ? (
                <div className="ai-skeleton-table">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={`history-skeleton-${index}`} className="ai-skeleton-table-row">
                      <div className="ai-skeleton-cell ai-skeleton-cell-small" />
                      <div className="ai-skeleton-cell ai-skeleton-cell-medium" />
                      <div className="ai-skeleton-cell ai-skeleton-cell-small" />
                      <div className="ai-skeleton-cell ai-skeleton-cell-medium" />
                    </div>
                  ))}
                </div>
              ) : historyError ? (
                <div className="ai-module-error">{historyError}</div>
              ) : (
                <table className="ai-table">
                  <thead>
                    <tr>
                      <th>序号</th>
                      <th>购买时间</th>
                      <th>购买次数</th>
                      <th>购买账号</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseHistory.map((record, index) => (
                      <tr key={record.id}>
                        <td>{index + 1}</td>
                        <td>{formatDateTime(record.createdAt)}</td>
                        <td>{record.amount}</td>
                        <td>{record.accountName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
