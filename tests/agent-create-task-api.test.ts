import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST as confirmCreatePOST } from "@/app/api/agent/tasks/confirm-create/route";
import { POST as createDraftPOST } from "@/app/api/agent/tasks/create-draft/route";
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

  it("keeps accumulating draft state across rounds for the same conversation", async () => {
    const conversationId = "conv_multi_round";

    const first = await createDraftPOST(
      buildRequest("http://localhost/api/agent/tasks/create-draft", {
        conversationId,
        rawUserQuery: "帮我创建一个离岗巡检任务",
        userAction: "continue"
      })
    );
    const firstPayload = await first.json();
    expect(firstPayload.status).toBe("needs_more_info");

    const second = await createDraftPOST(
      buildRequest("http://localhost/api/agent/tasks/create-draft", {
        conversationId,
        rawUserQuery: "周四早上9点执行",
        userAction: "continue"
      })
    );
    const secondPayload = await second.json();
    expect(secondPayload.status).toBe("needs_more_info");

    const third = await createDraftPOST(
      buildRequest("http://localhost/api/agent/tasks/create-draft", {
        conversationId,
        rawUserQuery: "检查全部设备",
        userAction: "continue"
      })
    );
    const thirdPayload = await third.json();
    expect(thirdPayload.status).toBe("ready_to_confirm");
    expect(thirdPayload.conversationId).toBe(conversationId);
    expect(thirdPayload.suggestedReply).toContain("确认创建");
  });

  it("creates a task after a complete multi-round draft is confirmed", async () => {
    const conversationId = "conv_confirm";

    await createDraftPOST(
      buildRequest("http://localhost/api/agent/tasks/create-draft", {
        conversationId,
        rawUserQuery: "帮我创建一个离岗巡检任务",
        userAction: "continue"
      })
    );
    await createDraftPOST(
      buildRequest("http://localhost/api/agent/tasks/create-draft", {
        conversationId,
        rawUserQuery: "周四早上9点执行",
        userAction: "continue"
      })
    );
    await createDraftPOST(
      buildRequest("http://localhost/api/agent/tasks/create-draft", {
        conversationId,
        rawUserQuery: "检查全部设备",
        userAction: "continue"
      })
    );

    const response = await confirmCreatePOST(
      buildRequest("http://localhost/api/agent/tasks/confirm-create", {
        conversationId,
        rawUserQuery: "确认创建",
        userAction: "confirm"
      })
    );

    const payload = await response.json();
    const snapshot = await getMemoryStore().snapshot(false);
    const task = snapshot.tasks.find((item) => item.id === payload.taskId);

    expect(payload.status).toBe("success");
    expect(payload.taskId).toMatch(/^task_/);
    expect(payload.detailPath).toBe(`/tasks/${payload.taskId}`);
    expect(task?.algorithmIds).toEqual(["away-from-post-detection"]);
    expect(task?.devices.length).toBeGreaterThan(0);
    expect(task?.schedules[0]?.startTime).toBe("09:00");
  });

  it("deletes draft state when the user cancels", async () => {
    const conversationId = "conv_cancel";

    await createDraftPOST(
      buildRequest("http://localhost/api/agent/tasks/create-draft", {
        conversationId,
        rawUserQuery: "帮我创建一个离岗巡检任务",
        userAction: "continue"
      })
    );

    const cancelResponse = await createDraftPOST(
      buildRequest("http://localhost/api/agent/tasks/create-draft", {
        conversationId,
        rawUserQuery: "算了不建了",
        userAction: "cancel"
      })
    );
    const cancelPayload = await cancelResponse.json();
    expect(cancelPayload.status).toBe("error");

    const confirmResponse = await confirmCreatePOST(
      buildRequest("http://localhost/api/agent/tasks/confirm-create", {
        conversationId,
        rawUserQuery: "确认创建",
        userAction: "confirm"
      })
    );
    const confirmPayload = await confirmResponse.json();
    expect(confirmPayload.status).toBe("error");
    expect(confirmPayload.suggestedReply).toContain("未找到");
  });

  it("clears the draft after successful creation", async () => {
    const conversationId = "conv_cleanup";

    await createDraftPOST(
      buildRequest("http://localhost/api/agent/tasks/create-draft", {
        conversationId,
        rawUserQuery: "帮我创建一个离岗巡检任务",
        userAction: "continue"
      })
    );
    await createDraftPOST(
      buildRequest("http://localhost/api/agent/tasks/create-draft", {
        conversationId,
        rawUserQuery: "周四早上9点执行，检查全部设备",
        userAction: "continue"
      })
    );
    await confirmCreatePOST(
      buildRequest("http://localhost/api/agent/tasks/confirm-create", {
        conversationId,
        rawUserQuery: "确认创建",
        userAction: "confirm"
      })
    );

    const retryResponse = await confirmCreatePOST(
      buildRequest("http://localhost/api/agent/tasks/confirm-create", {
        conversationId,
        rawUserQuery: "确认创建",
        userAction: "confirm"
      })
    );
    const retryPayload = await retryResponse.json();
    expect(retryPayload.status).toBe("error");
    expect(retryPayload.suggestedReply).toContain("未找到");
  });

  it("uses the default open draft when no conversationId is provided", async () => {
    const first = await createDraftPOST(
      buildRequest("http://localhost/api/agent/tasks/create-draft", {
        rawUserQuery: "帮我创建一个离岗巡检任务",
        userAction: "continue"
      })
    );
    const firstPayload = await first.json();
    expect(firstPayload.status).toBe("needs_more_info");
    expect(firstPayload.conversationId).toBe("global-agent-create-task");

    const second = await createDraftPOST(
      buildRequest("http://localhost/api/agent/tasks/create-draft", {
        rawUserQuery: "周四早上9点执行，检查全部设备",
        userAction: "continue"
      })
    );
    const secondPayload = await second.json();
    expect(secondPayload.status).toBe("ready_to_confirm");

    const confirm = await confirmCreatePOST(
      buildRequest("http://localhost/api/agent/tasks/confirm-create", {
        rawUserQuery: "确认创建",
        userAction: "confirm"
      })
    );
    const confirmPayload = await confirm.json();
    expect(confirmPayload.status).toBe("success");
    expect(confirmPayload.conversationId).toBe("global-agent-create-task");
  });
});
