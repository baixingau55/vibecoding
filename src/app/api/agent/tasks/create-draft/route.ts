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

async function parseRequestBody(request: NextRequest) {
  const raw = await request.json().catch(() => ({}));
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;

    if (typeof record.data === "string") {
      try {
        return JSON.parse(record.data);
      } catch {
        return {};
      }
    }

    if (
      record.body &&
      typeof record.body === "object" &&
      typeof (record.body as Record<string, unknown>).data === "string"
    ) {
      try {
        return JSON.parse((record.body as Record<string, unknown>).data as string);
      } catch {
        return {};
      }
    }
  }

  return raw;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createDraftRequestSchema.safeParse(await parseRequestBody(request));
  if (!parsed.success) {
    return NextResponse.json({
      status: "error",
      conversationId: "",
      suggestedReply: "任务草稿生成失败，请稍后重试。"
    });
  }

  return NextResponse.json(await createTaskDraft(parsed.data));
}
