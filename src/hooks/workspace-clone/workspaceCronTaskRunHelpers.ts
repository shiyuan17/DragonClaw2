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

export const UNBOUND_AGENT_TASK_ERROR = "当前频道未绑定运行 Agent，无法读取真实任务。";
export const TASK_GATEWAY_OFFLINE_ERROR = "Gateway 未连接，无法读取真实任务。";
export const TASK_FEEDBACK_TITLE = "任务";
export const RUN_RESULT_SESSION_POLL_ATTEMPTS = 3;
export const RUN_RESULT_SESSION_POLL_DELAY_MS = 800;

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
