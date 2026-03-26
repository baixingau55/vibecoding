import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST as createDraftPOST } from "@/app/api/agent/tasks/create-draft/route";
import { POST as confirmCreatePOST } from "@/app/api/agent/tasks/confirm-create/route";
import { createMockSnapshot } from "@/lib/mock-data";
import { getMemoryStore } from "@/lib/repositories/memory-store";

function buildRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

describe("agent create task APIs", () => {
  beforeEach(() => {
    vi.useRealTimers();
    getMemoryStore().replace(createMockSnapshot());
  });

  it("returns needs_more_info when schedule and device are missing", async () => {
    const response = await createDraftPOST(
      buildRequest("http://localhost/api/agent/tasks/create-draft", {
        rawUserQuery: "帮我创建一个离岗巡检任务",
        userAction: "continue",
        draftId: "",
        draftState: ""
      })
    );

    const payload = await response.json();

    expect(payload.status).toBe("needs_more_info");
    expect(payload.draftId).toMatch(/^draft_/);
    expect(payload.suggestedReply).toContain("执行时间");
    expect(payload.suggestedReply).toContain("设备范围");

    const draftState = JSON.parse(payload.draftState);
    expect(draftState.algorithmId).toBe("away-from-post-detection");
  });

  it("returns ready_to_confirm when query includes algorithm schedule and device", async () => {
    const response = await createDraftPOST(
      buildRequest("http://localhost/api/agent/tasks/create-draft", {
        rawUserQuery: "帮我创建一个每天早上9点执行的离岗巡检任务，检查A01",
        userAction: "continue",
        draftId: "",
        draftState: ""
      })
    );

    const payload = await response.json();

    expect(payload.status).toBe("ready_to_confirm");
    expect(payload.suggestedReply).toContain("确认创建");

    const draftState = JSON.parse(payload.draftState);
    expect(draftState.algorithmId).toBe("away-from-post-detection");
    expect(draftState.scheduleText).toBe("每天 09:00");
    expect(draftState.devices).toHaveLength(1);
  });

  it("creates a task from a confirmed draft", async () => {
    const draftResponse = await createDraftPOST(
      buildRequest("http://localhost/api/agent/tasks/create-draft", {
        rawUserQuery: "帮我创建一个每天早上9点执行的离岗巡检任务，检查A01",
        userAction: "continue",
        draftId: "",
        draftState: ""
      })
    );
    const draftPayload = await draftResponse.json();

    const response = await confirmCreatePOST(
      buildRequest("http://localhost/api/agent/tasks/confirm-create", {
        rawUserQuery: "确认创建",
        userAction: "confirm",
        draftId: draftPayload.draftId,
        draftState: draftPayload.draftState
      })
    );

    const payload = await response.json();
    const snapshot = await getMemoryStore().snapshot(false);
    const task = snapshot.tasks.find((item) => item.id === payload.taskId);

    expect(payload.status).toBe("success");
    expect(payload.taskId).toMatch(/^task_/);
    expect(payload.detailPath).toBe(`/tasks/${payload.taskId}`);
    expect(task?.algorithmIds).toEqual(["away-from-post-detection"]);
    expect(task?.devices).toHaveLength(1);
    expect(task?.schedules[0]?.startTime).toBe("09:00");
  });

  it("rejects confirm-create when userAction is not confirm", async () => {
    const response = await confirmCreatePOST(
      buildRequest("http://localhost/api/agent/tasks/confirm-create", {
        rawUserQuery: "继续吧",
        userAction: "continue",
        draftId: "draft_123",
        draftState: "{\"taskName\":\"test\"}"
      })
    );

    const payload = await response.json();

    expect(payload.status).toBe("error");
    expect(payload.suggestedReply).toContain("确认");
  });
});
