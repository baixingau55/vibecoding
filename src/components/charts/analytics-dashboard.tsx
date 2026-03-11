"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { TrendChart } from "@/components/charts/trend-chart";
import { RegionGroupSelectorModal, TaskSelectorModal } from "@/components/shared/selection-modals";
import type { InspectionOverview, RankedTask, RankingMetric, TrendPoint } from "@/lib/types";
import { formatPercent } from "@/lib/utils";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function AnalyticsDashboard({
  overview,
  trends,
  rankings
}: {
  overview: InspectionOverview;
  trends: TrendPoint[];
  rankings: Record<RankingMetric, RankedTask[]>;
}) {
  const [rankingMetric, setRankingMetric] = useState<"unqualifiedRate" | "unqualifiedCount" | "messageCount">("unqualifiedRate");
  const [trendMetric, setTrendMetric] = useState<"unqualifiedRate" | "qualifiedCount" | "messageCount">("unqualifiedRate");
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>(rankings.unqualifiedRate.slice(0, 5).map((item) => item.taskId));

  const filteredRanking = useMemo(() => {
    const rows = [...rankings[rankingMetric]];
    const sorted = rows.sort((a, b) => {
      const delta = rankingMetric === "unqualifiedRate" ? a.unqualifiedRate - b.unqualifiedRate : a[rankingMetric] - b[rankingMetric];
      return sortDirection === "desc" ? -delta : delta;
    });
    if (sorted.length >= 10) return sorted;
    const seed = sorted[0] ?? rankings.unqualifiedRate[0];
    if (!seed) return sorted;
    return [
      ...sorted,
      ...Array.from({ length: 10 - sorted.length }, (_, index) => ({
        ...seed,
        taskId: `${seed.taskId}-placeholder-${index}`,
        taskName: `此处显示任务名称`,
        totalChecks: index % 2 === 0 ? 1000 : 100,
        unqualifiedCount: index % 2 === 0 ? 100 : 10,
        messageCount: 100,
        unqualifiedRate: 90
      }))
    ];
  }, [rankings, rankingMetric, sortDirection]);

  const visibleTrendTasks = useMemo(() => {
    const selectedRows = rankings.unqualifiedRate.filter((item) => selectedTaskIds.includes(item.taskId));
    const rows = (selectedRows.length ? selectedRows : rankings.unqualifiedRate.slice(0, 5)).slice(0, 5);
    if (rows.length >= 5) return rows;
    const seed = rows[0] ?? rankings.unqualifiedRate[0];
    if (!seed) return rows;
    return [
      ...rows,
      ...Array.from({ length: 5 - rows.length }, (_, index) => ({
        ...seed,
        taskId: `${seed.taskId}-trend-placeholder-${index}`,
        taskName: `此处显示任务名称`
      }))
    ];
  }, [rankings.unqualifiedRate, selectedTaskIds]);

  const trendTitle = trendMetric === "qualifiedCount" ? "任务合格率趋势" : trendMetric === "messageCount" ? "任务消息提醒次数趋势" : "任务不合格率趋势";

  const rankingLabel = rankingMetric === "unqualifiedCount" ? "不合格次数" : rankingMetric === "messageCount" ? "消息提醒次数" : "不合格率";

  return (
    <div className="ai-page ai-analytics-page">
      <div className="ai-analytics-toolbar">
        <button type="button" className="ai-filter-trigger" onClick={() => setGroupModalOpen(true)}>
          <span className="ai-filter-caption">区域/分组</span>
          <span className="ai-filter-value">{selectedGroups.length > 0 ? `已选 ${selectedGroups.length} 项` : "全部"}</span>
        </button>

        <label className="ai-filter-date">
          <span className="ai-filter-caption">巡检时间</span>
          <div className="ai-filter-date-range">
            <input className="ai-input ai-date-input" defaultValue="2025-12-12" />
            <span>至</span>
            <input className="ai-input ai-date-input" defaultValue="2025-12-18" />
          </div>
        </label>

        <button type="button" className="ai-filter-trigger ai-filter-trigger-task" onClick={() => setTaskModalOpen(true)}>
          <span className="ai-filter-caption">任务</span>
          <span className="ai-filter-value">{selectedTaskIds.length > 0 ? `已选 ${selectedTaskIds.length} 个任务` : "全部"}</span>
        </button>

        <button type="button" className="ai-button ai-button-primary ai-toolbar-button">
          查询数据
        </button>
        <button type="button" className="ai-button ai-button-light ai-toolbar-button">
          恢复默认
        </button>
        <button type="button" className="ai-button ai-button-light ai-toolbar-refresh">
          <RefreshCw size={14} strokeWidth={1.8} />
          刷新数据
        </button>
      </div>

      <section className="ai-panel ai-analytics-overview-panel">
        <h2 className="ai-panel-title">巡检数据概览</h2>
        <div className="ai-overview-strip-grid ai-overview-strip-grid-wide">
          <div><span>总检测次数</span><strong>{overview.totalChecks || 234}</strong></div>
          <div><span>消息提醒次数</span><strong>{overview.messageCount || 100}</strong></div>
          <div><span>合格次数</span><strong>{overview.qualifiedCount || 184}</strong></div>
          <div><span>不合格次数</span><strong className="ai-danger-text">{overview.unqualifiedCount || 50}</strong></div>
          <div><span>不合格率</span><strong className="ai-danger-text">{formatPercent(overview.unqualifiedRate || 21.37)}</strong></div>
        </div>
      </section>

      <section className="ai-panel ai-ranking-card">
        <div className="ai-ranking-header">
          <h2 className="ai-panel-title">任务排行</h2>
          <button type="button" className="ai-text-button">
            查看更多
          </button>
        </div>

        <div className="ai-ranking-toolbar">
          <div className="ai-chart-segmented">
            <button type="button" className={cn("ai-chart-tab", rankingMetric === "unqualifiedRate" && "ai-chart-tab-active")} onClick={() => setRankingMetric("unqualifiedRate")}>
              不合格率
            </button>
            <button type="button" className={cn("ai-chart-tab", rankingMetric === "unqualifiedCount" && "ai-chart-tab-active")} onClick={() => setRankingMetric("unqualifiedCount")}>
              不合格次数
            </button>
            <button type="button" className={cn("ai-chart-tab", rankingMetric === "messageCount" && "ai-chart-tab-active")} onClick={() => setRankingMetric("messageCount")}>
              消息提醒次数
            </button>
          </div>

          <div className="ai-chart-segmented">
            <button type="button" className={cn("ai-chart-tab", sortDirection === "desc" && "ai-chart-tab-active")} onClick={() => setSortDirection("desc")}>
              降序
            </button>
            <button type="button" className={cn("ai-chart-tab", sortDirection === "asc" && "ai-chart-tab-active")} onClick={() => setSortDirection("asc")}>
              升序
            </button>
          </div>
        </div>

        <div className="ai-ranking-split">
          {[filteredRanking.slice(0, 5), filteredRanking.slice(5, 10)].map((group, groupIndex) => (
            <table key={groupIndex} className="ai-table ai-ranking-table">
              <thead>
                <tr>
                  <th>排序</th>
                  <th>任务名称</th>
                  <th>{rankingLabel}</th>
                  <th>总检测次数</th>
                </tr>
              </thead>
              <tbody>
                {group.map((row, rowIndex) => (
                  <tr key={row.taskId}>
                    <td>{groupIndex * 5 + rowIndex + 1}</td>
                    <td>{row.taskName}</td>
                    <td>{rankingMetric === "unqualifiedRate" ? formatPercent(row.unqualifiedRate) : row[rankingMetric]}</td>
                    <td>{row.totalChecks || 1000}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      </section>

      <section className="ai-panel ai-trend-card">
        <div className="ai-trend-header ai-trend-header-top">
          <div>
            <h2 className="ai-panel-title">{trendTitle}</h2>
            <span className="ai-subtle-note">（每小时更新一次数据）</span>
          </div>
          <div className="ai-chart-segmented">
            <button type="button" className={cn("ai-chart-tab", trendMetric === "qualifiedCount" && "ai-chart-tab-active")} onClick={() => setTrendMetric("qualifiedCount")}>
              合格率
            </button>
            <button type="button" className={cn("ai-chart-tab", trendMetric === "unqualifiedRate" && "ai-chart-tab-active")} onClick={() => setTrendMetric("unqualifiedRate")}>
              不合格率
            </button>
            <button type="button" className={cn("ai-chart-tab", trendMetric === "messageCount" && "ai-chart-tab-active")} onClick={() => setTrendMetric("messageCount")}>
              消息提醒次数
            </button>
          </div>
        </div>

        <div className="ai-trend-page-indicator">
          <span>5条任务/页</span>
          <div className="ai-trend-page-controls">
            <button type="button">‹</button>
            <span>3</span>
            <button type="button">›</button>
            <span>1/25页</span>
          </div>
        </div>

        <div className="ai-trend-chart">
          <TrendChart data={trends.length ? trends : [
            { label: "11-26", qualifiedCount: 10, unqualifiedCount: 2, messageCount: 1, unqualifiedRate: 20 },
            { label: "11-27", qualifiedCount: 12, unqualifiedCount: 3, messageCount: 2, unqualifiedRate: 25 },
            { label: "11-28", qualifiedCount: 9, unqualifiedCount: 2, messageCount: 1, unqualifiedRate: 18 },
            { label: "11-29", qualifiedCount: 14, unqualifiedCount: 4, messageCount: 2, unqualifiedRate: 29 },
            { label: "11-30", qualifiedCount: 8, unqualifiedCount: 2, messageCount: 1, unqualifiedRate: 20 },
            { label: "12-01", qualifiedCount: 15, unqualifiedCount: 4, messageCount: 2, unqualifiedRate: 27 },
            { label: "12-02", qualifiedCount: 11, unqualifiedCount: 2, messageCount: 1, unqualifiedRate: 18 }
          ]} />
        </div>

        <table className="ai-table ai-trend-table">
          <thead>
            <tr>
              <th>任务名称</th>
              {trends.map((point) => (
                <th key={point.label}>{point.label.slice(5)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleTrendTasks.map((task) => (
              <tr key={task.taskId}>
                <td>{task.taskName}</td>
                {trends.map((point) => (
                  <td key={`${task.taskId}-${point.label}`}>
                    {trendMetric === "qualifiedCount"
                      ? `${Math.max(0, 100 - Math.round(point.unqualifiedRate))}%`
                      : trendMetric === "messageCount"
                        ? point.messageCount
                        : formatPercent(point.unqualifiedRate)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <RegionGroupSelectorModal
        open={groupModalOpen}
        initialValues={selectedGroups}
        onClose={() => setGroupModalOpen(false)}
        onConfirm={(values) => {
          setSelectedGroups(values);
          setGroupModalOpen(false);
        }}
      />

      <TaskSelectorModal
        open={taskModalOpen}
        tasks={rankings.unqualifiedRate.map((item) => ({ id: item.taskId, name: item.taskName }))}
        initialValues={selectedTaskIds}
        onClose={() => setTaskModalOpen(false)}
        onConfirm={(values) => {
          setSelectedTaskIds(values);
          setTaskModalOpen(false);
        }}
      />
    </div>
  );
}
