import env, { getTpLinkProfiles, hasTpLinkEnv, type TpLinkProfile } from "@/lib/env";
import { createTpLinkAuthorization } from "@/lib/tplink/signature";
import type { Algorithm, DeviceRef, TpLinkProfileId } from "@/lib/types";

const TP_LINK_HOST = "api-smbcloud.tp-link.com.cn";
const TP_LINK_ENDPOINT = `https://${TP_LINK_HOST}`;
const DEVICE_PREVIEW_IMAGE =
  "https://images.unsplash.com/photo-1515169067868-5387ec356754?auto=format&fit=crop&w=1200&q=80";
const DEVICE_CACHE_TTL_MS = 60 * 1000;

let cachedDeviceList: DeviceRef[] | null = null;
let cachedDeviceListAt = 0;
let deviceListInFlight: Promise<DeviceRef[]> | null = null;

function getProfile(profileId?: TpLinkProfileId) {
  const profiles = getTpLinkProfiles();
  if (!profileId) return profiles[0];
  return profiles.find((item) => item.id === profileId);
}

async function tpLinkPostForProfile<T>(profile: TpLinkProfile, path: string, payload: unknown): Promise<T> {
  const { signedRequest, payloadString } = createTpLinkAuthorization({
    accessKey: profile.accessKey,
    secretKey: profile.secretKey,
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

async function tpLinkPost<T>(path: string, payload: unknown, profileId?: TpLinkProfileId): Promise<T> {
  if (!hasTpLinkEnv()) {
    throw new Error("TP-LINK credentials are not configured.");
  }

  const profile = getProfile(profileId);
  if (!profile) {
    throw new Error(`TP-LINK profile not found: ${profileId}`);
  }

  return tpLinkPostForProfile<T>(profile, path, payload);
}

async function tpLinkPostAcrossProfiles<T>(
  path: string,
  payload: unknown,
  predicate: (response: T) => boolean
): Promise<{ profileId: TpLinkProfileId; response: T }> {
  const profiles = getTpLinkProfiles();
  let lastError: Error | null = null;
  let lastInvalidResponse: { profileId: TpLinkProfileId; response: T } | null = null;

  for (const profile of profiles) {
    try {
      const response = await tpLinkPostForProfile<T>(profile, path, payload);
      if (predicate(response)) {
        return { profileId: profile.id, response };
      }
      lastInvalidResponse = { profileId: profile.id, response };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown TP-LINK error.");
    }
  }

  if (lastInvalidResponse) {
    throw new Error(`No TP-LINK profile returned a valid response. Last response from ${lastInvalidResponse.profileId}: ${JSON.stringify(lastInvalidResponse.response)}`);
  }

  if (lastError) throw lastError;
  throw new Error("No TP-LINK profile returned a valid response.");
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

function mapProjectDevice(item: TpLinkProjectDeviceItem, profile: TpLinkProfile): DeviceRef | null {
  const qrCode = item.qrCode?.trim();
  if (!qrCode) return null;

  return {
    qrCode,
    mac: item.mac,
    channelId: item.channelId ?? 1,
    name: normalizeText(item.deviceName, qrCode),
    status: mapTpLinkDeviceStatus(item.deviceStatus),
    groupName: `${profile.name} / ${normalizeText(item.regionName, "默认分组")}`,
    previewImage: DEVICE_PREVIEW_IMAGE,
    profileId: profile.id,
    profileName: profile.name
  };
}

function mapEntrustDevice(item: TpLinkEntrustDeviceItem, profile: TpLinkProfile, fallbackQrCode?: string): DeviceRef | null {
  const qrCode = item.qrCode?.trim() || fallbackQrCode?.trim();
  if (!qrCode) return null;

  return {
    qrCode,
    mac: item.mac,
    channelId: item.channelId ?? 1,
    name: normalizeText(item.deviceName, qrCode),
    status: mapTpLinkDeviceStatus(item.deviceStatus),
    groupName: `${profile.name} / ${normalizeText(item.belongEnterpriseName, "TP-LINK 托管设备")}`,
    previewImage: DEVICE_PREVIEW_IMAGE,
    profileId: profile.id,
    profileName: profile.name
  };
}

export async function fetchTpLinkAlgorithms() {
  const profiles = getTpLinkProfiles();
  const merged = new Map<string, Algorithm>();

  for (const profile of profiles) {
    const response = await tpLinkPostForProfile<TpLinkListResponse<TpLinkAlgorithmItem>>(
      profile,
      "/openapi/algorithmProduct/v1/getStandardAlgorithmBasicInfo",
      {
        start: 0,
        limit: 1000
      }
    );

    if (response.error_code !== 0) {
      throw new Error(`TP-LINK algorithm fetch failed with error_code=${response.error_code}`);
    }

    for (const item of response.result.list ?? []) {
      const current = merged.get(item.algorithmId);
      if (current) {
        current.profileIds = Array.from(new Set([...(current.profileIds ?? []), profile.id]));
        current.profileNames = Array.from(new Set([...(current.profileNames ?? []), profile.name]));
        current.versionList = Array.from(new Set([...current.versionList, ...(item.versionList ?? [])]));
        continue;
      }

      merged.set(item.algorithmId, {
        id: item.algorithmId,
        name: item.algorithmName,
        introduction: item.algorithmIntroduction,
        latestVersion: item.latestVersion,
        versionList: item.versionList,
        categories: item.algorithmCategoryList,
        active: true,
        source: "tplink",
        profileIds: [profile.id],
        profileNames: [profile.name]
      });
    }
  }

  return Array.from(merged.values());
}

export async function fetchTpLinkDevices(): Promise<DeviceRef[]> {
  if (cachedDeviceList && Date.now() - cachedDeviceListAt < DEVICE_CACHE_TTL_MS) {
    return cachedDeviceList;
  }

  if (deviceListInFlight) {
    return deviceListInFlight;
  }

  deviceListInFlight = (async () => {
  const endpoints = [
    "/tums/open/deviceManager/v1/getDeviceListInDeviceApplication",
    "/tums/open/deviceManager/v1/getDeviceListInProjectApplication"
  ] as const;
  const profiles = getTpLinkProfiles();
  const merged = new Map<string, DeviceRef>();
  let lastError: Error | null = null;

  for (const profile of profiles) {
    let fetchedForProfile = false;

    for (const path of endpoints) {
      try {
        const limit = 100;
        let start = 0;
        let total = Number.POSITIVE_INFINITY;

        while (start < total) {
          const response = await tpLinkPostForProfile<TpLinkListResponse<TpLinkProjectDeviceItem>>(profile, path, {
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
            const device = mapProjectDevice(item, profile);
            if (device) {
              merged.set(`${device.profileId}:${device.qrCode}`, device);
            }
          }

          if (list.length < limit) {
            break;
          }

          start += limit;
        }

        fetchedForProfile = true;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown TP-LINK device fetch error.");
      }
    }

    if (!fetchedForProfile) {
      continue;
    }
  }

  if (merged.size === 0 && lastError) {
    throw lastError;
  }

    const devices = Array.from(merged.values());
    cachedDeviceList = devices;
    cachedDeviceListAt = Date.now();
    return devices;
  })();

  try {
    return await deviceListInFlight;
  } finally {
    deviceListInFlight = null;
  }
}

export async function fetchTpLinkDeviceByQrCode(qrCode: string, profileId?: TpLinkProfileId): Promise<DeviceRef | null> {
  const profiles = profileId ? [getProfile(profileId)].filter(Boolean) as TpLinkProfile[] : getTpLinkProfiles();

  for (const profile of profiles) {
    try {
      const response = await tpLinkPostForProfile<TpLinkSingleListResponse<TpLinkEntrustDeviceItem>>(
        profile,
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
        const device = mapEntrustDevice(response.result?.list?.[0] ?? {}, profile, qrCode);
        if (device) {
          return device;
        }
      }
    } catch {
      // Fall through to broader fetch.
    }
  }

  const devices = await fetchTpLinkDevices().catch(() => []);
  return devices.find((device) => device.qrCode === qrCode && (!profileId || device.profileId === profileId)) ?? null;
}

export async function startTpLinkInspectionTask(
  payload: {
    callbackAddress: string;
    algorithmIdList: string[];
    devList: Array<{
      qrCode: string;
      channelId: number;
      regionConfig?: string;
    }>;
    type: 1 | 2;
    playbackTime?: string;
  },
  profileId?: TpLinkProfileId
) {
  return tpLinkPost<{
    error_code: number;
    result?: { taskId?: string };
  }>("/openapi/aiInspection/v1/startAiInspectionTask", payload, profileId);
}

export async function setTpLinkAlgorithmVersions(
  payload: {
    algorithmInfoList: Array<{ algorithmId: string; algorithmVersion: string }>;
  },
  profileId?: TpLinkProfileId
) {
  return tpLinkPost<{
    error_code: number;
    result?: { failList?: Array<{ algorithmId: string; algorithmVersion: string; error_code: number }> };
  }>("/openapi/aiInspection/v1/batchSetAlgorithmVersion", payload, profileId);
}

export async function getTpLinkInspectionTaskResult(taskId: string, profileId?: TpLinkProfileId) {
  if (profileId) {
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
    }>("/openapi/aiInspection/v1/getAiInspectionTaskResult", { taskId }, profileId);
  }

  const { response } = await tpLinkPostAcrossProfiles<{
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
  }>("/openapi/aiInspection/v1/getAiInspectionTaskResult", { taskId }, (item) => item.error_code === 0);

  return response;
}

export async function submitTpLinkCaptureVideoTask(
  payload: {
    qrCode: string;
    channelId: number;
    playbackStartTime: string;
    playbackEndTime: string;
    expireDays?: number;
  },
  profileId?: TpLinkProfileId
) {
  if (profileId) {
    return tpLinkPost<{
      error_code: number;
      result?: { taskId?: string };
    }>(
      "/vms/open/videoFetchService/v1/submitCaptureVideoTask",
      {
        qrCode: payload.qrCode,
        channelId: payload.channelId,
        type: 102,
        playbackStartTime: payload.playbackStartTime,
        playbackEndTime: payload.playbackEndTime,
        expireDays: payload.expireDays ?? 1
      },
      profileId
    );
  }

  const { response } = await tpLinkPostAcrossProfiles<{
    error_code: number;
    msg?: string;
    result?: { taskId?: string };
  }>(
    "/vms/open/videoFetchService/v1/submitCaptureVideoTask",
    {
      qrCode: payload.qrCode,
      channelId: payload.channelId,
      type: 102,
      playbackStartTime: payload.playbackStartTime,
      playbackEndTime: payload.playbackEndTime,
      expireDays: payload.expireDays ?? 1
    },
    (item) => item.error_code === 0 && Boolean(item.result?.taskId)
  );

  return response;
}

export async function getTpLinkVideoTaskInfo(taskId: string, profileId?: TpLinkProfileId) {
  if (profileId) {
    return tpLinkPost<{
      error_code: number;
      result?: {
        taskId?: string;
        state?: number;
        error_code?: number;
        errorMsg?: string;
      };
    }>("/vms/open/videoFetchService/v1/getTaskInfo", { taskId }, profileId);
  }

  const { response } = await tpLinkPostAcrossProfiles<{
    error_code: number;
    result?: {
      taskId?: string;
      state?: number;
      error_code?: number;
      errorMsg?: string;
    };
  }>("/vms/open/videoFetchService/v1/getTaskInfo", { taskId }, (item) => item.error_code === 0);

  return response;
}

export async function getTpLinkVideoTaskFilePage(taskId: string, profileId?: TpLinkProfileId) {
  if (profileId) {
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
    }>(
      "/vms/open/videoFetchService/v1/getTaskFilePage",
      {
        taskId,
        pageIndex: 0,
        pageSize: 10,
        urlRequired: true,
        urlTtl: 600
      },
      profileId
    );
  }

  const { response } = await tpLinkPostAcrossProfiles<{
    error_code: number;
    result?: {
      total?: number;
      list?: Array<{
        fileId?: string;
        urls?: string[];
        expireTime?: string | null;
      }>;
    };
  }>(
    "/vms/open/videoFetchService/v1/getTaskFilePage",
    {
      taskId,
      pageIndex: 0,
      pageSize: 10,
      urlRequired: true,
      urlTtl: 600
    },
    (item) => item.error_code === 0
  );

  return response;
}

export async function bootstrapTpLinkMessageSubscription(payload: {
  callbackUrl: string;
  signSecret: string;
}) {
  const results = [];

  for (const profile of getTpLinkProfiles()) {
    const configResponse = await tpLinkPostForProfile<{ error_code: number }>(profile, "/tums/open/msgTranspond/v1/setAppMsgPushConfig", {
      serverUrl: payload.callbackUrl,
      openMsgTransport: 1,
      msgContentType: []
    });

    const signResponse = await tpLinkPostForProfile<{ error_code: number }>(profile, "/tums/open/msgTranspond/v1/setAppMsgPushSk", {
      sk: payload.signSecret
    });

    results.push({ profileId: profile.id, configResponse, signResponse });
  }

  return results;
}

export function getTpLinkProfileName(profileId?: TpLinkProfileId) {
  if (!profileId) return undefined;
  return getProfile(profileId)?.name;
}

export function getDefaultTpLinkProfileId() {
  return env.tpLinkProfiles[0]?.id;
}
