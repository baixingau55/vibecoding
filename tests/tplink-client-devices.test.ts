import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createTpLinkResponse(list: Array<Record<string, unknown>>, total = list.length) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      error_code: 0,
      result: {
        total,
        list
      }
    })
  } as Response;
}

function getRequestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function getRequestBody(init?: RequestInit) {
  return init?.body ? JSON.parse(String(init.body)) : {};
}

describe("fetchTpLinkDevices", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env.TP_LINK_AK = "test-ak";
    process.env.TP_LINK_SK = "test-sk";
    process.env.TP_LINK_PROFILE_1_NAME = "TP-LINK Account 1";
    delete process.env.TP_LINK_AK_2;
    delete process.env.TP_LINK_SK_2;
    delete process.env.TP_LINK_PROFILE_2_NAME;
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

  it("fetches device, child, project, and entrust sources without dropping child channels", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = getRequestUrl(input);
      const body = getRequestBody(init);
      calls.push({ url, body });

      if (url.includes("getDeviceListInDeviceApplication")) {
        if ((body.filterAnd as { hasChild?: number } | undefined)?.hasChild === 1) {
          return createTpLinkResponse([
            {
              qrCode: "ipc-001",
              mac: "00-FF-00-00-00-01",
              parentQrCode: "nvr-001",
              parentMac: "00-FF-00-00-00-AA",
              channelId: 1,
              deviceName: "North Gate",
              deviceStatus: 1,
              regionName: "Campus"
            },
            {
              qrCode: "ipc-002",
              mac: "00-FF-00-00-00-02",
              parentQrCode: "nvr-001",
              parentMac: "00-FF-00-00-00-AA",
              channelId: 2,
              deviceName: "North Gate",
              deviceStatus: 0,
              regionName: "Campus"
            }
          ]);
        }

        return createTpLinkResponse([
          {
            qrCode: "nvr-001",
            mac: "00-FF-00-00-00-AA",
            channelId: 1,
            deviceName: "NVR-0002",
            deviceStatus: 1,
            regionName: "Campus"
          }
        ]);
      }

      if (url.includes("getDeviceListInProjectApplication")) {
        return createTpLinkResponse([
          {
            qrCode: "nvr-001",
            mac: "00-FF-00-00-00-AA",
            channelId: 2,
            deviceName: "North Gate",
            deviceStatus: 0,
            regionName: "Campus"
          }
        ]);
      }

      if (url.includes("getEntrustDeviceList")) {
        return createTpLinkResponse([
          {
            qrCode: "entrust-001",
            mac: "00-FF-00-00-00-EE",
            channelId: 1,
            deviceName: "Hosted Camera",
            deviceStatus: 1,
            belongEnterpriseName: "Hosted Devices"
          }
        ]);
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const { fetchTpLinkDevices } = await import("@/lib/tplink/client");
    const devices = await fetchTpLinkDevices();

    expect(calls.filter((call) => call.url.includes("getDeviceListInDeviceApplication") && !("filterAnd" in call.body))).toHaveLength(1);
    expect(
      calls.filter((call) => call.url.includes("getDeviceListInDeviceApplication") && (call.body.filterAnd as { hasChild?: number } | undefined)?.hasChild === 1)
    ).toHaveLength(1);
    expect(calls.filter((call) => call.url.includes("getDeviceListInProjectApplication"))).toHaveLength(1);
    expect(calls.filter((call) => call.url.includes("getEntrustDeviceList"))).toHaveLength(1);

    expect(devices).toHaveLength(4);
    expect(devices.map((device) => `${device.qrCode}:${device.channelId}`).sort()).toEqual([
      "entrust-001:1",
      "ipc-001:1",
      "ipc-002:2",
      "nvr-001:1"
    ]);

    expect(devices.find((device) => device.qrCode === "ipc-002")).toMatchObject({
      qrCode: "ipc-002",
      parentQrCode: "nvr-001",
      source: "device_application_child"
    });
  });

  it("merges cross-source duplicates only when a child row points at the parent identity", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = getRequestUrl(input);
      const body = getRequestBody(init);

      if (url.includes("getDeviceListInDeviceApplication")) {
        if ((body.filterAnd as { hasChild?: number } | undefined)?.hasChild === 1) {
          return createTpLinkResponse([
            {
              qrCode: "child-qr-001",
              mac: "00-FF-00-00-00-11",
              parentQrCode: "parent-qr-001",
              parentMac: "00-FF-00-00-00-22",
              channelId: 2,
              deviceName: "Front Hall 2",
              deviceStatus: 1,
              regionName: "Store A"
            }
          ]);
        }

        return createTpLinkResponse([]);
      }

      if (url.includes("getDeviceListInProjectApplication")) {
        return createTpLinkResponse([
          {
            qrCode: "parent-qr-001",
            mac: "00-FF-00-00-00-22",
            channelId: 2,
            deviceName: "Front Hall 2",
            deviceStatus: 1,
            regionName: "Store A"
          }
        ]);
      }

      if (url.includes("getEntrustDeviceList")) {
        return createTpLinkResponse([]);
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const { fetchTpLinkDevices } = await import("@/lib/tplink/client");
    const devices = await fetchTpLinkDevices();

    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      qrCode: "child-qr-001",
      mac: "00-FF-00-00-00-11",
      channelId: 2,
      name: "Front Hall 2",
      parentQrCode: "parent-qr-001",
      parentMac: "00-FF-00-00-00-22",
      source: "device_application_child"
    });
  });

  it("keeps same-name devices when their channelId differs", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = getRequestUrl(input);
      const body = getRequestBody(init);

      if (url.includes("getDeviceListInDeviceApplication")) {
        if ((body.filterAnd as { hasChild?: number } | undefined)?.hasChild === 1) {
          return createTpLinkResponse([
            {
              qrCode: "child-qr-001",
              mac: "00-FF-00-00-00-11",
              parentQrCode: "parent-qr-001",
              parentMac: "00-FF-00-00-00-22",
              channelId: 1,
              deviceName: "Front Hall",
              deviceStatus: 1,
              regionName: "Store A"
            },
            {
              qrCode: "child-qr-002",
              mac: "00-FF-00-00-00-12",
              parentQrCode: "parent-qr-001",
              parentMac: "00-FF-00-00-00-22",
              channelId: 2,
              deviceName: "Front Hall",
              deviceStatus: 1,
              regionName: "Store A"
            }
          ]);
        }

        return createTpLinkResponse([]);
      }

      if (url.includes("getDeviceListInProjectApplication") || url.includes("getEntrustDeviceList")) {
        return createTpLinkResponse([]);
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const { fetchTpLinkDevices } = await import("@/lib/tplink/client");
    const devices = await fetchTpLinkDevices();

    expect(devices).toHaveLength(2);
    expect(devices.map((device) => `${device.qrCode}:${device.channelId}`).sort()).toEqual(["child-qr-001:1", "child-qr-002:2"]);
  });
});
