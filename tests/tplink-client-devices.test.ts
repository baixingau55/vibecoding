import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createTpLinkResponse(
  list: Array<Record<string, unknown>>,
  options?: { total?: number; errorCode?: number; msg?: string }
) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      error_code: options?.errorCode ?? 0,
      msg: options?.msg,
      result: {
        total: options?.total ?? list.length,
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

  it("ignores device-type errors and keeps all project child devices under one NVR", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = getRequestUrl(input);
      const body = getRequestBody(init);
      calls.push({ url, body });

      if (url.includes("getDeviceListInDeviceApplication")) {
        return createTpLinkResponse([], {
          errorCode: -88311,
          msg: "application is not device type"
        });
      }

      if (url.includes("getDeviceListInProjectApplication")) {
        if ((body.filterAnd as { hasChild?: number } | undefined)?.hasChild === 1) {
          return createTpLinkResponse([
            {
              qrCode: "nvr-001",
              mac: "00-FF-00-00-00-AA",
              channelId: 1,
              deviceName: "NVR-0002",
              deviceStatus: 1,
              regionName: "Default"
            },
            {
              qrCode: "",
              mac: "00-FF-00-00-00-01",
              parentQrCode: "nvr-001",
              parentMac: "00-FF-00-00-00-AA",
              channelId: 1,
              deviceName: "NVRNVR",
              deviceStatus: 0,
              regionName: "Default"
            },
            {
              qrCode: "",
              mac: "00-FF-00-00-00-02",
              parentQrCode: "nvr-001",
              parentMac: "00-FF-00-00-00-AA",
              channelId: 2,
              deviceName: "IPCIPC",
              deviceStatus: 0,
              regionName: "Default"
            }
          ]);
        }

        return createTpLinkResponse([
          {
            qrCode: "nvr-001",
            mac: "00-FF-00-00-00-AA",
            deviceName: "NVR-0002",
            deviceStatus: 1,
            regionName: "Default"
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

    expect(
      calls.filter((call) => call.url.includes("getDeviceListInDeviceApplication") && (call.body.filterAnd as { hasChild?: number } | undefined)?.hasChild === 1)
    ).toHaveLength(1);
    expect(
      calls.filter((call) => call.url.includes("getDeviceListInProjectApplication") && (call.body.filterAnd as { hasChild?: number } | undefined)?.hasChild === 1)
    ).toHaveLength(1);

    expect(devices).toHaveLength(3);
    expect(devices.map((device) => `${device.qrCode}:${device.channelId}:${device.mac}`).sort()).toEqual([
      "nvr-001:1:00-FF-00-00-00-01",
      "nvr-001:1:00-FF-00-00-00-AA",
      "nvr-001:2:00-FF-00-00-00-02"
    ]);
    expect(devices.find((device) => device.mac === "00-FF-00-00-00-01")).toMatchObject({
      qrCode: "nvr-001",
      parentQrCode: "nvr-001",
      channelId: 1,
      source: "project_application_child"
    });
  });

  it("keeps same-name project child channels separate", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = getRequestUrl(input);
      const body = getRequestBody(init);

      if (url.includes("getDeviceListInDeviceApplication")) {
        return createTpLinkResponse([], {
          errorCode: -88311,
          msg: "application is not device type"
        });
      }

      if (url.includes("getDeviceListInProjectApplication")) {
        if ((body.filterAnd as { hasChild?: number } | undefined)?.hasChild === 1) {
          return createTpLinkResponse([
            {
              qrCode: "",
              mac: "00-FF-00-00-00-11",
              parentQrCode: "parent-qr-001",
              parentMac: "00-FF-00-00-00-22",
              channelId: 1,
              deviceName: "Front Hall",
              deviceStatus: 1,
              regionName: "Store A"
            },
            {
              qrCode: "",
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

      if (url.includes("getEntrustDeviceList")) {
        return createTpLinkResponse([]);
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const { fetchTpLinkDevices } = await import("@/lib/tplink/client");
    const devices = await fetchTpLinkDevices();

    expect(devices).toHaveLength(2);
    expect(devices.map((device) => `${device.channelId}:${device.mac}`).sort()).toEqual(["1:00-FF-00-00-00-11", "2:00-FF-00-00-00-12"]);
  });

  it("dedupes duplicated direct project devices returned by project and project-child endpoints", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = getRequestUrl(input);
      const body = getRequestBody(init);

      if (url.includes("getDeviceListInDeviceApplication")) {
        return createTpLinkResponse([], {
          errorCode: -88311,
          msg: "application is not device type"
        });
      }

      if (url.includes("getDeviceListInProjectApplication")) {
        return createTpLinkResponse([
          {
            qrCode: "camera-001",
            mac: "4C-10-D5-43-EC-55",
            channelId: 1,
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
      qrCode: "camera-001",
      mac: "4C-10-D5-43-EC-55",
      channelId: 1
    });
  });
});
