import { NextRequest, NextResponse } from "next/server";

import { handleTpLinkTaskCallback } from "@/lib/domain/tasks";

export async function POST(request: NextRequest) {
  const payload = await request.json();
  const taskId = payload.taskId ?? payload.task_id ?? payload.result?.taskId;
  const resultList = payload.resultList ?? payload.taskResult ?? payload.result?.taskResult ?? [];

  if (!taskId) {
    return NextResponse.json({ received: false, error: "taskId is required" }, { status: 400 });
  }

  const result = await handleTpLinkTaskCallback({ taskId, resultList });
  return NextResponse.json({ received: true, result });
}
