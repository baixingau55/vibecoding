import { NextRequest, NextResponse } from "next/server";

import { getTaskRuns } from "@/lib/domain/tasks";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const runs = await getTaskRuns(params.id);
  return NextResponse.json({ runs });
}
