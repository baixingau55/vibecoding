import { TaskAlgorithmChooser } from "@/components/tasks/task-algorithm-chooser";
import { getAlgorithms } from "@/lib/domain/algorithms";

export default async function TaskChooseAlgorithmPage() {
  const algorithms = await getAlgorithms();

  return <TaskAlgorithmChooser algorithms={algorithms} />;
}
