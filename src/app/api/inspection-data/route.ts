import { NextResponse } from "next/server";

import { getAnalyticsPayload } from "@/lib/domain/analytics";

export async function GET() {
  const { overview, trends, rankings } = await getAnalyticsPayload();

  return NextResponse.json({
    overview,
    trends,
    rankings
  });
}
