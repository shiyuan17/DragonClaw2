import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type {
  WorkspaceGatewaySessionsListResult,
  WorkspaceLiveStep,
  WorkspaceMessage,
} from "../../components/workspace-clone/workspaceCloneTypes";
import type { WorkspaceLiveStepDedupeEntry } from "./live-steps";
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
