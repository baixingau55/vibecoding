import { NextRequest, NextResponse } from "next/server";

import { getTaskRuntimeSummary } from "@/lib/domain/tasks";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const summary = await getTaskRuntimeSummary(params.id);
  if (!summary) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json(summary);
}
