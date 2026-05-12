import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  KnowledgeBaseRecord,
  KnowledgeBaseRoot,
  KnowledgeBaseTreeSnapshot,
  KnowledgeEditorMode,
  KnowledgeFileContent,
  KnowledgeTreeNode,
  UpsertKnowledgeBasePayload,
} from "../../types";

type SelectedKnowledgeFileRef = {
  rootId: string;
  relativePath: string;
} | null;

interface SaveSelectedFileOptions {
  silent?: boolean;
  reloadFile?: boolean;
  refreshTree?: boolean;
}

function buildRootInput(root: KnowledgeBaseRoot) {
  return {
    id: root.id,
    name: root.name,
    path: root.path,
  };
}

function flattenTreeFiles(nodes: KnowledgeTreeNode[]): Array<{ relativePath: string }> {
  const files: Array<{ relativePath: string }> = [];

  const visit = (entries: KnowledgeTreeNode[]) => {
    entries.forEach((entry) => {
      if (entry.nodeType === "file") {
        files.push({ relativePath: entry.relativePath });
        return;
      }
      if (entry.children.length > 0) {
        visit(entry.children);
      }
    });
  };

  visit(nodes);
  return files;
}

function hasTreePath(snapshot: KnowledgeBaseTreeSnapshot, target: SelectedKnowledgeFileRef) {
  if (!target) {
    return false;
  }

  return snapshot.roots.some((root) => {
    if (root.id !== target.rootId) {
      return false;
    }
    return flattenTreeFiles(root.children).some((file) => file.relativePath === target.relativePath);
  });
}

export function useWorkspaceKnowledgeBase() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseRecord[]>([]);
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState("");
  const [treeSnapshot, setTreeSnapshot] = useState<KnowledgeBaseTreeSnapshot | null>(null);
  const [selectedFileRef, setSelectedFileRef] = useState<SelectedKnowledgeFileRef>(null);
  const [selectedFile, setSelectedFile] = useState<KnowledgeFileContent | null>(null);
  const [editorMode, setEditorMode] = useState<KnowledgeEditorMode>("preview");
  const [loading, setLoading] = useState(false);
  const [treeLoading, setTreeLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selectedKnowledgeBase = useMemo(
    () => knowledgeBases.find((item) => item.id === selectedKnowledgeBaseId) ?? null,
    [knowledgeBases, selectedKnowledgeBaseId],
  );

  const refreshKnowledgeBases = useCallback(async (preferredId?: string | null) => {
    setLoading(true);
    setError("");
    try {
      const nextKnowledgeBases = await invoke<KnowledgeBaseRecord[]>("list_knowledge_bases");
      setKnowledgeBases(nextKnowledgeBases);

      const preferred = preferredId?.trim() || "";
      const nextSelectedId = preferred && nextKnowledgeBases.some((item) => item.id === preferred)
        ? preferred
        : selectedKnowledgeBaseId && nextKnowledgeBases.some((item) => item.id === selectedKnowledgeBaseId)
          ? selectedKnowledgeBaseId
          : "";
      setSelectedKnowledgeBaseId(nextSelectedId);
      return nextKnowledgeBases;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      return [];
    } finally {
      setLoading(false);
    }
  }, [selectedKnowledgeBaseId]);

  const refreshTree = useCallback(async (knowledgeBaseId?: string | null) => {
    const targetId = knowledgeBaseId?.trim() || selectedKnowledgeBaseId;
    if (!targetId) {
      setTreeSnapshot(null);
      setSelectedFileRef(null);
      setSelectedFile(null);
      setEditorMode("preview");
      return null;
    }

    setTreeLoading(true);
    setError("");
    try {
      const nextSnapshot = await invoke<KnowledgeBaseTreeSnapshot>("load_knowledge_base_tree", { id: targetId });
      setTreeSnapshot(nextSnapshot);

      if (selectedFileRef && !hasTreePath(nextSnapshot, selectedFileRef)) {
        setSelectedFileRef(null);
        setSelectedFile(null);
        setEditorMode("preview");
      }

      return nextSnapshot;
    } catch (nextError) {
      setTreeSnapshot(null);
      setSelectedFileRef(null);
      setSelectedFile(null);
      setEditorMode("preview");
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      return null;
    } finally {
      setTreeLoading(false);
    }
  }, [selectedFileRef, selectedKnowledgeBaseId]);

  const selectFile = useCallback(async (rootId: string, relativePath: string) => {
    if (!selectedKnowledgeBaseId) {
      return null;
    }

    setFileLoading(true);
    setError("");
    try {
      const nextFile = await invoke<KnowledgeFileContent>("load_knowledge_file", {
        id: selectedKnowledgeBaseId,
        rootId,
        relativePath,
      });
      setSelectedFileRef({ rootId, relativePath });
      setSelectedFile(nextFile);
      setEditorMode(nextFile.editable ? "edit" : "preview");
      return nextFile;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      return null;
    } finally {
      setFileLoading(false);
    }
  }, [selectedKnowledgeBaseId]);

  const upsertKnowledgeBase = useCallback(async (payload: UpsertKnowledgeBasePayload, successMessage: string) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const record = await invoke<KnowledgeBaseRecord>("upsert_knowledge_base", { payload });
      await refreshKnowledgeBases(record.id);
      await refreshTree(record.id);
      setNotice(successMessage);
      return record;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      return null;
    } finally {
      setSaving(false);
    }
  }, [refreshKnowledgeBases, refreshTree]);

  const createKnowledgeBase = useCallback(async (name: string, description?: string) => {
    return upsertKnowledgeBase({
      name,
      description,
      roots: [],
    }, "知识库已创建");
  }, [upsertKnowledgeBase]);

  const saveKnowledgeBaseMetadata = useCallback(async (name: string, description?: string) => {
    if (!selectedKnowledgeBase) {
      return null;
    }

    return upsertKnowledgeBase({
      id: selectedKnowledgeBase.id,
      name,
      description,
      roots: [],
    }, "知识库信息已更新");
  }, [selectedKnowledgeBase, upsertKnowledgeBase]);

  const renameKnowledgeBase = useCallback(async (name: string) => {
    return saveKnowledgeBaseMetadata(name, selectedKnowledgeBase?.description || "");
  }, [saveKnowledgeBaseMetadata, selectedKnowledgeBase?.description]);

  const addKnowledgeRoot = useCallback(async (path: string) => {
    if (!selectedKnowledgeBase) {
      return null;
    }

    return upsertKnowledgeBase({
      id: selectedKnowledgeBase.id,
      name: selectedKnowledgeBase.name,
      roots: [
        ...selectedKnowledgeBase.roots.map(buildRootInput),
        { path },
      ],
    }, "知识库目录已添加");
  }, [selectedKnowledgeBase, upsertKnowledgeBase]);

  const removeKnowledgeRoot = useCallback(async (rootId: string) => {
    if (!selectedKnowledgeBase) {
      return null;
    }
    if (selectedKnowledgeBase.roots.length <= 1) {
      setError("至少保留一个知识库目录");
      return null;
    }

    const nextRoots = selectedKnowledgeBase.roots
      .filter((root) => root.id !== rootId)
      .map(buildRootInput);
    const record = await upsertKnowledgeBase({
      id: selectedKnowledgeBase.id,
      name: selectedKnowledgeBase.name,
      roots: nextRoots,
    }, "知识库目录已移除");

    if (record && selectedFileRef?.rootId === rootId) {
      setSelectedFileRef(null);
      setSelectedFile(null);
      setEditorMode("preview");
    }

    return record;
  }, [selectedFileRef, selectedKnowledgeBase, upsertKnowledgeBase]);

  const deleteKnowledgeBase = useCallback(async (targetId?: string) => {
    const resolvedKnowledgeBase = targetId
      ? knowledgeBases.find((item) => item.id === targetId) ?? null
      : selectedKnowledgeBase;

    if (!resolvedKnowledgeBase) {
      return false;
    }

    const deletingCurrent = resolvedKnowledgeBase.id === selectedKnowledgeBase?.id;

    setSaving(true);
    setError("");
    setNotice("");
    try {
      await invoke<string>("delete_knowledge_base", { id: resolvedKnowledgeBase.id });
      await refreshKnowledgeBases(null);

      if (deletingCurrent) {
        setSelectedKnowledgeBaseId("");
        setTreeSnapshot(null);
        setSelectedFileRef(null);
        setSelectedFile(null);
        setEditorMode("preview");
      }

      setNotice("知识库已删除");
      return true;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      return false;
    } finally {
      setSaving(false);
    }
  }, [knowledgeBases, refreshKnowledgeBases, selectedKnowledgeBase]);

  const saveSelectedFile = useCallback(async (content: string, format: string, options?: SaveSelectedFileOptions) => {
    if (!selectedKnowledgeBaseId || !selectedFileRef) {
      return null;
    }

    const silent = Boolean(options?.silent);
    const shouldReloadFile = options?.reloadFile ?? !silent;
    const shouldRefreshTree = options?.refreshTree ?? !silent;

    setSaving(true);
    setError("");
    if (!silent) {
      setNotice("");
    }

    try {
      await invoke<string>("save_knowledge_file", {
        id: selectedKnowledgeBaseId,
        rootId: selectedFileRef.rootId,
        relativePath: selectedFileRef.relativePath,
        content,
        format,
      });

      let nextFile: KnowledgeFileContent | null = null;

      if (shouldReloadFile) {
        nextFile = await selectFile(selectedFileRef.rootId, selectedFileRef.relativePath);
      } else {
        const updatedAtMs = Date.now();
        nextFile = selectedFile
          ? {
              ...selectedFile,
              content,
              updatedAtMs,
            }
          : null;

        setSelectedFile((current) => {
          if (!current) {
            return current;
          }
          if (current.rootId !== selectedFileRef.rootId || current.relativePath !== selectedFileRef.relativePath) {
            return current;
          }
          return {
            ...current,
            content,
            updatedAtMs,
          };
        });
      }

      if (shouldRefreshTree) {
        await refreshTree(selectedKnowledgeBaseId);
      }

      setEditorMode(nextFile?.editable ? "edit" : "preview");
      if (!silent) {
        setNotice("文件已保存");
      }
      return nextFile;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      return null;
    } finally {
      setSaving(false);
    }
  }, [refreshTree, selectFile, selectedFile, selectedFileRef, selectedKnowledgeBaseId]);

  useEffect(() => {
    void refreshKnowledgeBases();
  }, [refreshKnowledgeBases]);

  useEffect(() => {
    if (!selectedKnowledgeBaseId) {
      setTreeSnapshot(null);
      setSelectedFileRef(null);
      setSelectedFile(null);
      setEditorMode("preview");
      return;
    }

    void refreshTree(selectedKnowledgeBaseId);
  }, [refreshTree, selectedKnowledgeBaseId]);

  return {
    knowledgeBases,
    selectedKnowledgeBaseId,
    selectedKnowledgeBase,
    treeSnapshot,
    selectedFile,
    selectedFileRef,
    editorMode,
    loading,
    treeLoading,
    fileLoading,
    saving,
    notice,
    error,
    setSelectedKnowledgeBaseId,
    setEditorMode,
    setNotice,
    setError,
    refreshKnowledgeBases,
    refreshTree,
    selectFile,
    createKnowledgeBase,
    saveKnowledgeBaseMetadata,
    renameKnowledgeBase,
    addKnowledgeRoot,
    removeKnowledgeRoot,
    deleteKnowledgeBase,
    saveSelectedFile,
  };
}
