import type { InspectionOverview, RankedTask, RankingMetric, TrendPoint } from "@/lib/types";

import { getAppSnapshot } from "@/lib/domain/store";

export async function getInspectionOverview(): Promise<InspectionOverview> {
  const snapshot = await getAppSnapshot();
  const successfulResults = snapshot.results.filter((item) => item.result !== "UNAVAILABLE");
  const qualifiedCount = successfulResults.filter((item) => item.result === "QUALIFIED").length;
  const unqualifiedCount = successfulResults.filter((item) => item.result === "UNQUALIFIED").length;
  const totalChecks = successfulResults.length;
  const messageCount = snapshot.messages.length;

  return {
    totalChecks,
    qualifiedCount,
    unqualifiedCount,
    messageCount,
    unqualifiedRate: totalChecks === 0 ? 0 : (unqualifiedCount / totalChecks) * 100
  };
}

export async function getTrendPoints(): Promise<TrendPoint[]> {
  const snapshot = await getAppSnapshot();
  const grouped = new Map<string, TrendPoint>();

  for (const result of snapshot.results) {
    if (result.result === "UNAVAILABLE") continue;
    const label = result.imageTime.slice(0, 10);
    const existing = grouped.get(label) ?? {
      label,
      qualifiedCount: 0,
      unqualifiedCount: 0,
      messageCount: 0,
      unqualifiedRate: 0
    };

    if (result.result === "QUALIFIED") existing.qualifiedCount += 1;
    if (result.result === "UNQUALIFIED") existing.unqualifiedCount += 1;
    grouped.set(label, existing);
  }

  for (const message of snapshot.messages) {
    const label = message.createdAt.slice(0, 10);
    const existing = grouped.get(label) ?? {
      label,
      qualifiedCount: 0,
      unqualifiedCount: 0,
      messageCount: 0,
      unqualifiedRate: 0
    };
    existing.messageCount += 1;
    grouped.set(label, existing);
  }

  return Array.from(grouped.values())
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((point) => {
      const total = point.qualifiedCount + point.unqualifiedCount;
      return {
        ...point,
        unqualifiedRate: total === 0 ? 0 : (point.unqualifiedCount / total) * 100
      };
    });
}

export async function getRankedTasks(metric: RankingMetric): Promise<RankedTask[]> {
  const snapshot = await getAppSnapshot();

  const rankings = snapshot.tasks.map<RankedTask>((task) => {
    const results = snapshot.results.filter((item) => item.taskId === task.id && item.result !== "UNAVAILABLE");
    const messages = snapshot.messages.filter((item) => item.taskId === task.id);
    const unqualifiedCount = results.filter((item) => item.result === "UNQUALIFIED").length;
    const totalChecks = results.length;
    return {
      taskId: task.id,
      taskName: task.name,
      totalChecks,
      unqualifiedCount,
      messageCount: messages.length,
      unqualifiedRate: totalChecks === 0 ? 0 : (unqualifiedCount / totalChecks) * 100
    };
  });

  return rankings.sort((a, b) => b[metric] - a[metric]);
}

