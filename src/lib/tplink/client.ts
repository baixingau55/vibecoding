import env, { hasTpLinkEnv } from "@/lib/env";
import { createTpLinkAuthorization } from "@/lib/tplink/signature";
import type { Algorithm, DeviceRef } from "@/lib/types";

const TP_LINK_HOST = "api-smbcloud.tp-link.com.cn";
const TP_LINK_ENDPOINT = `https://${TP_LINK_HOST}`;
const DEVICE_PREVIEW_IMAGE =
  "https://images.unsplash.com/photo-1515169067868-5387ec356754?auto=format&fit=crop&w=1200&q=80";

async function tpLinkPost<T>(path: string, payload: unknown): Promise<T> {
  if (!hasTpLinkEnv()) {
    throw new Error("TP-LINK credentials are not configured.");
  }

  const { signedRequest, payloadString } = createTpLinkAuthorization({
    accessKey: env.tpLinkAk,
    secretKey: env.tpLinkSk,
    path,
    payload
  });

  const response = await fetch(`${TP_LINK_ENDPOINT}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Host: TP_LINK_HOST,
      "X-Authorization": signedRequest.authorization
    },
    body: payloadString,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`TP-LINK request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

interface TpLinkListResponse<T> {
  error_code: number;
  result: {
    total?: number;
    list?: T[];
  };
}

interface TpLinkSingleListResponse<T> {
  error_code: number;
  result?: {
    list?: T[];
  };
}

interface TpLinkAlgorithmItem {
  algorithmId: string;
  algorithmName: string;
  algorithmIntroduction: string;
  latestVersion: string;
  versionList: string[];
  algorithmCategoryList: string[];
}

interface TpLinkProjectDeviceItem {
  qrCode?: string;
  mac?: string;
  deviceName?: string;
  deviceStatus?: number;
  channelId?: number;
  regionName?: string;
}

interface TpLinkEntrustDeviceItem {
  qrCode?: string;
  mac?: string;
  deviceName?: string;
  deviceStatus?: number;
  channelId?: number;
  belongEnterpriseName?: string;
}

function normalizeText(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function mapTpLinkDeviceStatus(value: number | undefined): DeviceRef["status"] {
  return value === 1 ? "online" : "offline";
}

function mapProjectDevice(item: TpLinkProjectDeviceItem): DeviceRef | null {
  const qrCode = item.qrCode?.trim();
  if (!qrCode) return null;

  return {
    qrCode,
    mac: item.mac,
    channelId: item.channelId ?? 1,
    name: normalizeText(item.deviceName, qrCode),
    status: mapTpLinkDeviceStatus(item.deviceStatus),
    groupName: normalizeText(item.regionName, "默认分组"),
    previewImage: DEVICE_PREVIEW_IMAGE
  };
}

function mapEntrustDevice(item: TpLinkEntrustDeviceItem, fallbackQrCode?: string): DeviceRef | null {
  const qrCode = item.qrCode?.trim() || fallbackQrCode?.trim();
  if (!qrCode) return null;

  return {
    qrCode,
    mac: item.mac,
    channelId: item.channelId ?? 1,
    name: normalizeText(item.deviceName, qrCode),
    status: mapTpLinkDeviceStatus(item.deviceStatus),
    groupName: normalizeText(item.belongEnterpriseName, "TP-LINK 托管设备"),
    previewImage: DEVICE_PREVIEW_IMAGE
  };
}

export async function fetchTpLinkAlgorithms() {
  const response = await tpLinkPost<TpLinkListResponse<TpLinkAlgorithmItem>>(
    "/openapi/algorithmProduct/v1/getStandardAlgorithmBasicInfo",
    {
      start: 0,
      limit: 1000
    }
  );

  if (response.error_code !== 0) {
    throw new Error(`TP-LINK algorithm fetch failed with error_code=${response.error_code}`);
  }

  return (response.result.list ?? []).map<Algorithm>((item) => ({
    id: item.algorithmId,
    name: item.algorithmName,
    introduction: item.algorithmIntroduction,
    latestVersion: item.latestVersion,
    versionList: item.versionList,
    categories: item.algorithmCategoryList,
    active: true,
    source: "tplink"
  }));
}

export async function fetchTpLinkDevices(): Promise<DeviceRef[]> {
  const endpoints = [
    "/tums/open/deviceManager/v1/getDeviceListInDeviceApplication",
    "/tums/open/deviceManager/v1/getDeviceListInProjectApplication"
  ] as const;

  let lastError: Error | null = null;

  for (const path of endpoints) {
    try {
      const merged = new Map<string, DeviceRef>();
      const limit = 100;
      let start = 0;
      let total = Number.POSITIVE_INFINITY;

      while (start < total) {
        const response = await tpLinkPost<TpLinkListResponse<TpLinkProjectDeviceItem>>(path, {
          start,
          limit,
          filterAnd: {
            hasChild: 1
          }
        });

        if (response.error_code !== 0) {
          throw new Error(`TP-LINK device fetch failed with error_code=${response.error_code}`);
        }

        const list = response.result.list ?? [];
        total = response.result.total ?? list.length;

        for (const item of list) {
          const device = mapProjectDevice(item);
          if (device) {
            merged.set(device.qrCode, device);
          }
        }

        if (list.length < limit) {
          break;
        }

        start += limit;
      }

      if (merged.size > 0) {
        return Array.from(merged.values());
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown TP-LINK device fetch error.");
    }
  }

  throw lastError ?? new Error("TP-LINK device fetch returned no devices.");
}

export async function fetchTpLinkDeviceByQrCode(qrCode: string): Promise<DeviceRef | null> {
  try {
    const response = await tpLinkPost<TpLinkSingleListResponse<TpLinkEntrustDeviceItem>>(
      "/tums/open/deviceEntrust/v1/getEntrustDeviceInfoByDevList",
      {
        devList: [
          {
            qrCode,
            channelId: 1
          }
        ]
      }
    );

    if (response.error_code === 0) {
      const device = mapEntrustDevice(response.result?.list?.[0] ?? {}, qrCode);
      if (device) {
        return device;
      }
    }
  } catch {
    // Fall back to the project application device list below.
  }

  const devices = await fetchTpLinkDevices().catch(() => []);
  return devices.find((device) => device.qrCode === qrCode) ?? null;
}

export async function startTpLinkInspectionTask(payload: {
  callbackAddress: string;
  algorithmIdList: string[];
  devList: Array<{
    qrCode: string;
    channelId: number;
    regionConfig?: string;
  }>;
  type: 1 | 2;
  playbackTime?: string;
}) {
  return tpLinkPost<{
    error_code: number;
    result?: { taskId?: string };
  }>("/openapi/aiInspection/v1/startAiInspectionTask", payload);
}

export async function setTpLinkAlgorithmVersions(payload: {
  algorithmInfoList: Array<{ algorithmId: string; algorithmVersion: string }>;
}) {
  return tpLinkPost<{
    error_code: number;
    result?: { failList?: Array<{ algorithmId: string; algorithmVersion: string; error_code: number }> };
  }>("/openapi/aiInspection/v1/batchSetAlgorithmVersion", payload);
}

export async function getTpLinkInspectionTaskResult(taskId: string) {
  return tpLinkPost<{
    error_code: number;
    result?: {
      taskStatus: number;
      taskResult?: Array<{
        qrCode: string;
        mac?: string;
        channelId: number;
        imageUrl: string;
        imageTime: string;
        algorithmId: string;
        algorithmResult: "QUALIFIED" | "UNQUALIFIED" | "UNAVAILABLE";
      }>;
      failList?: Array<{ qrCode: string; mac?: string; channelId: number; error_code: number }>;
    };
  }>("/openapi/aiInspection/v1/getAiInspectionTaskResult", { taskId });
}

export async function submitTpLinkCaptureVideoTask(payload: {
  qrCode: string;
  channelId: number;
  playbackStartTime: string;
  playbackEndTime: string;
  expireDays?: number;
}) {
  return tpLinkPost<{
    error_code: number;
    result?: { taskId?: string };
  }>("/vms/open/videoFetchService/v1/submitCaptureVideoTask", {
    qrCode: payload.qrCode,
    channelId: payload.channelId,
    type: 102,
    playbackStartTime: payload.playbackStartTime,
    playbackEndTime: payload.playbackEndTime,
    expireDays: payload.expireDays ?? 1
  });
}

export async function getTpLinkVideoTaskInfo(taskId: string) {
  return tpLinkPost<{
    error_code: number;
    result?: {
      taskId?: string;
      state?: number;
      error_code?: number;
      errorMsg?: string;
    };
  }>("/vms/open/videoFetchService/v1/getTaskInfo", { taskId });
}

export async function getTpLinkVideoTaskFilePage(taskId: string) {
  return tpLinkPost<{
    error_code: number;
    result?: {
      total?: number;
      list?: Array<{
        fileId?: string;
        urls?: string[];
        expireTime?: string | null;
      }>;
    };
  }>("/vms/open/videoFetchService/v1/getTaskFilePage", {
    taskId,
    pageIndex: 0,
    pageSize: 10,
    urlRequired: true,
    urlTtl: 600
  });
}

export async function bootstrapTpLinkMessageSubscription(payload: {
  callbackUrl: string;
  signSecret: string;
}) {
  const configResponse = await tpLinkPost<{ error_code: number }>("/tums/open/msgTranspond/v1/setAppMsgPushConfig", {
    serverUrl: payload.callbackUrl,
    openMsgTransport: 1,
    msgContentType: []
  });

  const signResponse = await tpLinkPost<{ error_code: number }>("/tums/open/msgTranspond/v1/setAppMsgPushSk", {
    sk: payload.signSecret
  });

  return { configResponse, signResponse };
}
