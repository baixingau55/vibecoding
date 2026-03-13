import { AnalyticsDashboard } from "@/components/charts/analytics-dashboard";
import { getAnalyticsPayload } from "@/lib/domain/analytics";

export default async function AnalyticsPage() {
  const { overview, trends, rankings } = await getAnalyticsPayload();

  return (
    <AnalyticsDashboard
      overview={overview}
      trends={trends}
      rankings={rankings}
    />
  );
}
