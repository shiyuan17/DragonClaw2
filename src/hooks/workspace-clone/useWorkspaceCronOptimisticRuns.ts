import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WorkspaceCronJob, WorkspaceCronRunRecord } from "../../components/workspace-clone/workspaceCloneTypes";
import {
  buildRunRecordTimestamp,
  OPTIMISTIC_RUN_INDICATOR_TIMEOUT_MS,
  resolveNewRunRecord,
} from "./workspaceCronTaskRunHelpers";

export interface WorkspaceOptimisticRunState {
  previousTopSignature: string;
  previousLatestTimestamp: number;
}

export function useWorkspaceCronOptimisticRuns(agentId: string | null) {
  const [optimisticRunningById, setOptimisticRunningById] = useState<Record<string, WorkspaceOptimisticRunState>>({});
  const optimisticRunningByIdRef = useRef(optimisticRunningById);
  const optimisticRunTimeoutsRef = useRef<Record<string, number>>({});
  const optimisticRunningTaskIds = useMemo(
    () => Object.keys(optimisticRunningById),
    [optimisticRunningById],
  );

  useEffect(() => {
    optimisticRunningByIdRef.current = optimisticRunningById;
  }, [optimisticRunningById]);

  const clearOptimisticRunState = useCallback((jobId: string) => {
    const timeoutId = optimisticRunTimeoutsRef.current[jobId];
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      delete optimisticRunTimeoutsRef.current[jobId];
    }

    if (optimisticRunningByIdRef.current[jobId]) {
      const next = { ...optimisticRunningByIdRef.current };
      delete next[jobId];
      optimisticRunningByIdRef.current = next;
    }

    setOptimisticRunningById((current) => {
      if (!current[jobId]) {
        return current;
      }

      const next = { ...current };
      delete next[jobId];
      return next;
    });
  }, []);

  const clearAllOptimisticRunStates = useCallback(() => {
    Object.values(optimisticRunTimeoutsRef.current).forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    optimisticRunTimeoutsRef.current = {};
    optimisticRunningByIdRef.current = {};
    setOptimisticRunningById({});
  }, []);

  const markOptimisticRunState = useCallback((jobId: string, state: WorkspaceOptimisticRunState) => {
    const previousTimeoutId = optimisticRunTimeoutsRef.current[jobId];
    if (previousTimeoutId !== undefined) {
      window.clearTimeout(previousTimeoutId);
    }

    optimisticRunTimeoutsRef.current[jobId] = window.setTimeout(() => {
      delete optimisticRunTimeoutsRef.current[jobId];
      if (optimisticRunningByIdRef.current[jobId]) {
        const next = { ...optimisticRunningByIdRef.current };
        delete next[jobId];
        optimisticRunningByIdRef.current = next;
      }
      setOptimisticRunningById((current) => {
        if (!current[jobId]) {
          return current;
        }

        const next = { ...current };
        delete next[jobId];
        return next;
      });
    }, OPTIMISTIC_RUN_INDICATOR_TIMEOUT_MS);

    optimisticRunningByIdRef.current = {
      ...optimisticRunningByIdRef.current,
      [jobId]: state,
    };
    setOptimisticRunningById((current) => ({
      ...current,
      [jobId]: state,
    }));
  }, []);

  const reconcileOptimisticRunStateWithEntries = useCallback((jobId: string, entries: WorkspaceCronRunRecord[]) => {
    const optimisticState = optimisticRunningByIdRef.current[jobId];
    if (!optimisticState) {
      return;
    }

    const latestResolvedRun = resolveNewRunRecord(
      entries,
      optimisticState.previousTopSignature,
      optimisticState.previousLatestTimestamp,
    );

    if (latestResolvedRun || entries.some((entry) => buildRunRecordTimestamp(entry) > optimisticState.previousLatestTimestamp)) {
      clearOptimisticRunState(jobId);
    }
  }, [clearOptimisticRunState]);

  const reconcileOptimisticRunStateWithTasks = useCallback((tasks: WorkspaceCronJob[]) => {
    Object.entries(optimisticRunningByIdRef.current).forEach(([jobId, optimisticState]) => {
      const matchingTask = tasks.find((job) => job.id === jobId);
      if (!matchingTask) {
        clearOptimisticRunState(jobId);
        return;
      }

      if (
        typeof matchingTask.state.runningAtMs === "number" ||
        (typeof matchingTask.state.lastRunAtMs === "number" && matchingTask.state.lastRunAtMs > optimisticState.previousLatestTimestamp)
      ) {
        clearOptimisticRunState(jobId);
      }
    });
  }, [clearOptimisticRunState]);

  useEffect(() => clearAllOptimisticRunStates, [clearAllOptimisticRunStates]);

  useEffect(() => {
    clearAllOptimisticRunStates();
  }, [agentId, clearAllOptimisticRunStates]);

  return useMemo(() => ({
    optimisticRunningTaskIds,
    clearOptimisticRunState,
    clearAllOptimisticRunStates,
    markOptimisticRunState,
    reconcileOptimisticRunStateWithEntries,
    reconcileOptimisticRunStateWithTasks,
  }), [
    clearAllOptimisticRunStates,
    clearOptimisticRunState,
    markOptimisticRunState,
    optimisticRunningTaskIds,
    reconcileOptimisticRunStateWithEntries,
    reconcileOptimisticRunStateWithTasks,
  ]);
}
