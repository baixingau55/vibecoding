"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, MoreHorizontal, RefreshCw, X } from "lucide-react";

import type { Algorithm, InspectionTask, PurchaseRecord, ServiceBalance } from "@/lib/types";
import { formatDateTime, formatNumber } from "@/lib/utils";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatSchedules(task: InspectionTask) {
  if (task.schedules.length === 0) return "未添加巡检时间";
  return task.schedules
    .map((item) => (item.type === "time_range" && item.endTime ? `${item.startTime} - ${item.endTime}` : item.startTime))
    .join("、");
}

function getStatusMeta(task: InspectionTask) {
  switch (task.status) {
    case "disabled":
      return { text: "任务已关闭", dot: "#B3B3B3", issue: "", previewTone: "neutral" as const };
    case "config_error":
      return {
        text: "任务异常",
        dot: "#FFC400",
        issue: task.configErrorReason ?? "算法已失效，任务中无巡检设备",
        previewTone: "danger" as const
      };
    default:
      return { text: "任务已开启", dot: "#24B354", issue: "", previewTone: "success" as const };
  }
}

type DisplayTask = InspectionTask & {
  displayId: string;
  overrideStatus?: InspectionTask["status"];
  overrideIssue?: string;
};

export function TasksWorkspace({
  balance,
  purchaseHistory,
  algorithms,
  tasks
}: {
  balance: ServiceBalance;
  purchaseHistory: PurchaseRecord[];
  algorithms: Algorithm[];
  tasks: InspectionTask[];
}) {
  const router = useRouter();
  const [showConfigOnly, setShowConfigOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState("全部");
  const [query, setQuery] = useState("");
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [purchaseCount, setPurchaseCount] = useState(1);
  const [activeMenuTaskId, setActiveMenuTaskId] = useState<string | null>(null);
  const [loadingTaskId, setLoadingTaskId] = useState("");
  const [notice, setNotice] = useState("");

  const taskPool = useMemo<DisplayTask[]>(() => {
    const clones: DisplayTask[] = [];
    const seed = tasks.length ? tasks : [];
    seed.forEach((task) => clones.push({ ...task, displayId: task.id }));
    if (seed.length > 0) clones.push({ ...seed[0], displayId: `${seed[0].id}-clone-1`, name: "A区人员在岗巡检任务" });
    if (seed.length > 0) clones.push({ ...seed[0], displayId: `${seed[0].id}-clone-2`, name: "A区人员在岗巡检任务" });
    if (seed.length > 0) clones.push({ ...seed[0], displayId: `${seed[0].id}-clone-3`, name: "A区人员在岗巡检任务" });
    if (seed[1]) clones.push({ ...seed[1], displayId: `${seed[1].id}-clone-4`, name: "A区人员在岗巡检任务", configErrorReason: "算法已失效，任务中已无巡检设备" });
    if (seed[0]) clones.push({ ...seed[0], displayId: `${seed[0].id}-clone-5`, name: "A区人员在岗巡检任务", devices: [] });
    if (seed[0]) clones.push({ ...seed[0], displayId: `${seed[0].id}-clone-6`, name: "A区人员在岗巡检任务", status: "enabled", devices: seed[0].devices.slice(0, 1) });
    return clones.slice(0, 8);
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    return taskPool.filter((task) => {
      if (showConfigOnly && task.status !== "config_error") return false;
      if (statusFilter === "已开启" && task.status === "disabled") return false;
      if (statusFilter === "已关闭" && task.status !== "disabled") return false;
      if (query.trim() && !task.name.includes(query.trim()) && !task.algorithmIds.some((item) => item.includes(query.trim()))) return false;
      return true;
    });
  }, [query, showConfigOnly, statusFilter, taskPool]);

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
    setNotice(response.ok ? "任务已关闭，历史数据与消息已保留。" : payload.error ?? "关闭失败");
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

  return (
    <div className="ai-page ai-task-list-page">
      <section className="ai-service-overview ai-service-overview-compact">
        <div className="ai-service-summary ai-service-summary-compact">
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
          </div>

          <div className="ai-service-actions">
            <button type="button" className="ai-button ai-button-light" onClick={() => setHistoryOpen(true)}>
              查看购买历史
            </button>
            <button type="button" className="ai-button ai-button-primary-outline" onClick={() => setPurchaseOpen(true)}>
              购买算法分析次数
            </button>
          </div>
        </div>

        <div className="ai-task-list-toolbar ai-task-list-toolbar-compact">
          <Link href="/tasks/select" className="ai-button ai-button-primary ai-toolbar-add">
            添加巡检任务
          </Link>

          <div className="ai-filter-group ai-filter-group-compact">
            <label className="ai-checkbox ai-checkbox-compact">
              <input type="checkbox" checked={showConfigOnly} onChange={(event) => setShowConfigOnly(event.target.checked)} />
              <span>仅显示配置异常的任务（{taskPool.filter((item) => item.status === "config_error").length}个）</span>
            </label>

            <label className="ai-field-label ai-field-label-compact">
              <span>任务开启状态</span>
              <select className="ai-input ai-input-select ai-toolbar-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option>全部</option>
                <option>已开启</option>
                <option>已关闭</option>
              </select>
            </label>

            <input
              className="ai-input ai-input-search ai-toolbar-search"
              placeholder="任务名称/算法名称"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />

            <button type="button" className="ai-button ai-button-light ai-toolbar-button" onClick={() => router.refresh()}>
              刷新
            </button>
          </div>
        </div>
      </section>

      {notice ? <div className="ai-inline-notice">{notice}</div> : null}

      {visibleTasks.length === 0 ? (
        <section className="ai-empty-state">
          <h2>请添加巡检任务</h2>
          <p>当前还没有符合筛选条件的巡检任务，去选择算法并创建一个任务吧。</p>
          <Link href="/tasks/select" className="ai-button ai-button-primary">
            添加巡检任务
          </Link>
        </section>
      ) : (
        <section className="ai-task-grid ai-task-grid-ui">
          {visibleTasks.map((task, index) => {
            const status = getStatusMeta(task);
            const previewDevices = task.devices.length > 0 ? task.devices : tasks[0]?.devices ?? [];
            const previewItems = Array.from({ length: 3 }, (_, itemIndex) => {
              const device = previewDevices[itemIndex % Math.max(1, previewDevices.length)];
              const tone = status.previewTone === "danger" && itemIndex === 0 ? "danger" : itemIndex === 0 ? "danger" : "success";
              const label = status.previewTone === "danger" && itemIndex === 0 ? "异常" : itemIndex === 0 ? "不合格" : "合格";
              return { id: `${task.displayId}-${itemIndex}`, image: device?.previewImage, tone, label };
            });

            return (
              <article key={task.displayId} className="ai-task-card ai-task-card-ui">
                <div className="ai-task-card-head">
                  <h2 className="ai-task-card-title">{index > 0 ? "A区人员在岗巡检任务" : task.name}</h2>
                  <div className="ai-task-card-status">
                    <span className="ai-status-dot" style={{ backgroundColor: status.dot }} />
                    <span>{status.text}</span>
                    <ChevronDown size={12} strokeWidth={1.8} />
                  </div>
                </div>

                <div className="ai-task-card-meta ai-task-card-meta-ui">
                  <p>巡检算法：{task.status === "config_error" ? "离岗检测" : task.algorithmIds.map(getAlgorithmName).join("、")}</p>
                  <p>巡检时间：每周一、三、五</p>
                  <p>设备总数：100 <span className="ai-danger-text">离线：{task.status === "config_error" ? 2 : 0}</span></p>
                </div>

                {task.status === "config_error" && status.issue ? (
                  <div className="ai-task-card-warning">{status.issue}</div>
                ) : null}

                <div className="ai-task-preview-box ai-task-preview-box-ui">
                  <div className="ai-task-preview-label">任务执行完成次数：10</div>
                  <div className="ai-task-preview-grid ai-task-preview-grid-ui">
                    {task.devices.length === 0 ? (
                      <div className="ai-task-preview-empty">等待巡检</div>
                    ) : (
                      previewItems.map((preview) => (
                        <div key={preview.id} className="ai-task-preview-item ai-task-preview-item-ui">
                          {preview.image ? (
                            <Image src={preview.image} alt={task.name} fill sizes="88px" />
                          ) : (
                            <div className="ai-task-preview-placeholder">等待巡检</div>
                          )}
                          <span className={cn("ai-task-preview-tag", `ai-task-preview-tag-${preview.tone}`)}>{preview.label}</span>
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
                    <button type="button" className="ai-more-button" onClick={() => setActiveMenuTaskId(activeMenuTaskId === task.displayId ? null : task.displayId)}>
                      <MoreHorizontal size={18} strokeWidth={1.8} />
                    </button>

                    {activeMenuTaskId === task.displayId ? (
                      <div className="ai-task-menu">
                        <button type="button" onClick={() => refreshTask(task.id)} disabled={loadingTaskId === task.id}>
                          <RefreshCw size={14} strokeWidth={1.8} />
                          <span>{loadingTaskId === task.id ? "刷新中" : "刷新"}</span>
                        </button>
                        <button type="button" onClick={() => router.push(`/tasks/${task.id}`)}>
                          <span>查看详情</span>
                        </button>
                        <button type="button" onClick={() => router.push(`/tasks/${task.id}`)}>
                          <span>编辑任务</span>
                        </button>
                        <button type="button" onClick={() => closeTask(task.id)} disabled={loadingTaskId === task.id}>
                          <span>关闭任务</span>
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

      <div className="ai-pagination-row ai-pagination-row-light">
        <span>共计X条 第1/1页</span>
        <div className="ai-pagination-controls">
          <select className="ai-input ai-input-select ai-pagination-select">
            <option>X条/页</option>
          </select>
          <button type="button">|&lt;</button>
          <button type="button">&lt;</button>
          <span className="ai-pagination-current">1</span>
          <button type="button">&gt;</button>
          <button type="button">&gt;|</button>
          <span>前往第</span>
          <input className="ai-input ai-pagination-input" defaultValue="1" />
          <span>页</span>
        </div>
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
                  收费标准 <strong>¥3.99</strong> / 千次
                </div>
                <div className="ai-stepper-row">
                  <span>购买服务量</span>
                  <div className="ai-stepper">
                    <button type="button" onClick={() => setPurchaseCount((current) => Math.max(1, current - 1))}>
                      -
                    </button>
                    <span>{purchaseCount}</span>
                    <button type="button" onClick={() => setPurchaseCount((current) => current + 1)}>
                      +
                    </button>
                  </div>
                  <span>千次</span>
                </div>
                <p>每执行 1 次云端算法分析（对一张图片进行检测），会消耗 1 次服务量。</p>
              </div>
              <button type="button" className="ai-text-button">
                查看计费规则
              </button>
            </div>
            <div className="ai-modal-footer">
              <div className="ai-modal-total">
                合计 <strong>¥{(purchaseCount * 3.99).toFixed(2)}</strong>
              </div>
              <button type="button" className="ai-button ai-button-primary" onClick={purchaseTimes}>
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
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
