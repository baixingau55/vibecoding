"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PencilLine, Plus, Trash2, X } from "lucide-react";

import { RegionEditor } from "@/components/tasks/region-editor";
import type { Algorithm, DeviceRef, InspectionSchedule, InspectionTask, MessageRule, RegionShape } from "@/lib/types";
import { cn, readJsonResponse } from "@/lib/utils";

function deviceKey(device: Pick<DeviceRef, "qrCode" | "channelId" | "profileId">) {
  return `${device.profileId ?? "primary"}:${device.qrCode}:${device.channelId}`;
}

const repeatOptions = [
  { label: "每天", days: [0, 1, 2, 3, 4, 5, 6] },
  { label: "工作日", days: [1, 2, 3, 4, 5] },
  { label: "周末", days: [0, 6] },
  { label: "自定义", days: [1, 3, 5] }
];

const intervalOptions = [
  { label: "1min", minutes: 1 },
  { label: "5min", minutes: 5 },
  { label: "10min", minutes: 10 },
  { label: "15min", minutes: 15 },
  { label: "30min", minutes: 30 },
  { label: "45min", minutes: 45 },
  { label: "1h", minutes: 60 },
  { label: "90min", minutes: 90 },
  { label: "2h", minutes: 120 }
];

const algorithmRuleMeta: Record<
  string,
  {
    target: string;
    defaultMode: "detect_target" | "not_detect_target";
    messageContent: string;
  }
> = {
  "away-from-post-detection": {
    target: "检出空岗行为",
    defaultMode: "detect_target",
    messageContent: "检出空岗"
  },
  "smoking-detection": {
    target: "检出吸烟行为",
    defaultMode: "detect_target",
    messageContent: "检出吸烟"
  },
  "helmet-detection": {
    target: "检出未佩戴安全帽行为",
    defaultMode: "detect_target",
    messageContent: "未佩戴安全帽"
  }
};

function formatRepeat(days: number[]) {
  const matched = repeatOptions.find((option) => option.days.join(",") === days.join(","));
  return matched?.label ?? "自定义";
}

function scheduleSummary(schedule: InspectionSchedule) {
  if (schedule.type === "time_point") return `时间点 ${schedule.startTime}`;
  return `时间段 ${schedule.startTime} - ${schedule.endTime} / 间隔 ${schedule.intervalMinutes ?? 30} 分钟`;
}

function isTimeValue(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function toMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

type DevicePreviewState = {
  url: string;
  imageTime?: string;
};

export function TaskBuilder({
  algorithms,
  devices,
  initialTask,
  selectedAlgorithmId,
  submitUrl = "/api/tasks",
  method = "POST",
  redirectTo = "/tasks",
  devicesLoaderUrl = "/api/tasks/device-options"
}: {
  algorithms: Algorithm[];
  devices: DeviceRef[];
  initialTask?: InspectionTask;
  selectedAlgorithmId?: string;
  submitUrl?: string;
  method?: "POST" | "PATCH";
  redirectTo?: string;
  devicesLoaderUrl?: string;
}) {
  const router = useRouter();
  const defaultAlgorithm = algorithms.find((item) => item.id === selectedAlgorithmId) ?? algorithms[0];
  const selectedAlgorithm = algorithms.find((item) => item.id === initialTask?.algorithmIds[0]) ?? defaultAlgorithm;
  const selectedAlgorithmRule = algorithmRuleMeta[selectedAlgorithm?.id ?? ""] ?? {
    target: "检出目标",
    defaultMode: "detect_target" as const,
    messageContent: "检出目标"
  };

  const [name, setName] = useState(initialTask?.name ?? `${selectedAlgorithm?.name ?? "离岗检测"}-任务1`);
  const [nameDraft, setNameDraft] = useState(initialTask?.name ?? `${selectedAlgorithm?.name ?? "离岗检测"}-任务1`);
  const [nameEditing, setNameEditing] = useState(false);

  const [algorithmId] = useState(initialTask?.algorithmIds[0] ?? selectedAlgorithm?.id ?? "");
  const [version] = useState(initialTask?.algorithmVersions[algorithmId] ?? selectedAlgorithm?.latestVersion ?? "1.0.0");
  const [selectedDevices, setSelectedDevices] = useState<DeviceRef[]>(() =>
    Array.from(new Map((initialTask?.devices ?? []).map((item) => [deviceKey(item), item] as const)).values())
  );
  const [pendingDeviceCodes, setPendingDeviceCodes] = useState<string[]>(() =>
    Array.from(new Set((initialTask?.devices ?? []).map((item) => deviceKey(item))))
  );
  const [activeDeviceCode, setActiveDeviceCode] = useState(initialTask?.devices[0] ? deviceKey(initialTask.devices[0]) : "");
  const [regionsByQrCode, setRegionsByQrCode] = useState<Record<string, RegionShape[]>>(initialTask?.regionsByQrCode ?? {});

  const [schedules, setSchedules] = useState<InspectionSchedule[]>(
    initialTask?.schedules.length
      ? initialTask.schedules
      : [{ type: "time_point", startTime: "08:00", repeatDays: [0, 1, 2, 3, 4, 5, 6] }]
  );
  const [repeatDays, setRepeatDays] = useState<number[]>(initialTask?.schedules[0]?.repeatDays ?? [0, 1, 2, 3, 4, 5, 6]);
  const [inspectionRuleMode, setInspectionRuleMode] = useState<"detect_target" | "not_detect_target">(
    initialTask?.inspectionRule?.resultMode ?? selectedAlgorithmRule.defaultMode
  );
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState<InspectionSchedule>({ type: "time_point", startTime: "08:00", repeatDays });
  const [scheduleError, setScheduleError] = useState("");
  const [editingScheduleIndex, setEditingScheduleIndex] = useState<number | null>(null);

  const [messageRule, setMessageRule] = useState<MessageRule>(
    initialTask?.messageRule ?? {
      enabled: true,
      triggerMode: "every_unqualified",
      continuousCount: 3,
      customMessageType: selectedAlgorithm?.name ?? "离岗检测",
      customMessageContent: selectedAlgorithmRule.messageContent
    }
  );

  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [allDevices, setAllDevices] = useState<DeviceRef[]>(devices);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesLoadError, setDevicesLoadError] = useState("");
  const [deviceSearch, setDeviceSearch] = useState("");
  const [deviceTableSearch, setDeviceTableSearch] = useState("");
  const [deviceStatusFilter, setDeviceStatusFilter] = useState<"all" | "online" | "offline">("all");
  const [checkedDeviceKeys, setCheckedDeviceKeys] = useState<string[]>([]);
  const [regionModalOpen, setRegionModalOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [selectedGroupName, setSelectedGroupName] = useState("全部分组");

  const [activeDevicePreview, setActiveDevicePreview] = useState<DevicePreviewState | null>(null);
  const [activeDevicePreviewLoading, setActiveDevicePreviewLoading] = useState(false);
  const [activeDevicePreviewError, setActiveDevicePreviewError] = useState("");
  const customMessageSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setAllDevices(devices);
  }, [devices]);

  useEffect(() => {
    setMessageRule((current) => ({
      ...current,
      customMessageType: current.customMessageType?.trim() ? current.customMessageType : selectedAlgorithm?.name ?? "离岗检测",
      customMessageContent: current.customMessageContent?.trim() ? current.customMessageContent : selectedAlgorithmRule.messageContent
    }));
  }, [selectedAlgorithm?.name, selectedAlgorithmRule.messageContent]);

  const activeDevice = useMemo(
    () => selectedDevices.find((item) => deviceKey(item) === activeDeviceCode) ?? null,
    [activeDeviceCode, selectedDevices]
  );

  const deviceGroups = useMemo(() => {
    const groups = Array.from(new Set(allDevices.map((device) => device.groupName)));
    return ["全部分组", ...groups];
  }, [allDevices]);

  const availableDevices = useMemo(() => {
    return allDevices.filter((device) => {
      if (selectedGroupName !== "全部分组" && device.groupName !== selectedGroupName) return false;
      if (!deviceSearch.trim()) return true;
      const keyword = deviceSearch.trim();
      return device.name.includes(keyword) || device.groupName.includes(keyword) || device.qrCode.includes(keyword);
    });
  }, [allDevices, deviceSearch, selectedGroupName]);

  const dedupedAvailableDevices = useMemo(
    () => Array.from(new Map(availableDevices.map((device) => [deviceKey(device), device] as const)).values()),
    [availableDevices]
  );

  useEffect(() => {
    let active = true;

    if (!activeDevice) {
      setActiveDevicePreview(null);
      setActiveDevicePreviewLoading(false);
      setActiveDevicePreviewError("");
      return undefined;
    }

    setActiveDevicePreviewLoading(true);
    setActiveDevicePreviewError("");

    void fetch(`/api/devices/${activeDevice.qrCode}/preview?profileId=${activeDevice.profileId ?? ""}`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 404) {
          if (active) {
            setActiveDevicePreview(null);
          }
          return null;
        }

        return readJsonResponse<{ url?: string; imageTime?: string }>(response, "鍔犺浇璁惧鐪熷疄棰勮澶辫触");
      })
      .then((payload) => {
        if (!active || !payload) return;
        setActiveDevicePreview(payload.url ? { url: payload.url, imageTime: payload.imageTime } : null);
      })
      .catch((error) => {
        if (!active) return;
        setActiveDevicePreview(null);
        setActiveDevicePreviewError(error instanceof Error ? error.message : "鍔犺浇璁惧鐪熷疄棰勮澶辫触");
      })
      .finally(() => {
        if (active) {
          setActiveDevicePreviewLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [activeDevice]);

  useEffect(() => {
    setCheckedDeviceKeys((current) => current.filter((key) => selectedDevices.some((device) => deviceKey(device) === key)));
    if (selectedDevices.length > 0 && !selectedDevices.some((item) => deviceKey(item) === activeDeviceCode)) {
      setActiveDeviceCode(deviceKey(selectedDevices[0]));
    }
    if (selectedDevices.length === 0 && activeDeviceCode) {
      setActiveDeviceCode("");
    }
  }, [activeDeviceCode, selectedDevices]);

  const visibleSelectedDevices = useMemo(() => {
    const keyword = deviceTableSearch.trim();
    return selectedDevices.filter((device) => {
      if (deviceStatusFilter !== "all" && device.status !== deviceStatusFilter) return false;
      if (!keyword) return true;
      return device.name.includes(keyword) || device.groupName.includes(keyword) || device.qrCode.includes(keyword);
    });
  }, [deviceStatusFilter, deviceTableSearch, selectedDevices]);

  const allVisibleDeviceKeys = useMemo(() => visibleSelectedDevices.map((device) => deviceKey(device)), [visibleSelectedDevices]);
  const allVisibleChecked = allVisibleDeviceKeys.length > 0 && allVisibleDeviceKeys.every((key) => checkedDeviceKeys.includes(key));

  async function ensureDevicesLoaded() {
    if (allDevices.length > 0 || devicesLoading) return;
    setDevicesLoading(true);
    setDevicesLoadError("");
    try {
      const response = await fetch(devicesLoaderUrl, { cache: "no-store" });
      const text = await response.text();
      const payload = (text.trim() ? JSON.parse(text) : {}) as { devices?: DeviceRef[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "加载设备列表失败");
      }
      setAllDevices(payload.devices ?? []);
    } catch (error) {
      setDevicesLoadError(error instanceof Error ? error.message : "加载设备列表失败");
    } finally {
      setDevicesLoading(false);
    }
  }

  async function openDeviceModal() {
    await ensureDevicesLoaded();
    setDeviceModalOpen(true);
  }

  function saveName() {
    const next = nameDraft.trim();
    if (!next) return;
    setName(next);
    setNameEditing(false);
  }

  function openScheduleModal(type: InspectionSchedule["type"]) {
    setEditingScheduleIndex(null);
    setScheduleDraft({
      type,
      startTime: type === "time_point" ? "08:00" : "09:00",
      endTime: type === "time_range" ? "18:00" : undefined,
      repeatDays,
      intervalMinutes: type === "time_range" ? 30 : undefined
    });
    setScheduleError("");
    setScheduleModalOpen(true);
  }

  function editSchedule(index: number) {
    const current = schedules[index];
    if (!current) return;
    setEditingScheduleIndex(index);
    setScheduleDraft({ ...current, repeatDays: [...current.repeatDays] });
    setRepeatDays([...current.repeatDays]);
    setScheduleError("");
    setScheduleModalOpen(true);
  }

  function commitSchedule() {
    if (editingScheduleIndex === null && schedules.length >= 20) {
      setScheduleError("巡检时间最多支持 20 项。");
      return;
    }

    if (!isTimeValue(scheduleDraft.startTime)) {
      setScheduleError("请输入合法的开始时间。");
      return;
    }

    if (scheduleDraft.type === "time_point") {
      const duplicate = schedules.some(
        (item, index) => index !== editingScheduleIndex && item.type === "time_point" && item.startTime === scheduleDraft.startTime
      );
      if (duplicate) {
        setScheduleError("时间点重复，请重新设置。");
        return;
      }
    }

    if (scheduleDraft.type === "time_range") {
      if (!scheduleDraft.endTime || !isTimeValue(scheduleDraft.endTime)) {
        setScheduleError("请输入合法的结束时间。");
        return;
      }

      const start = toMinutes(scheduleDraft.startTime);
      const end = toMinutes(scheduleDraft.endTime);
      const intervalMinutes = scheduleDraft.intervalMinutes ?? 30;

      if (end <= start) {
        setScheduleError("结束时间必须晚于开始时间。");
        return;
      }

      if (end - start < intervalMinutes) {
        setScheduleError("时间段长度不能小于巡检间隔。");
        return;
      }
    }

    setSchedules((current) => {
      const nextSchedule = { ...scheduleDraft, repeatDays };
      if (editingScheduleIndex === null) {
        return [...current, nextSchedule];
      }
      return current.map((item, index) => (index === editingScheduleIndex ? nextSchedule : item));
    });
    setEditingScheduleIndex(null);
    setScheduleModalOpen(false);
  }

  function removeSchedule(index: number) {
    setSchedules((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function applyDevices() {
    const nextDevices = Array.from(
      new Map(
        allDevices
          .filter((item) => pendingDeviceCodes.includes(deviceKey(item)))
          .map((item) => [deviceKey(item), item] as const)
      ).values()
    );
    setSelectedDevices(nextDevices);
    setActiveDeviceCode(nextDevices[0] ? deviceKey(nextDevices[0]) : "");
    setCheckedDeviceKeys([]);
    setDeviceModalOpen(false);
  }

  function removeDevice(targetKey: string) {
    const next = selectedDevices.filter((item) => deviceKey(item) !== targetKey);
    setSelectedDevices(next);
    setPendingDeviceCodes(next.map((item) => deviceKey(item)));
    setCheckedDeviceKeys((current) => current.filter((key) => key !== targetKey));
    if (activeDeviceCode === targetKey) {
      setActiveDeviceCode(next[0] ? deviceKey(next[0]) : "");
    }
  }

  function removeCheckedDevices() {
    if (checkedDeviceKeys.length === 0) return;
    const next = selectedDevices.filter((item) => !checkedDeviceKeys.includes(deviceKey(item)));
    setSelectedDevices(next);
    setPendingDeviceCodes(next.map((item) => deviceKey(item)));
    setCheckedDeviceKeys([]);
    if (!next.some((item) => deviceKey(item) === activeDeviceCode)) {
      setActiveDeviceCode(next[0] ? deviceKey(next[0]) : "");
    }
  }

  async function submitTask(shouldExit = true) {
    if (!name.trim()) {
      setFeedback("请输入任务名称。");
      return false;
    }

    if (schedules.length === 0) {
      setFeedback("请至少添加一个巡检时间。");
      return false;
    }

    if (selectedDevices.length === 0) {
      setFeedback("请至少添加一台巡检设备。");
      return false;
    }

    setSaving(true);
    setFeedback("");

    const customMessageInputs = customMessageSectionRef.current?.querySelectorAll("input.ai-input");
    const customMessageType = customMessageInputs?.[0] instanceof HTMLInputElement ? customMessageInputs[0].value.trim() : "";
    const customMessageContent = customMessageInputs?.[1] instanceof HTMLInputElement ? customMessageInputs[1].value.trim() : "";

    const payload = {
      name,
      algorithmIds: [algorithmId],
      algorithmVersions: { [algorithmId]: version },
      devices: selectedDevices,
      schedules: schedules.map((item) => ({ ...item, repeatDays })),
      inspectionRule: { resultMode: inspectionRuleMode },
      messageRule: {
        ...messageRule,
        customMessageType: customMessageType || messageRule.customMessageType?.trim() || selectedAlgorithm?.name || "离岗检测",
        customMessageContent: customMessageContent || messageRule.customMessageContent?.trim() || selectedAlgorithmRule.messageContent
      },
      regionsByQrCode
    };

    const response = await fetch(submitUrl, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const rawBody = await response.text();
    let body: { error?: string; task?: { id: string } } = {};
    if (rawBody.trim()) {
      try {
        body = JSON.parse(rawBody) as { error?: string; task?: { id: string } };
      } catch {
        body = { error: rawBody.slice(0, 200) };
      }
    }
    setSaving(false);

    if (!response.ok) {
      setFeedback(body.error ?? "保存失败，请检查配置项是否完整。");
      return false;
    }

    if (shouldExit) {
      const target = method === "PATCH" && initialTask ? `/tasks/${initialTask.id}` : redirectTo;
      window.location.replace(target);
    }

    return true;
  }

  return (
    <div className="ai-page ai-task-builder-page">
      <div className="ai-page-breadcrumb">
        <Link
          href="/tasks"
          onClick={(event) => {
            if (!saving) {
              event.preventDefault();
              setExitConfirmOpen(true);
            }
          }}
        >
          巡检任务
        </Link>
        <span>/</span>
        <span>{method === "PATCH" ? "编辑巡检任务" : "添加巡检任务"}</span>
      </div>

      <div className="ai-task-builder-header">
        <button type="button" className="ai-task-name-button" onClick={() => setNameEditing(true)}>
          <span>{name}</span>
          <PencilLine size={14} strokeWidth={1.8} />
        </button>
        <button type="button" className="ai-button ai-button-primary ai-task-builder-submit" disabled={saving} onClick={() => void submitTask(true)}>
          {saving ? "保存中" : method === "PATCH" ? "保存" : "完成"}
        </button>
      </div>

      {feedback ? <div className="ai-inline-notice ai-inline-notice-danger">{feedback}</div> : null}

      <div className="ai-task-builder-layout">
        <div className="ai-task-builder-left">
          <section className="ai-panel">
            <div className="ai-panel-head">
              <div>
                <h2 className="ai-panel-title">{selectedAlgorithm?.name ?? "离岗检测"}</h2>
                <p className="ai-panel-copy">{selectedAlgorithm?.introduction}</p>
              </div>
              <Link href="/tasks/choose" className="ai-button ai-button-light">
                替换算法
              </Link>
            </div>

            <div className="ai-form-grid">
              <div className="ai-form-label">算法检测目标</div>
              <div className="ai-form-value">{selectedAlgorithmRule.target}</div>

              <div className="ai-form-label">巡检结果判定规则</div>
              <div className="ai-form-inline">
                <span>若监控点画面的检测区域内</span>
                <select
                  className="ai-input ai-input-select ai-mini-select"
                  value={inspectionRuleMode}
                  onChange={(event) => setInspectionRuleMode(event.target.value as "detect_target" | "not_detect_target")}
                >
                  <option value="detect_target">检出目标</option>
                  <option value="not_detect_target">未检出目标</option>
                </select>
                <span>，则判定为不合格</span>
              </div>
            </div>
          </section>

          <section className="ai-panel">
            <div className="ai-panel-head">
              <h2 className="ai-panel-title">巡检时间</h2>
              <div className="tplink-message-actions">
                <button type="button" className="ai-text-button" onClick={() => openScheduleModal("time_point")}>
                  <Plus size={14} strokeWidth={1.8} /> 添加时间点
                </button>
                <button type="button" className="ai-text-button" onClick={() => openScheduleModal("time_range")}>
                  <Plus size={14} strokeWidth={1.8} /> 添加时间段
                </button>
              </div>
            </div>

            <div className="ai-form-grid">
              <div className="ai-form-label ai-required">巡检时间</div>
              <div>
                <div className="ai-schedule-list">
                  {schedules.map((schedule, index) => (
                    <div key={`${schedule.type}-${schedule.startTime}-${index}`} className="ai-schedule-item">
                      <span className="ai-chip ai-chip-active">{schedule.type === "time_point" ? "时间点" : "时间段"}</span>
                      <span>{scheduleSummary(schedule)}</span>
                      <button type="button" className="ai-icon-button" onClick={() => editSchedule(index)}>
                        <PencilLine size={14} strokeWidth={1.8} />
                      </button>
                      <button type="button" className="ai-icon-button" onClick={() => removeSchedule(index)}>
                        <Trash2 size={14} strokeWidth={1.8} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="ai-form-label ai-required">重复</div>
              <div className="ai-chip-row">
                {repeatOptions.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    className={repeatDays.join(",") === option.days.join(",") ? "ai-chip ai-chip-active" : "ai-chip"}
                    onClick={() => setRepeatDays(option.days)}
                  >
                    {option.label}
                  </button>
                ))}
                <span className="ai-subtle-note">当前：{formatRepeat(repeatDays)}</span>
              </div>
            </div>
          </section>

          <section className="ai-panel">
            <div className="ai-panel-head">
              <h2 className="ai-panel-title">消息提醒</h2>
            </div>

            <div className="ai-form-grid">
              <div className="ai-form-label">消息提醒</div>
              <div>
                <label className="ai-checkbox">
                  <input
                    type="checkbox"
                    checked={messageRule.enabled}
                    onChange={(event) => setMessageRule((current) => ({ ...current, enabled: event.target.checked }))}
                  />
                  <span>消息提醒（不选择表示无需推送消息）</span>
                </label>
              </div>

              <div className="ai-form-label">通知规则</div>
              <div className="ai-radio-stack">
                <label className="ai-radio">
                  <input
                    type="radio"
                    checked={messageRule.triggerMode === "every_unqualified"}
                    onChange={() => setMessageRule((current) => ({ ...current, triggerMode: "every_unqualified" }))}
                  />
                  <span>监控点每次被巡检为不合格时推送消息</span>
                </label>
                <label className="ai-radio ai-radio-inline">
                  <input
                    type="radio"
                    checked={messageRule.triggerMode === "continuous_unqualified"}
                    onChange={() => setMessageRule((current) => ({ ...current, triggerMode: "continuous_unqualified" }))}
                  />
                  <span>同一监控点一天内连续</span>
                  <select
                    className="ai-input ai-input-select ai-mini-select"
                    value={messageRule.continuousCount ?? 3}
                    onChange={(event) => setMessageRule((current) => ({ ...current, continuousCount: Number(event.target.value) }))}
                  >
                    <option value="2">2次</option>
                    <option value="3">3次</option>
                    <option value="4">4次</option>
                  </select>
                  <span>被巡检为不合格时推送消息</span>
                </label>
              </div>

              <div className="ai-form-label">自定义消息内容</div>
              <div className="ai-custom-message" ref={customMessageSectionRef}>
                <label className="ai-mini-form">
                  <span>消息类型</span>
                  <input className="ai-input" defaultValue={selectedAlgorithm?.name ?? "离岗检测"} />
                </label>
                <label className="ai-mini-form">
                  <span>消息内容</span>
                  <input className="ai-input" defaultValue={selectedAlgorithmRule.messageContent} />
                </label>
              </div>
            </div>
          </section>
        </div>

        <section className="ai-panel ai-device-panel">
          <div className="ai-panel-head">
            <h2 className="ai-panel-title">巡检设备（{selectedDevices.length}）</h2>
            <div className="tplink-message-actions">
              <button type="button" className="ai-button ai-button-light" onClick={() => void openDeviceModal()}>
                添加设备
              </button>
              <button
                type="button"
                className="ai-button ai-button-light"
                disabled={selectedDevices.length === 0}
                onClick={() => {
                  setSelectedDevices([]);
                  setPendingDeviceCodes([]);
                  setActiveDeviceCode("");
                }}
              >
                批量删除
              </button>
            </div>
          </div>

          <div className="ai-device-stage">
            {selectedDevices.length === 0 ? (
              <div className="ai-device-empty">
                <div className="ai-device-empty-icon" />
                <p>请添加巡检设备</p>
                <button type="button" className="ai-button ai-button-primary" onClick={() => void openDeviceModal()}>
                  添加设备
                </button>
              </div>
            ) : (
              <>
                <div className="ai-device-table-panel">
                  <div className="ai-device-toolbar">
                    <div className="ai-device-toolbar-left">
                      <button type="button" className="ai-button ai-button-light ai-device-toolbar-button" onClick={() => void openDeviceModal()}>
                        <Plus size={14} strokeWidth={2} />
                        <span>添加设备</span>
                      </button>
                      <button
                        type="button"
                        className="ai-button ai-button-light ai-device-toolbar-button"
                        disabled={checkedDeviceKeys.length === 0}
                        onClick={removeCheckedDevices}
                      >
                        删除
                      </button>
                    </div>
                    <div className="ai-device-toolbar-right">
                      <label className="ai-device-toolbar-filter">
                        <span>设备状态</span>
                        <select className="ai-input" value={deviceStatusFilter} onChange={(event) => setDeviceStatusFilter(event.target.value as "all" | "online" | "offline")}>
                          <option value="all">全部</option>
                          <option value="online">在线</option>
                          <option value="offline">离线</option>
                        </select>
                      </label>
                      <label className="ai-device-toolbar-search">
                        <input
                          className="ai-input"
                          value={deviceTableSearch}
                          onChange={(event) => setDeviceTableSearch(event.target.value)}
                          placeholder="设备名称/所属分组"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="ai-device-table-shell">
                    <div className="ai-device-table-row ai-device-table-row-head">
                      <div className="ai-device-table-check">
                        <input
                          type="checkbox"
                          checked={allVisibleChecked}
                          onChange={(event) => {
                            if (event.target.checked) {
                              setCheckedDeviceKeys((current) => Array.from(new Set([...current, ...allVisibleDeviceKeys])));
                              return;
                            }
                            setCheckedDeviceKeys((current) => current.filter((key) => !allVisibleDeviceKeys.includes(key)));
                          }}
                        />
                      </div>
                      <div>设备名称</div>
                      <div>所属分组</div>
                      <div>设备状态</div>
                      <div>画面检测区域</div>
                      <div>操作</div>
                    </div>

                    <div className="ai-device-table-body">
                      {visibleSelectedDevices.length === 0 ? (
                        <div className="ai-device-table-empty">暂无符合条件的巡检设备</div>
                      ) : (
                        visibleSelectedDevices.map((device) => {
                          const key = deviceKey(device);
                          const regionCount = (regionsByQrCode[device.qrCode] ?? []).length;
                          const isChecked = checkedDeviceKeys.includes(key);

                          return (
                            <div key={key} className={cn("ai-device-table-row", activeDeviceCode === key && "ai-device-table-row-active")}>
                              <div className="ai-device-table-check">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(event) => {
                                    setCheckedDeviceKeys((current) =>
                                      event.target.checked ? Array.from(new Set([...current, key])) : current.filter((item) => item !== key)
                                    );
                                  }}
                                />
                              </div>
                              <div className="ai-device-table-name" onClick={() => setActiveDeviceCode(key)}>
                                {device.name}
                              </div>
                              <div className="ai-device-table-group">{device.groupName}</div>
                              <div className="ai-device-table-status">
                                <span className={device.status === "online" ? "ai-device-status ai-device-status-online" : "ai-device-status"}>
                                  {device.status === "online" ? "在线" : "离线"}
                                </span>
                              </div>
                              <div className="ai-device-table-region">{regionCount > 0 ? "特定检测区域" : "全画面"}</div>
                              <div className="ai-device-table-actions">
                                <button
                                  type="button"
                                  className="ai-text-button"
                                  onClick={() => removeDevice(key)}
                                >
                                  删除
                                </button>
                                <button
                                  type="button"
                                  className="ai-text-button"
                                  onClick={() => {
                                    setActiveDeviceCode(key);
                                    setRegionModalOpen(true);
                                  }}
                                >
                                  设置检测区域
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                <div className="ai-device-layout">
                  <div className="ai-device-list">
                    <div className="ai-device-list-head">
                      <span>设备列表</span>
                      <em>{selectedDevices.length} 台</em>
                    </div>
                    {selectedDevices.map((device) => (
                      <button
                        key={deviceKey(device)}
                        type="button"
                        className={cn("ai-device-list-item", activeDeviceCode === deviceKey(device) && "ai-device-list-item-active")}
                        onClick={() => setActiveDeviceCode(deviceKey(device))}
                      >
                        <div className="ai-device-list-item-main">
                          <strong>{device.name}</strong>
                          <span>{device.groupName}</span>
                        </div>
                        <div className="ai-device-list-item-meta">
                          <span className={device.status === "online" ? "ai-device-status ai-device-status-online" : "ai-device-status"}>
                            {device.status === "online" ? "在线" : "离线"}
                          </span>
                          <span>{(regionsByQrCode[device.qrCode] ?? []).length > 0 ? "已配置区域" : "全画面"}</span>
                        </div>
                      </button>
                    ))}
                  </div>

                {activeDevice ? (
                  <div className="ai-device-meta-row">
                    <span>{activeDevice.groupName}</span>
                    <div className="tplink-message-actions">
                      <button type="button" className="ai-text-button" onClick={() => setRegionModalOpen(true)}>
                        设置检测区域
                      </button>
                      <button type="button" className="ai-text-button" onClick={() => removeDevice(deviceKey(activeDevice))}>
                        删除当前设备
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="ai-device-region-summary">
                  {activeDevice ? (
                    <>
                      <div className="ai-device-region-preview">
                        {activeDevicePreviewLoading ? <div className="ai-device-region-preview-loading">正在加载真实预览...</div> : null}
                        {activeDevicePreview ? <img src={activeDevicePreview.url} alt={activeDevice.name} /> : null}
                        <div className="ai-device-region-preview-empty">暂无真实预览底图</div>
                      </div>
                      <div className="ai-device-region-copy">
                        <strong>检测区域</strong>
                        <div className="ai-device-region-status-line">
                          <span className="ai-device-region-status-label">区域类型</span>
                          <span className="ai-device-region-status-value">
                            {(regionsByQrCode[activeDevice.qrCode] ?? []).length > 0 ? "特定检测区域" : "全画面"}
                          </span>
                        </div>
                        <p>当前已设置 {(regionsByQrCode[activeDevice.qrCode] ?? []).length} 个区域。未设置区域不会阻塞任务保存和执行。</p>
                      </div>
                    </>
                  ) : null}
                </div>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      {nameEditing ? (
        <div className="ai-overlay">
          <div className="ai-modal">
            <div className="ai-modal-header">
              <strong>编辑任务名称</strong>
              <button type="button" className="ai-close-button" onClick={() => setNameEditing(false)}>
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>
            <div className="ai-modal-body">
              <input className="ai-input" value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} />
            </div>
            <div className="ai-modal-footer">
              <button type="button" className="ai-button ai-button-light" onClick={() => setNameEditing(false)}>
                取消
              </button>
              <button type="button" className="ai-button ai-button-primary" onClick={saveName}>
                确定
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {scheduleModalOpen ? (
        <div className="ai-overlay">
          <div className="ai-modal ai-schedule-modal">
            <div className="ai-modal-header">
              <strong>添加巡检时间</strong>
              <button type="button" className="ai-close-button" onClick={() => setScheduleModalOpen(false)}>
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>
            <div className="ai-modal-body ai-modal-stack ai-schedule-modal-body">
              <div className="ai-segmented">
                <button
                  type="button"
                  className={scheduleDraft.type === "time_point" ? "ai-segmented-item ai-segmented-item-active" : "ai-segmented-item"}
                  onClick={() => setScheduleDraft({ type: "time_point", startTime: "08:00", repeatDays })}
                >
                  时间点
                </button>
                <button
                  type="button"
                  className={scheduleDraft.type === "time_range" ? "ai-segmented-item ai-segmented-item-active" : "ai-segmented-item"}
                  onClick={() =>
                    setScheduleDraft({ type: "time_range", startTime: "09:00", endTime: "18:00", repeatDays, intervalMinutes: 30 })
                  }
                >
                  时间时段
                </button>
              </div>

              <div className="ai-schedule-modal-copy">
                <p>请按照 UE 配置巡检时间。单次任务最多支持 20 个时间点或时间段，时间段长度不能短于巡检间隔。</p>
              </div>

              <div className={scheduleDraft.type === "time_range" ? "ai-schedule-grid ai-schedule-grid-range" : "ai-schedule-grid"}>
                <label className="ai-mini-form">
                  <span>{scheduleDraft.type === "time_point" ? "执行时间" : "开始时间"}</span>
                  <input
                    className="ai-input"
                    value={scheduleDraft.startTime}
                    onChange={(event) => setScheduleDraft((current) => ({ ...current, startTime: event.target.value }))}
                  />
                </label>

                {scheduleDraft.type === "time_range" ? (
                  <>
                    <label className="ai-mini-form">
                      <span>结束时间</span>
                      <input
                        className="ai-input"
                        value={scheduleDraft.endTime ?? ""}
                        onChange={(event) => setScheduleDraft((current) => ({ ...current, endTime: event.target.value }))}
                      />
                    </label>
                    <label className="ai-mini-form">
                      <span>巡检间隔</span>
                      <select
                        className="ai-input ai-input-select"
                        value={scheduleDraft.intervalMinutes ?? 30}
                        onChange={(event) => setScheduleDraft((current) => ({ ...current, intervalMinutes: Number(event.target.value) }))}
                      >
                        {intervalOptions.map((option) => (
                          <option key={option.minutes} value={option.minutes}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}
              </div>

              {scheduleError ? <div className="ai-inline-notice ai-inline-notice-danger">{scheduleError}</div> : null}
            </div>
            <div className="ai-modal-footer">
              <button type="button" className="ai-button ai-button-light" onClick={() => setScheduleModalOpen(false)}>
                取消
              </button>
              <button type="button" className="ai-button ai-button-primary" onClick={commitSchedule}>
                确定
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deviceModalOpen ? (
        <div className="ai-overlay">
          <div className="ai-modal ai-device-modal">
            <div className="ai-modal-header">
              <strong>添加巡检设备</strong>
              <button type="button" className="ai-close-button" onClick={() => setDeviceModalOpen(false)}>
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>
            <div className="ai-modal-body ai-modal-stack ai-device-modal-body">
              <input
                className="ai-input"
                placeholder="设备名称 / 分组 / QRCode"
                value={deviceSearch}
                onChange={(event) => setDeviceSearch(event.target.value)}
              />

              <div className="ai-device-modal-grid">
                <div className="ai-device-groups">
                  {deviceGroups.map((groupName) => {
                    const count =
                      groupName === "全部分组" ? allDevices.length : allDevices.filter((device) => device.groupName === groupName).length;
                    return (
                      <button
                        key={groupName}
                        type="button"
                        className={selectedGroupName === groupName ? "ai-device-group ai-device-group-active" : "ai-device-group"}
                        onClick={() => setSelectedGroupName(groupName)}
                      >
                        <span>{groupName}</span>
                        <em>{count}</em>
                      </button>
                    );
                  })}
                </div>

                <div className="ai-device-table">
                  <div className="ai-device-table-head">
                    <span>设备名称</span>
                    <span>设备状态</span>
                    <span>所属分组</span>
                  </div>
                  <div className="ai-device-select-list">
                    {devicesLoading ? <div className="ai-device-select-empty">设备列表加载中...</div> : null}
                    {!devicesLoading && devicesLoadError ? <div className="ai-device-select-empty">{devicesLoadError}</div> : null}
                    {!devicesLoading && !devicesLoadError
                      ? dedupedAvailableDevices.map((device) => {
                          const identity = deviceKey(device);
                          const checked = pendingDeviceCodes.includes(identity);
                          return (
                            <label key={identity} className="ai-device-select-item">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) =>
                                  setPendingDeviceCodes((current) =>
                                    event.target.checked ? [...new Set([...current, identity])] : current.filter((item) => item !== identity)
                                  )
                                }
                              />
                              <div className="ai-device-select-main">
                                <strong>{device.name}</strong>
                                <span className={device.status === "online" ? "ai-device-status ai-device-status-online" : "ai-device-status"}>
                                  {device.status === "online" ? "在线" : "离线"}
                                </span>
                                <p>{device.groupName}</p>
                              </div>
                            </label>
                          );
                        })
                      : null}
                    {!devicesLoading && !devicesLoadError && availableDevices.length === 0 ? (
                      <div className="ai-device-select-empty">暂无符合条件的设备</div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            <div className="ai-modal-footer">
              <button type="button" className="ai-button ai-button-light" onClick={() => setDeviceModalOpen(false)}>
                取消
              </button>
              <button type="button" className="ai-button ai-button-primary" onClick={applyDevices}>
                确定
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {regionModalOpen ? (
        <div className="ai-overlay">
          <div className="ai-modal ai-region-modal">
            <div className="ai-modal-header">
              <strong>设置检测区域</strong>
              <button type="button" className="ai-close-button" onClick={() => setRegionModalOpen(false)}>
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>
            <div className="ai-modal-body">
              <RegionEditor
                device={activeDevice}
                regions={activeDevice ? regionsByQrCode[activeDevice.qrCode] ?? [] : []}
                onChange={(nextRegions) => {
                  if (!activeDevice) return;
                  setRegionsByQrCode((current) => ({ ...current, [activeDevice.qrCode]: nextRegions }));
                }}
              />
            </div>
            <div className="ai-modal-footer">
              <button type="button" className="ai-button ai-button-light" onClick={() => setRegionModalOpen(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {exitConfirmOpen ? (
        <div className="ai-overlay">
          <div className="ai-modal">
            <div className="ai-modal-header">
              <strong>退出提示</strong>
              <button type="button" className="ai-close-button" onClick={() => setExitConfirmOpen(false)}>
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>
            <div className="ai-modal-body">当前任务仍在编辑中，是否需要先保存当前配置？</div>
            <div className="ai-modal-footer">
              <button type="button" className="ai-button ai-button-light" onClick={() => router.push("/tasks")}>
                不保存
              </button>
              <button
                type="button"
                className="ai-button ai-button-light"
                onClick={async () => {
                  const ok = await submitTask(false);
                  if (ok) router.push("/tasks");
                }}
              >
                保存并退出
              </button>
              <button type="button" className="ai-button ai-button-primary" onClick={() => setExitConfirmOpen(false)}>
                继续编辑
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
