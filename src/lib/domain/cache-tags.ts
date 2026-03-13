import { revalidateTag } from "next/cache";

export const CACHE_TAGS = {
  tasks: "tasks",
  taskDetail: "task-detail",
  messages: "messages",
  analytics: "analytics",
  balance: "balance",
  algorithms: "algorithms"
} as const;

export function revalidateTaskReadModels() {
  revalidateTag(CACHE_TAGS.tasks);
  revalidateTag(CACHE_TAGS.taskDetail);
  revalidateTag(CACHE_TAGS.analytics);
  revalidateTag(CACHE_TAGS.messages);
}

export function revalidateMessageReadModels() {
  revalidateTag(CACHE_TAGS.messages);
  revalidateTag(CACHE_TAGS.taskDetail);
}

export function revalidateAnalyticsReadModels() {
  revalidateTag(CACHE_TAGS.analytics);
}

export function revalidateBalanceReadModels() {
  revalidateTag(CACHE_TAGS.balance);
}

export function revalidateAlgorithmReadModels() {
  revalidateTag(CACHE_TAGS.algorithms);
}

export function revalidateAllReadModels() {
  revalidateTaskReadModels();
  revalidateMessageReadModels();
  revalidateAnalyticsReadModels();
  revalidateBalanceReadModels();
  revalidateAlgorithmReadModels();
}
