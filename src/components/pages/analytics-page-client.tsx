"use client";

import { useEffect, useState } from "react";

import { AnalyticsPageSkeleton } from "@/components/loading/page-skeletons";
import { AnalyticsDashboard } from "@/components/charts/analytics-dashboard";
import type { InspectionOverview, RankedTask, RankingMetric, TrendPoint } from "@/lib/types";

type AnalyticsPayload = {
  overview: InspectionOverview;
  trends: TrendPoint[];
  rankings: Record<RankingMetric, RankedTask[]>;
};

export function AnalyticsPageClient() {
  const [payload, setPayload] = useState<AnalyticsPayload | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const response = await fetch("/api/inspection-data", { cache: "no-store" });
      const data = (await response.json()) as AnalyticsPayload;
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

  return <AnalyticsDashboard overview={payload.overview} trends={payload.trends} rankings={payload.rankings} />;
}
