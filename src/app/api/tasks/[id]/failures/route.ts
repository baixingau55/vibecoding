import { NextRequest, NextResponse } from "next/server";

import { getTaskFailures } from "@/lib/domain/tasks";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const failures = await getTaskFailures(params.id);
  return NextResponse.json({ failures });
}
