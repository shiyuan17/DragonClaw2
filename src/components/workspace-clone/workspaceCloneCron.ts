import type {
  WorkspaceCronDeliveryStatus,
  WorkspaceCronJob,
  WorkspaceCronJobPatch,
  WorkspaceCronJobState,
  WorkspaceCronListResult,
  WorkspaceCronPayload,
  WorkspaceCronRunPageResult,
  WorkspaceCronRunRecord,
  WorkspaceCronRunResult,
  WorkspaceCronRunStatus,
  WorkspaceCronSchedule,
  WorkspaceCronStatusSummary,
} from "./workspaceCloneTypes";

export type WorkspaceCronDisplayStatus = "running" | "ok" | "error" | "skipped" | "disabled";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function toNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function toOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
function normalizeSchedule(value: unknown): WorkspaceCronSchedule | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.kind === "at") {
    const at = toNonEmptyString(value.at);
    return at ? { kind: "at", at } : null;
  }
  if (value.kind === "every") {
    const everyMs = toOptionalNumber(value.everyMs);
    if (!everyMs || everyMs < 1) {
      return null;
    }

    return {
      kind: "every",
      everyMs,
      anchorMs: toOptionalNumber(value.anchorMs),
    };
  }
  if (value.kind === "cron") {
    const expr = toNonEmptyString(value.expr);
    if (!expr) {
      return null;
    }

    return {
      kind: "cron",
      expr,
      tz: toOptionalString(value.tz),
      staggerMs: toOptionalNumber(value.staggerMs),
    };
  }
  return null;
}
function normalizePayload(value: unknown): WorkspaceCronPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.kind === "systemEvent") {
    const text = toNonEmptyString(value.text);
    return text ? { kind: "systemEvent", text } : null;
  }
  if (value.kind === "agentTurn") {
    const message = toNonEmptyString(value.message);
    if (!message) {
      return null;
    }

    const toolsAllow = Array.isArray(value.toolsAllow)
      ? value.toolsAllow.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : value.toolsAllow === null
        ? null
        : undefined;

    return {
      kind: "agentTurn",
      message,
      model: toOptionalString(value.model),
      fallbacks: Array.isArray(value.fallbacks)
        ? value.fallbacks.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : undefined,
      thinking: toOptionalString(value.thinking),
      timeoutSeconds: toOptionalNumber(value.timeoutSeconds),
      allowUnsafeExternalContent: toOptionalBoolean(value.allowUnsafeExternalContent),
      lightContext: toOptionalBoolean(value.lightContext),
      toolsAllow,
    };
  }
  return null;
}
function normalizeState(value: unknown): WorkspaceCronJobState {
  if (!isRecord(value)) {
    return {};
  }

  return {
    nextRunAtMs: toOptionalNumber(value.nextRunAtMs),
    runningAtMs: toOptionalNumber(value.runningAtMs),
    lastRunAtMs: toOptionalNumber(value.lastRunAtMs),
    lastRunStatus: normalizeRunStatus(value.lastRunStatus),
    lastStatus: normalizeRunStatus(value.lastStatus),
    lastError: toOptionalString(value.lastError),
    lastErrorReason: toOptionalString(value.lastErrorReason),
    lastDurationMs: toOptionalNumber(value.lastDurationMs),
    consecutiveErrors: toOptionalNumber(value.consecutiveErrors),
    consecutiveSkipped: toOptionalNumber(value.consecutiveSkipped),
    lastDelivered: toOptionalBoolean(value.lastDelivered),
    lastDeliveryStatus: normalizeDeliveryStatus(value.lastDeliveryStatus),
    lastDeliveryError: toOptionalString(value.lastDeliveryError),
    lastFailureAlertAtMs: toOptionalNumber(value.lastFailureAlertAtMs),
  };
}
function normalizeDeliveryPreviewById(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([jobId, preview]) => {
      if (!isRecord(preview)) {
        return [];
      }

      const label = toOptionalString(preview.label);
      const detail = toOptionalString(preview.detail);
      const text = [label, detail].filter(Boolean).join(" · ");
      return text ? [[jobId, text]] : [];
    }),
  );
}
export function normalizeRunStatus(value: unknown): WorkspaceCronRunStatus | undefined {
  return value === "ok" || value === "error" || value === "skipped" ? value : undefined;
}
export function normalizeDeliveryStatus(value: unknown): WorkspaceCronDeliveryStatus | undefined {
  return value === "delivered" ||
    value === "not-delivered" ||
    value === "unknown" ||
    value === "not-requested"
    ? value
    : undefined;
}
export function normalizeWorkspaceCronJob(value: unknown): WorkspaceCronJob | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = toNonEmptyString(value.id);
  const name = toNonEmptyString(value.name);
  const enabled = toOptionalBoolean(value.enabled);
  const createdAtMs = toOptionalNumber(value.createdAtMs);
  const updatedAtMs = toOptionalNumber(value.updatedAtMs);
  const schedule = normalizeSchedule(value.schedule);
  const payload = normalizePayload(value.payload);
  if (!id || !name || enabled === undefined || createdAtMs === undefined || updatedAtMs === undefined || !schedule || !payload) {
    return null;
  }
  const sessionTarget: WorkspaceCronJob["sessionTarget"] =
    value.sessionTarget === "main" ||
    value.sessionTarget === "isolated" ||
    value.sessionTarget === "current" ||
    (typeof value.sessionTarget === "string" && value.sessionTarget.startsWith("session:"))
      ? (value.sessionTarget as WorkspaceCronJob["sessionTarget"])
      : "main";
  const wakeMode = value.wakeMode === "now" ? "now" : "next-heartbeat";
  return {
    id,
    agentId: toOptionalString(value.agentId) ?? null,
    sessionKey: toOptionalString(value.sessionKey) ?? null,
    name,
    description: toOptionalString(value.description),
    enabled,
    deleteAfterRun: toOptionalBoolean(value.deleteAfterRun),
    createdAtMs,
    updatedAtMs,
    schedule,
    sessionTarget,
    wakeMode,
    payload,
    state: normalizeState(value.state),
  };
}
export function normalizeWorkspaceCronListResult(value: unknown): WorkspaceCronListResult {
  if (!isRecord(value)) {
    return { jobs: [], total: 0, offset: 0, limit: 0, hasMore: false, nextOffset: null };
  }

  const deliveryPreviewById = normalizeDeliveryPreviewById(value.deliveryPreviews);
  const jobs = Array.isArray(value.jobs)
    ? value.jobs
      .map((job) => normalizeWorkspaceCronJob(job))
      .filter((job): job is WorkspaceCronJob => Boolean(job))
      .map((job) => ({
        ...job,
        deliveryPreview: deliveryPreviewById[job.id] ?? null,
      }))
    : [];

  return {
    jobs,
    total: toOptionalNumber(value.total) ?? jobs.length,
    offset: toOptionalNumber(value.offset) ?? 0,
    limit: toOptionalNumber(value.limit) ?? jobs.length,
    hasMore: value.hasMore === true,
    nextOffset: toOptionalNumber(value.nextOffset) ?? null,
  };
}
function normalizeUsage(value: unknown): WorkspaceCronRunRecord["usage"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    input_tokens: toOptionalNumber(value.input_tokens),
    output_tokens: toOptionalNumber(value.output_tokens),
    total_tokens: toOptionalNumber(value.total_tokens),
    cache_read_tokens: toOptionalNumber(value.cache_read_tokens),
    cache_write_tokens: toOptionalNumber(value.cache_write_tokens),
  };
}
export function normalizeWorkspaceCronRunRecord(value: unknown): WorkspaceCronRunRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const ts = toOptionalNumber(value.ts);
  const jobId = toNonEmptyString(value.jobId);
  if (ts === undefined || !jobId) {
    return null;
  }
  return {
    ts,
    jobId,
    action: "finished",
    status: normalizeRunStatus(value.status),
    error: toOptionalString(value.error),
    summary: toOptionalString(value.summary),
    delivered: toOptionalBoolean(value.delivered),
    deliveryStatus: normalizeDeliveryStatus(value.deliveryStatus),
    deliveryError: toOptionalString(value.deliveryError),
    sessionId: toOptionalString(value.sessionId),
    sessionKey: toOptionalString(value.sessionKey),
    runAtMs: toOptionalNumber(value.runAtMs),
    durationMs: toOptionalNumber(value.durationMs),
    nextRunAtMs: toOptionalNumber(value.nextRunAtMs),
    model: toOptionalString(value.model),
    provider: toOptionalString(value.provider),
    jobName: toOptionalString(value.jobName),
    usage: normalizeUsage(value.usage),
  };
}
export function normalizeWorkspaceCronRunPageResult(value: unknown): WorkspaceCronRunPageResult {
  if (!isRecord(value)) {
    return { entries: [], total: 0, offset: 0, limit: 0, hasMore: false, nextOffset: null };
  }

  const entries = Array.isArray(value.entries)
    ? value.entries
      .map((entry) => normalizeWorkspaceCronRunRecord(entry))
      .filter((entry): entry is WorkspaceCronRunRecord => Boolean(entry))
    : [];

  return {
    entries,
    total: toOptionalNumber(value.total) ?? entries.length,
    offset: toOptionalNumber(value.offset) ?? 0,
    limit: toOptionalNumber(value.limit) ?? entries.length,
    hasMore: value.hasMore === true,
    nextOffset: toOptionalNumber(value.nextOffset) ?? null,
  };
}
export function normalizeWorkspaceCronStatusSummary(value: unknown): WorkspaceCronStatusSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const enabled = toOptionalBoolean(value.enabled);
  const storePath = toNonEmptyString(value.storePath);
  const jobs = toOptionalNumber(value.jobs);
  if (enabled === undefined || !storePath || jobs === undefined) {
    return null;
  }

  return {
    enabled,
    storePath,
    jobs,
    nextWakeAtMs: toOptionalNumber(value.nextWakeAtMs) ?? null,
  };
}
export function normalizeWorkspaceCronRunResult(value: unknown): WorkspaceCronRunResult | null {
  if (!isRecord(value) || value.ok !== true) {
    return value && isRecord(value) && value.ok === false ? { ok: false } : null;
  }
  if (value.ran === true) {
    return { ok: true, ran: true };
  }
  if (value.enqueued === true) {
    const runId = toNonEmptyString(value.runId);
    return runId ? { ok: true, enqueued: true, runId } : null;
  }
  if (value.ran === false) {
    const reason =
      value.reason === "already-running" || value.reason === "not-due" || value.reason === "invalid-spec"
        ? value.reason
        : null;
    return reason ? { ok: true, ran: false, reason } : null;
  }
  return null;
}
export function resolveWorkspaceCronAgentId(job: WorkspaceCronJob): string {
  return job.agentId?.trim() || "main";
}
export function getWorkspaceCronDisplayStatus(
  job: WorkspaceCronJob,
  options?: { optimisticRunning?: boolean },
): WorkspaceCronDisplayStatus {
  if (!job.enabled) {
    return "disabled";
  }
  if (typeof job.state.runningAtMs === "number") {
    return "running";
  }
  if (options?.optimisticRunning) {
    return "running";
  }
  if (job.state.lastRunStatus === "error" || job.state.lastStatus === "error") {
    return "error";
  }
  if (job.state.lastRunStatus === "skipped" || job.state.lastStatus === "skipped") {
    return "skipped";
  }
  return "ok";
}

export function getWorkspaceCronStatusLabel(status: WorkspaceCronDisplayStatus): string {
  switch (status) {
    case "running":
      return "运行中";
    case "error":
      return "异常";
    case "skipped":
      return "已跳过";
    case "disabled":
      return "已停用";
    case "ok":
    default:
      return "正常";
  }
}

export function getWorkspaceCronStatusTone(status: WorkspaceCronDisplayStatus): "online" | "busy" | "offline" | "running" {
  switch (status) {
    case "running":
      return "running";
    case "ok":
      return "online";
    case "error":
    case "skipped":
      return "busy";
    case "disabled":
    default:
      return "offline";
  }
}

export function getWorkspaceCronEditDisabledReason(job: WorkspaceCronJob): string | null {
  if (job.payload.kind !== "systemEvent") {
    return "当前仅支持编辑 systemEvent 类型任务";
  }

  return null;
}

export function formatWorkspaceCronPayloadPreview(job: WorkspaceCronJob): string {
  if (job.payload.kind === "systemEvent") {
    return job.payload.text;
  }

  return job.payload.message;
}

function formatDurationUnit(value: number, unit: string) {
  return value >= 10 ? `${Math.round(value)}${unit}` : `${value.toFixed(1).replace(/\\.0$/, "")}${unit}`;
}

export function formatWorkspaceCronDuration(ms?: number): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) {
    return "0 秒";
  }

  if (ms < 60_000) {
    return `${Math.round(ms / 1000)} 秒`;
  }
  if (ms < 3_600_000) {
    return formatDurationUnit(ms / 60_000, " 分钟");
  }
  if (ms < 86_400_000) {
    return formatDurationUnit(ms / 3_600_000, " 小时");
  }
  return formatDurationUnit(ms / 86_400_000, " 天");
}

export function formatWorkspaceCronScheduleSummary(schedule: WorkspaceCronSchedule): string {
  switch (schedule.kind) {
    case "at":
      return `单次 · ${schedule.at}`;
    case "every":
      return `每 ${formatWorkspaceCronDuration(schedule.everyMs)}`;
    case "cron":
      return schedule.tz ? `Cron · ${schedule.expr} · ${schedule.tz}` : `Cron · ${schedule.expr}`;
    default:
      return "未配置";
  }
}

export function formatWorkspaceCronTimestamp(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "暂无";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "暂无";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatWorkspaceCronSessionTarget(value: WorkspaceCronJob["sessionTarget"]): string {
  if (value === "main") {
    return "主会话";
  }
  if (value === "isolated") {
    return "独立会话";
  }
  if (value === "current") {
    return "当前会话";
  }
  return value;
}

export function buildWorkspaceCronPatch(input: {
  name: string;
  description: string;
  enabled: boolean;
  schedule: WorkspaceCronSchedule;
  sessionTarget: WorkspaceCronJob["sessionTarget"];
  wakeMode: WorkspaceCronJob["wakeMode"];
  payload: WorkspaceCronPayload;
}): WorkspaceCronJobPatch {
  return {
    name: input.name.trim(),
    description: input.description.trim(),
    enabled: input.enabled,
    schedule: input.schedule,
    sessionTarget: input.sessionTarget,
    wakeMode: input.wakeMode,
    payload: input.payload,
  };
}
