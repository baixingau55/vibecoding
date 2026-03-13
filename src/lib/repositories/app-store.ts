import { PostgrestError } from "@supabase/supabase-js";

import { fetchTpLinkDeviceByQrCode, fetchTpLinkDevices } from "@/lib/tplink/client";
import { getSupabaseAdminClient } from "@/lib/supabase/client";
import { slugId } from "@/lib/utils";
import type {
  AppSnapshot,
  BalanceLedgerEntry,
  DeviceRef,
  InspectionFailure,
  InspectionResult,
  InspectionRun,
  InspectionSchedule,
  InspectionTask,
  MediaAsset,
  MessageItem,
  PurchaseRecord,
  RegionShape,
  SchedulerScan,
  ServiceBalance
} from "@/lib/types";
import { getMemoryStore } from "@/lib/repositories/memory-store";

const INITIAL_BALANCE_ID = "default";
const FALLBACK_DEVICE_PREVIEW =
  "https://images.unsplash.com/photo-1515169067868-5387ec356754?auto=format&fit=crop&w=1200&q=80";

type MaybeStore = ReturnType<typeof getMemoryStore>;

function isMissingTableError(error: unknown) {
  return error instanceof PostgrestError && error.code === "PGRST205";
}

function isMissingColumnError(error: unknown) {
  if (!(error instanceof PostgrestError)) return false;
  return error.code === "PGRST204" || error.code === "42703" || /column/i.test(error.message);
}

function toDateString(value: string | null | undefined) {
  return value ?? undefined;
}

async function hasSupabaseSchema() {
  const client = getSupabaseAdminClient();
  if (!client) return false;

  const { error } = await client.from("service_balance").select("id").limit(1);
  return !error || !isMissingTableError(error);
}

async function ensureBaseRows() {
  const client = getSupabaseAdminClient();
  if (!client) return false;

  const { data, error } = await client.from("service_balance").select("*").eq("id", INITIAL_BALANCE_ID).maybeSingle();
  if (error && !isMissingTableError(error)) {
    throw error;
  }

  if (!data) {
    const now = new Date().toISOString();
    await client.from("service_balance").upsert(
      {
        id: INITIAL_BALANCE_ID,
        total: 50000,
        remaining: 50000,
        used: 0,
        purchased: 0,
        last_updated_at: now
      },
      { onConflict: "id" }
    );
    await client.from("balance_ledger").upsert(
      {
        id: slugId("ledger"),
        created_at: now,
        delta: 50000,
        reason: "initial_grant",
        note: "系统初始赠送"
      },
      { onConflict: "id" }
    );
  }

  return true;
}

async function loadDevices(taskDevices: DeviceRef[], resultQrCodes: string[]) {
  const merged = new Map<string, DeviceRef>();
  taskDevices.forEach((device) => merged.set(`${device.profileId ?? "unknown"}:${device.qrCode}`, device));

  try {
    const devices = await fetchTpLinkDevices();
    for (const device of devices) {
      merged.set(`${device.profileId ?? "unknown"}:${device.qrCode}`, device);
    }
  } catch {
    const qrCodes = Array.from(new Set([...taskDevices.map((device) => device.qrCode), ...resultQrCodes]));
    const fetched = await Promise.all(qrCodes.map((qrCode) => fetchTpLinkDeviceByQrCode(qrCode).catch(() => null)));
    for (const device of fetched) {
      if (device) {
        merged.set(`${device.profileId ?? "unknown"}:${device.qrCode}`, device);
      }
    }
  }

  for (const qrCode of resultQrCodes) {
    const hasQrCode = Array.from(merged.values()).some((device) => device.qrCode === qrCode);
    if (!hasQrCode) {
      merged.set(`result:${qrCode}`, {
        qrCode,
        channelId: 1,
        name: qrCode,
        status: "online",
        groupName: "历史抓拍设备",
        previewImage: FALLBACK_DEVICE_PREVIEW,
        profileId: undefined,
        profileName: undefined
      });
    }
  }


  return Array.from(merged.values());
}

async function getSupabaseSnapshot(): Promise<AppSnapshot | null> {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  if (!(await hasSupabaseSchema())) return null;
  await ensureBaseRows();

  const [
    balanceRes,
    purchaseRes,
    ledgerRes,
    taskRes,
    taskDeviceRes,
    taskScheduleRes,
    taskRegionRes,
    runRes,
    resultRes,
    failureRes,
    messageRes,
    mediaRes,
    schedulerScanRes
  ] = await Promise.all([
    client.from("service_balance").select("*").eq("id", INITIAL_BALANCE_ID).maybeSingle(),
    client.from("purchase_records").select("*").order("created_at", { ascending: false }),
    client.from("balance_ledger").select("*").order("created_at", { ascending: false }),
    client.from("inspection_tasks").select("*").order("updated_at", { ascending: false }),
    client.from("inspection_task_devices").select("*"),
    client.from("inspection_task_schedules").select("*"),
    client.from("inspection_task_regions").select("*"),
    client.from("inspection_runs").select("*").order("started_at", { ascending: false }),
    client.from("inspection_results").select("*").order("image_time", { ascending: false }),
    client.from("inspection_failures").select("*"),
    client.from("messages").select("*").order("created_at", { ascending: false }),
    client.from("message_media").select("*"),
    client.from("scheduler_scans").select("*").order("scanned_at", { ascending: false }).limit(50)
  ]);

  const errors = [
    balanceRes.error,
    purchaseRes.error,
    ledgerRes.error,
    taskRes.error,
    taskDeviceRes.error,
    taskScheduleRes.error,
    taskRegionRes.error,
    runRes.error,
    resultRes.error,
    failureRes.error,
    messageRes.error,
    mediaRes.error,
    schedulerScanRes.error && !isMissingTableError(schedulerScanRes.error) ? schedulerScanRes.error : null
  ].filter(Boolean);
  if (errors.length > 0) {
    throw errors[0];
  }

  const tasksById = new Map<string, InspectionTask>();
  for (const row of taskRes.data ?? []) {
    tasksById.set(row.id, {
      id: row.id,
      name: row.name,
      status: row.status,
      algorithmIds: row.algorithm_ids ?? [],
      algorithmVersions: row.algorithm_versions ?? {},
      devices: [],
      schedules: [],
      inspectionRule: row.inspection_rule ?? undefined,
      messageRule: row.message_rule ?? { enabled: true, triggerMode: "every_unqualified", continuousCount: 3 },
      regionsByQrCode: {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      nextRunAt: toDateString(row.next_run_at),
      closedAt: toDateString(row.closed_at),
      configErrorReason: row.config_error_reason ?? undefined
    });
  }

  for (const row of taskDeviceRes.data ?? []) {
    const task = tasksById.get(row.task_id);
    if (!task) continue;
      task.devices.push({
        qrCode: row.qr_code,
        mac: row.mac ?? undefined,
        channelId: row.channel_id,
        name: row.name,
        status: row.status,
        groupName: row.group_name,
        previewImage: row.preview_image,
        profileId: row.profile_id ?? undefined,
        profileName: row.profile_name ?? undefined
      });
  }

  for (const row of taskScheduleRes.data ?? []) {
    const task = tasksById.get(row.task_id);
    if (!task) continue;
    task.schedules.push({
      type: row.schedule_type,
      startTime: row.start_time,
      endTime: row.end_time ?? undefined,
      repeatDays: row.repeat_days ?? [],
      intervalMinutes: row.interval_minutes ?? undefined
    } satisfies InspectionSchedule);
  }

  for (const row of taskRegionRes.data ?? []) {
    const task = tasksById.get(row.task_id);
    if (!task) continue;
    task.regionsByQrCode[row.qr_code] = (row.regions ?? []) as RegionShape[];
  }

  const tasks = Array.from(tasksById.values());
  const resultQrCodes = Array.from(new Set((resultRes.data ?? []).map((row) => row.qr_code).filter(Boolean)));
  const devices = await loadDevices(tasks.flatMap((task) => task.devices), resultQrCodes);
  const deviceByCompositeKey = new Map<string, DeviceRef>(
    devices.map((device) => [`${device.profileId ?? "unknown"}:${device.qrCode}:${device.channelId}`, device] as const)
  );
  const deviceByQrCode = new Map(devices.map((device) => [device.qrCode, device] as const));

  for (const task of tasks) {
    task.devices = Array.from(
      new Map(
        task.devices
          .map((device) => {
            const compositeKey = `${device.profileId ?? "unknown"}:${device.qrCode}:${device.channelId}`;
            const matched =
              deviceByCompositeKey.get(compositeKey) ??
              Array.from(deviceByCompositeKey.values()).find(
                (candidate) =>
                  candidate.qrCode === device.qrCode &&
                  candidate.channelId === device.channelId &&
                  (!device.mac || !candidate.mac || device.mac === candidate.mac)
              ) ??
              deviceByQrCode.get(device.qrCode);

            return { ...device, ...(matched ?? {}) };
          })
          .map((device) => [`${device.profileId ?? "primary"}:${device.qrCode}:${device.channelId}`, device] as const)
      ).values()
    );

    if (task.devices.length === 0) {
      const fallbackQrCodes = Array.from(
        new Set(
          (resultRes.data ?? [])
            .filter((row) => row.task_id === task.id)
            .map((row) => row.qr_code)
            .filter(Boolean)
        )
      );

      task.devices = fallbackQrCodes
        .map((qrCode) => deviceByQrCode.get(qrCode) ?? {
          qrCode,
          channelId: 1,
          name: qrCode,
          status: "online" as const,
          groupName: "历史抓拍设备",
          previewImage: FALLBACK_DEVICE_PREVIEW
        })
        .filter((device): device is DeviceRef => Boolean(device));
    }
  }

  return {
    serviceBalance: balanceRes.data
      ? {
          total: balanceRes.data.total,
          remaining: balanceRes.data.remaining,
          used: balanceRes.data.used,
          purchased: balanceRes.data.purchased,
          lastUpdatedAt: balanceRes.data.last_updated_at
        }
      : {
          total: 50000,
          remaining: 50000,
          used: 0,
          purchased: 0,
          lastUpdatedAt: new Date().toISOString()
        },
    purchaseRecords: (purchaseRes.data ?? []).map<PurchaseRecord>((row) => ({
      id: row.id,
      createdAt: row.created_at,
      accountName: row.account_name,
      amount: row.amount,
      source: row.source,
      note: row.note
    })),
    balanceLedger: (ledgerRes.data ?? []).map<BalanceLedgerEntry>((row) => ({
      id: row.id,
      createdAt: row.created_at,
      delta: row.delta,
      reason: row.reason,
      relatedId: row.related_id ?? undefined,
      note: row.note ?? undefined
    })),
    algorithms: [],
    devices,
    tasks,
    runs: (runRes.data ?? []).map<InspectionRun>((row) => ({
      id: row.id,
      taskId: row.task_id,
      startedAt: row.started_at,
      completedAt: toDateString(row.completed_at),
      status: row.status,
      totalChecks: row.total_checks,
      successfulChecks: row.successful_checks,
      failedChecks: row.failed_checks,
      chargedUnits: row.charged_units,
      refundedUnits: row.refunded_units,
      tpLinkTaskId: row.tplink_task_id ?? undefined,
      profileId: row.profile_id ?? undefined
    })),
    results: (resultRes.data ?? []).map<InspectionResult>((row) => ({
      id: row.id,
      runId: row.run_id,
      taskId: row.task_id,
      qrCode: row.qr_code,
      channelId: row.channel_id,
      algorithmId: row.algorithm_id,
      algorithmVersion: row.algorithm_version,
      imageUrl: row.image_url,
      imageTime: row.image_time,
      result: row.result,
      profileId: row.profile_id ?? undefined
    })),
    failures: (failureRes.data ?? []).map<InspectionFailure>((row) => ({
      id: row.id,
      runId: row.run_id,
      taskId: row.task_id,
      qrCode: row.qr_code,
      channelId: row.channel_id,
      algorithmId: row.algorithm_id ?? undefined,
      errorCode: row.error_code,
      message: row.message
    })),
    messages: (messageRes.data ?? []).map<MessageItem>((row) => ({
      id: row.id,
      taskId: row.task_id,
      runId: row.run_id ?? undefined,
      resultId: row.result_id ?? undefined,
      type: row.type,
      read: row.read,
      title: row.title,
      description: row.description,
      result: row.result,
      qrCode: row.qr_code,
      channelId: row.channel_id,
      algorithmId: row.algorithm_id,
      createdAt: row.created_at,
      imageUrl: row.image_url ?? undefined,
      imageId: row.image_id ?? undefined,
      videoTaskId: row.video_task_id ?? undefined,
      profileId: row.profile_id ?? undefined
    })),
    media: (mediaRes.data ?? []).map<MediaAsset>((row) => ({
      id: row.id,
      kind: row.kind,
      messageId: row.message_id ?? undefined,
      taskId: row.task_id ?? undefined,
      url: row.url,
      expiresAt: row.expires_at
    })),
    schedulerScans: (schedulerScanRes.data ?? []).map<SchedulerScan>((row) => ({
      id: row.id,
      scannedAt: row.scanned_at,
      dueCount: row.due_count,
      completedCount: row.completed_count,
      failedCount: row.failed_count,
      errorSummary: row.error_summary ?? undefined
    }))
  };
}

function getFallbackStore(): MaybeStore {
  return getMemoryStore();
}

export async function getAppStore() {
  const client = getSupabaseAdminClient();
  const useSupabase = client && (await hasSupabaseSchema());
  if (!useSupabase || !client) {
    return getFallbackStore();
  }

  await ensureBaseRows();

  return {
    async snapshot() {
      const snapshot = await getSupabaseSnapshot();
      if (!snapshot) {
        return getFallbackStore().snapshot();
      }
      return snapshot;
    },
    async replace() {
      throw new Error("Supabase replace is not supported.");
    },
    async setBalance(balance: ServiceBalance) {
      const { error } = await client.from("service_balance").upsert(
        {
          id: INITIAL_BALANCE_ID,
          total: balance.total,
          remaining: balance.remaining,
          used: balance.used,
          purchased: balance.purchased,
          last_updated_at: balance.lastUpdatedAt
        },
        { onConflict: "id" }
      );
      if (error) throw error;
    },
    async addPurchase(record: PurchaseRecord, ledgerEntry: BalanceLedgerEntry, nextBalance: ServiceBalance) {
      const { error: purchaseError } = await client.from("purchase_records").insert({
        id: record.id,
        created_at: record.createdAt,
        account_name: record.accountName,
        amount: record.amount,
        source: record.source,
        note: record.note
      });
      if (purchaseError) throw purchaseError;

      const { error: ledgerError } = await client.from("balance_ledger").insert({
        id: ledgerEntry.id,
        created_at: ledgerEntry.createdAt,
        delta: ledgerEntry.delta,
        reason: ledgerEntry.reason,
        related_id: ledgerEntry.relatedId ?? null,
        note: ledgerEntry.note ?? null
      });
      if (ledgerError) throw ledgerError;

      await this.setBalance(nextBalance);
    },
    async upsertTask(task: InspectionTask) {
      const { error: taskError } = await client.from("inspection_tasks").upsert(
        {
          id: task.id,
          name: task.name,
          status: task.status,
          algorithm_ids: task.algorithmIds,
          algorithm_versions: task.algorithmVersions,
          inspection_rule: task.inspectionRule ?? null,
          message_rule: task.messageRule,
          config_error_reason: task.configErrorReason ?? null,
          next_run_at: task.nextRunAt ?? null,
          created_at: task.createdAt,
          updated_at: task.updatedAt,
          closed_at: task.closedAt ?? null
        },
        { onConflict: "id" }
      );
      if (taskError) throw taskError;

      await client.from("inspection_task_devices").delete().eq("task_id", task.id);
      await client.from("inspection_task_schedules").delete().eq("task_id", task.id);
      await client.from("inspection_task_regions").delete().eq("task_id", task.id);

      if (task.devices.length > 0) {
        const deviceRows = task.devices.map((device) => ({
          id: slugId("taskdev"),
          task_id: task.id,
          qr_code: device.qrCode,
          mac: device.mac ?? null,
          channel_id: device.channelId,
          name: device.name,
          status: device.status,
          group_name: device.groupName,
          preview_image: device.previewImage,
          profile_id: device.profileId ?? null,
          profile_name: device.profileName ?? null
        }));
        let { error } = await client.from("inspection_task_devices").insert(deviceRows);
        if (error && isMissingColumnError(error)) {
          ({ error } = await client.from("inspection_task_devices").insert(
            deviceRows.map(({ profile_id: _profileId, profile_name: _profileName, ...legacyRow }) => legacyRow)
          ));
        }
        if (error) throw error;
      }

      if (task.schedules.length > 0) {
        const { error } = await client.from("inspection_task_schedules").insert(
          task.schedules.map((schedule) => ({
            id: slugId("taskschedule"),
            task_id: task.id,
            schedule_type: schedule.type,
            start_time: schedule.startTime,
            end_time: schedule.endTime ?? null,
            repeat_days: schedule.repeatDays,
            interval_minutes: schedule.intervalMinutes ?? null
          }))
        );
        if (error) throw error;
      }

      const regionRows = Object.entries(task.regionsByQrCode);
      if (regionRows.length > 0) {
        const { error } = await client.from("inspection_task_regions").insert(
          regionRows.map(([qrCode, regions]) => ({
            id: slugId("taskregion"),
            task_id: task.id,
            qr_code: qrCode,
            regions
          }))
        );
        if (error) throw error;
      }
    },
    async deleteTask(taskId: string) {
      const { error } = await client.from("inspection_tasks").delete().eq("id", taskId);
      if (error) throw error;
    },
    async addRun(run: InspectionRun) {
      let { error } = await client.from("inspection_runs").insert({
        id: run.id,
        task_id: run.taskId,
        started_at: run.startedAt,
        completed_at: run.completedAt ?? null,
        status: run.status,
        total_checks: run.totalChecks,
        successful_checks: run.successfulChecks,
        failed_checks: run.failedChecks,
        charged_units: run.chargedUnits,
        refunded_units: run.refundedUnits,
        tplink_task_id: run.tpLinkTaskId ?? null,
        profile_id: run.profileId ?? null
      });
      if (error && isMissingColumnError(error)) {
        ({ error } = await client.from("inspection_runs").insert({
          id: run.id,
          task_id: run.taskId,
          started_at: run.startedAt,
          completed_at: run.completedAt ?? null,
          status: run.status,
          total_checks: run.totalChecks,
          successful_checks: run.successfulChecks,
          failed_checks: run.failedChecks,
          charged_units: run.chargedUnits,
          refunded_units: run.refundedUnits,
          tplink_task_id: run.tpLinkTaskId ?? null
        }));
      }
      if (error) throw error;
    },
    async updateRun(run: InspectionRun) {
      let { error } = await client
        .from("inspection_runs")
        .update({
          completed_at: run.completedAt ?? null,
          status: run.status,
          total_checks: run.totalChecks,
          successful_checks: run.successfulChecks,
          failed_checks: run.failedChecks,
          charged_units: run.chargedUnits,
          refunded_units: run.refundedUnits,
          tplink_task_id: run.tpLinkTaskId ?? null,
          profile_id: run.profileId ?? null
        })
        .eq("id", run.id);
      if (error && isMissingColumnError(error)) {
        ({ error } = await client
          .from("inspection_runs")
          .update({
            completed_at: run.completedAt ?? null,
            status: run.status,
            total_checks: run.totalChecks,
            successful_checks: run.successfulChecks,
            failed_checks: run.failedChecks,
            charged_units: run.chargedUnits,
            refunded_units: run.refundedUnits,
            tplink_task_id: run.tpLinkTaskId ?? null
          })
          .eq("id", run.id));
      }
      if (error) throw error;
    },
    async addResults(nextResults: InspectionResult[]) {
      if (nextResults.length === 0) return;
      const resultRows = nextResults.map((item) => ({
          id: item.id,
          run_id: item.runId,
          task_id: item.taskId,
          qr_code: item.qrCode,
          channel_id: item.channelId,
          algorithm_id: item.algorithmId,
          algorithm_version: item.algorithmVersion,
          image_url: item.imageUrl,
          image_time: item.imageTime,
          result: item.result,
          profile_id: item.profileId ?? null
        }));
      let { error } = await client.from("inspection_results").upsert(resultRows, { onConflict: "id" });
      if (error && isMissingColumnError(error)) {
        ({ error } = await client.from("inspection_results").upsert(
          resultRows.map(({ profile_id: _profileId, ...legacyRow }) => legacyRow),
          { onConflict: "id" }
        ));
      }
      if (error) throw error;
    },
    async addFailures(nextFailures: InspectionFailure[]) {
      if (nextFailures.length === 0) return;
      const { error } = await client.from("inspection_failures").upsert(
        nextFailures.map((item) => ({
          id: item.id,
          run_id: item.runId,
          task_id: item.taskId,
          qr_code: item.qrCode,
          channel_id: item.channelId,
          algorithm_id: item.algorithmId ?? null,
          error_code: item.errorCode,
          message: item.message
        })),
        { onConflict: "id" }
      );
      if (error) throw error;
    },
    async addMessages(nextMessages: MessageItem[]) {
      if (nextMessages.length === 0) return;
      const messageRows = nextMessages.map((item) => ({
          id: item.id,
          task_id: item.taskId,
          run_id: item.runId ?? null,
          result_id: item.resultId ?? null,
          type: item.type,
          read: item.read,
          title: item.title,
          description: item.description,
          result: item.result,
          qr_code: item.qrCode,
          channel_id: item.channelId,
          algorithm_id: item.algorithmId,
          created_at: item.createdAt,
          image_url: item.imageUrl ?? null,
          image_id: item.imageId ?? null,
          video_task_id: item.videoTaskId ?? null,
          profile_id: item.profileId ?? null
        }));
      let { error } = await client.from("messages").upsert(messageRows, { onConflict: "id" });
      if (error && isMissingColumnError(error)) {
        ({ error } = await client.from("messages").upsert(
          messageRows.map(({ result_id: _resultId, profile_id: _profileId, ...legacyRow }) => legacyRow),
          { onConflict: "id" }
        ));
      }
      if (error) throw error;
    },
    async updateMessage(message: MessageItem) {
      let { error } = await client
        .from("messages")
        .update({
          result_id: message.resultId ?? null,
          read: message.read,
          title: message.title,
          description: message.description,
          result: message.result,
          image_url: message.imageUrl ?? null,
          image_id: message.imageId ?? null,
          video_task_id: message.videoTaskId ?? null,
          profile_id: message.profileId ?? null
        })
        .eq("id", message.id);
      if (error && isMissingColumnError(error)) {
        ({ error } = await client
          .from("messages")
          .update({
            read: message.read,
            title: message.title,
            description: message.description,
            result: message.result,
            image_url: message.imageUrl ?? null,
            image_id: message.imageId ?? null,
            video_task_id: message.videoTaskId ?? null
          })
          .eq("id", message.id));
      }
      if (error) throw error;
    },
    async addMedia(asset: MediaAsset) {
      const { error } = await client.from("message_media").upsert(
        {
          id: asset.id,
          message_id: asset.messageId ?? null,
          task_id: asset.taskId ?? null,
          kind: asset.kind,
          url: asset.url,
          expires_at: asset.expiresAt
        },
        { onConflict: "id" }
      );
      if (error) throw error;
    },
    async addSchedulerScan(scan: SchedulerScan) {
      const { error } = await client.from("scheduler_scans").upsert(
        {
          id: scan.id,
          scanned_at: scan.scannedAt,
          due_count: scan.dueCount,
          completed_count: scan.completedCount,
          failed_count: scan.failedCount,
          error_summary: scan.errorSummary ?? null
        },
        { onConflict: "id" }
      );
      if (error && !isMissingTableError(error) && !isMissingColumnError(error)) throw error;
    }
  };
}
