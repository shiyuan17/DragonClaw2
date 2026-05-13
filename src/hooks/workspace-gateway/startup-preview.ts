import type { WorkspaceGatewaySessionsListResult } from "../../components/workspace-clone/workspaceCloneTypes";
import { createAgentSessionKey, filterAgentSessions } from "./client";
import { sortSessionsByUpdatedAt } from "./session-cache";

export interface WorkspaceStartupPreviewState {
  agentId: string;
  mainSessionKey: string;
  previewSessionKey: string;
}

export function resolveWorkspaceStartupPreviewState(
  result: WorkspaceGatewaySessionsListResult | null,
  agentId: string,
): WorkspaceStartupPreviewState | null {
  const normalizedAgentId = agentId.trim();
  if (!normalizedAgentId) {
    return null;
  }

  const mainSessionKey = createAgentSessionKey(normalizedAgentId);
  const sessions = sortSessionsByUpdatedAt(filterAgentSessions(result, normalizedAgentId));
  const latestNonMainSession = sessions.find((session) => session.key !== mainSessionKey) ?? null;
  if (!latestNonMainSession) {
    return null;
  }

  const mainSession = sessions.find((session) => session.key === mainSessionKey) ?? null;
  const latestNonMainUpdatedAt = latestNonMainSession.updatedAt ?? 0;
  const mainUpdatedAt = mainSession?.updatedAt ?? 0;
  if (latestNonMainUpdatedAt <= mainUpdatedAt) {
    return null;
  }

  return {
    agentId: normalizedAgentId,
    mainSessionKey,
    previewSessionKey: latestNonMainSession.key,
  };
}

export function isWorkspaceStartupPreviewActive(
  previewState: WorkspaceStartupPreviewState | null,
  selectedAgentId: string,
  selectedSessionKey: string,
) {
  return Boolean(
    previewState
    && previewState.agentId === selectedAgentId
    && previewState.mainSessionKey === selectedSessionKey,
  );
}

export function resolveWorkspaceStartupPreviewDisplaySessionKey(
  previewState: WorkspaceStartupPreviewState | null,
  selectedAgentId: string,
  selectedSessionKey: string,
) {
  if (!isWorkspaceStartupPreviewActive(previewState, selectedAgentId, selectedSessionKey)) {
    return selectedSessionKey;
  }

  return (previewState as WorkspaceStartupPreviewState).previewSessionKey;
}
