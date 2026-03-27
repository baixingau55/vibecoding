import { beforeEach, describe, expect, it, vi } from "vitest";

import { deviceCompositeKey } from "@/lib/domain/device-reconciliation";
import type { DeviceRef } from "@/lib/types";

describe("task device options API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns the live TP-LINK snapshot and keeps NVR channel devices separate from the parent NVR", async () => {
    const devices: DeviceRef[] = [
      {
        qrCode: "nvr-001",
        mac: "00-FF-00-00-00-AA",
        channelId: 1,
        name: "NVR-0002",
        status: "online",
        groupName: "Project A",
        previewImage: "https://example.com/1.jpg",
        profileId: "primary",
        profileName: "Primary",
        source: "project_application"
      },
      {
        qrCode: "nvr-001",
        mac: "00-FF-00-00-00-01",
        channelId: 1,
        name: "NVRNVR",
        status: "offline",
        groupName: "Project A",
        previewImage: "https://example.com/2.jpg",
        profileId: "primary",
        profileName: "Primary",
        parentQrCode: "nvr-001",
        parentMac: "00-FF-00-00-00-AA",
        source: "project_application_child"
      },
      {
        qrCode: "nvr-001",
        mac: "00-FF-00-00-00-02",
        channelId: 2,
        name: "IPCIPC",
        status: "offline",
        groupName: "Project A",
        previewImage: "https://example.com/3.jpg",
        profileId: "primary",
        profileName: "Primary",
        parentQrCode: "nvr-001",
        parentMac: "00-FF-00-00-00-AA",
        source: "project_application_child"
      }
    ];

    vi.doMock("@/lib/tplink/client", () => ({
      fetchTpLinkDevices: async () => devices
    }));

    const { GET } = await import("@/app/api/tasks/device-options/route");
    const response = await GET();
    const payload = await response.json();

    expect(payload.devices).toHaveLength(3);
    expect(payload.devices.map((device: DeviceRef) => deviceCompositeKey(device))).toEqual([
      "primary:nvr-001:1:00-FF-00-00-00-AA",
      "primary:nvr-001:1:00-FF-00-00-00-01",
      "primary:nvr-001:2:00-FF-00-00-00-02"
    ]);
  });
});
