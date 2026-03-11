import { AlgorithmSelect } from "@/components/tasks/algorithm-select";
import { getAlgorithms } from "@/lib/domain/algorithms";

export default async function TaskSelectPage() {
  const algorithms = await getAlgorithms();
  return <AlgorithmSelect algorithms={algorithms} />;
}
