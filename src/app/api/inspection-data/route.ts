import { NextResponse } from "next/server";

import { getInspectionOverview, getRankedTasks, getTrendPoints } from "@/lib/domain/analytics";

export async function GET() {
  const [overview, trends, rankedByRate, rankedByCount, rankedByMessages] = await Promise.all([
    getInspectionOverview(),
    getTrendPoints(),
    getRankedTasks("unqualifiedRate"),
    getRankedTasks("unqualifiedCount"),
    getRankedTasks("messageCount")
  ]);

  return NextResponse.json({
    overview,
    trends,
    rankings: {
      unqualifiedRate: rankedByRate,
      unqualifiedCount: rankedByCount,
      messageCount: rankedByMessages
    }
  });
}

