import { useCallback, useState } from "react";

import type { WorkspaceToolCategory, WorkspaceToolOption } from "../../components/workspace-clone/workspaceCloneTypes";

interface UseWorkspaceToolsAdminOptions {
  agentId: string | null;
}

export function useWorkspaceToolsAdmin(_options: UseWorkspaceToolsAdminOptions) {
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [toolOptions] = useState<WorkspaceToolOption[]>([]);
  const [toolCategory, setToolCategory] = useState<WorkspaceToolCategory>("all");
  const [toolProfileLabel] = useState("全量");
  const [toolDraftIds, setToolDraftIds] = useState<string[]>([]);
  const [toolLoading, setToolLoading] = useState(false);
  const [toolSaving, setToolSaving] = useState(false);
  const [toolNotice, setToolNotice] = useState("");
  const [toolError, setToolError] = useState("");

  const clearToolStatus = useCallback(() => {
    setToolNotice("");
    setToolError("");
  }, []);

  const refreshToolOptions = useCallback(async (_options?: { showLoading?: boolean }) => {
    return;
  }, []);

  const openToolsModal = useCallback(() => {
    setShowToolsModal(true);
    clearToolStatus();
  }, [clearToolStatus]);

  const closeToolsModal = useCallback(() => {
    setShowToolsModal(false);
    setToolLoading(false);
    setToolSaving(false);
    clearToolStatus();
  }, [clearToolStatus]);

  const handleToggleTool = useCallback((toolId: string) => {
    setToolDraftIds((current) =>
      current.includes(toolId)
        ? current.filter((item) => item !== toolId)
        : [...current, toolId],
    );
  }, []);

  const handleSaveTools = useCallback(async () => {
    return;
  }, []);

  return {
    showToolsModal,
    toolOptions,
    toolCategory,
    toolProfileLabel,
    toolDraftIds,
    toolLoading,
    toolSaving,
    toolNotice,
    toolError,
    setToolCategory,
    setToolDraftIds,
    setToolNotice,
    setToolError,
    clearToolStatus,
    refreshToolOptions,
    openToolsModal,
    closeToolsModal,
    handleToggleTool,
    handleSaveTools,
  };
}
