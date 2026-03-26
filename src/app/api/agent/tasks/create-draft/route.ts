import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import env from "@/lib/env";
import { createTaskDraft } from "@/lib/agent/create-task-workflow";

const createDraftRequestSchema = z.object({
  rawUserQuery: z.string().trim().min(1),
  userAction: z.enum(["cancel", "confirm", "continue"]).default("continue"),
  draftId: z.string().optional().default(""),
  draftState: z.string().optional().default("")
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
      draftId: "",
      suggestedReply: "任务草稿生成失败，请稍后重试。",
      draftState: ""
    });
  }

  return NextResponse.json(await createTaskDraft(parsed.data));
}
