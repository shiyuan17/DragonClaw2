import { useCallback } from "react";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { WorkspaceManualTaskExecutionContent } from "../../components/workspace-clone/workspaceCloneManualTaskExecution";
import type { WorkspaceLiveStep, WorkspaceMessage } from "../../components/workspace-clone/workspaceCloneTypes";
import type { WorkspaceGatewaySessionsListResult } from "../../components/workspace-clone/workspaceCloneTypes";
import type { WorkspaceGatewayClient } from "./client";
import { createWorkspaceSession } from "./session-creation";

export function useWorkspaceManualSessionExecution(params: {
  clientRef: MutableRefObject<WorkspaceGatewayClient | null>;
  selectedAgentId: string;
  selectedAgentIdRef: MutableRefObject<string>;
  currentGatewaySessionKey: string;
  currentSessionKeyRef: MutableRefObject<string>;
  sessionsResult: WorkspaceGatewaySessionsListResult | null;
  loadSessions: () => Promise<WorkspaceGatewaySessionsListResult | null>;
  clearActiveRunRefs: () => void;
  appendLocalSessionSystemMessage: (sessionKey: string, text: string) => void;
  sendMessage: (
    value: string,
    options?: {
      targetSessionKey?: string | null;
      targetAgentId?: string | null;
      preserveSessionSwitch?: boolean;
      displayText?: string;
      transportText?: string;
    },
  ) => Promise<boolean>;
  setSelectedAgentId: Dispatch<SetStateAction<string>>;
  setSelectedSessionKey: Dispatch<SetStateAction<string>>;
  setPendingUserMessage: Dispatch<SetStateAction<WorkspaceMessage | null>>;
  setStreamText: Dispatch<SetStateAction<string | null>>;
  setActiveRunId: Dispatch<SetStateAction<string | null>>;
  setLiveSteps: Dispatch<SetStateAction<WorkspaceLiveStep[]>>;
  setResettingSession: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
}) {
  const createNewSession = useCallback(async (options?: { agentId?: string | null; parentSessionKey?: string | null }) => {
    const client = params.clientRef.current;
    const agentId = options?.agentId?.trim() || params.selectedAgentIdRef.current || params.selectedAgentId;
    if (!client?.connected || !agentId) {
      return null;
    }

    params.setResettingSession(true);
    try {
      const createdKey = await createWorkspaceSession({
        client,
        agentId,
        preferredParentSessionKey: options?.parentSessionKey,
        currentSessionKey: params.currentGatewaySessionKey || params.currentSessionKeyRef.current,
        sessionsResult: params.sessionsResult,
        loadSessions: params.loadSessions,
      });
      params.setPendingUserMessage(null);
      params.setStreamText(null);
      params.setActiveRunId(null);
      params.clearActiveRunRefs();
      params.setLiveSteps([]);
      params.setSelectedAgentId(agentId);
      params.setSelectedSessionKey(createdKey);
      return createdKey;
    } catch (createError) {
      params.setError(createError instanceof Error ? createError.message : String(createError));
      return null;
    } finally {
      params.setResettingSession(false);
    }
  }, [params]);

  const runTaskInNewChat = useCallback(async (task: {
    agentId: string;
    content: WorkspaceManualTaskExecutionContent;
    parentSessionKey?: string | null;
  }) => {
    const sessionKey = await createNewSession({ agentId: task.agentId, parentSessionKey: task.parentSessionKey });
    if (!sessionKey) {
      return false;
    }

    params.appendLocalSessionSystemMessage(sessionKey, `正在执行任务：${task.content.displayTitle}`);
    return params.sendMessage(task.content.displayMessage, {
      targetSessionKey: sessionKey,
      targetAgentId: task.agentId,
      preserveSessionSwitch: true,
      displayText: task.content.displayMessage,
      transportText: task.content.transportMessage,
    });
  }, [createNewSession, params]);

  return {
    createNewSession,
    runTaskInNewChat,
  };
}
