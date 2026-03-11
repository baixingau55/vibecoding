import { getMemoryStore } from "@/lib/repositories/memory-store";
import { slugId } from "@/lib/utils";

import { getAppSnapshot } from "@/lib/domain/store";
import type { PurchaseRecord, ServiceBalance } from "@/lib/types";

export async function getServiceBalance() {
  const snapshot = await getAppSnapshot();
  return snapshot.serviceBalance;
}

export async function getPurchaseHistory() {
  const snapshot = await getAppSnapshot();
  return snapshot.purchaseRecords;
}

export async function purchaseServiceUnits(input: { amount: number; accountName?: string; note?: string }) {
  const store = getMemoryStore();
  const snapshot = store.snapshot();
  const nextBalance: ServiceBalance = {
    ...snapshot.serviceBalance,
    total: snapshot.serviceBalance.total + input.amount,
    purchased: snapshot.serviceBalance.purchased + input.amount,
    remaining: snapshot.serviceBalance.remaining + input.amount,
    lastUpdatedAt: new Date().toISOString()
  };

  const record: PurchaseRecord = {
    id: slugId("purchase"),
    createdAt: new Date().toISOString(),
    accountName: input.accountName ?? "admin",
    amount: input.amount,
    source: "ui-test",
    note: input.note ?? "站内测试购买"
  };

  const ledger = {
    id: slugId("ledger"),
    createdAt: record.createdAt,
    delta: input.amount,
    reason: "purchase" as const,
    relatedId: record.id,
    note: record.note
  };

  store.addPurchase(record, ledger, nextBalance);
  return { balance: nextBalance, record };
}

export async function chargeUnits(taskId: string, amount: number) {
  const store = getMemoryStore();
  const snapshot = store.snapshot();
  const nextBalance: ServiceBalance = {
    ...snapshot.serviceBalance,
    remaining: Math.max(snapshot.serviceBalance.remaining - amount, 0),
    used: snapshot.serviceBalance.used + amount,
    lastUpdatedAt: new Date().toISOString()
  };

  store.setBalance(nextBalance);
  return nextBalance;
}

export async function refundUnits(taskId: string, amount: number) {
  const store = getMemoryStore();
  const snapshot = store.snapshot();
  const nextBalance: ServiceBalance = {
    ...snapshot.serviceBalance,
    remaining: snapshot.serviceBalance.remaining + amount,
    used: Math.max(snapshot.serviceBalance.used - amount, 0),
    lastUpdatedAt: new Date().toISOString()
  };

  store.setBalance(nextBalance);
  return nextBalance;
}
