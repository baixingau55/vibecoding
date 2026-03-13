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
  const [trendMetric, setTrendMetric] = useState<"unqualifiedRate" | "qualifiedRate" | "messageCount">("unqualifiedRate");
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedRange, setAppliedRange] = useState<{ start: string; end: string }>({ start: "", end: "" });

  const filteredTrends = useMemo(() => {
    return trends.filter((point) => {
      const year = new Date().getFullYear();
      const day = `${year}-${point.label}`;
      if (appliedRange.start && day < appliedRange.start) return false;
      if (appliedRange.end && day > appliedRange.end) return false;
      return true;
    });
  }, [appliedRange.end, appliedRange.start, trends]);

  const filteredRanking = useMemo(() => {
    const rows = rankings[rankingMetric].filter((row) => selectedTaskIds.length === 0 || selectedTaskIds.includes(row.taskId));
    return [...rows].sort((a, b) => {
      const delta = rankingMetric === "unqualifiedRate" ? a.unqualifiedRate - b.unqualifiedRate : a[rankingMetric] - b[rankingMetric];
      return sortDirection === "desc" ? -delta : delta;
    });
  }, [rankingMetric, rankings, selectedTaskIds, sortDirection]);

  const visibleTrendTasks = useMemo(() => {
    const source = selectedTaskIds.length > 0 ? rankings.unqualifiedRate.filter((item) => selectedTaskIds.includes(item.taskId)) : rankings.unqualifiedRate;
    return source.slice(0, 5);
  }, [rankings.unqualifiedRate, selectedTaskIds]);

  const filteredOverview = useMemo<InspectionOverview>(() => {
    if (filteredTrends.length === 0) {
      return { totalChecks: 0, qualifiedCount: 0, unqualifiedCount: 0, messageCount: 0, qualifiedRate: 0, unqualifiedRate: 0 };
    }
    const qualifiedCount = filteredTrends.reduce((sum, item) => sum + item.qualifiedCount, 0);
    const unqualifiedCount = filteredTrends.reduce((sum, item) => sum + item.unqualifiedCount, 0);
    const messageCount = filteredTrends.reduce((sum, item) => sum + item.messageCount, 0);
    const totalChecks = qualifiedCount + unqualifiedCount;
    return {
      totalChecks,
      qualifiedCount,
      unqualifiedCount,
      messageCount,
      qualifiedRate: totalChecks === 0 ? 0 : (qualifiedCount / totalChecks) * 100,
      unqualifiedRate: totalChecks === 0 ? 0 : (unqualifiedCount / totalChecks) * 100
    };
  }, [filteredTrends]);

  const trendTitle = trendMetric === "qualifiedRate" ? "任务合格率趋势" : trendMetric === "messageCount" ? "任务消息提醒次数趋势" : "任务不合格率趋势";
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
            <input className="ai-input ai-date-input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            <span>至</span>
            <input className="ai-input ai-date-input" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
        </label>

        <button type="button" className="ai-filter-trigger ai-filter-trigger-task" onClick={() => setTaskModalOpen(true)}>
          <span className="ai-filter-caption">任务</span>
          <span className="ai-filter-value">{selectedTaskIds.length > 0 ? `已选 ${selectedTaskIds.length} 个任务` : "全部"}</span>
        </button>

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
            setSelectedTaskIds([]);
            setSelectedGroups([]);
          }}
        >
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
          <div><span>总检测次数</span><strong>{filteredOverview.totalChecks || overview.totalChecks}</strong></div>
          <div><span>消息提醒次数</span><strong>{filteredOverview.messageCount || overview.messageCount}</strong></div>
          <div><span>合格次数</span><strong>{filteredOverview.qualifiedCount || overview.qualifiedCount}</strong></div>
          <div><span>不合格次数</span><strong className="ai-danger-text">{filteredOverview.unqualifiedCount || overview.unqualifiedCount}</strong></div>
          <div><span>不合格率</span><strong className="ai-danger-text">{formatPercent(filteredOverview.totalChecks ? filteredOverview.unqualifiedRate : overview.unqualifiedRate)}</strong></div>
        </div>
      </section>

      <section className="ai-panel ai-ranking-card">
        <div className="ai-ranking-header">
          <h2 className="ai-panel-title">任务排行</h2>
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

        <table className="ai-table ai-ranking-table">
          <thead>
            <tr>
              <th>排序</th>
              <th>任务名称</th>
              <th>{rankingLabel}</th>
              <th>总检测次数</th>
            </tr>
          </thead>
          <tbody>
            {filteredRanking.map((row, index) => (
              <tr key={row.taskId}>
                <td>{index + 1}</td>
                <td>{row.taskName}</td>
                <td>{rankingMetric === "unqualifiedRate" ? formatPercent(row.unqualifiedRate) : row[rankingMetric]}</td>
                <td>{row.totalChecks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="ai-panel ai-trend-card">
        <div className="ai-trend-header ai-trend-header-top">
          <div>
            <h2 className="ai-panel-title">{trendTitle}</h2>
            <span className="ai-subtle-note">（每小时更新一次数据）</span>
          </div>
          <div className="ai-chart-segmented">
            <button type="button" className={cn("ai-chart-tab", trendMetric === "qualifiedRate" && "ai-chart-tab-active")} onClick={() => setTrendMetric("qualifiedRate")}>
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

        <div className="ai-trend-chart">
          <TrendChart data={filteredTrends} metric={trendMetric} />
        </div>

        <table className="ai-table ai-trend-table">
          <thead>
            <tr>
              <th>任务名称</th>
              {filteredTrends.map((point) => (
                <th key={point.label}>{point.label.slice(5)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleTrendTasks.map((task) => (
              <tr key={task.taskId}>
                <td>{task.taskName}</td>
                {filteredTrends.map((point) => (
                  <td key={`${task.taskId}-${point.label}`}>
                    {trendMetric === "qualifiedRate"
                      ? formatPercent(point.qualifiedRate)
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
