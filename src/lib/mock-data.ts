import type {
  Algorithm,
  AppSnapshot,
  BalanceLedgerEntry,
  DeviceRef,
  InspectionFailure,
  InspectionResult,
  InspectionRun,
  InspectionTask,
  MediaAsset,
  MessageItem,
  PurchaseRecord,
  RegionShape,
  SchedulerScan,
  ServiceBalance
} from "@/lib/types";

const now = new Date();

const algorithms: Algorithm[] = [
  {
    id: "away-from-post-detection",
    name: "离岗检测",
    introduction: "自动检测监控区域内值守人员是否离岗，适用于收银台、前台和值班岗位场景。",
    latestVersion: "1.2.0",
    versionList: ["1.0.0", "1.1.0", "1.2.0"],
    categories: ["连锁企业", "门店运营"],
    active: true,
    source: "mock"
  },
  {
    id: "smoking-detection",
    name: "吸烟检测",
    introduction: "对重点区域内的吸烟行为进行检测，辅助门店规范巡检和风险发现。",
    latestVersion: "1.0.1",
    versionList: ["1.0.0", "1.0.1"],
    categories: ["连锁企业", "安全管理"],
    active: true,
    source: "mock"
  },
  {
    id: "helmet-detection",
    name: "安全帽检测",
    introduction: "识别作业区域内人员是否佩戴安全帽，适用于工厂和施工现场。",
    latestVersion: "2.1.0",
    versionList: ["2.0.0", "2.1.0"],
    categories: ["工业制造"],
    active: true,
    source: "mock"
  }
];

const devices: DeviceRef[] = [
  {
    qrCode: "357183410325BEC23",
    channelId: 1,
    name: "收银区摄像机 A01",
    status: "online",
    groupName: "门店A / 收银区",
    previewImage: "https://images.unsplash.com/photo-1515169067868-5387ec356754?auto=format&fit=crop&w=1200&q=80"
  },
  {
    qrCode: "35718341031F43E43",
    channelId: 1,
    name: "前台摄像机 B07",
    status: "online",
    groupName: "门店B / 前台区",
    previewImage: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1200&q=80"
  }
];

const baseRegions: RegionShape[] = [
  {
    id: 1,
    points: [
      { x: 1800, y: 2600 },
      { x: 7200, y: 2600 },
      { x: 6900, y: 7800 },
      { x: 2200, y: 7600 }
    ]
  }
];

const serviceBalance: ServiceBalance = {
  total: 50000,
  remaining: 43620,
  used: 6380,
  purchased: 12000,
  lastUpdatedAt: now.toISOString()
};

const purchaseRecords: PurchaseRecord[] = [
  {
    id: "purchase_001",
    createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 48).toISOString(),
    accountName: "admin",
    amount: 5000,
    source: "ui-test",
    note: "站内测试购买"
  },
  {
    id: "purchase_002",
    createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 12).toISOString(),
    accountName: "admin",
    amount: 7000,
    source: "manual",
    note: "人工补充次数"
  }
];

const balanceLedger: BalanceLedgerEntry[] = [
  {
    id: "ledger_initial",
    createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 72).toISOString(),
    delta: 50000,
    reason: "initial_grant",
    note: "初始赠送"
  },
  {
    id: "ledger_purchase_001",
    createdAt: purchaseRecords[0].createdAt,
    delta: 5000,
    reason: "purchase",
    relatedId: purchaseRecords[0].id,
    note: "购买分析次数"
  }
];

const tasks: InspectionTask[] = [
  {
    id: "task_away_post",
    name: "收银台离岗巡检",
    algorithmIds: ["away-from-post-detection"],
    algorithmVersions: { "away-from-post-detection": "1.2.0" },
    status: "enabled",
    devices: [devices[0]],
    schedules: [
      { type: "time_point", startTime: "08:00", repeatDays: [0, 1, 2, 3, 4, 5, 6] },
      { type: "time_point", startTime: "15:00", repeatDays: [0, 1, 2, 3, 4, 5, 6] }
    ],
    inspectionRule: { resultMode: "detect_target" },
    messageRule: { enabled: true, triggerMode: "every_unqualified" },
    regionsByQrCode: {
      [devices[0].qrCode]: baseRegions
    },
    createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 36).toISOString(),
    updatedAt: new Date(now.getTime() - 1000 * 60 * 30).toISOString(),
    nextRunAt: new Date(now.getTime() + 1000 * 60 * 30).toISOString()
  },
  {
    id: "task_smoking",
    name: "前台吸烟巡检",
    algorithmIds: ["smoking-detection"],
    algorithmVersions: { "smoking-detection": "1.0.1" },
    status: "config_error",
    devices: [devices[1]],
    schedules: [{ type: "time_range", startTime: "09:00", endTime: "18:00", repeatDays: [1, 2, 3, 4, 5] }],
    inspectionRule: { resultMode: "detect_target" },
    messageRule: { enabled: true, triggerMode: "every_unqualified" },
    regionsByQrCode: {},
    createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 20).toISOString(),
    updatedAt: new Date(now.getTime() - 1000 * 60 * 15).toISOString(),
    configErrorReason: "算法已失效，任务中已无巡检设备"
  },
  {
    id: "task_helmet",
    name: "仓库安全帽巡检",
    algorithmIds: ["helmet-detection"],
    algorithmVersions: { "helmet-detection": "2.1.0" },
    status: "disabled",
    devices: [devices[0], devices[1]],
    schedules: [{ type: "time_range", startTime: "09:00", endTime: "18:00", repeatDays: [1, 2, 3, 4, 5] }],
    inspectionRule: { resultMode: "detect_target" },
    messageRule: { enabled: true, triggerMode: "every_unqualified" },
    regionsByQrCode: {
      [devices[0].qrCode]: baseRegions,
      [devices[1].qrCode]: baseRegions
    },
    createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 80).toISOString(),
    updatedAt: new Date(now.getTime() - 1000 * 60 * 60 * 10).toISOString(),
    closedAt: new Date(now.getTime() - 1000 * 60 * 60 * 4).toISOString()
  }
];

const runs: InspectionRun[] = [
  {
    id: "run_001",
    taskId: "task_away_post",
    startedAt: new Date(now.getTime() - 1000 * 60 * 120).toISOString(),
    completedAt: new Date(now.getTime() - 1000 * 60 * 118).toISOString(),
    status: "completed",
    totalChecks: 1,
    successfulChecks: 1,
    failedChecks: 0,
    chargedUnits: 1,
    refundedUnits: 0,
    tpLinkTaskId: "tplink_run_001",
    profileId: "primary"
  },
  {
    id: "run_002",
    taskId: "task_away_post",
    startedAt: new Date(now.getTime() - 1000 * 60 * 60).toISOString(),
    completedAt: new Date(now.getTime() - 1000 * 60 * 57).toISOString(),
    status: "partial_success",
    totalChecks: 2,
    successfulChecks: 1,
    failedChecks: 1,
    chargedUnits: 2,
    refundedUnits: 1,
    tpLinkTaskId: "tplink_run_002",
    profileId: "primary"
  }
];

const results: InspectionResult[] = [
  {
    id: "result_001",
    runId: "run_001",
    taskId: "task_away_post",
    qrCode: devices[0].qrCode,
    channelId: 1,
    algorithmId: "away-from-post-detection",
    algorithmVersion: "1.2.0",
    imageUrl: devices[0].previewImage,
    imageTime: new Date(now.getTime() - 1000 * 60 * 120).toISOString(),
    result: "QUALIFIED",
    profileId: "primary"
  },
  {
    id: "result_002",
    runId: "run_002",
    taskId: "task_away_post",
    qrCode: devices[0].qrCode,
    channelId: 1,
    algorithmId: "away-from-post-detection",
    algorithmVersion: "1.2.0",
    imageUrl: devices[0].previewImage,
    imageTime: new Date(now.getTime() - 1000 * 60 * 60).toISOString(),
    result: "UNQUALIFIED",
    profileId: "primary"
  }
];

const failures: InspectionFailure[] = [
  {
    id: "failure_001",
    runId: "run_002",
    taskId: "task_away_post",
    qrCode: devices[1].qrCode,
    channelId: 1,
    algorithmId: "away-from-post-detection",
    errorCode: -20571,
    message: "设备抓图失败，已返还次数"
  }
];

const messages: MessageItem[] = [
  {
    id: "msg_001",
    taskId: "task_away_post",
    runId: "run_002",
    resultId: "result_002",
    type: "inspection_unqualified",
    read: false,
    title: "离岗检测巡检不合格",
    description: "监控点每次被巡检为不合格时推送消息",
    result: "UNQUALIFIED",
    qrCode: devices[0].qrCode,
    channelId: 1,
    algorithmId: "away-from-post-detection",
    createdAt: new Date(now.getTime() - 1000 * 60 * 60).toISOString(),
    imageUrl: devices[0].previewImage,
    imageId: "media_image_001",
    videoTaskId: "media_video_001",
    profileId: "primary"
  }
];

const schedulerScans: SchedulerScan[] = [
  {
    id: "scan_001",
    scannedAt: new Date(now.getTime() - 1000 * 60).toISOString(),
    dueCount: 1,
    completedCount: 1,
    failedCount: 0
  }
];

const media: MediaAsset[] = [
  {
    id: "media_image_001",
    kind: "image",
    messageId: "msg_001",
    taskId: "task_away_post",
    url: devices[0].previewImage,
    expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 2).toISOString()
  },
  {
    id: "media_video_001",
    kind: "video",
    messageId: "msg_001",
    taskId: "task_away_post",
    url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 2).toISOString()
  }
];

export function createMockSnapshot(): AppSnapshot {
  return {
    serviceBalance,
    purchaseRecords,
    balanceLedger,
    algorithms,
    devices,
    tasks,
    runs,
    results,
    failures,
    messages,
    media,
    schedulerScans
  };
}
