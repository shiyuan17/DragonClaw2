import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  normalizeWorkspaceCronListResult,
  normalizeWorkspaceCronRunPageResult,
  normalizeWorkspaceCronRunResult,
  normalizeWorkspaceCronStatusSummary,
  resolveWorkspaceCronAgentId,
} from "../../components/workspace-clone/workspaceCloneCron";
import type {
  WorkspaceCronJob,
  WorkspaceCronJobPatch,
  WorkspaceCronStatusSummary,
} from "../../components/workspace-clone/workspaceCloneTypes";
import {
  buildRunRecordSignature,
  buildRunRecordTimestamp,
  getRunSkipNotice,
  getRunSkipTone,
  pollResolvedRunSession,
  resolveNewRunRecord,
  TASK_FEEDBACK_TITLE,
  TASK_GATEWAY_OFFLINE_ERROR,
  UNBOUND_AGENT_TASK_ERROR,
  type WorkspaceCronRunFollowUpOptions,
  type WorkspaceCronRunLifecycleCallbacks,
  type WorkspaceCronRunOutcome,
  type WorkspaceCronTaskFeedbackEvent,
} from "./workspaceCronTaskRunHelpers";
import { useWorkspaceCronOptimisticRuns } from "./useWorkspaceCronOptimisticRuns";

type WorkspaceCronTaskAction = "refresh" | "toggle" | "save" | "run" | "delete" | "runs";

interface UseWorkspaceCronTasksOptions {
  agentId: string | null;
  gatewayConnected: boolean;
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>;
  enabled?: boolean;
}

export function useWorkspaceCronTasks({
  agentId,
  gatewayConnected,
  request,
  enabled = true,
}: UseWorkspaceCronTasksOptions) {
  const normalizedAgentId = useMemo(() => agentId?.trim() || null, [agentId]);
  const [tasks, setTasks] = useState<WorkspaceCronJob[]>([]);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskNotice, setTaskNotice] = useState("");
  const [taskError, setTaskError] = useState("");
  const [taskRunsError, setTaskRunsError] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskRunsById, setTaskRunsById] = useState<Record<string, ReturnType<typeof normalizeWorkspaceCronRunPageResult>["entries"]>>({});
  const [taskRunsLoadingId, setTaskRunsLoadingId] = useState<string | null>(null);
  const [taskActionJobId, setTaskActionJobId] = useState<string | null>(null);
  const [taskActionType, setTaskActionType] = useState<WorkspaceCronTaskAction | null>(null);
  const [taskFeedbackEvent, setTaskFeedbackEvent] = useState<WorkspaceCronTaskFeedbackEvent | null>(null);
  const [cronStatus, setCronStatus] = useState<WorkspaceCronStatusSummary | null>(null);
  const currentAgentIdRef = useRef<string | null>(normalizedAgentId);
  const selectedTaskIdRef = useRef<string | null>(null);
  const taskRunsByIdRef = useRef(taskRunsById);
  const gatewayConnectedRef = useRef(gatewayConnected);
  const followUpRefreshTimerRef = useRef<number | null>(null);
  const loadSeqRef = useRef(0);
  const taskFeedbackSeqRef = useRef(0);
  const {
    optimisticRunningTaskIds,
    clearOptimisticRunState,
    clearAllOptimisticRunStates,
    markOptimisticRunState,
    reconcileOptimisticRunStateWithEntries,
    reconcileOptimisticRunStateWithTasks,
  } = useWorkspaceCronOptimisticRuns(normalizedAgentId);

  useEffect(() => { currentAgentIdRef.current = normalizedAgentId; }, [normalizedAgentId]);
  useEffect(() => { selectedTaskIdRef.current = selectedTaskId; }, [selectedTaskId]);
  useEffect(() => { taskRunsByIdRef.current = taskRunsById; }, [taskRunsById]);
  useEffect(() => { gatewayConnectedRef.current = gatewayConnected; }, [gatewayConnected]);

  const emitTaskFeedback = useCallback((payload: Omit<WorkspaceCronTaskFeedbackEvent, "id">) => {
    taskFeedbackSeqRef.current += 1;
    setTaskFeedbackEvent({ id: taskFeedbackSeqRef.current, ...payload });
  }, []);

  const clearScheduledRefresh = useCallback(() => {
    if (followUpRefreshTimerRef.current !== null) {
      window.clearTimeout(followUpRefreshTimerRef.current);
      followUpRefreshTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearScheduledRefresh, [clearScheduledRefresh]);

  const clearTaskStatus = useCallback(() => {
    setTaskNotice("");
    setTaskError("");
    setTaskRunsError("");
  }, []);

  const fetchTaskRuns = useCallback(async (jobId: string) => normalizeWorkspaceCronRunPageResult(
    await request("cron.runs", { jobId, limit: 6, sortDir: "desc" }),
  ).entries, [request]);

  const loadTaskRuns = useCallback(async (jobId: string, options?: { force?: boolean }) => {
    if (!enabled || !gatewayConnected || !normalizedAgentId || !jobId) {
      return [];
    }

    if (!options?.force && taskRunsByIdRef.current[jobId]) {
      setSelectedTaskId(jobId);
      setTaskRunsError("");
      return taskRunsByIdRef.current[jobId];
    }

    setSelectedTaskId(jobId);
    setTaskRunsLoadingId(jobId);
    setTaskRunsError("");

    try {
      const entries = await fetchTaskRuns(jobId);
      reconcileOptimisticRunStateWithEntries(jobId, entries);
      setTaskRunsById((current) => ({ ...current, [jobId]: entries }));
      return entries;
    } catch (error) {
      const message = error instanceof Error ? error.message : "读取任务运行记录失败";
      setTaskRunsError(message);
      emitTaskFeedback({
        tone: "error",
        title: TASK_FEEDBACK_TITLE,
        message,
        dedupeKey: "workspace-task-runs-error",
        autoCloseMs: 3600,
        persistent: false,
      });
      return [];
    } finally {
      setTaskRunsLoadingId((current) => (current === jobId ? null : current));
    }
  }, [emitTaskFeedback, enabled, fetchTaskRuns, gatewayConnected, normalizedAgentId, reconcileOptimisticRunStateWithEntries]);

  const refreshTasks = useCallback(async (options?: { showLoading?: boolean; keepNotice?: boolean }) => {
    if (!enabled) {
      clearAllOptimisticRunStates();
      return [];
    }

    if (!normalizedAgentId || !gatewayConnected) {
      clearScheduledRefresh();
      clearAllOptimisticRunStates();
      setTasks([]);
      setSelectedTaskId(null);
      setTaskRunsById({});
      setTaskLoading(false);
      setCronStatus(null);
      setTaskRunsLoadingId(null);
      if (!options?.keepNotice) {
        setTaskNotice("");
      }
      setTaskRunsError("");
      setTaskError(normalizedAgentId ? TASK_GATEWAY_OFFLINE_ERROR : UNBOUND_AGENT_TASK_ERROR);
      return [];
    }

    const requestId = loadSeqRef.current + 1;
    loadSeqRef.current = requestId;
    if (options?.showLoading) {
      setTaskLoading(true);
    }
    if (!options?.keepNotice) {
      setTaskNotice("");
    }
    setTaskError("");

    try {
      const [listPayload, statusPayload] = await Promise.all([
        request("cron.list", {
          includeDisabled: true,
          enabled: "all",
          sortBy: "nextRunAtMs",
          sortDir: "asc",
        }),
        request("cron.status", {}),
      ]);

      if (loadSeqRef.current !== requestId || currentAgentIdRef.current !== normalizedAgentId) {
        return [];
      }

      const listResult = normalizeWorkspaceCronListResult(listPayload);
      const nextTasks = listResult.jobs.filter((job) => resolveWorkspaceCronAgentId(job) === normalizedAgentId);
      reconcileOptimisticRunStateWithTasks(nextTasks);
      const validTaskIds = new Set(nextTasks.map((job) => job.id));
      const nextSelectedTaskId = validTaskIds.has(selectedTaskIdRef.current || "")
        ? selectedTaskIdRef.current
        : nextTasks[0]?.id || null;

      setTasks(nextTasks);
      setCronStatus(normalizeWorkspaceCronStatusSummary(statusPayload));
      setSelectedTaskId(nextSelectedTaskId);
      setTaskRunsById((current) => Object.fromEntries(Object.entries(current).filter(([jobId]) => validTaskIds.has(jobId))));
      setTaskRunsError("");
      setTaskError("");

      if (nextSelectedTaskId && !taskRunsByIdRef.current[nextSelectedTaskId]) {
        void loadTaskRuns(nextSelectedTaskId, { force: true });
      }

      return nextTasks;
    } catch (error) {
      if (loadSeqRef.current === requestId && currentAgentIdRef.current === normalizedAgentId) {
        setCronStatus(null);
        setTasks([]);
        setSelectedTaskId(null);
        setTaskRunsById({});
        setTaskRunsError("");
        setTaskError(error instanceof Error ? error.message : "读取真实任务失败");
      }
      return [];
    } finally {
      if (options?.showLoading && loadSeqRef.current === requestId && currentAgentIdRef.current === normalizedAgentId) {
        setTaskLoading(false);
      }
    }
  }, [clearAllOptimisticRunStates, clearScheduledRefresh, enabled, gatewayConnected, loadTaskRuns, normalizedAgentId, reconcileOptimisticRunStateWithTasks, request]);

  const scheduleFollowUpRefresh = useCallback((jobId: string, options?: WorkspaceCronRunFollowUpOptions) => {
    clearScheduledRefresh();
    followUpRefreshTimerRef.current = window.setTimeout(() => {
      if (!gatewayConnectedRef.current || currentAgentIdRef.current !== normalizedAgentId) {
        return;
      }

      void (async () => {
        await refreshTasks({ keepNotice: true });
        const entries = await loadTaskRuns(jobId, { force: true });
        const latestRun = options ? resolveNewRunRecord(entries, options.previousTopSignature, options.previousLatestTimestamp) : null;

        if (latestRun?.sessionKey || latestRun?.sessionId) {
          options?.callbacks?.onSessionResolved?.({ sessionKey: latestRun.sessionKey ?? null, sessionId: latestRun.sessionId ?? null });
          return;
        }

        if (latestRun) {
          options?.callbacks?.onTerminalRunResolved?.({ status: latestRun.status, summary: latestRun.summary ?? null, error: latestRun.error ?? null });
        }
      })();
    }, 1500);
  }, [clearScheduledRefresh, loadTaskRuns, normalizedAgentId, refreshTasks]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!normalizedAgentId || !gatewayConnected) {
      clearScheduledRefresh();
      clearAllOptimisticRunStates();
      setTasks([]);
      setSelectedTaskId(null);
      setTaskRunsById({});
      setTaskRunsLoadingId(null);
      setCronStatus(null);
      setTaskLoading(false);
      setTaskNotice("");
      setTaskRunsError("");
      setTaskError(normalizedAgentId ? TASK_GATEWAY_OFFLINE_ERROR : UNBOUND_AGENT_TASK_ERROR);
      return;
    }

    clearTaskStatus();
    void refreshTasks({ showLoading: true });
  }, [clearAllOptimisticRunStates, clearScheduledRefresh, clearTaskStatus, enabled, gatewayConnected, normalizedAgentId, refreshTasks]);

  const runTaskAction = useCallback(async <T,>(
    jobId: string,
    action: WorkspaceCronTaskAction,
    runner: () => Promise<T>,
  ) => {
    setTaskActionJobId(jobId);
    setTaskActionType(action);
    try {
      return await runner();
    } finally {
      setTaskActionJobId((current) => (current === jobId ? null : current));
      setTaskActionType((current) => (current === action ? null : current));
    }
  }, []);

  const finishTaskMutation = useCallback(async (
    jobId: string,
    action: "toggle" | "save" | "delete",
    runner: () => Promise<void>,
    successMessage: string,
    failureMessage: string,
  ) => {
    await runTaskAction(jobId, action, async () => {
      clearTaskStatus();
      await runner();
      setTaskNotice(successMessage);
      emitTaskFeedback({
        tone: "success",
        title: TASK_FEEDBACK_TITLE,
        message: successMessage,
        dedupeKey: `workspace-task-${action}`,
        persistent: false,
      });
    }).catch((error) => {
      const message = error instanceof Error ? error.message : failureMessage;
      setTaskError(message);
      emitTaskFeedback({
        tone: "error",
        title: TASK_FEEDBACK_TITLE,
        message,
        dedupeKey: `workspace-task-${action}-error`,
        autoCloseMs: 3600,
        persistent: false,
      });
      if (action === "save") {
        throw error;
      }
    });
  }, [clearTaskStatus, emitTaskFeedback, runTaskAction]);

  const toggleTaskEnabled = useCallback(async (job: WorkspaceCronJob) => {
    await finishTaskMutation(
      job.id,
      "toggle",
      async () => {
        await request("cron.update", { id: job.id, patch: { enabled: !job.enabled } });
        await refreshTasks({ keepNotice: true });
      },
      job.enabled ? "任务已停用" : "任务已启用",
      "更新任务状态失败",
    );
  }, [finishTaskMutation, refreshTasks, request]);

  const updateTask = useCallback(async (jobId: string, patch: WorkspaceCronJobPatch) => {
    await finishTaskMutation(
      jobId,
      "save",
      async () => {
        await request("cron.update", { id: jobId, patch });
        await refreshTasks({ keepNotice: true });
        await loadTaskRuns(jobId, { force: true });
      },
      "任务已保存",
      "保存任务失败",
    );
  }, [finishTaskMutation, loadTaskRuns, refreshTasks, request]);

  const deleteTask = useCallback(async (jobId: string) => {
    await finishTaskMutation(
      jobId,
      "delete",
      async () => {
        await request("cron.remove", { id: jobId });
        setTaskRunsById((current) => {
          const next = { ...current };
          delete next[jobId];
          return next;
        });
        if (selectedTaskIdRef.current === jobId) {
          setSelectedTaskId(null);
        }
        await refreshTasks({ keepNotice: true });
      },
      "任务已删除",
      "删除任务失败",
    );
  }, [finishTaskMutation, refreshTasks, request]);

  const runTaskNow = useCallback(async (jobId: string, callbacks?: WorkspaceCronRunLifecycleCallbacks) => {
    const previousTopRun = taskRunsByIdRef.current[jobId]?.[0] ?? null;
    const previousTask = tasks.find((task) => task.id === jobId) ?? null;
    const previousTopSignature = buildRunRecordSignature(previousTopRun);
    const previousLatestTimestamp = Math.max(buildRunRecordTimestamp(previousTopRun), previousTask?.state.lastRunAtMs ?? 0);

    return runTaskAction(jobId, "run", async (): Promise<WorkspaceCronRunOutcome | null> => {
      clearTaskStatus();
      const result = normalizeWorkspaceCronRunResult(await request("cron.run", { id: jobId, mode: "force" }));
      if (!result) {
        throw new Error("cron.run 返回格式不正确");
      }
      if (result.ok === false) {
        throw new Error("任务触发失败");
      }

      if ("reason" in result) {
        clearOptimisticRunState(jobId);
        const message = getRunSkipNotice(result.reason);
        callbacks?.onSkipped?.({ reason: result.reason, message });
        setTaskNotice(message);
        emitTaskFeedback({
          tone: getRunSkipTone(result.reason),
          title: TASK_FEEDBACK_TITLE,
          message,
          dedupeKey: "workspace-task-run-skip",
          autoCloseMs: result.reason === "invalid-spec" ? 3600 : undefined,
          persistent: false,
        });
        await refreshTasks({ keepNotice: true });
        await loadTaskRuns(jobId, { force: true });
        return { status: "skipped" };
      }

      const message = "enqueued" in result && result.enqueued
        ? "任务已进入执行队列，正在定位结果会话"
        : "任务已立即触发，正在定位结果会话";
      callbacks?.onAccepted?.({
        message,
        enqueued: "enqueued" in result && result.enqueued,
        runId: "runId" in result ? result.runId : null,
      });
      markOptimisticRunState(jobId, { previousTopSignature, previousLatestTimestamp });
      setTaskNotice(message);
      emitTaskFeedback({
        tone: "enqueued" in result && result.enqueued ? "info" : "success",
        title: TASK_FEEDBACK_TITLE,
        message,
        dedupeKey: "workspace-task-run",
        persistent: false,
      });

      await refreshTasks({ keepNotice: true });
      const resolvedSession = await pollResolvedRunSession({
        jobId,
        previousTopSignature,
        previousLatestTimestamp,
        loadTaskRuns,
        isStillActive: () => gatewayConnectedRef.current && currentAgentIdRef.current === normalizedAgentId,
      });
      if (resolvedSession?.sessionKey || resolvedSession?.sessionId) {
        callbacks?.onSessionResolved?.({ sessionKey: resolvedSession.sessionKey ?? null, sessionId: resolvedSession.sessionId ?? null });
      } else if (resolvedSession?.latestRun) {
        callbacks?.onTerminalRunResolved?.({ status: resolvedSession.latestRun.status, summary: resolvedSession.latestRun.summary ?? null, error: resolvedSession.latestRun.error ?? null });
      }
      scheduleFollowUpRefresh(jobId, { previousTopSignature, previousLatestTimestamp, callbacks });

      return resolvedSession?.sessionKey || resolvedSession?.sessionId ? { status: "session-resolved", sessionKey: resolvedSession.sessionKey, sessionId: resolvedSession.sessionId } : { status: "accepted" };
    }).catch((error) => {
      clearOptimisticRunState(jobId);
      const message = error instanceof Error ? error.message : "触发任务失败";
      callbacks?.onError?.({ message });
      setTaskError(message);
      emitTaskFeedback({
        tone: "error",
        title: TASK_FEEDBACK_TITLE,
        message,
        dedupeKey: "workspace-task-run-error",
        autoCloseMs: 3600,
        persistent: false,
      });
      return null;
    });
  }, [clearOptimisticRunState, clearTaskStatus, emitTaskFeedback, loadTaskRuns, markOptimisticRunState, normalizedAgentId, refreshTasks, request, runTaskAction, scheduleFollowUpRefresh, tasks]);

  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) ?? tasks[0] ?? null, [selectedTaskId, tasks]);

  return {
    tasks,
    enabledTasks: tasks.filter((task) => task.enabled),
    disabledTasks: tasks.filter((task) => !task.enabled),
    selectedTask,
    selectedTaskId,
    selectedTaskRuns: selectedTask ? taskRunsById[selectedTask.id] ?? [] : [],
    taskRunsById,
    taskLoading,
    taskNotice,
    taskError,
    taskRunsError,
    optimisticRunningTaskIds,
    taskRunsLoading: Boolean(taskRunsLoadingId),
    taskRunsLoadingId,
    taskActionJobId,
    taskActionType,
    taskFeedbackEvent,
    cronStatus,
    setSelectedTaskId,
    clearTaskStatus,
    refreshTasks,
    loadTaskRuns,
    toggleTaskEnabled,
    updateTask,
    deleteTask,
    runTaskNow,
  };
}
