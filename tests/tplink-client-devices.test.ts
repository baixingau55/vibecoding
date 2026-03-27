import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createTpLinkResponse(list: Array<Record<string, unknown>>) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      error_code: 0,
      result: {
        total: list.length,
        list
      }
    })
  } as Response;
}

describe("fetchTpLinkDevices", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env.TP_LINK_AK = "test-ak";
    process.env.TP_LINK_SK = "test-sk";
    delete process.env.TP_LINK_AK_2;
    delete process.env.TP_LINK_SK_2;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it("keeps multi-channel devices instead of collapsing them by qrCode", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("getDeviceListInDeviceApplication")) {
        return createTpLinkResponse([
          {
            qrCode: "device-001",
            channelId: 1,
            deviceName: "North Gate",
            deviceStatus: 1,
            regionName: "Campus"
          },
          {
            qrCode: "device-001",
            channelId: 2,
            deviceName: "North Gate",
            deviceStatus: 1,
            regionName: "Campus"
          }
        ]);
      }

      if (url.includes("getDeviceListInProjectApplication")) {
        return createTpLinkResponse([]);
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const { fetchTpLinkDevices } = await import("@/lib/tplink/client");
    const devices = await fetchTpLinkDevices();

    expect(devices).toHaveLength(2);
    expect(devices.map((device) => `${device.qrCode}:${device.channelId}`)).toEqual(["device-001:1", "device-001:2"]);
    expect(fetchMock).toHaveBeenCalled();
    for (const [, requestInit] of fetchMock.mock.calls) {
      const payload = requestInit?.body ? JSON.parse(String(requestInit.body)) : {};
      expect(payload.filterAnd).toBeUndefined();
    }
  });

  it("uses parent device identity to merge overlapping rows from different list APIs", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("getDeviceListInDeviceApplication")) {
        return createTpLinkResponse([
          {
            qrCode: "child-qr-001",
            parentQrCode: "nvr-qr-001",
            mac: "00-FF-00-11-11-11",
            parentMac: "00-FF-00-22-22-22",
            channelId: 2,
            deviceName: "前厅2",
            deviceStatus: 1,
            regionName: "聚才路"
          }
        ]);
      }

      if (url.includes("getDeviceListInProjectApplication")) {
        return createTpLinkResponse([
          {
            qrCode: "nvr-qr-001",
            mac: "00-FF-00-22-22-22",
            channelId: 2,
            deviceName: "前厅2",
            deviceStatus: 1,
            regionName: "聚才路"
          }
        ]);
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const { fetchTpLinkDevices } = await import("@/lib/tplink/client");
    const devices = await fetchTpLinkDevices();

    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      qrCode: "nvr-qr-001",
      mac: "00-FF-00-22-22-22",
      channelId: 2,
      name: "前厅2"
    });
  });
});
