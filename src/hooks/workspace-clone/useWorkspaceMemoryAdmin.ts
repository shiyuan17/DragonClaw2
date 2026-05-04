import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WorkspaceMemoryFile } from "../../components/workspace-clone/workspaceCloneTypes";

interface UseWorkspaceMemoryAdminOptions {
  agentId: string | null;
}

export function useWorkspaceMemoryAdmin({ agentId }: UseWorkspaceMemoryAdminOptions) {
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [memoryFiles, setMemoryFiles] = useState<WorkspaceMemoryFile[]>([]);
  const [selectedMemoryFileId, setSelectedMemoryFileId] = useState("agents.md");
  const [memoryDraftContent, setMemoryDraftContent] = useState("");
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memorySaving, setMemorySaving] = useState(false);
  const [memoryNotice, setMemoryNotice] = useState("");
  const [memoryError, setMemoryError] = useState("");
  const currentAgentIdRef = useRef<string | null>(null);
  const memoryLoadSeqRef = useRef(0);

  useEffect(() => {
    currentAgentIdRef.current = agentId;
  }, [agentId]);

  const activeMemoryFile = useMemo(
    () => memoryFiles.find((file) => file.id === selectedMemoryFileId) ?? memoryFiles[0] ?? null,
    [memoryFiles, selectedMemoryFileId],
  );

  const clearMemoryStatus = useCallback(() => {
    setMemoryNotice("");
    setMemoryError("");
  }, []);

  const refreshMemoryFiles = useCallback(async (options?: {
    showLoading?: boolean;
    preferredId?: string;
  }) => {
    const showLoading = options?.showLoading ?? false;
    const preferredId = options?.preferredId;

    if (!agentId) {
      setMemoryFiles([]);
      setSelectedMemoryFileId("");
      setMemoryDraftContent("");
      return;
    }

    if (showLoading) {
      setMemoryLoading(true);
    }

    const targetAgentId = agentId;
    const requestId = memoryLoadSeqRef.current + 1;
    memoryLoadSeqRef.current = requestId;

    try {
      const memoryModule = await import("../../components/workspace-clone/workspaceCloneMemory");
      const snapshot = await memoryModule.loadWorkspaceMemorySnapshot(targetAgentId);
      if (memoryLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
        return;
      }
      const nextFiles = snapshot.items.length > 0
        ? snapshot.items.map((item) => memoryModule.normalizeWorkspaceMemoryFile(item))
        : memoryModule.createWorkspaceFallbackMemoryFiles();
      const nextSelectedId =
        preferredId && nextFiles.some((file) => file.id === preferredId)
          ? preferredId
          : nextFiles.some((file) => file.id === selectedMemoryFileId)
            ? selectedMemoryFileId
            : nextFiles[0]?.id || "";
      const nextActiveFile = nextFiles.find((file) => file.id === nextSelectedId) ?? nextFiles[0] ?? null;

      setMemoryFiles(nextFiles);
      setSelectedMemoryFileId(nextSelectedId);
      setMemoryDraftContent(nextActiveFile?.content || "");
      setMemoryError("");
    } catch (memoryLoadError) {
      if (memoryLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
        return;
      }
      setMemoryError(memoryLoadError instanceof Error ? memoryLoadError.message : "读取记忆文件失败");
      if (memoryFiles.length === 0) {
        const memoryModule = await import("../../components/workspace-clone/workspaceCloneMemory");
        const fallbackFiles = memoryModule.createWorkspaceFallbackMemoryFiles();
        setMemoryFiles(fallbackFiles);
        setSelectedMemoryFileId(fallbackFiles[0]?.id || "");
        setMemoryDraftContent(fallbackFiles[0]?.content || "");
      }
    } finally {
      if (showLoading && memoryLoadSeqRef.current === requestId && currentAgentIdRef.current === targetAgentId) {
        setMemoryLoading(false);
      }
    }
  }, [agentId, memoryFiles.length, selectedMemoryFileId]);

  const openMemoryModal = useCallback(() => {
    setShowMemoryModal(true);
    clearMemoryStatus();
    void refreshMemoryFiles({
      showLoading: true,
      preferredId: selectedMemoryFileId || undefined,
    });
  }, [clearMemoryStatus, refreshMemoryFiles, selectedMemoryFileId]);

  const closeMemoryModal = useCallback(() => {
    memoryLoadSeqRef.current += 1;
    setShowMemoryModal(false);
    setMemoryLoading(false);
    setMemorySaving(false);
    clearMemoryStatus();
  }, [clearMemoryStatus]);

  const handleSelectMemoryFile = useCallback((fileId: string) => {
    setSelectedMemoryFileId(fileId);
    const nextFile = memoryFiles.find((file) => file.id === fileId);
    setMemoryDraftContent(nextFile?.content || "");
  }, [memoryFiles]);

  const handleSaveMemoryFile = useCallback(async () => {
    if (!activeMemoryFile || !agentId) {
      setMemoryError("请先选择一个记忆文件");
      return;
    }

    clearMemoryStatus();
    setMemorySaving(true);

    try {
      const memoryModule = await import("../../components/workspace-clone/workspaceCloneMemory");
      await memoryModule.saveWorkspaceMemoryFile({
        sourcePath: activeMemoryFile.sourcePath,
        content: memoryDraftContent,
        agentId: agentId,
      });
      setMemoryNotice(`记忆文件已保存：${activeMemoryFile.displayName}`);
      await refreshMemoryFiles({ preferredId: activeMemoryFile.id });
    } catch (memorySaveError) {
      setMemoryError(memorySaveError instanceof Error ? memorySaveError.message : "保存记忆文件失败");
    } finally {
      setMemorySaving(false);
    }
  }, [activeMemoryFile, clearMemoryStatus, agentId, memoryDraftContent, refreshMemoryFiles]);

  return {
    showMemoryModal,
    memoryFiles,
    selectedMemoryFileId,
    memoryDraftContent,
    memoryLoading,
    memorySaving,
    memoryNotice,
    memoryError,
    setMemoryDraftContent,
    setMemoryNotice,
    setMemoryError,
    clearMemoryStatus,
    refreshMemoryFiles,
    openMemoryModal,
    closeMemoryModal,
    handleSelectMemoryFile,
    handleSaveMemoryFile,
    activeMemoryFile,
  };
}
