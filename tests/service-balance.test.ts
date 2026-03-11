import { beforeEach, describe, expect, it } from "vitest";

import { createMockSnapshot } from "@/lib/mock-data";
import { getServiceBalance, purchaseServiceUnits, chargeUnits, refundUnits } from "@/lib/domain/service-balance";
import { getMemoryStore } from "@/lib/repositories/memory-store";

describe("service balance", () => {
  beforeEach(() => {
    getMemoryStore().replace(createMockSnapshot());
  });

  it("adds purchased units immediately in test purchase mode", async () => {
    const before = await getServiceBalance();
    const result = await purchaseServiceUnits({ amount: 3000, accountName: "tester" });
    const after = await getServiceBalance();

    expect(result.record.amount).toBe(3000);
    expect(after.remaining).toBe(before.remaining + 3000);
    expect(after.total).toBe(before.total + 3000);
  });

  it("charges and refunds units according to execution result", async () => {
    const before = await getServiceBalance();

    await chargeUnits("task_demo", 8);
    let current = await getServiceBalance();
    expect(current.remaining).toBe(before.remaining - 8);
    expect(current.used).toBe(before.used + 8);

    await refundUnits("task_demo", 3);
    current = await getServiceBalance();
    expect(current.remaining).toBe(before.remaining - 5);
    expect(current.used).toBe(before.used + 5);
  });
});
