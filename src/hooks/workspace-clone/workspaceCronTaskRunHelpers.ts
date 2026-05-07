import type { WorkspaceCronJob, WorkspaceCronPayload, WorkspaceCronRunRecord } from "../../components/workspace-clone/workspaceCloneTypes";
import { normalizeWorkspaceCronRunResult } from "../../components/workspace-clone/workspaceCloneCron";
import { resolveWorkspaceTaskDisplayTitle } from "../../components/workspace-clone/workspaceCloneTaskTitle";

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

export interface WorkspacePendingRunNowBridge {
  jobId: string;
  agentId: string;
  taskName: string;
  taskDisplayTitle: string;
  payloadKind: WorkspaceCronPayload["kind"];
  acceptedAt: number;
  runId: string | null;
  enqueued: boolean;
  previousTopSignature: string;
  previousLatestTimestamp: number;
  message: string;
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
  expectedRunId?: string | null;
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
    record.runId ?? "",
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
  expectedRunId?: string | null,
) {
  const normalizedExpectedRunId = expectedRunId?.trim() || "";
  if (normalizedExpectedRunId) {
    const matchingRun = runs.find((run) => run.runId?.trim() === normalizedExpectedRunId) ?? null;
    if (matchingRun) {
      return matchingRun;
    }

    if (runs.some((run) => Boolean(run.runId?.trim()))) {
      return null;
    }
  }

  return runs.find((run) => (
    previousTopSignature
      ? buildRunRecordSignature(run) !== previousTopSignature
      : buildRunRecordTimestamp(run) > previousLatestTimestamp
  )) ?? null;
}

export async function pollResolvedRunSession(params: {
  jobId: string;
  previousTopSignature: string;
  previousLatestTimestamp: number;
  expectedRunId?: string | null;
  loadTaskRuns: (jobId: string, options?: { force?: boolean }) => Promise<WorkspaceCronRunRecord[]>;
  isStillActive: () => boolean;
}) {
  let entries = await params.loadTaskRuns(params.jobId, { force: true });
  let latestRun = resolveNewRunRecord(
    entries,
    params.previousTopSignature,
    params.previousLatestTimestamp,
    params.expectedRunId,
  );
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
    latestRun = resolveNewRunRecord(
      entries,
      params.previousTopSignature,
      params.previousLatestTimestamp,
      params.expectedRunId,
    );
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

export function createPendingRunNowBridge(params: {
  job: WorkspaceCronJob;
  agentId: string;
  acceptedAt?: number;
  runId?: string | null;
  enqueued: boolean;
  previousTopSignature: string;
  previousLatestTimestamp: number;
  message: string;
}): WorkspacePendingRunNowBridge {
  return {
    jobId: params.job.id,
    agentId: params.agentId,
    taskName: params.job.name,
    taskDisplayTitle: resolveWorkspaceTaskDisplayTitle(params.job),
    payloadKind: params.job.payload.kind,
    acceptedAt: params.acceptedAt ?? Date.now(),
    runId: params.runId?.trim() || null,
    enqueued: params.enqueued,
    previousTopSignature: params.previousTopSignature,
    previousLatestTimestamp: params.previousLatestTimestamp,
    message: params.message,
  };
}

export interface WorkspaceRunTaskNowParams {
  jobId: string;
  job: WorkspaceCronJob | null;
  previousTopRun: WorkspaceCronRunRecord | null;
  normalizedAgentId: string | null;
  currentAgentIdRef: { current: string | null };
  gatewayConnectedRef: { current: boolean };
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>;
  clearTaskStatus: () => void;
  refreshTasks: (options?: { showLoading?: boolean; keepNotice?: boolean }) => Promise<WorkspaceCronJob[]>;
  loadTaskRuns: (jobId: string, options?: { force?: boolean }) => Promise<WorkspaceCronRunRecord[]>;
  clearOptimisticRunState: (jobId: string) => void;
  markOptimisticRunState: (
    jobId: string,
    meta: { previousTopSignature: string; previousLatestTimestamp: number },
  ) => void;
  emitTaskFeedback: (payload: Omit<WorkspaceCronTaskFeedbackEvent, "id">) => void;
  setTaskNotice: (message: string) => void;
  setTaskError: (message: string) => void;
  setPendingRunNowBridge: (bridge: WorkspacePendingRunNowBridge | null) => void;
  scheduleFollowUpRefresh: (jobId: string, options?: WorkspaceCronRunFollowUpOptions) => void;
  callbacks?: WorkspaceCronRunLifecycleCallbacks;
  options?: {
    forceWakeNow?: boolean;
  };
}

export async function runWorkspaceCronTaskNow(params: WorkspaceRunTaskNowParams): Promise<WorkspaceCronRunOutcome | null> {
  const previousTopSignature = buildRunRecordSignature(params.previousTopRun);
  const previousLatestTimestamp = Math.max(
    buildRunRecordTimestamp(params.previousTopRun),
    params.job?.state.lastRunAtMs ?? 0,
  );
  const emitTerminalFeedback = (payload: {
    status?: "ok" | "error" | "skipped";
    summary?: string | null;
    error?: string | null;
  }) => {
    const message = payload.status === "ok"
      ? payload.summary?.trim()
        ? `任务执行完成：${payload.summary.trim()}`
        : "任务执行完成。"
      : payload.status === "skipped"
        ? `任务未执行：${payload.error?.trim() || "已被调度器跳过。"}`
        : `任务执行失败：${payload.error?.trim() || "未返回更多错误信息。"}`;
    params.setTaskNotice(message);
    params.emitTaskFeedback({
      tone: payload.status === "ok" ? "success" : payload.status === "skipped" ? "info" : "error",
      title: TASK_FEEDBACK_TITLE,
      message,
      dedupeKey: "workspace-task-run-terminal",
      autoCloseMs: payload.status === "ok" ? 2800 : 3600,
      persistent: false,
    });
  };

  params.clearTaskStatus();
  const shouldForceImmediateWake = Boolean(
    params.options?.forceWakeNow &&
    params.job?.sessionTarget === "main" &&
    params.job.payload.kind === "systemEvent" &&
    params.job.wakeMode !== "now",
  );
  let shouldRestoreWakeMode = false;

  try {
    if (shouldForceImmediateWake) {
      await params.request("cron.update", { id: params.jobId, patch: { wakeMode: "now" } });
      shouldRestoreWakeMode = true;
    }
  } catch {
    shouldRestoreWakeMode = false;
  }

  try {
    const result = normalizeWorkspaceCronRunResult(await params.request("cron.run", { id: params.jobId, mode: "force" }));
    if (!result) {
      throw new Error("cron.run 返回格式不正确");
    }
    if (result.ok === false) {
      throw new Error("任务触发失败");
    }

    if ("reason" in result) {
      params.clearOptimisticRunState(params.jobId);
      const message = getRunSkipNotice(result.reason);
      params.setPendingRunNowBridge(null);
      params.callbacks?.onSkipped?.({ reason: result.reason, message });
      params.setTaskNotice(message);
      params.emitTaskFeedback({
        tone: getRunSkipTone(result.reason),
        title: TASK_FEEDBACK_TITLE,
        message,
        dedupeKey: "workspace-task-run-skip",
        autoCloseMs: result.reason === "invalid-spec" ? 3600 : undefined,
        persistent: false,
      });
      await params.refreshTasks({ keepNotice: true });
      await params.loadTaskRuns(params.jobId, { force: true });
      return { status: "skipped" };
    }

    const isMainSystemEventTask = params.job?.sessionTarget === "main" && params.job.payload.kind === "systemEvent";
    const message = isMainSystemEventTask
      ? ("enqueued" in result && result.enqueued
        ? "任务已进入执行队列，正在立刻唤醒主会话"
        : "任务已立即触发，正在立刻唤醒主会话")
      : ("enqueued" in result && result.enqueued
        ? "任务已进入执行队列，正在定位结果会话"
        : "任务已立即触发，正在定位结果会话");
    const expectedRunId = "runId" in result ? result.runId ?? null : null;

    if (params.job && params.normalizedAgentId) {
      params.setPendingRunNowBridge(createPendingRunNowBridge({
        job: params.job,
        agentId: params.normalizedAgentId,
        runId: expectedRunId,
        enqueued: "enqueued" in result && result.enqueued,
        previousTopSignature,
        previousLatestTimestamp,
        message,
      }));
    } else {
      params.setPendingRunNowBridge(null);
    }

    params.callbacks?.onAccepted?.({
      message,
      enqueued: "enqueued" in result && result.enqueued,
      runId: expectedRunId,
    });
    params.markOptimisticRunState(params.jobId, { previousTopSignature, previousLatestTimestamp });
    params.setTaskNotice(message);
    params.emitTaskFeedback({
      tone: "enqueued" in result && result.enqueued ? "info" : "success",
      title: TASK_FEEDBACK_TITLE,
      message,
      dedupeKey: "workspace-task-run",
      persistent: false,
    });

    await params.refreshTasks({ keepNotice: true });
    const resolvedSession = await pollResolvedRunSession({
      jobId: params.jobId,
      previousTopSignature,
      previousLatestTimestamp,
      expectedRunId,
      loadTaskRuns: params.loadTaskRuns,
      isStillActive: () => params.gatewayConnectedRef.current && params.currentAgentIdRef.current === params.normalizedAgentId,
    });

    if (resolvedSession?.sessionKey || resolvedSession?.sessionId) {
      params.setPendingRunNowBridge(null);
      params.callbacks?.onSessionResolved?.({ sessionKey: resolvedSession.sessionKey ?? null, sessionId: resolvedSession.sessionId ?? null });
    } else if (resolvedSession?.latestRun) {
      params.setPendingRunNowBridge(null);
      emitTerminalFeedback({
        status: resolvedSession.latestRun.status,
        summary: resolvedSession.latestRun.summary ?? null,
        error: resolvedSession.latestRun.error ?? null,
      });
      params.callbacks?.onTerminalRunResolved?.({
        status: resolvedSession.latestRun.status,
        summary: resolvedSession.latestRun.summary ?? null,
        error: resolvedSession.latestRun.error ?? null,
      });
    }

    if (!resolvedSession?.sessionKey && !resolvedSession?.sessionId && !resolvedSession?.latestRun) {
      params.scheduleFollowUpRefresh(params.jobId, {
        previousTopSignature,
        previousLatestTimestamp,
        expectedRunId,
        callbacks: {
          onSessionResolved: (payload) => {
            params.setPendingRunNowBridge(null);
            params.callbacks?.onSessionResolved?.(payload);
          },
          onTerminalRunResolved: (payload) => {
            params.setPendingRunNowBridge(null);
            emitTerminalFeedback(payload);
            params.callbacks?.onTerminalRunResolved?.(payload);
          },
        },
      });
    }

    return resolvedSession?.sessionKey || resolvedSession?.sessionId
      ? { status: "session-resolved", sessionKey: resolvedSession.sessionKey, sessionId: resolvedSession.sessionId }
      : { status: "accepted" };
  } catch (error) {
    params.clearOptimisticRunState(params.jobId);
    const message = error instanceof Error ? error.message : "触发任务失败";
    params.setPendingRunNowBridge(null);
    params.callbacks?.onError?.({ message });
    params.setTaskError(message);
    params.emitTaskFeedback({
      tone: "error",
      title: TASK_FEEDBACK_TITLE,
      message,
      dedupeKey: "workspace-task-run-error",
      autoCloseMs: 3600,
      persistent: false,
    });
    return null;
  } finally {
    if (shouldRestoreWakeMode && params.job?.wakeMode) {
      void params.request("cron.update", { id: params.jobId, patch: { wakeMode: params.job.wakeMode } })
        .then(() => params.refreshTasks({ keepNotice: true }))
        .catch(() => undefined);
    }
  }
}
