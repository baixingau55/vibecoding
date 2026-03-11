import { notFound } from "next/navigation";

import { TaskDetailView } from "@/components/tasks/task-detail-view";
import { getAlgorithms } from "@/lib/domain/algorithms";
import { getAppSnapshot } from "@/lib/domain/store";
import { getTaskById } from "@/lib/domain/tasks";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, algorithms, snapshot] = await Promise.all([getTaskById(id), getAlgorithms(), getAppSnapshot()]);

  if (!detail) {
    notFound();
  }

  return (
    <TaskDetailView
      task={detail.task}
      runs={detail.runs}
      results={detail.results}
      failures={detail.failures}
      messages={detail.messages}
      algorithms={algorithms}
      devices={snapshot.devices}
    />
  );
}
