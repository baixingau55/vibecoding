export type AlgorithmResult = "QUALIFIED" | "UNQUALIFIED" | "UNAVAILABLE";
export type TpLinkProfileId = string;

export type TaskStatus =
  | "draft"
  | "enabled"
  | "disabled"
  | "running"
  | "partial_success"
  | "completed"
  | "config_error";

export type MediaKind = "image" | "video";

export type RankingMetric = "unqualifiedRate" | "unqualifiedCount" | "messageCount";

export interface Algorithm {
  id: string;
  name: string;
  introduction: string;
  latestVersion: string;
  versionList: string[];
  categories: string[];
  active: boolean;
  source: "tplink" | "mock";
  profileIds?: TpLinkProfileId[];
  profileNames?: string[];
}

export interface ServiceBalance {
  total: number;
  remaining: number;
  used: number;
  purchased: number;
  lastUpdatedAt: string;
}

export interface PurchaseRecord {
  id: string;
  createdAt: string;
  accountName: string;
  amount: number;
  source: "manual" | "ui-test";
  note: string;
}

export interface BalanceLedgerEntry {
  id: string;
  createdAt: string;
  delta: number;
  reason: "initial_grant" | "purchase" | "task_charge" | "task_refund" | "manual_adjustment";
  relatedId?: string;
  note?: string;
}

export interface DeviceRef {
  qrCode: string;
  mac?: string;
  channelId: number;
  name: string;
  status: "online" | "offline";
  groupName: string;
  previewImage: string;
  profileId?: TpLinkProfileId;
  profileName?: string;
}

export interface RegionPoint {
  x: number;
  y: number;
}

export interface RegionShape {
  id: number;
  points: RegionPoint[];
}

export interface InspectionSchedule {
  type: "time_point" | "time_range";
  startTime: string;
  endTime?: string;
  repeatDays: number[];
  intervalMinutes?: number;
}

export interface MessageRule {
  enabled: boolean;
  triggerMode: "every_unqualified" | "continuous_unqualified";
  continuousCount?: number;
}

export interface InspectionRule {
  resultMode: "detect_target" | "not_detect_target";
}

export interface InspectionTask {
  id: string;
  name: string;
  algorithmIds: string[];
  algorithmVersions: Record<string, string>;
  status: TaskStatus;
  devices: DeviceRef[];
  schedules: InspectionSchedule[];
  inspectionRule?: InspectionRule;
  messageRule: MessageRule;
  regionsByQrCode: Record<string, RegionShape[]>;
  createdAt: string;
  updatedAt: string;
  nextRunAt?: string;
  closedAt?: string;
  configErrorReason?: string;
}

export interface InspectionRun {
  id: string;
  taskId: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "completed" | "partial_success" | "failed";
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  chargedUnits: number;
  refundedUnits: number;
  tpLinkTaskId?: string;
  profileId?: TpLinkProfileId;
}

export interface InspectionResult {
  id: string;
  runId: string;
  taskId: string;
  qrCode: string;
  channelId: number;
  algorithmId: string;
  algorithmVersion: string;
  imageUrl: string;
  imageTime: string;
  result: AlgorithmResult;
  profileId?: TpLinkProfileId;
  qualifiedRate?: number;
}

export interface InspectionFailure {
  id: string;
  runId: string;
  taskId: string;
  qrCode: string;
  channelId: number;
  algorithmId?: string;
  errorCode: number;
  message: string;
}

export interface MessageItem {
  id: string;
  taskId: string;
  runId?: string;
  resultId?: string;
  type: "inspection_unqualified";
  read: boolean;
  title: string;
  description: string;
  result: Exclude<AlgorithmResult, "UNAVAILABLE">;
  qrCode: string;
  channelId: number;
  algorithmId: string;
  createdAt: string;
  imageUrl?: string;
  imageId?: string;
  videoTaskId?: string;
  profileId?: TpLinkProfileId;
}

export interface MediaAsset {
  id: string;
  kind: MediaKind;
  messageId?: string;
  taskId?: string;
  url: string;
  expiresAt: string;
}

export interface InspectionOverview {
  totalChecks: number;
  qualifiedCount: number;
  unqualifiedCount: number;
  messageCount: number;
  qualifiedRate: number;
  unqualifiedRate: number;
}

export interface TrendPoint {
  label: string;
  qualifiedCount: number;
  unqualifiedCount: number;
  messageCount: number;
  qualifiedRate: number;
  unqualifiedRate: number;
}

export interface RankedTask {
  taskId: string;
  taskName: string;
  totalChecks: number;
  unqualifiedCount: number;
  messageCount: number;
  unqualifiedRate: number;
}

export interface AppSnapshot {
  serviceBalance: ServiceBalance;
  purchaseRecords: PurchaseRecord[];
  balanceLedger: BalanceLedgerEntry[];
  algorithms: Algorithm[];
  devices: DeviceRef[];
  tasks: InspectionTask[];
  runs: InspectionRun[];
  results: InspectionResult[];
  failures: InspectionFailure[];
  messages: MessageItem[];
  media: MediaAsset[];
  schedulerScans: SchedulerScan[];
}

export interface SchedulerScan {
  id: string;
  scannedAt: string;
  dueCount: number;
  completedCount: number;
  failedCount: number;
  errorSummary?: string;
}
