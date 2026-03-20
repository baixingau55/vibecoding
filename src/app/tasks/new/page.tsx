import { TaskCreatePageClient } from "@/components/pages/task-create-page-client";
import { getAlgorithms } from "@/lib/domain/algorithms";

export default async function TaskCreatePage({
  searchParams
}: {
  searchParams: Promise<{ algorithmId?: string }>;
}) {
  const { algorithmId } = await searchParams;
  const algorithms = await getAlgorithms();

  return (
    <TaskCreatePageClient
      selectedAlgorithmId={algorithmId}
      initialPayload={{
        algorithms,
        devices: []
      }}
    />
  );
}
