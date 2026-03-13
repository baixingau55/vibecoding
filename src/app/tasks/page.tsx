import { TasksWorkspace } from "@/components/tasks/tasks-workspace";
import { getAlgorithms } from "@/lib/domain/algorithms";
import { getPurchaseHistory, getServiceBalance } from "@/lib/domain/service-balance";
import { listTasks } from "@/lib/domain/tasks";
import { getAppStore } from "@/lib/repositories/app-store";

export default async function TasksPage() {
  const store = await getAppStore();
  const fallbackSnapshot =
    "getTaskPreviewData" in store && typeof store.getTaskPreviewData === "function" ? null : await store.snapshot(false);
  const [balance, purchaseHistory, algorithms, tasks, previewResults] = await Promise.all([
    getServiceBalance(),
    getPurchaseHistory(),
    getAlgorithms(),
    listTasks(),
    "getTaskPreviewData" in store && typeof store.getTaskPreviewData === "function"
      ? store.getTaskPreviewData()
      : Promise.resolve(
          fallbackSnapshot!.results
            .filter((result) => result.imageUrl)
            .map((result) => ({ taskId: result.taskId, qrCode: result.qrCode, imageUrl: result.imageUrl, imageTime: result.imageTime }))
        )
  ]);

  const previewByTaskId = Object.fromEntries(
    tasks.map((task) => {
      const previews = previewResults
        .filter((result) => result.taskId === task.id)
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
