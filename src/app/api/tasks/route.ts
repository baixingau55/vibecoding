import { NextRequest, NextResponse } from "next/server";

import { listTasks, upsertTask } from "@/lib/domain/tasks";
import type { InspectionTask } from "@/lib/types";

export async function GET() {
  const tasks = await listTasks();
  return NextResponse.json({ tasks });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<InspectionTask>;
  const task = await upsertTask({
    name: body.name,
    algorithmIds: body.algorithmIds,
    algorithmVersions: body.algorithmVersions,
    devices: body.devices,
    schedules: body.schedules,
    inspectionRule: body.inspectionRule,
    messageRule: body.messageRule,
    regionsByQrCode: body.regionsByQrCode
  });

  return NextResponse.json({ task });
}
