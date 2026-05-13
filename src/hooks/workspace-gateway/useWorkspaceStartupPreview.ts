import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkspaceGatewaySessionsListResult } from "../../components/workspace-clone/workspaceCloneTypes";
import {
  isWorkspaceStartupPreviewActive,
  resolveWorkspaceStartupPreviewDisplaySessionKey,
  resolveWorkspaceStartupPreviewState,
  type WorkspaceStartupPreviewState,
} from "./startup-preview";

interface UseWorkspaceStartupPreviewParams {
  selectedAgentId: string;
  selectedSessionKey: string;
  sessionsResult: WorkspaceGatewaySessionsListResult | null;
}

export function useWorkspaceStartupPreview({
  selectedAgentId,
  selectedSessionKey,
  sessionsResult,
}: UseWorkspaceStartupPreviewParams) {
  const [startupPreviewState, setStartupPreviewState] = useState<WorkspaceStartupPreviewState | null>(null);
  const clearStartupPreview = useCallback(() => {
    setStartupPreviewState(null);
  }, []);
  const startupPreviewActive = useMemo(
    () => isWorkspaceStartupPreviewActive(startupPreviewState, selectedAgentId, selectedSessionKey),
    [selectedAgentId, selectedSessionKey, startupPreviewState],
  );
  const startupPreviewDisplaySessionKey = useMemo(
    () => resolveWorkspaceStartupPreviewDisplaySessionKey(startupPreviewState, selectedAgentId, selectedSessionKey),
    [selectedAgentId, selectedSessionKey, startupPreviewState],
  );

  useEffect(() => {
    if (!startupPreviewState) {
      return;
    }

    const nextPreviewState = resolveWorkspaceStartupPreviewState(sessionsResult, startupPreviewState.agentId);
    if (startupPreviewActive && nextPreviewState && nextPreviewState.previewSessionKey !== startupPreviewState.previewSessionKey) {
      setStartupPreviewState(nextPreviewState);
      return;
    }
    if (!nextPreviewState || !startupPreviewActive) {
      clearStartupPreview();
    }
  }, [clearStartupPreview, sessionsResult, startupPreviewActive, startupPreviewState]);

  return {
    startupPreviewState,
    setStartupPreviewState,
    clearStartupPreview,
    startupPreviewActive,
    startupPreviewDisplaySessionKey,
  };
}
