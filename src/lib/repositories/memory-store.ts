import { createMockSnapshot } from "@/lib/mock-data";
import type {
  AppSnapshot,
  BalanceLedgerEntry,
  InspectionFailure,
  InspectionResult,
  InspectionRun,
  InspectionTask,
  MediaAsset,
  MessageItem,
  PurchaseRecord,
  ServiceBalance
} from "@/lib/types";

declare global {
  // eslint-disable-next-line no-var
  var __AI_XUNJIAN_STORE__: AppSnapshot | undefined;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getMemoryStore() {
  if (!global.__AI_XUNJIAN_STORE__) {
    global.__AI_XUNJIAN_STORE__ = createMockSnapshot();
  }

  const store = global.__AI_XUNJIAN_STORE__;

  return {
    snapshot() {
      return clone(store);
    },
    replace(snapshot: AppSnapshot) {
      global.__AI_XUNJIAN_STORE__ = clone(snapshot);
    },
    setBalance(balance: ServiceBalance) {
      store.serviceBalance = clone(balance);
    },
    addPurchase(record: PurchaseRecord, ledgerEntry: BalanceLedgerEntry, nextBalance: ServiceBalance) {
      store.purchaseRecords.unshift(clone(record));
      store.balanceLedger.unshift(clone(ledgerEntry));
      store.serviceBalance = clone(nextBalance);
    },
    upsertTask(task: InspectionTask) {
      const index = store.tasks.findIndex((item) => item.id === task.id);
      if (index >= 0) {
        store.tasks[index] = clone(task);
      } else {
        store.tasks.unshift(clone(task));
      }
    },
    deleteTask(taskId: string) {
      store.tasks = store.tasks.filter((item) => item.id !== taskId);
      store.runs = store.runs.filter((item) => item.taskId !== taskId);
      store.results = store.results.filter((item) => item.taskId !== taskId);
      store.failures = store.failures.filter((item) => item.taskId !== taskId);
      store.messages = store.messages.filter((item) => item.taskId !== taskId);
      store.media = store.media.filter((item) => item.taskId !== taskId);
    },
    addRun(run: InspectionRun) {
      store.runs.unshift(clone(run));
    },
    updateRun(run: InspectionRun) {
      const index = store.runs.findIndex((item) => item.id === run.id);
      if (index >= 0) {
        store.runs[index] = clone(run);
      }
    },
    addResults(nextResults: InspectionResult[]) {
      store.results.unshift(...clone(nextResults));
    },
    addFailures(nextFailures: InspectionFailure[]) {
      store.failures.unshift(...clone(nextFailures));
    },
    addMessages(nextMessages: MessageItem[]) {
      store.messages.unshift(...clone(nextMessages));
    },
    updateMessage(message: MessageItem) {
      const index = store.messages.findIndex((item) => item.id === message.id);
      if (index >= 0) {
        store.messages[index] = clone(message);
      }
    },
    addMedia(asset: MediaAsset) {
      store.media.unshift(clone(asset));
    }
  };
}
