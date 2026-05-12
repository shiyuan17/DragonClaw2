import { openPath } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KnowledgeBaseRecord, KnowledgeFileContent, KnowledgeOverviewView, KnowledgeRootSnapshot, KnowledgeTreeNode } from "../../types";
import { useWorkspaceKnowledgeBase } from "../../hooks/workspace-clone/useWorkspaceKnowledgeBase";
import { Modal } from "../ui/Modal";
import { WorkspaceCloneLakeHost } from "./WorkspaceCloneLakeHost";
import {
  convertKnowledgeLakeHtmlToSource,
  convertKnowledgeSourceToLakeHtml,
  isKnowledgeTextFormat,
} from "./workspaceCloneKnowledgeFormat";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";

interface KnowledgeFileEntry {
  id: string;
  rootId: string;
  relativePath: string;
  name: string;
  extension: string;
  updatedAtMs?: number | null;
  sizeBytes?: number | null;
}

function formatTimestamp(timestamp?: number | null) {
  if (!timestamp) {
    return "--";
  }

  return new Date(timestamp).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatFileSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeExtension(value?: string | null) {
  return value?.trim().toLowerCase() || "file";
}

function isInlineEditableExtension(extension: string) {
  return ["md", "markdown", "txt", "html", "htm"].includes(extension);
}

function collectKnowledgeFiles(roots: KnowledgeRootSnapshot[]) {
  const files: KnowledgeFileEntry[] = [];

  const visit = (nodes: KnowledgeTreeNode[], rootId: string) => {
    nodes.forEach((node) => {
      if (node.nodeType === "directory") {
        if (node.children.length > 0) {
          visit(node.children, rootId);
        }
        return;
      }

      files.push({
        id: `${rootId}:${node.relativePath}`,
        rootId,
        relativePath: node.relativePath,
        name: node.name,
        extension: normalizeExtension(node.extension),
        updatedAtMs: node.updatedAtMs,
        sizeBytes: node.sizeBytes,
      });
    });
  };

  roots.forEach((root) => {
    if (root.exists) {
      visit(root.children, root.id);
    }
  });

  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "zh-CN"));
}

function buildKnowledgeFileTone(extension: string) {
  if (extension === "md" || extension === "markdown") {
    return "is-markdown";
  }
  if (extension === "txt") {
    return "is-text";
  }
  if (extension === "html" || extension === "htm") {
    return "is-html";
  }
  if (extension === "pdf") {
    return "is-pdf";
  }
  return "is-generic";
}

function buildKnowledgeFileLabel(extension: string) {
  if (extension === "md" || extension === "markdown") {
    return "Markdown";
  }
  if (extension === "txt") {
    return "Text";
  }
  if (extension === "html" || extension === "htm") {
    return "HTML";
  }
  return extension.toUpperCase();
}

function resolveKnowledgeCardMeta(recordName: string, description?: string | null) {
  const normalizedDescription = description?.trim();
  if (normalizedDescription) {
    return normalizedDescription;
  }
  return `${recordName} 的本地知识文档集合`;
}

interface WorkspaceCloneKnowledgePageProps {
  onSelectedKnowledgeBaseChange?: (knowledgeBase: KnowledgeBaseRecord | null) => void;
}

export function WorkspaceCloneKnowledgePage({ onSelectedKnowledgeBaseChange }: WorkspaceCloneKnowledgePageProps = {}) {
  const {
    knowledgeBases,
    selectedKnowledgeBaseId,
    selectedKnowledgeBase,
    treeSnapshot,
    selectedFile: rawSelectedFile,
    selectedFileRef,
    loading,
    treeLoading,
    saving,
    notice,
    error,
    setSelectedKnowledgeBaseId,
    setEditorMode,
    setNotice,
    setError,
    selectFile,
    createKnowledgeBase,
    saveSelectedFile,
  } = useWorkspaceKnowledgeBase();
  const activeEditableFileRef = useRef<KnowledgeFileContent | null>(null);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const draftContentRef = useRef("");
  const lastSavedContentRef = useRef("");
  const [overviewView, setOverviewView] = useState<KnowledgeOverviewView>("grid");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [editorSeedHtml, setEditorSeedHtml] = useState("<p><br /></p>");
  const [draftContent, setDraftContent] = useState("");
  const [lastSavedContent, setLastSavedContent] = useState("");
  const [autosaveError, setAutosaveError] = useState("");
  const [autosaveState, setAutosaveState] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");

  const currentTreeSnapshot = treeSnapshot?.knowledgeBase.id === selectedKnowledgeBaseId ? treeSnapshot : null;
  const treeRoots = currentTreeSnapshot?.roots || [];
  const fileEntries = useMemo(() => collectKnowledgeFiles(treeRoots), [treeRoots]);
  const fileCount = fileEntries.length;
  const selectedFile = rawSelectedFile?.knowledgeBaseId === selectedKnowledgeBaseId ? rawSelectedFile : null;
  const editableSelectedFile = Boolean(selectedFile?.editable && isKnowledgeTextFormat(selectedFile.format));
  const selectedFileKey = selectedFileRef && selectedFile
    ? `${selectedFileRef.rootId}:${selectedFileRef.relativePath}`
    : "";
  const canCreateKnowledgeBase = draftName.trim().length > 0 && !saving;

  useEffect(() => {
    onSelectedKnowledgeBaseChange?.(selectedKnowledgeBase);
  }, [onSelectedKnowledgeBaseChange, selectedKnowledgeBase]);

  useEffect(() => {
    activeEditableFileRef.current = editableSelectedFile ? selectedFile : null;
  }, [editableSelectedFile, selectedFile]);

  useEffect(() => {
    draftContentRef.current = draftContent;
  }, [draftContent]);

  useEffect(() => {
    lastSavedContentRef.current = lastSavedContent;
  }, [lastSavedContent]);

  useEffect(() => {
    if (!selectedFile || !editableSelectedFile) {
      setEditorSeedHtml("<p><br /></p>");
      setDraftContent("");
      setLastSavedContent("");
      setAutosaveError("");
      setAutosaveState("idle");
      draftContentRef.current = "";
      lastSavedContentRef.current = "";
      return;
    }

    const nextSource = selectedFile.content;
    setEditorSeedHtml(convertKnowledgeSourceToLakeHtml(nextSource, selectedFile.format));
    setDraftContent(nextSource);
    setLastSavedContent(nextSource);
    setAutosaveError("");
    setAutosaveState("saved");
    draftContentRef.current = nextSource;
    lastSavedContentRef.current = nextSource;
  }, [editableSelectedFile, selectedFile?.absolutePath, selectedFile?.content, selectedFile?.format]);

  const persistCurrentDraft = useCallback(async () => {
    const activeFile = activeEditableFileRef.current;
    if (!activeFile) {
      return true;
    }

    if (draftContentRef.current === lastSavedContentRef.current) {
      return true;
    }

    if (savePromiseRef.current) {
      const inFlightResult = await savePromiseRef.current;
      if (!inFlightResult) {
        return false;
      }
      if (draftContentRef.current === lastSavedContentRef.current) {
        return true;
      }
    }

    setAutosaveState("saving");
    const nextPromise = (async () => {
      const nextDraft = draftContentRef.current;
      const savedFile = await saveSelectedFile(nextDraft, activeFile.format, {
        silent: true,
        reloadFile: false,
        refreshTree: false,
      });
      if (savedFile) {
        lastSavedContentRef.current = nextDraft;
        setLastSavedContent(nextDraft);
        setAutosaveError("");
        setAutosaveState("saved");
        return true;
      }

      setAutosaveError("自动保存失败，请稍后重试");
      setAutosaveState("error");
      return false;
    })();

    savePromiseRef.current = nextPromise;
    try {
      return await nextPromise;
    } finally {
      if (savePromiseRef.current === nextPromise) {
        savePromiseRef.current = null;
      }
    }
  }, [saveSelectedFile]);

  const flushPendingDraft = useCallback(async () => {
    if (savePromiseRef.current) {
      const inFlightResult = await savePromiseRef.current;
      if (!inFlightResult) {
        return false;
      }
    }
    return persistCurrentDraft();
  }, [persistCurrentDraft]);

  useEffect(() => {
    if (!editableSelectedFile) {
      return undefined;
    }
    if (draftContent === lastSavedContent) {
      return undefined;
    }

    if (autosaveState !== "saving") {
      setAutosaveState("pending");
    }

    const timer = window.setTimeout(() => {
      void persistCurrentDraft();
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [autosaveState, draftContent, editableSelectedFile, lastSavedContent, persistCurrentDraft]);

  const resetTransientState = useCallback(() => {
    setAutosaveError("");
    setAutosaveState("idle");
    setNotice("");
    setError("");
  }, [setError, setNotice]);

  const handleSelectKnowledgeBase = useCallback(async (knowledgeBaseId: string) => {
    const flushed = await flushPendingDraft();
    if (!flushed) {
      return;
    }

    resetTransientState();

    if (selectedKnowledgeBaseId === knowledgeBaseId) {
      setSelectedKnowledgeBaseId("");
      setEditorMode("preview");
      return;
    }

    setSelectedKnowledgeBaseId(knowledgeBaseId);
    setEditorMode("preview");
  }, [flushPendingDraft, resetTransientState, selectedKnowledgeBaseId, setEditorMode, setSelectedKnowledgeBaseId]);

  const handleClearSelection = useCallback(async () => {
    const flushed = await flushPendingDraft();
    if (!flushed) {
      return;
    }

    resetTransientState();
    setSelectedKnowledgeBaseId("");
    setEditorMode("preview");
  }, [flushPendingDraft, resetTransientState, setEditorMode, setSelectedKnowledgeBaseId]);

  const handleOpenKnowledgeFile = useCallback(async (file: KnowledgeFileEntry) => {
    const flushed = await flushPendingDraft();
    if (!flushed) {
      return;
    }

    const loaded = await selectFile(file.rootId, file.relativePath);
    if (loaded && (!loaded.editable || !isKnowledgeTextFormat(loaded.format))) {
      await openPath(loaded.absolutePath);
    }
  }, [flushPendingDraft, selectFile]);

  const handleLakeChange = useCallback(({ html }: { html: string; value: string }) => {
    const activeFile = activeEditableFileRef.current;
    if (!activeFile) {
      return;
    }

    const nextSource = convertKnowledgeLakeHtmlToSource(html, activeFile.format);
    draftContentRef.current = nextSource;
    setDraftContent(nextSource);
    if (autosaveError) {
      setAutosaveError("");
    }
  }, [autosaveError]);

  const handleSubmitKnowledgeBase = async () => {
    if (!canCreateKnowledgeBase) {
      return;
    }

    const created = await createKnowledgeBase(draftName, draftDescription);
    if (!created) {
      return;
    }

    setDraftName("");
    setDraftDescription("");
    setShowCreateModal(false);
  };

  const autosaveLabel = useMemo(() => {
    if (!editableSelectedFile) {
      return "";
    }
    if (saving || autosaveState === "saving") {
      return "自动保存中...";
    }
    if (autosaveState === "error") {
      return autosaveError || "自动保存失败";
    }
    if (draftContent !== lastSavedContent || autosaveState === "pending") {
      return "等待自动保存";
    }
    return "已自动保存";
  }, [autosaveError, autosaveState, draftContent, editableSelectedFile, lastSavedContent, saving]);

  return (
    <>
      <section className="workspace-clone__knowledge-shell">
        <aside className="workspace-clone__knowledge-library">
          <div className="workspace-clone__knowledge-library-scroll">
            {knowledgeBases.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`workspace-clone__knowledge-library-item ${selectedKnowledgeBaseId === item.id ? "is-active" : ""}`}
                onClick={() => {
                  void handleSelectKnowledgeBase(item.id);
                }}
              >
                <strong>{item.name}</strong>
              </button>
            ))}

            {knowledgeBases.length === 0 ? (
              <div className="workspace-clone__knowledge-library-empty">
                <strong>暂无知识库</strong>
              </div>
            ) : null}
          </div>
        </aside>

        <div className="workspace-clone__knowledge-content">
          {error ? (
            <div className="workspace-clone__knowledge-inline-state is-error">{error}</div>
          ) : null}
          {notice ? (
            <div className="workspace-clone__knowledge-inline-state is-notice">{notice}</div>
          ) : null}
          {autosaveError ? (
            <div className="workspace-clone__knowledge-inline-state is-error">{autosaveError}</div>
          ) : null}

          {loading ? (
            <div className="workspace-clone__knowledge-stage-empty">
              <strong>正在加载知识库</strong>
            </div>
          ) : !selectedKnowledgeBase ? (
            <section className="workspace-clone__knowledge-overview">
              <header className="workspace-clone__knowledge-browser-head">
                <div className="workspace-clone__knowledge-browser-title">
                  <strong>全部知识库</strong>
                  <span>{knowledgeBases.length} 个知识库</span>
                </div>

                <div className="workspace-clone__knowledge-browser-actions">
                  <button
                    type="button"
                    className={`workspace-clone__knowledge-browser-icon ${overviewView === "grid" ? "is-active" : ""}`}
                    onClick={() => setOverviewView("grid")}
                    aria-label="网格视图"
                  >
                    <WorkspaceCloneIcon name="grid" size={15} strokeWidth={1.9} />
                  </button>
                  <button
                    type="button"
                    className={`workspace-clone__knowledge-browser-icon ${overviewView === "list" ? "is-active" : ""}`}
                    onClick={() => setOverviewView("list")}
                    aria-label="列表视图"
                  >
                    <WorkspaceCloneIcon name="list" size={15} strokeWidth={1.9} />
                  </button>
                  <button
                    type="button"
                    className="workspace-clone__knowledge-browser-create"
                    onClick={() => setShowCreateModal(true)}
                  >
                    <WorkspaceCloneIcon name="plus" size={16} strokeWidth={2} />
                    <span>新建知识库</span>
                  </button>
                </div>
              </header>

              {knowledgeBases.length === 0 ? (
                <div className="workspace-clone__knowledge-stage-empty">
                  <strong>先创建一个知识库</strong>
                </div>
              ) : (
                <div className={`workspace-clone__knowledge-overview-grid is-${overviewView}`}>
                  {knowledgeBases.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="workspace-clone__knowledge-overview-card"
                      onClick={() => {
                        void handleSelectKnowledgeBase(item.id);
                      }}
                    >
                      <div className="workspace-clone__knowledge-overview-card-head">
                        <span className="workspace-clone__knowledge-overview-card-icon">
                          <WorkspaceCloneIcon name="notebook" size={16} strokeWidth={1.9} />
                        </span>
                        <strong>{item.name}</strong>
                      </div>
                      <p>{resolveKnowledgeCardMeta(item.name, item.description)}</p>
                      <div className="workspace-clone__knowledge-overview-card-meta">
                        <span>更新时间 {formatTimestamp(item.updatedAtMs)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <section className="workspace-clone__knowledge-detail">
              <header className="workspace-clone__knowledge-detail-topbar">
                <div className="workspace-clone__knowledge-browser-title">
                  <strong>{selectedKnowledgeBase.name}</strong>
                  <span>{fileCount} 个文档</span>
                </div>

                <div className="workspace-clone__knowledge-browser-actions">
                  <button
                    type="button"
                    className="workspace-clone__knowledge-browser-icon"
                    onClick={() => {
                      void handleClearSelection();
                    }}
                    aria-label="返回知识库总览"
                  >
                    <WorkspaceCloneIcon name="arrow-left" size={15} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="workspace-clone__knowledge-browser-create is-compact"
                    onClick={() => setShowCreateModal(true)}
                  >
                    <WorkspaceCloneIcon name="plus" size={16} strokeWidth={2} />
                    <span>新建知识库</span>
                  </button>
                </div>
              </header>

              <div className="workspace-clone__knowledge-detail-layout">
                <section className="workspace-clone__knowledge-docs-panel">
                  <div className="workspace-clone__knowledge-docs-header">
                    <strong>当前知识库文档</strong>
                    <span>{fileCount} 个</span>
                  </div>

                  {treeLoading ? (
                    <div className="workspace-clone__knowledge-document-empty">正在加载文档</div>
                  ) : fileEntries.length === 0 ? (
                    <div className="workspace-clone__knowledge-document-empty">当前知识库还没有文档</div>
                  ) : (
                    <div className="workspace-clone__knowledge-document-list">
                      {fileEntries.map((file) => {
                        const isActive = selectedFileKey === file.id;
                        const tone = buildKnowledgeFileTone(file.extension);
                        const formatLabel = buildKnowledgeFileLabel(file.extension);
                        const editable = isInlineEditableExtension(file.extension);

                        return (
                          <button
                            key={file.id}
                            type="button"
                            className={`workspace-clone__knowledge-document-row ${isActive ? "is-active" : ""}`.trim()}
                            onClick={() => {
                              void handleOpenKnowledgeFile(file);
                            }}
                          >
                            <span className={`workspace-clone__knowledge-document-icon ${tone}`}>
                              <WorkspaceCloneIcon name="folder" size={14} strokeWidth={1.8} />
                            </span>
                            <span className="workspace-clone__knowledge-document-copy">
                              <strong>{file.name}</strong>
                              <small>{file.relativePath}</small>
                              <span className="workspace-clone__knowledge-document-meta">
                                {formatLabel} · {formatFileSize(file.sizeBytes)} · {formatTimestamp(file.updatedAtMs)}
                                {!editable ? " · 外部打开" : ""}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="workspace-clone__knowledge-editor-panel">
                  {editableSelectedFile && selectedFile ? (
                    <>
                      <div className="workspace-clone__knowledge-editor-toolbar">
                        <div className="workspace-clone__knowledge-editor-file">
                          <strong>{selectedFile.fileName}</strong>
                          <small>{selectedFile.relativePath}</small>
                        </div>

                        <div className="workspace-clone__knowledge-editor-actions">
                          <span
                            className={`workspace-clone__knowledge-editor-status ${
                              autosaveState === "error" ? "is-error" : autosaveState === "saving" ? "is-saving" : ""
                            }`.trim()}
                          >
                            {autosaveLabel}
                          </span>
                          <button
                            type="button"
                            className="workspace-clone__knowledge-toolbar-btn"
                            onClick={() => void openPath(selectedFile.absolutePath)}
                          >
                            外部打开
                          </button>
                        </div>
                      </div>

                      <div className="workspace-clone__knowledge-editor-canvas">
                        <WorkspaceCloneLakeHost
                          key={selectedFile.absolutePath}
                          value={editorSeedHtml}
                          placeholder="在这里编辑知识库文档"
                          onChange={handleLakeChange}
                        />
                      </div>
                    </>
                  ) : selectedFile ? (
                    <div className="workspace-clone__knowledge-editor-placeholder">
                      <strong>当前文件不支持内嵌编辑</strong>
                      <span>{selectedFile.fileName} 已切换为外部打开方式。</span>
                      <button
                        type="button"
                        className="workspace-clone__knowledge-toolbar-btn"
                        onClick={() => void openPath(selectedFile.absolutePath)}
                      >
                        外部打开
                      </button>
                    </div>
                  ) : (
                    <div className="workspace-clone__knowledge-editor-placeholder">
                      <strong>选择左侧文档开始编辑</strong>
                      <span>Markdown、txt、html 文档会在这里直接编辑，并在停止输入后自动保存。</span>
                    </div>
                  )}
                </section>
              </div>
            </section>
          )}
        </div>
      </section>

      <Modal
        show={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        maxWidth={660}
        overlayClassName="workspace-model-modal__overlay"
        contentClassName="workspace-model-modal__surface workspace-knowledge-modal__surface"
      >
        <div className="workspace-knowledge-modal">
          <div className="workspace-knowledge-modal__header">
            <div>
              <span className="workspace-clone__knowledge-kicker">新建知识库</span>
              <h3>创建知识库</h3>
              <p>填写名称和简介后，系统会自动绑定到 OpenClaw 的 `knowledge-base` 目录。</p>
            </div>
            <button
              type="button"
              className="workspace-model-modal__icon"
              onClick={() => setShowCreateModal(false)}
              aria-label="关闭知识库弹窗"
            >
              <WorkspaceCloneIcon name="x" size={18} strokeWidth={2} />
            </button>
          </div>

          <div className="workspace-knowledge-modal__body">
            <label className="workspace-clone__knowledge-field">
              <span>知识库名称</span>
              <input
                type="text"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="例如：产品规范、部署文档、项目知识库"
              />
            </label>

            <label className="workspace-clone__knowledge-field">
              <span>知识库简介（可选）</span>
              <textarea
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                placeholder="一句话说明这个知识库的内容范围。"
              />
            </label>
          </div>

          <div className="workspace-knowledge-modal__footer">
            <button type="button" className="workspace-model-modal__ghost" onClick={() => setShowCreateModal(false)}>
              取消
            </button>
            <button
              type="button"
              className="workspace-model-modal__primary"
              disabled={!canCreateKnowledgeBase}
              onClick={() => void handleSubmitKnowledgeBase()}
            >
              {saving ? "创建中..." : "创建知识库"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
