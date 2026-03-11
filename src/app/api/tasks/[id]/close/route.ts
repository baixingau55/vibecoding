import { NextRequest, NextResponse } from "next/server";

import { closeTask } from "@/lib/domain/tasks";

export async function POST(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const task = await closeTask(params.id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  return NextResponse.json({ task });
}

