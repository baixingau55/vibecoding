import { beforeEach, describe, expect, it } from "vitest";

import { getInspectionOverview, getRankedTasks, getTrendPoints } from "@/lib/domain/analytics";
import { createMockSnapshot } from "@/lib/mock-data";
import { getMemoryStore } from "@/lib/repositories/memory-store";

describe("analytics aggregation", () => {
  beforeEach(() => {
    getMemoryStore().replace(createMockSnapshot());
  });

  it("calculates overview using only available result rows", async () => {
    const overview = await getInspectionOverview();

    expect(overview.totalChecks).toBe(2);
    expect(overview.qualifiedCount).toBe(1);
    expect(overview.unqualifiedCount).toBe(1);
    expect(overview.messageCount).toBe(1);
    expect(overview.unqualifiedRate).toBe(50);
  });

  it("builds task rankings for each metric", async () => {
    const byRate = await getRankedTasks("unqualifiedRate");
    const byCount = await getRankedTasks("unqualifiedCount");
    const trends = await getTrendPoints();

    expect(byRate[0]?.taskId).toBe("task_away_post");
    expect(byCount[0]?.unqualifiedCount).toBeGreaterThanOrEqual(1);
    expect(trends.length).toBeGreaterThanOrEqual(1);
  });
});
