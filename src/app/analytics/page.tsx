import { AnalyticsPageClient } from "@/components/pages/analytics-page-client";
import { getAnalyticsPayload } from "@/lib/domain/analytics";

export default async function AnalyticsPage() {
  const payload = await getAnalyticsPayload();
  return <AnalyticsPageClient initialPayload={payload} />;
}
