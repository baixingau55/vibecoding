import { notFound } from "next/navigation";

import { TaskDetailView } from "@/components/tasks/task-detail-view";
import { getAlgorithms } from "@/lib/domain/algorithms";
import { getMediaForMessage } from "@/lib/domain/media";
import { getAppSnapshot } from "@/lib/domain/store";
import { getTaskById, triggerDueTasks } from "@/lib/domain/tasks";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await triggerDueTasks();
  const [detail, algorithms, snapshot] = await Promise.all([getTaskById(id), getAlgorithms(), getAppSnapshot()]);

  if (!detail) {
    notFound();
  }

  const mediaEntries = await Promise.all(detail.messages.map(async (message) => [message.id, await getMediaForMessage(message.id)] as const));
  const mediaByMessage = Object.fromEntries(mediaEntries);

  return (
    <TaskDetailView
      task={detail.task}
      runs={detail.runs}
      results={detail.results}
      failures={detail.failures}
      messages={detail.messages}
      mediaByMessage={mediaByMessage}
      algorithms={algorithms}
      devices={snapshot.devices}
    />
  );
}
