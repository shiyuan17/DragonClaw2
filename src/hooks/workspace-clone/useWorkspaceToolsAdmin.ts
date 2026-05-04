import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import {
  buildToolOptions,
  buildToolSummaryItems,
  getWorkspaceToolProfileLabel,
  normalizeWorkspaceStringList,
} from "../../components/workspace-clone/workspaceCloneAgentResources";
import type {
  WorkspaceAgentToolConfig,
  WorkspaceToolCategory,
  WorkspaceToolOption,
} from "../../components/workspace-clone/workspaceCloneTypes";

interface UseWorkspaceToolsAdminOptions {
  agentId: string | null;
}

export function useWorkspaceToolsAdmin({ agentId }: UseWorkspaceToolsAdminOptions) {
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [toolOptions, setToolOptions] = useState<WorkspaceToolOption[]>([]);
  const [toolCategory, setToolCategory] = useState<WorkspaceToolCategory>("all");
  const [toolProfileLabel, setToolProfileLabel] = useState("全量");
  const [toolDraftIds, setToolDraftIds] = useState<string[]>([]);
  const [toolLoading, setToolLoading] = useState(false);
  const [toolSaving, setToolSaving] = useState(false);
  const [toolNotice, setToolNotice] = useState("");
  const [toolError, setToolError] = useState("");
  const currentAgentIdRef = useRef<string | null>(null);
  const toolLoadSeqRef = useRef(0);

  useEffect(() => {
    currentAgentIdRef.current = agentId;
  }, [agentId]);

  const clearToolStatus = useCallback(() => {
    setToolNotice("");
    setToolError("");
  }, []);

  useEffect(() => {
    setToolCategory("all");
    clearToolStatus();
  }, [agentId, clearToolStatus]);

  const selectedToolOptions = useMemo(
    () => toolOptions.map((item) => ({
      ...item,
      selected: toolDraftIds.includes(item.id),
    })),
    [toolDraftIds, toolOptions],
  );

  const toolResourceItems = useMemo(
    () => buildToolSummaryItems(selectedToolOptions),
    [selectedToolOptions],
  );

  const refreshToolOptions = useCallback(async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? false;
    if (!agentId) {
      setToolOptions([]);
      setToolProfileLabel("全量");
      setToolDraftIds([]);
      return;
    }

    if (showLoading) {
      setToolLoading(true);
    }

    const targetAgentId = agentId;
    const requestId = toolLoadSeqRef.current + 1;
    toolLoadSeqRef.current = requestId;

    try {
      const config = await invoke<WorkspaceAgentToolConfig>("get_agent_tool_config", {
        agentId: targetAgentId,
      });
      if (toolLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
        return;
      }
      const nextOptions = buildToolOptions(config);
      setToolOptions(nextOptions);
      setToolProfileLabel(getWorkspaceToolProfileLabel(config));
      setToolDraftIds(nextOptions.filter((item) => item.selected).map((item) => item.id));
      setToolError("");
    } catch (toolLoadError) {
      if (toolLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
        return;
      }
      setToolError(toolLoadError instanceof Error ? toolLoadError.message : "读取工具权限失败");
      setToolOptions([]);
      setToolProfileLabel("全量");
      setToolDraftIds([]);
    } finally {
      if (showLoading && toolLoadSeqRef.current === requestId && currentAgentIdRef.current === targetAgentId) {
        setToolLoading(false);
      }
    }
  }, [agentId]);

  const openToolsModal = useCallback(() => {
    setShowToolsModal(true);
    clearToolStatus();
    void refreshToolOptions({ showLoading: true });
  }, [clearToolStatus, refreshToolOptions]);

  const closeToolsModal = useCallback(() => {
    toolLoadSeqRef.current += 1;
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

  const handleSelectAllTools = useCallback(() => {
    setToolDraftIds(toolOptions.map((item) => item.id));
  }, [toolOptions]);

  const handleClearTools = useCallback(() => {
    setToolDraftIds([]);
  }, []);

  const handleSaveTools = useCallback(async () => {
    if (!agentId) {
      setToolError("当前未选中 Agent");
      return;
    }

    clearToolStatus();
    setToolSaving(true);

    try {
      await invoke<WorkspaceAgentToolConfig>("save_agent_tool_config", {
        agentId,
        selectedToolNames: normalizeWorkspaceStringList(toolDraftIds),
      });
      setToolNotice("工具权限已保存，下一条消息会按新权限执行。");
      await refreshToolOptions();
    } catch (saveError) {
      setToolError(saveError instanceof Error ? saveError.message : "保存工具权限失败");
    } finally {
      setToolSaving(false);
    }
  }, [agentId, clearToolStatus, refreshToolOptions, toolDraftIds]);

  return {
    showToolsModal,
    toolOptions,
    selectedToolOptions,
    toolResourceItems,
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
    handleSelectAllTools,
    handleClearTools,
    handleSaveTools,
  };
}
