import type { WorkspaceCronRunRecord } from "../../components/workspace-clone/workspaceCloneTypes";

export type WorkspaceCronTaskFeedbackTone = "success" | "error" | "warning" | "info";

export interface WorkspaceCronTaskFeedbackEvent {
  id: number;
  tone: WorkspaceCronTaskFeedbackTone;
  title?: string;
  message: string;
  dedupeKey: string;
  autoCloseMs?: number;
  persistent?: boolean;
}

export interface WorkspaceCronRunOutcome {
  status: "session-resolved" | "accepted" | "skipped";
  sessionKey?: string | null;
  sessionId?: string | null;
}

export interface WorkspaceCronRunLifecycleCallbacks {
  onAccepted?: (payload: { message: string; enqueued: boolean; runId?: string | null }) => void;
  onSkipped?: (payload: { reason: "not-due" | "already-running" | "invalid-spec"; message: string }) => void;
  onError?: (payload: { message: string }) => void;
  onSessionResolved?: (payload: { sessionKey?: string | null; sessionId?: string | null }) => void;
  onTerminalRunResolved?: (payload: {
    status?: WorkspaceCronRunRecord["status"];
    summary?: string | null;
    error?: string | null;
  }) => void;
}

export interface WorkspaceCronRunFollowUpOptions {
  previousTopSignature: string;
  previousLatestTimestamp: number;
  callbacks?: WorkspaceCronRunLifecycleCallbacks;
}

export const UNBOUND_AGENT_TASK_ERROR = "当前频道未绑定运行 Agent，无法读取真实任务。";
export const TASK_GATEWAY_OFFLINE_ERROR = "Gateway 未连接，无法读取真实任务。";
export const TASK_FEEDBACK_TITLE = "任务";
export const RUN_RESULT_SESSION_POLL_ATTEMPTS = 3;
export const RUN_RESULT_SESSION_POLL_DELAY_MS = 800;
export const OPTIMISTIC_RUN_INDICATOR_TIMEOUT_MS = 8000;

export function getRunSkipNotice(reason: "not-due" | "already-running" | "invalid-spec") {
  switch (reason) {
    case "already-running":
      return "任务已在运行中";
    case "invalid-spec":
      return "任务配置当前不可执行，请检查任务规则";
    case "not-due":
    default:
      return "任务当前未到执行时机";
  }
}

export function getRunSkipTone(reason: "not-due" | "already-running" | "invalid-spec"): WorkspaceCronTaskFeedbackTone {
  switch (reason) {
    case "invalid-spec":
      return "error";
    case "already-running":
      return "warning";
    case "not-due":
    default:
      return "info";
  }
}

export function waitForDelay(delayMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

export function buildRunRecordSignature(record?: WorkspaceCronRunRecord | null) {
  if (!record) {
    return "";
  }

  return [
    record.ts,
    record.runAtMs ?? "",
    record.sessionKey ?? "",
    record.sessionId ?? "",
    record.status ?? "",
  ].join(":");
}

export function buildRunRecordTimestamp(record?: WorkspaceCronRunRecord | null) {
  if (!record) {
    return 0;
  }

  return record.runAtMs ?? record.ts;
}

export function resolveNewRunRecord(
  runs: WorkspaceCronRunRecord[],
  previousTopSignature: string,
  previousLatestTimestamp: number,
) {
  const latestRun = runs[0] ?? null;
  if (!latestRun) {
    return null;
  }

  if (previousTopSignature) {
    return buildRunRecordSignature(latestRun) !== previousTopSignature ? latestRun : null;
  }

  return buildRunRecordTimestamp(latestRun) > previousLatestTimestamp ? latestRun : null;
}

export async function pollResolvedRunSession(params: {
  jobId: string;
  previousTopSignature: string;
  previousLatestTimestamp: number;
  loadTaskRuns: (jobId: string, options?: { force?: boolean }) => Promise<WorkspaceCronRunRecord[]>;
  isStillActive: () => boolean;
}) {
  let entries = await params.loadTaskRuns(params.jobId, { force: true });
  let latestRun = resolveNewRunRecord(entries, params.previousTopSignature, params.previousLatestTimestamp);
  if (latestRun?.sessionKey || latestRun?.sessionId) {
    return {
      sessionKey: latestRun.sessionKey ?? null,
      sessionId: latestRun.sessionId ?? null,
      latestRun,
    };
  }

  for (let attempt = 1; attempt < RUN_RESULT_SESSION_POLL_ATTEMPTS; attempt += 1) {
    if (!params.isStillActive()) {
      break;
    }

    await waitForDelay(RUN_RESULT_SESSION_POLL_DELAY_MS);
    entries = await params.loadTaskRuns(params.jobId, { force: true });
    latestRun = resolveNewRunRecord(entries, params.previousTopSignature, params.previousLatestTimestamp);
    if (latestRun?.sessionKey || latestRun?.sessionId) {
      return {
        sessionKey: latestRun.sessionKey ?? null,
        sessionId: latestRun.sessionId ?? null,
        latestRun,
      };
    }
  }

  return latestRun
    ? {
      sessionKey: latestRun.sessionKey ?? null,
      sessionId: latestRun.sessionId ?? null,
      latestRun,
    }
    : null;
}
