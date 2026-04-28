import { useMemo } from "react";
import { Modal } from "../ui/Modal";
import { filterWorkspaceMemoryFiles } from "./workspaceCloneMemory";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import type { WorkspaceMemoryFile } from "./workspaceCloneTypes";

interface WorkspaceCloneMemoryModalProps {
  show: boolean;
  agentName: string;
  files: WorkspaceMemoryFile[];
  search: string;
  selectedFileId: string;
  draftContent: string;
  loading: boolean;
  saving: boolean;
  notice: string;
  error: string;
  onClose: () => void;
  onRefresh: () => void;
  onSearchChange: (value: string) => void;
  onSelectFile: (fileId: string) => void;
  onDraftChange: (value: string) => void;
  onSave: () => void;
}

export function WorkspaceCloneMemoryModal({
  show,
  agentName,
  files,
  search,
  selectedFileId,
  draftContent,
  loading,
  saving,
  notice,
  error,
  onClose,
  onRefresh,
  onSearchChange,
  onSelectFile,
  onDraftChange,
  onSave,
}: WorkspaceCloneMemoryModalProps) {
  const filteredFiles = useMemo(
    () => filterWorkspaceMemoryFiles(files, search),
    [files, search],
  );

  const activeFile = useMemo(
    () => files.find((file) => file.id === selectedFileId) ?? filteredFiles[0] ?? null,
    [files, filteredFiles, selectedFileId],
  );

  return (
    <Modal
      show={show}
      onClose={onClose}
      maxWidth={980}
      overlayClassName="workspace-memory-modal__overlay"
      contentClassName="workspace-memory-modal__surface"
    >
      <div className="workspace-memory-modal">
        <div className="workspace-memory-modal__header">
          <div>
            <h3>{agentName || "main"} · 记忆</h3>
            <p>查看并编辑当前 Agent 的固定记忆文件，保存时会同步到对应 workspace。</p>
          </div>
          <div className="workspace-memory-modal__header-actions">
            <button
              type="button"
              className="workspace-model-modal__ghost"
              onClick={onRefresh}
              disabled={loading || saving}
            >
              刷新
            </button>
            <button
              type="button"
              className="workspace-model-modal__icon"
              onClick={onClose}
              aria-label="关闭记忆弹窗"
            >
              <WorkspaceCloneIcon name="x" size={15} strokeWidth={1.9} />
            </button>
          </div>
        </div>

        <div className="workspace-memory-modal__body">
          {notice && <div className="workspace-model-modal__status is-success">{notice}</div>}
          {error && <div className="workspace-model-modal__status is-error">{error}</div>}

          <div className="workspace-memory-modal__layout">
            <aside className="workspace-memory-modal__sidebar">
              <div className="workspace-memory-modal__search">
                <input
                  type="search"
                  value={search}
                  placeholder="筛选标题、路径或摘要"
                  onChange={(event) => onSearchChange(event.target.value)}
                />
              </div>

              <div className="workspace-memory-modal__file-list">
                {filteredFiles.length === 0 ? (
                  <div className="workspace-memory-modal__empty">没有匹配的记忆文件。</div>
                ) : (
                  filteredFiles.map((file) => (
                    <button
                      key={file.id}
                      type="button"
                      className={`workspace-memory-modal__file-item ${activeFile?.id === file.id ? "is-active" : ""}`}
                      onClick={() => onSelectFile(file.id)}
                    >
                      <div className="workspace-memory-modal__file-title">
                        <strong>{file.displayName}</strong>
                        {file.isFocus && <span className="workspace-clone__resource-tag">重点</span>}
                      </div>
                      <p>{file.summary}</p>
                    </button>
                  ))
                )}
              </div>
            </aside>

            <section className="workspace-memory-modal__editor">
              {activeFile ? (
                <>
                  <div className="workspace-memory-modal__editor-head">
                    <div className="workspace-memory-modal__editor-meta">
                      <span>标题</span>
                      <div className="workspace-memory-modal__editor-title">
                        <strong>{activeFile.displayName}</strong>
                        {activeFile.isFocus && <span className="workspace-clone__resource-tag">重点</span>}
                        {!activeFile.exists && <span className="workspace-clone__resource-tag">待创建</span>}
                      </div>
                      <small>{activeFile.relativePath}</small>
                    </div>

                    <button
                      type="button"
                      className="workspace-model-modal__primary"
                      onClick={onSave}
                      disabled={loading || saving}
                    >
                      {saving ? "保存中..." : "保存"}
                    </button>
                  </div>

                  {!activeFile.exists && (
                    <div className="workspace-memory-modal__hint">
                      当前文件尚不存在，首次保存时会自动创建。
                    </div>
                  )}

                  {loading ? (
                    <div className="workspace-memory-modal__empty">正在读取记忆文件...</div>
                  ) : (
                    <textarea
                      className="workspace-memory-modal__textarea"
                      value={draftContent}
                      placeholder="在这里编写当前 Agent 的记忆内容"
                      onChange={(event) => onDraftChange(event.target.value)}
                      disabled={saving}
                    />
                  )}
                </>
              ) : (
                <div className="workspace-memory-modal__empty">请选择一个记忆文件进行编辑。</div>
              )}
            </section>
          </div>
        </div>
      </div>
    </Modal>
  );
}
