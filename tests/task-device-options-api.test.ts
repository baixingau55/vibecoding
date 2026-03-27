import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DeviceRef } from "@/lib/types";

describe("task device options API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns the unified device snapshot without dropping extra channels", async () => {
    const devices: DeviceRef[] = [
      {
        qrCode: "device-001",
        channelId: 1,
        name: "North Gate",
        status: "online",
        groupName: "Project A",
        previewImage: "https://example.com/1.jpg",
        profileId: "primary",
        profileName: "Primary"
      },
      {
        qrCode: "device-001",
        channelId: 2,
        name: "North Gate",
        status: "online",
        groupName: "Project A",
        previewImage: "https://example.com/2.jpg",
        profileId: "primary",
        profileName: "Primary"
      },
      {
        qrCode: "device-001",
        channelId: 2,
        name: "North Gate",
        status: "online",
        groupName: "Project A",
        previewImage: "https://example.com/2.jpg",
        profileId: "primary",
        profileName: "Primary"
      }
    ];

    vi.doMock("@/lib/repositories/app-store", () => ({
      getAppStore: async () => ({
        snapshot: async () => ({ devices })
      })
    }));

    const { GET } = await import("@/app/api/tasks/device-options/route");
    const response = await GET();
    const payload = await response.json();

    expect(payload.devices).toHaveLength(2);
    expect(payload.devices.map((device: DeviceRef) => `${device.qrCode}:${device.channelId}`)).toEqual(["device-001:1", "device-001:2"]);
  });
});
