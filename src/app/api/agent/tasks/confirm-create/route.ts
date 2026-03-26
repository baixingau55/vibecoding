import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { confirmCreateTask } from "@/lib/agent/create-task-workflow";
import env from "@/lib/env";

const confirmCreateRequestSchema = z.object({
  conversationId: z.string().trim().min(1),
  rawUserQuery: z.string().trim().min(1),
  userAction: z.enum(["cancel", "confirm", "continue"])
});

function isAuthorized(request: NextRequest) {
  if (!env.agentApiToken) return true;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return bearer === env.agentApiToken;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = confirmCreateRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({
      status: "error",
      conversationId: "",
      taskId: "",
      taskName: "",
      detailPath: "",
      nextRunAt: "",
      suggestedReply: "任务创建失败，请检查配置后重试。"
    });
  }

  return NextResponse.json(await confirmCreateTask(parsed.data));
}
