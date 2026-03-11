"use client";

import { CartesianGrid, Legend, Line, LineChart as RechartsLineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { TrendPoint } from "@/lib/types";

export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="chart-shell">
      <ResponsiveContainer width="100%" height={300}>
        <RechartsLineChart data={data} margin={{ left: -12, right: 12, top: 16, bottom: 0 }}>
          <CartesianGrid stroke="rgba(171,183,204,0.24)" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#8B93A7", fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} width={44} tick={{ fill: "#8B93A7", fontSize: 12 }} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="unqualifiedRate" name="不合格率" stroke="#FF7C70" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="qualifiedCount" name="合格率" stroke="#24B354" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="messageCount" name="消息提醒次数" stroke="#1785E6" strokeWidth={2} dot={false} />
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}
