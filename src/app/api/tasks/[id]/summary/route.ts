import { NextRequest, NextResponse } from "next/server";

import { getTaskSummary } from "@/lib/domain/tasks";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const task = await getTaskSummary(params.id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ task });
}
