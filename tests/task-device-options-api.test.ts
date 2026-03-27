import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DeviceRef } from "@/lib/types";

describe("task device options API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns the live TP-LINK snapshot and keeps additional channels", async () => {
    const devices: DeviceRef[] = [
      {
        qrCode: "device-001",
        channelId: 1,
        name: "North Gate",
        status: "online",
        groupName: "Project A",
        previewImage: "https://example.com/1.jpg",
        profileId: "primary",
        profileName: "Primary",
        source: "device_application"
      },
      {
        qrCode: "device-001",
        channelId: 2,
        name: "North Gate",
        status: "online",
        groupName: "Project A",
        previewImage: "https://example.com/2.jpg",
        profileId: "primary",
        profileName: "Primary",
        source: "device_application_child"
      },
      {
        qrCode: "device-001",
        channelId: 2,
        name: "North Gate",
        status: "online",
        groupName: "Project A",
        previewImage: "https://example.com/2.jpg",
        profileId: "primary",
        profileName: "Primary",
        source: "project_application"
      }
    ];

    vi.doMock("@/lib/tplink/client", () => ({
      fetchTpLinkDevices: async () => devices
    }));

    const { GET } = await import("@/app/api/tasks/device-options/route");
    const response = await GET();
    const payload = await response.json();

    expect(payload.devices).toHaveLength(2);
    expect(payload.devices.map((device: DeviceRef) => `${device.qrCode}:${device.channelId}`)).toEqual(["device-001:1", "device-001:2"]);
  });
});
