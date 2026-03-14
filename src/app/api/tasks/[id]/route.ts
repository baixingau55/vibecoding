import { after, NextRequest, NextResponse } from "next/server";

import { deleteTask, getTaskRuntimeSummary, queueImmediateExecutionIfDue, upsertTask } from "@/lib/domain/tasks";
import type { InspectionTask } from "@/lib/types";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const summary = await getTaskRuntimeSummary(params.id);
  if (!summary) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json(summary);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const body = (await request.json()) as Partial<InspectionTask>;
  const task = await upsertTask({
    id: params.id,
    name: body.name,
    algorithmIds: body.algorithmIds,
    algorithmVersions: body.algorithmVersions,
    devices: body.devices,
    schedules: body.schedules,
    inspectionRule: body.inspectionRule,
    messageRule: body.messageRule,
    regionsByQrCode: body.regionsByQrCode
  });

  after(async () => {
    try {
      await queueImmediateExecutionIfDue(task);
    } catch (error) {
      console.error(`Failed to queue immediate execution for task ${task.id}`, error);
    }
  });

  return NextResponse.json({ task });
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  try {
    const task = await deleteTask(params.id);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    return NextResponse.json({ task });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete task failed" },
      { status: 400 }
    );
  }
}
