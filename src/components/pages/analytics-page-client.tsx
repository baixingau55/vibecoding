"use client";

import { useEffect, useState } from "react";

import { AnalyticsPageSkeleton } from "@/components/loading/page-skeletons";
import { AnalyticsDashboard } from "@/components/charts/analytics-dashboard";
import type { InspectionOverview, RankedTask, RankingMetric, TaskTrendSeries, TrendPoint } from "@/lib/types";
import { readJsonResponse } from "@/lib/utils";

type AnalyticsPayload = {
  overview: InspectionOverview;
  trends: TrendPoint[];
  rankings: Record<RankingMetric, RankedTask[]>;
  taskTrends: TaskTrendSeries[];
};

export function AnalyticsPageClient() {
  const [payload, setPayload] = useState<AnalyticsPayload | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const response = await fetch("/api/inspection-data", { cache: "no-store" });
      const data = await readJsonResponse<AnalyticsPayload>(response, "巡检数据加载失败");
      if (cancelled) return;
      setPayload(data);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!payload) {
    return <AnalyticsPageSkeleton />;
  }

  return <AnalyticsDashboard overview={payload.overview} trends={payload.trends} rankings={payload.rankings} taskTrends={payload.taskTrends} />;
}
