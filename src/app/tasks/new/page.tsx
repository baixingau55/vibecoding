import { TaskCreatePageClient } from "@/components/pages/task-create-page-client";

export default async function TaskCreatePage({
  searchParams
}: {
  searchParams: Promise<{ algorithmId?: string }>;
}) {
  const { algorithmId } = await searchParams;
  return <TaskCreatePageClient selectedAlgorithmId={algorithmId} />;
}
