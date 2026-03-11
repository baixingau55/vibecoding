import { beforeEach, describe, expect, it } from "vitest";

import { executeTask, upsertTask } from "@/lib/domain/tasks";
import { getServiceBalance } from "@/lib/domain/service-balance";
import { createMockSnapshot } from "@/lib/mock-data";
import { getMemoryStore } from "@/lib/repositories/memory-store";

describe("task execution", () => {
  beforeEach(() => {
    getMemoryStore().replace(createMockSnapshot());
  });

  it("charges by device count * algorithm count and refunds failed device", async () => {
    const snapshot = createMockSnapshot();
    const devices = snapshot.devices;

    const task = await upsertTask({
      name: "双设备测试任务",
      algorithmIds: ["away-from-post-detection"],
      algorithmVersions: { "away-from-post-detection": "1.2.0" },
      devices,
      schedules: [{ type: "time_point", startTime: "09:00", repeatDays: [1, 2, 3] }],
      messageRule: { enabled: true, triggerMode: "every_unqualified" },
      regionsByQrCode: {
        [devices[0].qrCode]: [{ id: 1, points: [{ x: 1000, y: 1000 }, { x: 2000, y: 1000 }, { x: 1800, y: 2200 }] }],
        [devices[1].qrCode]: [{ id: 1, points: [{ x: 1200, y: 1200 }, { x: 2400, y: 1200 }, { x: 2200, y: 2600 }] }]
      }
    });

    const before = await getServiceBalance();
    const execution = await executeTask(task.id);
    const after = await getServiceBalance();

    expect(execution.run.chargedUnits).toBe(2);
    expect(execution.run.refundedUnits).toBe(1);
    expect(execution.failures).toHaveLength(1);
    expect(after.remaining).toBe(before.remaining - 1);
  });

  it("rejects execution when task configuration is invalid", async () => {
    await expect(executeTask("task_smoking")).rejects.toThrow();
  });
});
