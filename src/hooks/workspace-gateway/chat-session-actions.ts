import type { Dispatch, SetStateAction } from "react";
import { extractAgentIdFromSessionKey } from "./message-normalizers";
import type { WorkspaceGatewayClient } from "./client";
import type { WorkspaceMessage, WorkspaceLiveStep } from "../../components/workspace-clone/workspaceCloneTypes";

export async function abortWorkspaceGatewayMessage(params: {
  client: WorkspaceGatewayClient | null;
  currentGatewaySessionKey: string;
  currentRunId: string | null;
  finishLiveSteps: (status: "aborted") => void;
  removeTransientThinkingBridge: (runId?: string | null) => void;
  setError: Dispatch<SetStateAction<string | null>>;
}) {
  if (!params.client?.connected || !params.currentGatewaySessionKey) {
    return false;
  }

  try {
    await params.client.request("chat.abort", params.currentRunId
      ? { sessionKey: params.currentGatewaySessionKey, runId: params.currentRunId }
      : { sessionKey: params.currentGatewaySessionKey });
    params.removeTransientThinkingBridge(params.currentRunId);
    params.finishLiveSteps("aborted");
    return true;
  } catch (abortError) {
    params.setError(abortError instanceof Error ? abortError.message : String(abortError));
    return false;
  }
}

export async function resetWorkspaceGatewaySession(params: {
  client: WorkspaceGatewayClient | null;
  currentGatewaySessionKey: string;
  currentRunId: string | null;
  currentSessionKey: string;
  selectedAgentId: string;
  ensureTaskRunConversationBound: (sessionKey: string, fallbackAgentId?: string | null) => Promise<string | null>;
  clearActiveRunRefs: () => void;
  clearLocalSessionMessages: (sessionKey: string) => void;
  loadHistory: (sessionKey: string, options?: { agentId?: string; connectionGeneration?: number }) => Promise<void | boolean>;
  loadSessions: () => Promise<unknown>;
  saveSessionHistoryCache: (
    sessionKey: string,
    agentId: string,
    messages: unknown[],
    updatedAt?: number | null,
    title?: string | null,
  ) => Promise<void>;
  updateSessionHistoryCache: (sessionKey: string, messages: unknown[]) => void;
  connectionGeneration: number;
  setActiveRunId: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setLiveSteps: Dispatch<SetStateAction<WorkspaceLiveStep[]>>;
  setPendingUserMessage: Dispatch<SetStateAction<WorkspaceMessage | null>>;
  setResettingSession: Dispatch<SetStateAction<boolean>>;
  setStreamText: Dispatch<SetStateAction<string | null>>;
}) {
  const gatewaySessionKey =
    params.currentGatewaySessionKey
    || await params.ensureTaskRunConversationBound(params.currentSessionKey, params.selectedAgentId);
  if (!params.client?.connected || !gatewaySessionKey) {
    return false;
  }

  params.setResettingSession(true);

  try {
    if (params.currentRunId) {
      await params.client.request("chat.abort", {
        sessionKey: gatewaySessionKey,
        runId: params.currentRunId,
      }).catch(() => undefined);
    }

    await params.client.request("sessions.reset", { key: gatewaySessionKey });
    params.setActiveRunId(null);
    params.setPendingUserMessage(null);
    params.setStreamText(null);
    params.clearActiveRunRefs();
    params.setLiveSteps([]);
    params.clearLocalSessionMessages(gatewaySessionKey);
    params.updateSessionHistoryCache(gatewaySessionKey, []);
    await params.saveSessionHistoryCache(
      gatewaySessionKey,
      extractAgentIdFromSessionKey(gatewaySessionKey) || params.selectedAgentId,
      [],
      null,
      null,
    ).catch(() => undefined);
    await Promise.all([
      params.loadSessions(),
      params.loadHistory(params.currentSessionKey, {
        agentId: params.selectedAgentId,
        connectionGeneration: params.connectionGeneration,
      }),
    ]);
    return true;
  } catch (resetError) {
    params.setError(resetError instanceof Error ? resetError.message : String(resetError));
    return false;
  } finally {
    params.setResettingSession(false);
  }
}
