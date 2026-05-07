import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type {
  WorkspaceGatewaySessionsListResult,
  WorkspaceLiveStep,
  WorkspaceMessage,
} from "../../components/workspace-clone/workspaceCloneTypes";
import type { WorkspaceLiveStepDedupeEntry } from "./live-steps";
import { extractAgentIdFromSessionKey, resolveAgentSessionKey } from "./message-normalizers";
import type { WorkspaceTaskRunSession } from "./task-run-sessions";
import { formatClockTime } from "./time-formatters";

interface WorkspaceActiveRunRefs {
  currentRunIdRef: MutableRefObject<string | null>;
  activeRunAliasesRef: MutableRefObject<Set<string>>;
  liveStepDedupeRef: MutableRefObject<Map<string, WorkspaceLiveStepDedupeEntry>>;
  hasObservedNonThinkingStepRef: MutableRefObject<boolean>;
  hasAssistantTextDeltaRef: MutableRefObject<boolean>;
}

interface WorkspaceActiveRunSetters {
  setSelectedSessionKey: Dispatch<SetStateAction<string>>;
  setPendingUserMessage: Dispatch<SetStateAction<WorkspaceMessage | null>>;
  setStreamText: Dispatch<SetStateAction<string | null>>;
  setActiveRunId: Dispatch<SetStateAction<string | null>>;
  setLiveSteps: Dispatch<SetStateAction<WorkspaceLiveStep[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
}

export function clearWorkspaceActiveRunRefs(refs: WorkspaceActiveRunRefs) {
  refs.currentRunIdRef.current = null;
  refs.activeRunAliasesRef.current.clear();
  refs.liveStepDedupeRef.current.clear();
  refs.hasObservedNonThinkingStepRef.current = false;
  refs.hasAssistantTextDeltaRef.current = false;
}

export function initializeWorkspaceActiveRun(params: {
  runId: string;
  sessionKey?: string;
  pendingUserMessage?: WorkspaceMessage | null;
  refs: WorkspaceActiveRunRefs;
  setters: WorkspaceActiveRunSetters;
}) {
  clearWorkspaceActiveRunRefs(params.refs);
  params.refs.currentRunIdRef.current = params.runId;
  params.refs.activeRunAliasesRef.current = new Set([params.runId]);
  if (params.sessionKey) params.setters.setSelectedSessionKey(params.sessionKey);
  params.setters.setPendingUserMessage(params.pendingUserMessage ?? null);
  params.setters.setStreamText("");
  params.setters.setActiveRunId(params.runId);
  params.setters.setLiveSteps([{ id: `${params.runId}:thinking`, kind: "thinking", status: "running", title: "思考中", time: formatClockTime(Date.now()) }]);
  params.setters.setError(null);
}

export function adoptWorkspaceActiveRunSession(params: {
  sessionKey: string;
  fallbackAgentId?: string | null;
  preserveActiveRunSessionSwitch: (sessionKey: string) => void;
  setSelectedAgentId: (agentId: string) => void;
  setSelectedSessionKey: (sessionKey: string) => void;
}) {
  const normalizedSessionKey = params.sessionKey.trim();
  if (!normalizedSessionKey) return false;
  params.preserveActiveRunSessionSwitch(normalizedSessionKey);
  params.setSelectedAgentId(extractAgentIdFromSessionKey(normalizedSessionKey) || params.fallbackAgentId?.trim() || "");
  params.setSelectedSessionKey(normalizedSessionKey);
  return true;
}

export function beginWorkspaceAcceptedRunBridge(params: {
  runId?: string | null;
  sessionKey?: string | null;
  fallbackAgentId?: string | null;
  selectedAgentId: string;
  preserveActiveRunSessionSwitch: (sessionKey: string) => void;
  setSelectedAgentId: (agentId: string) => void;
  setSelectedSessionKey: (sessionKey: string) => void;
  initializeActiveRun: (params: { runId: string; sessionKey?: string; pendingUserMessage: null }) => void;
}) {
  const normalizedRunId = params.runId?.trim() || "";
  const normalizedSessionKey = params.sessionKey?.trim() || "";
  const nextAgentId =
    extractAgentIdFromSessionKey(normalizedSessionKey) ||
    params.fallbackAgentId?.trim() ||
    params.selectedAgentId;

  if (nextAgentId) params.setSelectedAgentId(nextAgentId);
  if (normalizedSessionKey) params.preserveActiveRunSessionSwitch(normalizedSessionKey);
  if (normalizedRunId) {
    params.initializeActiveRun({
      runId: normalizedRunId,
      sessionKey: normalizedSessionKey || undefined,
      pendingUserMessage: null,
    });
    return true;
  }
  if (normalizedSessionKey) {
    params.setSelectedSessionKey(normalizedSessionKey);
    return true;
  }
  return false;
}

export function endWorkspaceActiveRun(params: {
  expectedRunId?: string | null;
  refs: WorkspaceActiveRunRefs;
  setters: Pick<WorkspaceActiveRunSetters, "setPendingUserMessage" | "setStreamText" | "setActiveRunId" | "setLiveSteps">;
  removeTransientThinkingBridge?: (runId?: string | null) => void;
}) {
  if (
    params.expectedRunId &&
    params.expectedRunId !== params.refs.currentRunIdRef.current &&
    !params.refs.activeRunAliasesRef.current.has(params.expectedRunId)
  ) {
    return false;
  }

  const resolvedRunId = params.expectedRunId?.trim() || params.refs.currentRunIdRef.current;
  params.removeTransientThinkingBridge?.(resolvedRunId);
  params.setters.setPendingUserMessage(null);
  params.setters.setStreamText(null);
  params.setters.setActiveRunId(null);
  clearWorkspaceActiveRunRefs(params.refs);
  params.setters.setLiveSteps([]);
  return true;
}

export async function resolveTaskRunBoundSessionKey(params: {
  result: { sessionKey?: string | null; sessionId?: string | null };
  sessionsResult: WorkspaceGatewaySessionsListResult | null;
  loadSessions: () => Promise<WorkspaceGatewaySessionsListResult | null>;
}) {
  const directSessionKey = params.result.sessionKey?.trim() || "";
  let boundSessionKey = directSessionKey;
  if (!boundSessionKey && params.result.sessionId?.trim()) {
    boundSessionKey = params.sessionsResult?.sessions.find((session) => session.sessionId === params.result.sessionId)?.key?.trim() || "";
  }
  if (boundSessionKey) return boundSessionKey;
  const payload = await params.loadSessions().catch(() => null);
  return params.result.sessionId?.trim()
    ? payload?.sessions.find((session) => session.sessionId === params.result.sessionId)?.key?.trim() || ""
    : directSessionKey;
}

export async function bindWorkspaceTaskRunConversationToResult(params: {
  sessionKey: string;
  result: { sessionKey?: string | null; sessionId?: string | null };
  sessionsResult: WorkspaceGatewaySessionsListResult | null;
  loadSessions: () => Promise<WorkspaceGatewaySessionsListResult | null>;
  loadHistory: (sessionKey: string, options?: { agentId?: string; connectionGeneration?: number }) => Promise<void>;
  patchTaskRunSession: (
    sessionKey: string,
    updater: (session: WorkspaceTaskRunSession) => WorkspaceTaskRunSession,
  ) => void;
  resolveTaskRunSession: (sessionKey: string) => WorkspaceTaskRunSession | null;
  connectionGeneration: number;
}) {
  const syntheticSession = params.resolveTaskRunSession(params.sessionKey);
  if (!syntheticSession) {
    return null;
  }

  const boundSessionKey = await resolveTaskRunBoundSessionKey({
    result: params.result,
    sessionsResult: params.sessionsResult,
    loadSessions: params.loadSessions,
  });
  if (!boundSessionKey) {
    return null;
  }

  if (syntheticSession.boundSessionKey === boundSessionKey && syntheticSession.status === "resolved") {
    return boundSessionKey;
  }

  params.patchTaskRunSession(params.sessionKey, (session) => ({
    ...session,
    status: "resolved",
    boundSessionKey,
    updatedAt: Date.now(),
  }));
  void params.loadSessions().catch(() => null);
  await params.loadHistory(params.sessionKey, {
    agentId: syntheticSession.agentId,
    connectionGeneration: params.connectionGeneration,
  });
  return boundSessionKey;
}

export async function ensureWorkspaceTaskRunConversationBound(params: {
  sessionKey: string;
  fallbackAgentId?: string | null;
  selectedAgentId: string;
  sessionsResult: WorkspaceGatewaySessionsListResult | null;
  loadSessions: () => Promise<WorkspaceGatewaySessionsListResult | null>;
  resolveTaskRunSession: (sessionKey: string) => WorkspaceTaskRunSession | null;
  resolveSessionContext: (
    sessionKey: string,
    fallbackAgentId?: string | null,
  ) => { gatewaySessionKey?: string | null };
  bindTaskRunConversationToResult: (
    sessionKey: string,
    result: { sessionKey?: string | null; sessionId?: string | null },
  ) => Promise<string | null>;
}) {
  const syntheticSession = params.resolveTaskRunSession(params.sessionKey);
  if (!syntheticSession) {
    return params.resolveSessionContext(params.sessionKey, params.fallbackAgentId).gatewaySessionKey || null;
  }

  if (syntheticSession.boundSessionKey?.trim()) {
    return syntheticSession.boundSessionKey.trim();
  }

  const agentId =
    syntheticSession.agentId ||
    params.fallbackAgentId?.trim() ||
    params.selectedAgentId;
  let fallbackSessionKey = agentId ? resolveAgentSessionKey(params.sessionsResult, agentId) : "";

  if (!fallbackSessionKey && agentId) {
    const refreshedSessions = await params.loadSessions().catch(() => null);
    fallbackSessionKey = resolveAgentSessionKey(refreshedSessions, agentId);
  }

  if (!fallbackSessionKey) {
    return null;
  }

  await params.bindTaskRunConversationToResult(params.sessionKey, { sessionKey: fallbackSessionKey });
  return fallbackSessionKey;
}

export async function selectWorkspaceResolvedSessionResult(params: {
  result: { sessionKey?: string | null; sessionId?: string | null };
  fallbackAgentId?: string | null;
  runId?: string | null;
  selectedAgentId: string;
  sessionsResult: WorkspaceGatewaySessionsListResult | null;
  loadSessions: () => Promise<WorkspaceGatewaySessionsListResult | null>;
  resolveSessionContext: (
    sessionKey: string,
    fallbackAgentId?: string | null,
  ) => { agentId?: string | null };
  preserveActiveRunSessionSwitch: (sessionKey: string) => void;
  setSelectedAgentId: (agentId: string) => void;
  setSelectedSessionKey: (sessionKey: string) => void;
  isKnownActiveRunId: (runId?: string | null) => boolean;
  initializeActiveRun: (params: { runId: string; pendingUserMessage: null }) => void;
}) {
  const boundSessionKey = await resolveTaskRunBoundSessionKey({
    result: params.result,
    sessionsResult: params.sessionsResult,
    loadSessions: params.loadSessions,
  });
  if (!boundSessionKey) {
    return null;
  }

  const nextAgentId =
    params.resolveSessionContext(boundSessionKey, params.fallbackAgentId).agentId ||
    params.fallbackAgentId?.trim() ||
    params.selectedAgentId;
  if (nextAgentId) {
    params.setSelectedAgentId(nextAgentId);
  }
  params.preserveActiveRunSessionSwitch(boundSessionKey);
  params.setSelectedSessionKey(boundSessionKey);

  const normalizedRunId = params.runId?.trim() || "";
  if (normalizedRunId && !params.isKnownActiveRunId(normalizedRunId)) {
    window.setTimeout(() => {
      params.initializeActiveRun({
        runId: normalizedRunId,
        pendingUserMessage: null,
      });
    }, 0);
  }

  return boundSessionKey;
}
