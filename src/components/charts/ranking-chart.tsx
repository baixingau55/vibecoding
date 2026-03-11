"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { RankedTask, RankingMetric } from "@/lib/types";

const metricMeta: Record<RankingMetric, { unit: string }> = {
  unqualifiedRate: { unit: "%" },
  unqualifiedCount: { unit: "" },
  messageCount: { unit: "" }
};

export function RankingChart({ data, metric }: { data: RankedTask[]; metric: RankingMetric }) {
  const chartData = data.slice(0, 6).map((item) => ({
    name: item.taskName,
    value: Number(Number(item[metric]).toFixed(1))
  }));

  return (
    <div className="chart-shell">
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 12, right: 8, top: 4, bottom: 4 }}>
          <CartesianGrid stroke="rgba(58,81,116,0.12)" horizontal={false} />
          <XAxis type="number" tickLine={false} axisLine={false} unit={metricMeta[metric].unit} />
          <YAxis dataKey="name" type="category" width={120} tickLine={false} axisLine={false} />
          <Tooltip formatter={(value: number) => `${value}${metricMeta[metric].unit}`} />
          <Bar dataKey="value" radius={[12, 12, 12, 12]} fill="#3757c5" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
