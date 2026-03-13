import { TasksWorkspace } from "@/components/tasks/tasks-workspace";
import { getAlgorithms } from "@/lib/domain/algorithms";
import { getPurchaseHistory, getServiceBalance } from "@/lib/domain/service-balance";
import { getAppSnapshot } from "@/lib/domain/store";
import { listTasks } from "@/lib/domain/tasks";

export default async function TasksPage() {
  const [balance, purchaseHistory, algorithms, tasks, snapshot] = await Promise.all([
    getServiceBalance(),
    getPurchaseHistory(),
    getAlgorithms(),
    listTasks(),
    getAppSnapshot({ includeDevices: false })
  ]);

  const previewByTaskId = Object.fromEntries(
    tasks.map((task) => {
      const previews = snapshot.results
        .filter((result) => result.taskId === task.id && result.imageUrl)
        .sort((a, b) => b.imageTime.localeCompare(a.imageTime))
        .slice(0, 3)
        .map((result) => ({ qrCode: result.qrCode, imageUrl: result.imageUrl }));

      return [task.id, previews];
    })
  );

  return (
    <TasksWorkspace
      balance={balance}
      purchaseHistory={purchaseHistory}
      algorithms={algorithms}
      tasks={tasks}
      previewByTaskId={previewByTaskId}
    />
  );
}
