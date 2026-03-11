import { NextResponse } from "next/server";

import { listTasks, executeTask } from "@/lib/domain/tasks";

export async function GET() {
  const tasks = await listTasks();
  const dueTasks = tasks.filter((task) => task.status === "enabled" && task.nextRunAt && new Date(task.nextRunAt) <= new Date());

  const completed: string[] = [];
  for (const task of dueTasks) {
    try {
      await executeTask(task.id);
      completed.push(task.id);
    } catch {
      // Keep cron endpoint resilient; failures are reflected in task/run state.
    }
  }

  return NextResponse.json({ completed });
}
