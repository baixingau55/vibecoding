import { describe, expect, it } from "vitest";

import { createTpLinkAuthorization } from "@/lib/tplink/signature";

describe("TP-LINK signature", () => {
  it("generates a stable authorization header for fixed inputs", () => {
    const result = createTpLinkAuthorization({
      accessKey: "ak-demo",
      secretKey: "sk-demo",
      path: "/openapi/aiInspection/v1/startAiInspectionTask",
      payload: { hello: "world" },
      timestamp: 1710000000,
      nonce: "nonce123",
      terminalId: "terminal123"
    });

    expect(result.payloadString).toBe(JSON.stringify({ hello: "world" }));
    expect(result.signature).toBe("bf324196d3f4177c38ac1daf77fee73fdba855bc5b5aa3346d4a4e8867d481ba");
    expect(result.signedRequest.authorization).toContain("AccessKey=ak-demo");
    expect(result.signedRequest.authorization).toContain("TerminalId=terminal123");
  });
});
