import { NextRequest, NextResponse } from "next/server";

import { getTaskResults } from "@/lib/domain/tasks";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const results = await getTaskResults(params.id);
  return NextResponse.json({ results });
}
