import { TasksWorkspace } from "@/components/tasks/tasks-workspace";
import { getAlgorithms } from "@/lib/domain/algorithms";
import { getPurchaseHistory, getServiceBalance } from "@/lib/domain/service-balance";
import { listTasks } from "@/lib/domain/tasks";

export default async function TasksPage() {
  const [balance, purchaseHistory, algorithms, tasks] = await Promise.all([
    getServiceBalance(),
    getPurchaseHistory(),
    getAlgorithms(),
    listTasks()
  ]);

  return <TasksWorkspace balance={balance} purchaseHistory={purchaseHistory} algorithms={algorithms} tasks={tasks} />;
}
