import { unstable_cache } from "next/cache";

import { CACHE_TAGS, revalidateBalanceReadModels } from "@/lib/domain/cache-tags";
import { getAppStore } from "@/lib/repositories/app-store";
import { slugId } from "@/lib/utils";

import { getAppSnapshot } from "@/lib/domain/store";
import type { PurchaseRecord, ServiceBalance } from "@/lib/types";

const getCachedBalance = unstable_cache(
  async () => {
    const store = await getAppStore();
    if ("getServiceBalanceData" in store && typeof store.getServiceBalanceData === "function") {
      return store.getServiceBalanceData();
    }
    const snapshot = await getAppSnapshot({ includeDevices: false });
    return snapshot.serviceBalance;
  },
  ["service-balance"],
  { revalidate: 5, tags: [CACHE_TAGS.balance] }
);

const getCachedPurchaseHistory = unstable_cache(
  async () => {
    const store = await getAppStore();
    if ("getPurchaseHistoryData" in store && typeof store.getPurchaseHistoryData === "function") {
      return store.getPurchaseHistoryData();
    }
    const snapshot = await getAppSnapshot({ includeDevices: false });
    return snapshot.purchaseRecords;
  },
  ["purchase-history"],
  { revalidate: 5, tags: [CACHE_TAGS.balance] }
);

export async function getServiceBalance() {
  return getCachedBalance();
}

export async function getPurchaseHistory() {
  return getCachedPurchaseHistory();
}

export async function purchaseServiceUnits(input: { amount: number; accountName?: string; note?: string }) {
  const store = await getAppStore();
  const snapshot = await store.snapshot(false);
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

  await store.addPurchase(record, ledger, nextBalance);
  revalidateBalanceReadModels();
  return { balance: nextBalance, record };
}

export async function chargeUnits(taskId: string, amount: number) {
  const store = await getAppStore();
  const snapshot = await store.snapshot(false);
  const nextBalance: ServiceBalance = {
    ...snapshot.serviceBalance,
    remaining: Math.max(snapshot.serviceBalance.remaining - amount, 0),
    used: snapshot.serviceBalance.used + amount,
    lastUpdatedAt: new Date().toISOString()
  };

  await store.setBalance(nextBalance);
  revalidateBalanceReadModels();
  return nextBalance;
}

export async function refundUnits(taskId: string, amount: number) {
  const store = await getAppStore();
  const snapshot = await store.snapshot(false);
  const nextBalance: ServiceBalance = {
    ...snapshot.serviceBalance,
    remaining: snapshot.serviceBalance.remaining + amount,
    used: Math.max(snapshot.serviceBalance.used - amount, 0),
    lastUpdatedAt: new Date().toISOString()
  };

  await store.setBalance(nextBalance);
  revalidateBalanceReadModels();
  return nextBalance;
}
