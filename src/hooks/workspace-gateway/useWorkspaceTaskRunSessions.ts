import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WorkspaceTaskRunSession } from "./task-run-sessions";
import { buildTaskRunSystemMessage, createTaskRunSession, isTaskRunSessionKey } from "./task-run-sessions";
import { extractAgentIdFromSessionKey } from "./message-normalizers";

export function useWorkspaceTaskRunSessions(currentSessionKey: string) {
  const [taskRunSessions, setTaskRunSessions] = useState<Record<string, WorkspaceTaskRunSession>>({});
  const taskRunSessionsRef = useRef<Record<string, WorkspaceTaskRunSession>>({});
  const currentTaskRunSession = useMemo(
    () => (isTaskRunSessionKey(currentSessionKey) ? taskRunSessions[currentSessionKey] ?? null : null),
    [currentSessionKey, taskRunSessions],
  );
  const currentGatewaySessionKey = currentTaskRunSession?.boundSessionKey || (currentTaskRunSession ? "" : currentSessionKey);
  const currentGatewaySessionKeyRef = useRef(currentGatewaySessionKey);

  useEffect(() => {
    taskRunSessionsRef.current = taskRunSessions;
  }, [taskRunSessions]);

  useEffect(() => {
    currentGatewaySessionKeyRef.current = currentGatewaySessionKey;
  }, [currentGatewaySessionKey]);

  const resolveTaskRunSession = useCallback((sessionKey: string) => (
    isTaskRunSessionKey(sessionKey) ? taskRunSessionsRef.current[sessionKey] ?? null : null
  ), []);

  const patchTaskRunSession = useCallback((
    sessionKey: string,
    updater: (session: WorkspaceTaskRunSession) => WorkspaceTaskRunSession,
  ) => {
    setTaskRunSessions((current) => {
      const target = current[sessionKey];
      if (!target) {
        return current;
      }

      const nextSession = updater(target);
      if (nextSession === target) {
        return current;
      }

      return {
        ...current,
        [sessionKey]: nextSession,
      };
    });
  }, []);

  const createTaskRunConversation = useCallback((params: {
    agentId: string;
    taskId: string;
    taskName: string;
    taskDisplayTitle: string;
    initialMessage: string;
    onSelect: (agentId: string, sessionKey: string) => void;
  }) => {
    const session = createTaskRunSession(params);
    setTaskRunSessions((current) => ({
      ...current,
      [session.key]: session,
    }));
    params.onSelect(params.agentId, session.key);
    return session.key;
  }, []);

  const setTaskRunConversationStatus = useCallback((
    sessionKey: string,
    status: WorkspaceTaskRunSession["status"],
    message: string,
  ) => {
    patchTaskRunSession(sessionKey, (session) => ({
      ...session,
      status,
      updatedAt: Date.now(),
      systemMessages: [buildTaskRunSystemMessage(message)],
    }));
  }, [patchTaskRunSession]);

  const resolveSessionContext = useCallback((sessionKey: string, fallbackAgentId?: string | null) => {
    const taskRunSession = resolveTaskRunSession(sessionKey);
    const gatewaySessionKey = taskRunSession?.boundSessionKey?.trim() || (taskRunSession ? "" : sessionKey);
    return {
      displaySessionKey: sessionKey,
      gatewaySessionKey,
      taskRunSession,
      agentId: taskRunSession?.agentId || extractAgentIdFromSessionKey(gatewaySessionKey) || fallbackAgentId?.trim() || "",
    };
  }, [resolveTaskRunSession]);

  return {
    taskRunSessions,
    currentTaskRunSession,
    currentGatewaySessionKey,
    currentGatewaySessionKeyRef,
    resolveTaskRunSession,
    patchTaskRunSession,
    createTaskRunConversation,
    setTaskRunConversationStatus,
    resolveSessionContext,
  };
}
