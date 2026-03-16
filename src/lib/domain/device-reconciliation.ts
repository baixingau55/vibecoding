import type { DeviceRef } from "@/lib/types";

function isPlaceholderGroup(groupName: string | undefined) {
  return /托管设备|Entrust/i.test(groupName?.trim() ?? "");
}

export function isPlaceholderDeviceIdentity(device: Pick<DeviceRef, "qrCode" | "name" | "groupName">) {
  const normalizedName = device.name?.trim();
  return !normalizedName || normalizedName === device.qrCode || isPlaceholderGroup(device.groupName);
}

function hasTrustedProfileBinding(device: Pick<DeviceRef, "profileId" | "status" | "qrCode" | "name" | "groupName">) {
  return Boolean(device.profileId && device.status === "online" && !isPlaceholderDeviceIdentity(device));
}

export function getPreferredProfileId(devices: Array<Pick<DeviceRef, "profileId">>) {
  const profileCounts = new Map<string, number>();
  for (const device of devices) {
    if (!device.profileId) continue;
    profileCounts.set(device.profileId, (profileCounts.get(device.profileId) ?? 0) + 1);
  }

  return [...profileCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
}

export function scoreDeviceCandidate(
  source: Pick<DeviceRef, "profileId" | "status" | "mac" | "name" | "groupName" | "qrCode">,
  candidate: Pick<DeviceRef, "profileId" | "status" | "mac" | "name" | "groupName" | "qrCode">,
  preferredProfileId?: string
) {
  let score = 0;
  const trustedBinding = hasTrustedProfileBinding(source);
  const placeholderIdentity = isPlaceholderDeviceIdentity(source);

  if (source.mac && candidate.mac && source.mac === candidate.mac) score += 220;
  if (trustedBinding && source.profileId && source.profileId === candidate.profileId) score += 180;
  if (!trustedBinding && source.profileId && source.profileId === candidate.profileId) score += 35;
  if (!source.profileId && preferredProfileId && candidate.profileId === preferredProfileId) score += 110;
  if (!placeholderIdentity && source.name && source.name === candidate.name) score += 70;
  if (!placeholderIdentity && source.groupName && source.groupName === candidate.groupName) score += 40;
  if (candidate.status === "online") score += 60;
  if (source.status !== "online" && candidate.status === "online") score += 80;
  if (candidate.profileId) score += 20;
  if (placeholderIdentity && candidate.name && candidate.name !== candidate.qrCode) score += 30;

  return score;
}

export function pickBestDeviceCandidate(source: DeviceRef, candidates: DeviceRef[], preferredProfileId?: string) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  return [...candidates].sort(
    (left, right) => scoreDeviceCandidate(source, right, preferredProfileId) - scoreDeviceCandidate(source, left, preferredProfileId)
  )[0];
}

export function filterCandidatesForDevice(source: Pick<DeviceRef, "profileId">, candidates: DeviceRef[]) {
  if (!source.profileId) return candidates;

  const sameProfileCandidates = candidates.filter((candidate) => candidate.profileId === source.profileId);
  return sameProfileCandidates;
}

export function reconcileDevice(source: DeviceRef, candidates: DeviceRef[], preferredProfileId?: string) {
  const bestCandidate = pickBestDeviceCandidate(source, candidates, preferredProfileId);
  if (!bestCandidate) return source;

  return {
    ...source,
    ...bestCandidate,
    profileId: bestCandidate.profileId ?? source.profileId,
    profileName: bestCandidate.profileName ?? source.profileName
  };
}

export function deviceCompositeKey(device: Pick<DeviceRef, "profileId" | "qrCode" | "channelId">) {
  return `${device.profileId ?? "primary"}:${device.qrCode}:${device.channelId}`;
}

export function dedupeDevicesByIdentity(devices: DeviceRef[]) {
  return Array.from(new Map(devices.map((device) => [deviceCompositeKey(device), device] as const)).values());
}
