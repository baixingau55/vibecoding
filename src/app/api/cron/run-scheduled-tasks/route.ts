import { NextRequest, NextResponse } from "next/server";

import { triggerDueTasks } from "@/lib/domain/tasks";
import env from "@/lib/env";

function isAuthorized(request: NextRequest) {
  if (!env.internalAdminToken) return true;

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const headerToken = request.headers.get("x-internal-admin-token");
  const queryToken = request.nextUrl.searchParams.get("token");
  const candidate = bearer || headerToken || queryToken;

  return candidate === env.internalAdminToken;
}

async function handleCron(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await triggerDueTasks();
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Failed to run scheduled tasks", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run scheduled tasks" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}
