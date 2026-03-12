import { NextResponse } from "next/server";

import { triggerDueTasks } from "@/lib/domain/tasks";

export async function GET() {
  const completed = await triggerDueTasks();
  return NextResponse.json({ completed });
}
