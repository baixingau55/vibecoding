import { TaskBuilder } from "@/components/tasks/task-builder";
import { getAlgorithms } from "@/lib/domain/algorithms";
import { getAppSnapshot } from "@/lib/domain/store";

export default async function TaskCreatePage({
  searchParams
}: {
  searchParams: Promise<{ algorithmId?: string }>;
}) {
  const [{ algorithmId }, algorithms, snapshot] = await Promise.all([searchParams, getAlgorithms(), getAppSnapshot()]);

  return <TaskBuilder algorithms={algorithms} devices={snapshot.devices} selectedAlgorithmId={algorithmId} />;
}
