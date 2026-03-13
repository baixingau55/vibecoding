"use client";

import { CartesianGrid, Legend, Line, LineChart as RechartsLineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { TrendPoint } from "@/lib/types";

const metricConfig = {
  qualifiedRate: { key: "qualifiedRate", name: "合格率", stroke: "#24B354", percent: true },
  unqualifiedRate: { key: "unqualifiedRate", name: "不合格率", stroke: "#FF7C70", percent: true },
  qualifiedCount: { key: "qualifiedCount", name: "合格次数", stroke: "#24B354", percent: false },
  unqualifiedCount: { key: "unqualifiedCount", name: "不合格次数", stroke: "#FF7C70", percent: false },
  messageCount: { key: "messageCount", name: "消息提醒次数", stroke: "#1785E6", percent: false }
} as const;

export function TrendChart({
  data,
  metric = "unqualifiedRate"
}: {
  data: TrendPoint[];
  metric?: keyof typeof metricConfig;
}) {
  const currentMetric = metricConfig[metric];

  return (
    <div className="chart-shell">
      <ResponsiveContainer width="100%" height={300}>
        <RechartsLineChart data={data} margin={{ left: -12, right: 12, top: 16, bottom: 0 }}>
          <CartesianGrid stroke="rgba(171,183,204,0.24)" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#8B93A7", fontSize: 12 }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={52}
            tick={{ fill: "#8B93A7", fontSize: 12 }}
            tickFormatter={(value: number) => (currentMetric.percent ? `${value}%` : `${value}`)}
          />
          <Tooltip formatter={(value: number) => (currentMetric.percent ? `${value.toFixed(1)}%` : value)} />
          <Legend />
          <Line
            type="monotone"
            dataKey={currentMetric.key}
            name={currentMetric.name}
            stroke={currentMetric.stroke}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}
