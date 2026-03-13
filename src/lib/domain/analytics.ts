import type { InspectionOverview, RankedTask, RankingMetric, TrendPoint } from "@/lib/types";

import { getAppSnapshot } from "@/lib/domain/store";

function buildInspectionOverview(snapshot: Awaited<ReturnType<typeof getAppSnapshot>>): InspectionOverview {
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
    qualifiedRate: totalChecks === 0 ? 0 : (qualifiedCount / totalChecks) * 100,
    unqualifiedRate: totalChecks === 0 ? 0 : (unqualifiedCount / totalChecks) * 100
  };
}

function buildTrendPoints(snapshot: Awaited<ReturnType<typeof getAppSnapshot>>): TrendPoint[] {
  const grouped = new Map<string, TrendPoint>();

  for (const result of snapshot.results) {
    if (result.result === "UNAVAILABLE") continue;
    const label = result.imageTime.slice(0, 10);
    const existing = grouped.get(label) ?? {
      label,
      qualifiedCount: 0,
      unqualifiedCount: 0,
      messageCount: 0,
      qualifiedRate: 0,
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
      qualifiedRate: 0,
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
        qualifiedRate: total === 0 ? 0 : (point.qualifiedCount / total) * 100,
        unqualifiedRate: total === 0 ? 0 : (point.unqualifiedCount / total) * 100
      };
    });
}

function buildRankedTasks(snapshot: Awaited<ReturnType<typeof getAppSnapshot>>, metric: RankingMetric): RankedTask[] {
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

export async function getInspectionOverview(): Promise<InspectionOverview> {
  return buildInspectionOverview(await getAppSnapshot({ includeDevices: false }));
}

export async function getTrendPoints(): Promise<TrendPoint[]> {
  return buildTrendPoints(await getAppSnapshot({ includeDevices: false }));
}

export async function getRankedTasks(metric: RankingMetric): Promise<RankedTask[]> {
  return buildRankedTasks(await getAppSnapshot({ includeDevices: false }), metric);
}

export async function getAnalyticsPayload() {
  const snapshot = await getAppSnapshot({ includeDevices: false });
  return {
    overview: buildInspectionOverview(snapshot),
    trends: buildTrendPoints(snapshot),
    rankings: {
      unqualifiedRate: buildRankedTasks(snapshot, "unqualifiedRate"),
      unqualifiedCount: buildRankedTasks(snapshot, "unqualifiedCount"),
      messageCount: buildRankedTasks(snapshot, "messageCount")
    }
  };
}
