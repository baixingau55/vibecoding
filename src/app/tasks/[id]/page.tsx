import { TaskDetailPageClient } from "@/components/pages/task-detail-page-client";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TaskDetailPageClient taskId={id} />;
}
