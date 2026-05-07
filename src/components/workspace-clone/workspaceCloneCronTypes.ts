export type WorkspaceCronSessionTarget = "main" | "isolated" | "current" | `session:${string}`;
export type WorkspaceCronWakeMode = "next-heartbeat" | "now";
export type WorkspaceCronRunStatus = "ok" | "error" | "skipped";
export type WorkspaceCronDeliveryStatus = "delivered" | "not-delivered" | "unknown" | "not-requested";
export type WorkspaceCronRunSkipReason = "not-due" | "already-running" | "invalid-spec";

export type WorkspaceCronSchedule =
  | {
      kind: "at";
      at: string;
    }
  | {
      kind: "every";
      everyMs: number;
      anchorMs?: number;
    }
  | {
      kind: "cron";
      expr: string;
      tz?: string;
      staggerMs?: number;
    };

export type WorkspaceCronPayload =
  | {
      kind: "systemEvent";
      text: string;
    }
  | {
      kind: "agentTurn";
      message: string;
      model?: string;
      fallbacks?: string[];
      thinking?: string;
      timeoutSeconds?: number;
      allowUnsafeExternalContent?: boolean;
      lightContext?: boolean;
      toolsAllow?: string[] | null;
    };

export interface WorkspaceCronJobState {
  nextRunAtMs?: number;
  runningAtMs?: number;
  lastRunAtMs?: number;
  lastRunStatus?: WorkspaceCronRunStatus;
  lastStatus?: WorkspaceCronRunStatus;
  lastError?: string;
  lastErrorReason?: string;
  lastDurationMs?: number;
  consecutiveErrors?: number;
  consecutiveSkipped?: number;
  lastDelivered?: boolean;
  lastDeliveryStatus?: WorkspaceCronDeliveryStatus;
  lastDeliveryError?: string;
  lastFailureAlertAtMs?: number;
}

export interface WorkspaceCronJob {
  id: string;
  agentId?: string | null;
  sessionKey?: string | null;
  name: string;
  description?: string;
  enabled: boolean;
  deleteAfterRun?: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  schedule: WorkspaceCronSchedule;
  sessionTarget: WorkspaceCronSessionTarget;
  wakeMode: WorkspaceCronWakeMode;
  payload: WorkspaceCronPayload;
  state: WorkspaceCronJobState;
  deliveryPreview?: string | null;
}

export interface WorkspaceCronListResult {
  jobs: WorkspaceCronJob[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
}

export interface WorkspaceCronRunRecord {
  ts: number;
  jobId: string;
  action: "finished";
  runId?: string;
  status?: WorkspaceCronRunStatus;
  error?: string;
  summary?: string;
  delivered?: boolean;
  deliveryStatus?: WorkspaceCronDeliveryStatus;
  deliveryError?: string;
  sessionId?: string;
  sessionKey?: string;
  runAtMs?: number;
  durationMs?: number;
  nextRunAtMs?: number;
  model?: string;
  provider?: string;
  jobName?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    cache_read_tokens?: number;
    cache_write_tokens?: number;
  };
}

export interface WorkspaceCronRunPageResult {
  entries: WorkspaceCronRunRecord[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
}

export interface WorkspaceCronStatusSummary {
  enabled: boolean;
  storePath: string;
  jobs: number;
  nextWakeAtMs: number | null;
}

export type WorkspaceCronRunResult =
  | { ok: true; ran: true }
  | { ok: true; enqueued: true; runId: string }
  | { ok: true; ran: false; reason: WorkspaceCronRunSkipReason }
  | { ok: false };

export interface WorkspaceCronJobPatch {
  name?: string;
  agentId?: string | null;
  sessionKey?: string | null;
  description?: string;
  enabled?: boolean;
  deleteAfterRun?: boolean;
  schedule?: WorkspaceCronSchedule;
  sessionTarget?: WorkspaceCronSessionTarget;
  wakeMode?: WorkspaceCronWakeMode;
  payload?:
    | Partial<Extract<WorkspaceCronPayload, { kind: "systemEvent" }>>
    | Partial<Extract<WorkspaceCronPayload, { kind: "agentTurn" }>>;
  state?: Partial<WorkspaceCronJobState>;
}
