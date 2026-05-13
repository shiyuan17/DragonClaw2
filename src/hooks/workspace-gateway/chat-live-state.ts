import { formatAgentAvatar } from "./client";
import { buildPostToolThinkingStep, getPostToolThinkingStepId, updateLiveStepList } from "./live-steps";
import { extractAgentIdFromSessionKey } from "./message-normalizers";
import type { WorkspaceGatewayAgentRow, WorkspaceLiveStep, WorkspaceLiveStepStatus } from "../../components/workspace-clone/workspaceCloneTypes";

export function resolveWorkspaceAssistantAuthor(params: {
  agents: WorkspaceGatewayAgentRow[];
  selectedAgent: WorkspaceGatewayAgentRow | null;
  sessionKey?: string | null;
}) {
  if (params.sessionKey) {
    const agentId = extractAgentIdFromSessionKey(params.sessionKey);
    const match = agentId ? params.agents.find((agent) => agent.id === agentId) : null;
    if (match) {
      return formatAgentAvatar(match);
    }
  }
  return params.selectedAgent ? formatAgentAvatar(params.selectedAgent) : "A";
}

export function applyWorkspaceLiveStepUpdate(params: {
  current: WorkspaceLiveStep[];
  step: WorkspaceLiveStep;
  hasAssistantTextDelta: boolean;
  hasObservedNonThinkingStep: boolean;
  options?: {
    insertPostToolThinking?: boolean;
    bridgeRunId?: string;
    bridgeTimestamp?: number | null;
  };
}) {
  const next = updateLiveStepList(params.current, params.step);
  if (
    !params.options?.insertPostToolThinking
    || !params.options.bridgeRunId
    || params.hasAssistantTextDelta
    || !params.hasObservedNonThinkingStep
  ) {
    return next;
  }
  return updateLiveStepList(next, buildPostToolThinkingStep(params.options.bridgeRunId, params.options.bridgeTimestamp));
}

export function removeWorkspaceTransientThinkingBridge(current: WorkspaceLiveStep[], runId?: string | null) {
  if (!runId) {
    return current;
  }
  return current.filter((step) => step.id !== getPostToolThinkingStepId(runId));
}

export function finishWorkspaceLiveSteps(current: WorkspaceLiveStep[], status: WorkspaceLiveStepStatus) {
  return current.map((step) => (
    step.status === "running" || step.status === "pending"
      ? { ...step, status }
      : step
  ));
}
