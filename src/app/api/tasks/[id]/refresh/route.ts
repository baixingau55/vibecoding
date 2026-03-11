import { NextRequest, NextResponse } from "next/server";

import { refreshTaskResults } from "@/lib/domain/tasks";

export async function POST(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  try {
    const execution = await refreshTaskResults(params.id);
    return NextResponse.json(execution);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Task execution failed" },
      { status: 400 }
    );
  }
}
