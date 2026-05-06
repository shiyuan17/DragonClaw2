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
  WorkspaceCronRunRecord,
  WorkspaceCronStatusSummary,
} from "../../components/workspace-clone/workspaceCloneTypes";

type WorkspaceCronTaskAction = "refresh" | "toggle" | "save" | "run" | "delete" | "runs";
const UNBOUND_AGENT_TASK_ERROR = "当前频道未绑定运行 Agent，无法读取真实任务";

interface UseWorkspaceCronTasksOptions {
  agentId: string | null;
  gatewayConnected: boolean;
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>;
  enabled?: boolean;
}

function getRunSkipNotice(reason: "not-due" | "already-running" | "invalid-spec") {
  switch (reason) {
    case "already-running":
      return "任务已在运行中";
    case "invalid-spec":
      return "任务配置当前不可执行，请检查任务规格";
    case "not-due":
    default:
      return "任务当前未到执行时机";
  }
}

export function useWorkspaceCronTasks({
  agentId,
  gatewayConnected,
  request,
  enabled = true,
}: UseWorkspaceCronTasksOptions) {
  const normalizedAgentId = useMemo(() => {
    const nextAgentId = agentId?.trim();
    return nextAgentId ? nextAgentId : null;
  }, [agentId]);
  const [tasks, setTasks] = useState<WorkspaceCronJob[]>([]);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskNotice, setTaskNotice] = useState("");
  const [taskError, setTaskError] = useState("");
  const [taskRunsError, setTaskRunsError] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskRunsById, setTaskRunsById] = useState<Record<string, WorkspaceCronRunRecord[]>>({});
  const [taskRunsLoadingId, setTaskRunsLoadingId] = useState<string | null>(null);
  const [taskActionJobId, setTaskActionJobId] = useState<string | null>(null);
  const [taskActionType, setTaskActionType] = useState<WorkspaceCronTaskAction | null>(null);
  const [cronStatus, setCronStatus] = useState<WorkspaceCronStatusSummary | null>(null);
  const currentAgentIdRef = useRef<string | null>(normalizedAgentId);
  const selectedTaskIdRef = useRef<string | null>(null);
  const taskRunsByIdRef = useRef<Record<string, WorkspaceCronRunRecord[]>>({});
  const gatewayConnectedRef = useRef(gatewayConnected);
  const loadSeqRef = useRef(0);
  const followUpRefreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    currentAgentIdRef.current = normalizedAgentId;
  }, [normalizedAgentId]);

  useEffect(() => {
    selectedTaskIdRef.current = selectedTaskId;
  }, [selectedTaskId]);

  useEffect(() => {
    taskRunsByIdRef.current = taskRunsById;
  }, [taskRunsById]);

  useEffect(() => {
    gatewayConnectedRef.current = gatewayConnected;
  }, [gatewayConnected]);

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
      const result = normalizeWorkspaceCronRunPageResult(
        await request("cron.runs", { jobId, limit: 6, sortDir: "desc" }),
      );
      setTaskRunsById((current) => ({
        ...current,
        [jobId]: result.entries,
      }));
      return result.entries;
    } catch (error) {
      setTaskRunsError(error instanceof Error ? error.message : "读取任务运行记录失败");
      return [];
    } finally {
      setTaskRunsLoadingId((current) => (current === jobId ? null : current));
    }
  }, [enabled, gatewayConnected, normalizedAgentId, request]);

  const refreshTasks = useCallback(async (options?: { showLoading?: boolean; keepNotice?: boolean }) => {
    if (!enabled) {
      return [];
    }

    if (!normalizedAgentId) {
      clearScheduledRefresh();
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
      setTaskError(UNBOUND_AGENT_TASK_ERROR);
      return [];
    }

    if (!gatewayConnected) {
      clearScheduledRefresh();
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
      setTaskError("Gateway 未连接，无法读取真实任务");
      return [];
    }

    const showLoading = options?.showLoading ?? false;
    const targetAgentId = normalizedAgentId;
    const requestId = loadSeqRef.current + 1;
    loadSeqRef.current = requestId;

    if (showLoading) {
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

      if (loadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
        return [];
      }

      const listResult = normalizeWorkspaceCronListResult(listPayload);
      const nextStatus = normalizeWorkspaceCronStatusSummary(statusPayload);
      const nextTasks = listResult.jobs.filter((job) => resolveWorkspaceCronAgentId(job) === targetAgentId);
      const validTaskIds = new Set(nextTasks.map((job) => job.id));
      const nextSelectedTaskId = validTaskIds.has(selectedTaskIdRef.current || "")
        ? selectedTaskIdRef.current
        : nextTasks[0]?.id || null;

      setTasks(nextTasks);
      setCronStatus(nextStatus);
      setSelectedTaskId(nextSelectedTaskId);
      setTaskRunsById((current) => Object.fromEntries(
        Object.entries(current).filter(([jobId]) => validTaskIds.has(jobId)),
      ));
      setTaskRunsError("");
      setTaskError("");

      if (nextSelectedTaskId && !taskRunsByIdRef.current[nextSelectedTaskId]) {
        void loadTaskRuns(nextSelectedTaskId, { force: true });
      }

      return nextTasks;
    } catch (error) {
      if (loadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
        return [];
      }

      setCronStatus(null);
      setTasks([]);
      setSelectedTaskId(null);
      setTaskRunsById({});
      setTaskRunsError("");
      setTaskError(error instanceof Error ? error.message : "读取真实任务失败");
      return [];
    } finally {
      if (showLoading && loadSeqRef.current === requestId && currentAgentIdRef.current === targetAgentId) {
        setTaskLoading(false);
      }
    }
  }, [clearScheduledRefresh, enabled, gatewayConnected, loadTaskRuns, normalizedAgentId, request]);

  const scheduleFollowUpRefresh = useCallback((jobId: string) => {
    clearScheduledRefresh();
    followUpRefreshTimerRef.current = window.setTimeout(() => {
      if (!gatewayConnectedRef.current || currentAgentIdRef.current !== normalizedAgentId) {
        return;
      }

      void refreshTasks({ keepNotice: true });
      void loadTaskRuns(jobId, { force: true });
    }, 1500);
  }, [clearScheduledRefresh, loadTaskRuns, normalizedAgentId, refreshTasks]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!normalizedAgentId) {
      clearScheduledRefresh();
      setTasks([]);
      setSelectedTaskId(null);
      setTaskRunsById({});
      setTaskRunsLoadingId(null);
      setCronStatus(null);
      setTaskLoading(false);
      setTaskNotice("");
      setTaskRunsError("");
      setTaskError(UNBOUND_AGENT_TASK_ERROR);
      return;
    }

    if (!gatewayConnected) {
      clearScheduledRefresh();
      setTasks([]);
      setSelectedTaskId(null);
      setTaskRunsById({});
      setTaskRunsLoadingId(null);
      setCronStatus(null);
      setTaskLoading(false);
      setTaskNotice("");
      setTaskRunsError("");
      setTaskError("Gateway 未连接，无法读取真实任务");
      return;
    }

    clearTaskStatus();
    void refreshTasks({ showLoading: true });
  }, [clearScheduledRefresh, clearTaskStatus, enabled, gatewayConnected, normalizedAgentId, refreshTasks]);

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

  const toggleTaskEnabled = useCallback(async (job: WorkspaceCronJob) => {
    await runTaskAction(job.id, "toggle", async () => {
      clearTaskStatus();
      await request("cron.update", {
        id: job.id,
        patch: { enabled: !job.enabled },
      });
      setTaskNotice(job.enabled ? "任务已停用" : "任务已启用");
      await refreshTasks({ keepNotice: true });
    }).catch((error) => {
      setTaskError(error instanceof Error ? error.message : "更新任务状态失败");
    });
  }, [clearTaskStatus, refreshTasks, request, runTaskAction]);

  const updateTask = useCallback(async (jobId: string, patch: WorkspaceCronJobPatch) => {
    await runTaskAction(jobId, "save", async () => {
      clearTaskStatus();
      await request("cron.update", {
        id: jobId,
        patch,
      });
      setTaskNotice("任务已保存");
      await refreshTasks({ keepNotice: true });
      await loadTaskRuns(jobId, { force: true });
    }).catch((error) => {
      setTaskError(error instanceof Error ? error.message : "保存任务失败");
      throw error;
    });
  }, [clearTaskStatus, loadTaskRuns, refreshTasks, request, runTaskAction]);

  const deleteTask = useCallback(async (jobId: string) => {
    await runTaskAction(jobId, "delete", async () => {
      clearTaskStatus();
      await request("cron.remove", { id: jobId });
      setTaskNotice("任务已删除");
      setTaskRunsById((current) => {
        const next = { ...current };
        delete next[jobId];
        return next;
      });
      if (selectedTaskIdRef.current === jobId) {
        setSelectedTaskId(null);
      }
      await refreshTasks({ keepNotice: true });
    }).catch((error) => {
      setTaskError(error instanceof Error ? error.message : "删除任务失败");
    });
  }, [clearTaskStatus, refreshTasks, request, runTaskAction]);

  const runTaskNow = useCallback(async (jobId: string) => {
    await runTaskAction(jobId, "run", async () => {
      clearTaskStatus();
      const result = normalizeWorkspaceCronRunResult(
        await request("cron.run", { id: jobId, mode: "force" }),
      );

      if (!result) {
        throw new Error("cron.run 返回格式不正确");
      }

      if (result.ok === false) {
        throw new Error("任务触发失败");
      }

      if ("ran" in result && result.ran === true) {
        setTaskNotice("任务已立即触发");
      } else if ("enqueued" in result && result.enqueued) {
        setTaskNotice("任务已进入执行队列");
      } else if ("reason" in result) {
        setTaskNotice(getRunSkipNotice(result.reason));
      }

      await refreshTasks({ keepNotice: true });
      await loadTaskRuns(jobId, { force: true });
      scheduleFollowUpRefresh(jobId);
    }).catch((error) => {
      setTaskError(error instanceof Error ? error.message : "触发任务失败");
    });
  }, [clearTaskStatus, loadTaskRuns, refreshTasks, request, runTaskAction, scheduleFollowUpRefresh]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? tasks[0] ?? null,
    [selectedTaskId, tasks],
  );

  const selectedTaskRuns = useMemo(
    () => (selectedTask ? taskRunsById[selectedTask.id] ?? [] : []),
    [selectedTask, taskRunsById],
  );

  const enabledTasks = useMemo(() => tasks.filter((task) => task.enabled), [tasks]);
  const disabledTasks = useMemo(() => tasks.filter((task) => !task.enabled), [tasks]);

  return {
    tasks,
    enabledTasks,
    disabledTasks,
    selectedTask,
    selectedTaskId,
    selectedTaskRuns,
    taskRunsById,
    taskLoading,
    taskNotice,
    taskError,
    taskRunsError,
    taskRunsLoading: Boolean(taskRunsLoadingId),
    taskRunsLoadingId,
    taskActionJobId,
    taskActionType,
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
