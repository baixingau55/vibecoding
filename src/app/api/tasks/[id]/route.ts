import { NextRequest, NextResponse } from "next/server";

import { deleteTask, getTaskById, upsertTask } from "@/lib/domain/tasks";
import type { InspectionTask } from "@/lib/types";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const task = await getTaskById(params.id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json(task);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const body = (await request.json()) as Partial<InspectionTask>;
  const task = await upsertTask({
    id: params.id,
    name: body.name ?? "未命名巡检任务",
    algorithmIds: body.algorithmIds ?? [],
    algorithmVersions: body.algorithmVersions ?? {},
    devices: body.devices ?? [],
    schedules: body.schedules ?? [],
    inspectionRule: body.inspectionRule ?? { resultMode: "detect_target" },
    messageRule: body.messageRule ?? { enabled: true, triggerMode: "every_unqualified", continuousCount: 3 },
    regionsByQrCode: body.regionsByQrCode ?? {}
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
