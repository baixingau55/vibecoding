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

export function AnalyticsPageClient({ initialPayload }: { initialPayload?: AnalyticsPayload | null }) {
  const [payload, setPayload] = useState<AnalyticsPayload | null>(initialPayload ?? null);

  useEffect(() => {
    if (initialPayload) {
      return;
    }

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
  }, [initialPayload]);

  if (!payload) {
    return <AnalyticsPageSkeleton />;
  }

  return <AnalyticsDashboard overview={payload.overview} trends={payload.trends} rankings={payload.rankings} taskTrends={payload.taskTrends} />;
}
