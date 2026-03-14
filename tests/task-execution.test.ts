import { beforeEach, describe, expect, it, vi } from "vitest";

import { executeTask, queueImmediateExecutionIfDue, triggerDueTasks, upsertTask } from "@/lib/domain/tasks";
import { getServiceBalance } from "@/lib/domain/service-balance";
import { createMockSnapshot } from "@/lib/mock-data";
import { getMemoryStore } from "@/lib/repositories/memory-store";

describe("task execution", () => {
  beforeEach(() => {
    vi.useRealTimers();
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

  it("keeps 1-minute time range tasks on the current day after save", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13T09:43:18.000Z"));

    const snapshot = createMockSnapshot();
    const task = await upsertTask({
      name: "1-minute schedule",
      algorithmIds: ["vehicle-parking-detection-algorithm"],
      algorithmVersions: { "vehicle-parking-detection-algorithm": "1.0.1" },
      devices: [snapshot.devices[0]],
      schedules: [{ type: "time_range", startTime: "17:42", endTime: "18:00", repeatDays: [0, 1, 2, 3, 4, 5, 6], intervalMinutes: 1 }],
      messageRule: { enabled: true, triggerMode: "every_unqualified" },
      regionsByQrCode: {}
    });

    expect(task.nextRunAt).toBe("2026-03-13T09:44:00.000Z");
  });

  it("chooses the nearest nextRunAt across time points and time ranges", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13T08:02:20.000Z"));

    const snapshot = createMockSnapshot();
    const task = await upsertTask({
      name: "mixed schedule task",
      algorithmIds: ["vehicle-parking-detection-algorithm"],
      algorithmVersions: { "vehicle-parking-detection-algorithm": "1.0.1" },
      devices: [snapshot.devices[0]],
      schedules: [
        { type: "time_point", startTime: "16:10", repeatDays: [0, 1, 2, 3, 4, 5, 6] },
        { type: "time_range", startTime: "16:03", endTime: "16:20", repeatDays: [0, 1, 2, 3, 4, 5, 6], intervalMinutes: 5 }
      ],
      messageRule: { enabled: true, triggerMode: "every_unqualified" },
      regionsByQrCode: {}
    });

    expect(task.nextRunAt).toBe("2026-03-13T08:05:00.000Z");
  });

  it("executes immediately when a task is saved inside an active time range and keeps the original grid", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13T10:03:20.000Z"));

    const snapshot = createMockSnapshot();
    const task = await upsertTask({
      name: "immediate range task",
      algorithmIds: ["vehicle-parking-detection-algorithm"],
      algorithmVersions: { "vehicle-parking-detection-algorithm": "1.0.1" },
      devices: [snapshot.devices[0]],
      schedules: [{ type: "time_range", startTime: "18:00", endTime: "19:00", repeatDays: [0, 1, 2, 3, 4, 5, 6], intervalMinutes: 5 }],
      messageRule: { enabled: true, triggerMode: "every_unqualified" },
      regionsByQrCode: {}
    });

    const queueResult = await queueImmediateExecutionIfDue(task);
    const currentSnapshot = await getMemoryStore().snapshot(false);
    const updatedTask = currentSnapshot.tasks.find((item) => item.id === task.id)!;
    const relatedRuns = currentSnapshot.runs.filter((item) => item.taskId === task.id);

    expect(queueResult.queued).toBe(true);
    expect(relatedRuns).toHaveLength(1);
    expect(updatedTask.nextRunAt).toBe("2026-03-13T10:05:00.000Z");
  });

  it("continues scanning running tasks for later time range intervals", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13T09:43:18.000Z"));

    const snapshot = createMockSnapshot();
    const task = await upsertTask({
      name: "running schedule task",
      algorithmIds: ["vehicle-parking-detection-algorithm"],
      algorithmVersions: { "vehicle-parking-detection-algorithm": "1.0.1" },
      devices: [snapshot.devices[0]],
      schedules: [{ type: "time_range", startTime: "17:42", endTime: "18:00", repeatDays: [0, 1, 2, 3, 4, 5, 6], intervalMinutes: 1 }],
      messageRule: { enabled: true, triggerMode: "every_unqualified" },
      regionsByQrCode: {}
    });

    await executeTask(task.id);

    vi.setSystemTime(new Date("2026-03-13T09:44:02.000Z"));
    const summary = await triggerDueTasks(new Date("2026-03-13T09:44:02.000Z"));
    const currentSnapshot = await getMemoryStore().snapshot(false);
    const relatedRuns = currentSnapshot.runs.filter((item) => item.taskId === task.id);

    expect(summary.completed).toContain(task.id);
    expect(relatedRuns.length).toBeGreaterThanOrEqual(2);
  });

  it("recovers running tasks with no active runs before scanning due work", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-14T05:55:54.000Z"));

    const snapshot = createMockSnapshot();
    const task = await upsertTask({
      name: "reconcile orphan running task",
      algorithmIds: ["vehicle-parking-detection-algorithm"],
      algorithmVersions: { "vehicle-parking-detection-algorithm": "1.0.1" },
      devices: [snapshot.devices[0]],
      schedules: [{ type: "time_range", startTime: "13:50", endTime: "14:30", repeatDays: [0, 1, 2, 3, 4, 5, 6], intervalMinutes: 10 }],
      messageRule: { enabled: true, triggerMode: "every_unqualified" },
      regionsByQrCode: {}
    });

    const store = getMemoryStore();
    const currentSnapshot = await store.snapshot(false);
    const patchedTask = currentSnapshot.tasks.find((item) => item.id === task.id)!;
    patchedTask.status = "running";
    patchedTask.nextRunAt = "2026-03-14T05:50:00.000Z";
    store.replace(currentSnapshot);

    const summary = await triggerDueTasks(new Date("2026-03-14T05:55:54.000Z"));
    const after = await store.snapshot(false);
    const updatedTask = after.tasks.find((item) => item.id === task.id)!;

    expect(summary.completed).toContain(task.id);
    expect(updatedTask.status).toBe("enabled");
    expect(updatedTask.nextRunAt).toBeTruthy();
  });

  it("reconciles stale running minute-range runs before the next interval fires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-14T09:05:10.000Z"));

    const snapshot = createMockSnapshot();
    const task = await upsertTask({
      name: "stale minute run task",
      algorithmIds: ["vehicle-parking-detection-algorithm"],
      algorithmVersions: { "vehicle-parking-detection-algorithm": "1.0.1" },
      devices: [snapshot.devices[0]],
      schedules: [{ type: "time_range", startTime: "17:00", endTime: "19:00", repeatDays: [0, 1, 2, 3, 4, 5, 6], intervalMinutes: 1 }],
      messageRule: { enabled: true, triggerMode: "every_unqualified" },
      regionsByQrCode: {}
    });

    const store = getMemoryStore();
    const currentSnapshot = await store.snapshot(false);
    const patchedTask = currentSnapshot.tasks.find((item) => item.id === task.id)!;
    patchedTask.status = "running";
    patchedTask.nextRunAt = "2026-03-14T09:05:00.000Z";
    currentSnapshot.runs.unshift({
      id: "run_stale_range",
      taskId: task.id,
      startedAt: "2026-03-14T09:01:00.000Z",
      status: "running",
      totalChecks: 1,
      successfulChecks: 0,
      failedChecks: 0,
      chargedUnits: 1,
      refundedUnits: 0
    });
    store.replace(currentSnapshot);

    const summary = await triggerDueTasks(new Date("2026-03-14T09:05:10.000Z"));
    const after = await store.snapshot(false);
    const staleRun = after.runs.find((item) => item.id === "run_stale_range")!;
    const latestTask = after.tasks.find((item) => item.id === task.id)!;

    expect(summary.completed).toContain(task.id);
    expect(staleRun.status).toBe("failed");
    expect(staleRun.refundedUnits).toBeGreaterThanOrEqual(1);
    expect(latestTask.nextRunAt).toBeTruthy();
  });
});
