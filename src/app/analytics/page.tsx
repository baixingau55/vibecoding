import { AnalyticsDashboard } from "@/components/charts/analytics-dashboard";
import { getInspectionOverview, getRankedTasks, getTrendPoints } from "@/lib/domain/analytics";

export default async function AnalyticsPage() {
  const [overview, trends, rankedByRate, rankedByCount, rankedByMessages] = await Promise.all([
    getInspectionOverview(),
    getTrendPoints(),
    getRankedTasks("unqualifiedRate"),
    getRankedTasks("unqualifiedCount"),
    getRankedTasks("messageCount")
  ]);

  return (
    <AnalyticsDashboard
      overview={overview}
      trends={trends}
      rankings={{
        unqualifiedRate: rankedByRate,
        unqualifiedCount: rankedByCount,
        messageCount: rankedByMessages
      }}
    />
  );
}
