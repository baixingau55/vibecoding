import env, { hasTpLinkEnv } from "@/lib/env";
import { createTpLinkAuthorization } from "@/lib/tplink/signature";
import type { Algorithm, DeviceRef } from "@/lib/types";

const TP_LINK_HOST = "api-smbcloud.tp-link.com.cn";
const TP_LINK_ENDPOINT = `https://${TP_LINK_HOST}`;

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

interface TpLinkAlgorithmItem {
  algorithmId: string;
  algorithmName: string;
  algorithmIntroduction: string;
  latestVersion: string;
  versionList: string[];
  algorithmCategoryList: string[];
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

interface TpLinkDeviceInfoResponse {
  error_code: number;
  result?: {
    qrCode?: string;
    mac?: string;
    devName?: string;
    channelId?: number;
    groupName?: string;
    online?: boolean;
  };
}

export async function fetchTpLinkDeviceByQrCode(qrCode: string): Promise<DeviceRef | null> {
  const response = await tpLinkPost<TpLinkDeviceInfoResponse>("/tums/open/device/v1/getDeviceInfo", {
    qrCode
  });

  if (response.error_code !== 0 || !response.result) {
    return null;
  }

  return {
    qrCode: response.result.qrCode ?? qrCode,
    mac: response.result.mac,
    channelId: response.result.channelId ?? 1,
    name: response.result.devName ?? qrCode,
    status: response.result.online ? "online" : "offline",
    groupName: response.result.groupName ?? "TP-LINK 导入设备",
    previewImage: "https://images.unsplash.com/photo-1515169067868-5387ec356754?auto=format&fit=crop&w=1200&q=80"
  };
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
