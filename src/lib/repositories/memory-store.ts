import { createMockSnapshot } from "@/lib/mock-data";
import type {
  AppSnapshot,
  BalanceLedgerEntry,
  CreateTaskConversationDraft,
  InspectionFailure,
  InspectionResult,
  InspectionRun,
  InspectionTask,
  MediaAsset,
  MessageAlertCounter,
  MessageItem,
  PurchaseRecord,
  SchedulerScan,
  ServiceBalance
} from "@/lib/types";

declare global {
  // eslint-disable-next-line no-var
  var __AI_XUNJIAN_STORE__: AppSnapshot | undefined;
  // eslint-disable-next-line no-var
  var __AI_XUNJIAN_CREATE_TASK_DRAFTS__: Record<string, CreateTaskConversationDraft> | undefined;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getMemoryStore() {
  if (!global.__AI_XUNJIAN_STORE__) {
    global.__AI_XUNJIAN_STORE__ = createMockSnapshot();
  }

  const store = global.__AI_XUNJIAN_STORE__;
  if (!store.messageAlertCounters) {
    store.messageAlertCounters = [];
  }
  if (!global.__AI_XUNJIAN_CREATE_TASK_DRAFTS__) {
    global.__AI_XUNJIAN_CREATE_TASK_DRAFTS__ = {};
  }
  const createTaskDrafts = global.__AI_XUNJIAN_CREATE_TASK_DRAFTS__;

  return {
    snapshot(_includeDevices = true) {
      return clone(store);
    },
    replace(snapshot: AppSnapshot) {
      global.__AI_XUNJIAN_STORE__ = clone(snapshot);
      global.__AI_XUNJIAN_CREATE_TASK_DRAFTS__ = {};
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
    updateTaskRuntime(taskId: string, patch: Partial<Pick<InspectionTask, "status" | "updatedAt" | "nextRunAt" | "closedAt" | "configErrorReason">>) {
      const index = store.tasks.findIndex((item) => item.id === taskId);
      if (index >= 0) {
        store.tasks[index] = {
          ...store.tasks[index],
          ...clone(patch)
        };
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
    updateResult(result: InspectionResult) {
      const index = store.results.findIndex((item) => item.id === result.id);
      if (index >= 0) {
        store.results[index] = clone(result);
      } else {
        store.results.unshift(clone(result));
      }
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
    },
    updateMedia(asset: MediaAsset) {
      const index = store.media.findIndex((item) => item.id === asset.id);
      if (index >= 0) {
        store.media[index] = clone(asset);
      } else {
        store.media.unshift(clone(asset));
      }
    },
    addSchedulerScan(scan: SchedulerScan) {
      store.schedulerScans.unshift(clone(scan));
      store.schedulerScans = store.schedulerScans.slice(0, 100);
    },
    getMessageAlertCounter(taskId: string, qrCode: string, algorithmId: string, counterDate: string) {
      return clone(
        store.messageAlertCounters?.find(
          (item) =>
            item.taskId === taskId &&
            item.qrCode === qrCode &&
            item.algorithmId === algorithmId &&
            item.counterDate === counterDate
        ) ?? null
      );
    },
    upsertMessageAlertCounter(counter: MessageAlertCounter) {
      const index =
        store.messageAlertCounters?.findIndex(
          (item) =>
            item.taskId === counter.taskId &&
            item.qrCode === counter.qrCode &&
            item.algorithmId === counter.algorithmId &&
            item.counterDate === counter.counterDate
        ) ?? -1;
      if (index >= 0 && store.messageAlertCounters) {
        store.messageAlertCounters[index] = clone(counter);
      } else {
        store.messageAlertCounters?.unshift(clone(counter));
      }
    },
    getCreateTaskDraft(conversationId: string) {
      return clone(createTaskDrafts[conversationId] ?? null);
    },
    upsertCreateTaskDraft(draft: CreateTaskConversationDraft) {
      createTaskDrafts[draft.conversationId] = clone(draft);
    },
    deleteCreateTaskDraft(conversationId: string) {
      delete createTaskDrafts[conversationId];
    }
  };
}
