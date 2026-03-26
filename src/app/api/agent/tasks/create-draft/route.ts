import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createTaskDraft } from "@/lib/agent/create-task-workflow";
import env from "@/lib/env";

const createDraftRequestSchema = z.object({
  conversationId: z.string().trim().min(1),
  rawUserQuery: z.string().trim().min(1),
  userAction: z.enum(["cancel", "confirm", "continue"]).default("continue")
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

  const parsed = createDraftRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({
      status: "error",
      conversationId: "",
      suggestedReply: "任务草稿生成失败，请稍后重试。"
    });
  }

  return NextResponse.json(await createTaskDraft(parsed.data));
}
