import { useMemo } from "react";
import { Modal } from "../ui/Modal";
import { MAIN_AGENT_DISPLAY_NAME } from "../../data/agencyRoster";
import { WORKSPACE_COMMAND_ITEMS } from "./workspaceCloneData";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import { createUniqueWorkspaceSlashCommandValue } from "./workspaceCloneSlashCommands";
import type {
  WorkspaceSlashCommandDefinition,
  WorkspaceSlashCommandDraftInput,
} from "./workspaceCloneTypes";

interface WorkspaceCloneCommandsModalProps {
  show: boolean;
  agentName: string;
  items: WorkspaceSlashCommandDefinition[];
  activeCommandId: string;
  search: string;
  draft: WorkspaceSlashCommandDraftInput;
  editingCommandId: string | null;
  editorOpen: boolean;
  loading: boolean;
  saving: boolean;
  notice: string;
  error: string;
  onClose: () => void;
  onRefresh: () => void;
  onSearchChange: (value: string) => void;
  onActivate: (commandId: string) => void;
  onStartCreate: () => void;
  onStartEdit: (commandId: string) => void;
  onCancelEdit: () => void;
  onDelete: (commandId: string) => void;
  onDraftChange: (nextDraft: WorkspaceSlashCommandDraftInput) => void;
  onSaveDraft: () => void;
}

export function WorkspaceCloneCommandsModal({
  show,
  agentName,
  items,
  activeCommandId,
  search,
  draft,
  editingCommandId,
  editorOpen,
  loading,
  saving,
  notice,
  error,
  onClose,
  onRefresh,
  onSearchChange,
  onActivate,
  onStartCreate,
  onStartEdit,
  onCancelEdit,
  onDelete,
  onDraftChange,
  onSaveDraft,
}: WorkspaceCloneCommandsModalProps) {
  const builtinItems = useMemo(
    () => items.filter((item) => item.source === "builtin"),
    [items],
  );
  const customItems = useMemo(
    () => items.filter((item) => item.source === "custom"),
    [items],
  );
  const filteredBuiltinItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return builtinItems;
    }

    return builtinItems.filter((item) =>
      `${item.command} ${item.name} ${item.description}`.toLowerCase().includes(query),
    );
  }, [builtinItems, search]);
  const filteredCustomItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return customItems;
    }

    return customItems.filter((item) =>
      `${item.command} ${item.name} ${item.description}`.toLowerCase().includes(query),
    );
  }, [customItems, search]);
  const commandPreview = useMemo(
    () =>
      createUniqueWorkspaceSlashCommandValue({
        name: draft.name || "command",
        existingCommands: items,
        excludeId: editingCommandId,
      }),
    [draft.name, editingCommandId, items],
  );

  return (
    <Modal
      show={show}
      onClose={onClose}
      maxWidth={980}
      overlayClassName="workspace-resource-modal__overlay"
      contentClassName="workspace-resource-modal__surface"
    >
      <div className="workspace-resource-modal workspace-command-modal">
        <div className="workspace-resource-modal__header">
          <div>
            <h3>{agentName || MAIN_AGENT_DISPLAY_NAME} / Slash Commands</h3>
            <p>全局共享命令会作用于所有聊天。本阶段只支持用户自定义命令，系统默认命令保留为只读扩展位。</p>
          </div>
          <div className="workspace-resource-modal__header-actions">
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
              aria-label="关闭命令面板"
            >
              <WorkspaceCloneIcon name="x" size={15} strokeWidth={1.9} />
            </button>
          </div>
        </div>

        <div className="workspace-resource-modal__body">
          <div className="workspace-resource-modal__toolbar workspace-command-modal__toolbar">
            <div className="workspace-resource-modal__search">
              <input
                type="search"
                value={search}
                placeholder="搜索命令、名称或说明"
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </div>
            <div className="workspace-resource-modal__toolbar-actions">
              <span className="workspace-resource-modal__count">{customItems.length} 个自定义命令</span>
              <button
                type="button"
                className="workspace-model-modal__primary"
                onClick={onStartCreate}
                disabled={saving}
              >
                新建命令
              </button>
            </div>
          </div>

          {(notice.trim() || error.trim()) && (
            <div className="workspace-command-modal__feedback">
              {notice.trim() ? (
                <div className="workspace-command-modal__feedback-card is-notice">{notice}</div>
              ) : null}
              {error.trim() ? (
                <div className="workspace-command-modal__feedback-card is-error">{error}</div>
              ) : null}
            </div>
          )}

          <div className="workspace-command-modal__grid">
            <section className="workspace-command-modal__column">
              <div className="workspace-resource-modal__section-title">系统默认命令</div>
              {filteredBuiltinItems.length === 0 ? (
                <div className="workspace-resource-modal__empty">
                  当前还没有预置的系统命令，后续会通过只读扩展位补充。
                </div>
              ) : (
                <div className="workspace-resource-modal__list">
                  {filteredBuiltinItems.map((item) => (
                    <div key={item.id} className="workspace-command-modal__row is-readonly">
                      <div className="workspace-command-modal__row-copy">
                        <div className="workspace-command-modal__row-head">
                          <strong>{item.command}</strong>
                          <span className="workspace-clone__resource-tag">只读</span>
                        </div>
                        <p>{item.description || item.name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="workspace-command-modal__column">
              <div className="workspace-resource-modal__section-title">用户自定义命令</div>
              {loading ? (
                <div className="workspace-resource-modal__empty">正在加载命令配置...</div>
              ) : filteredCustomItems.length === 0 ? (
                <div className="workspace-command-modal__empty-stack">
                  <div className="workspace-resource-modal__empty">
                    当前还没有自定义命令，可以先把常用 Prompt 或流程整理成快捷入口。
                  </div>
                  <div className="workspace-command-modal__examples">
                    {WORKSPACE_COMMAND_ITEMS.map((item) => (
                      <div key={item.id} className="workspace-command-modal__example">
                        <strong>{item.title}</strong>
                        <small>{item.subtitle}</small>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="workspace-resource-modal__list">
                  {filteredCustomItems.map((item) => {
                    const isActive = item.id === activeCommandId;
                    return (
                      <div key={item.id} className={`workspace-command-modal__row ${isActive ? "is-active" : ""}`}>
                        <button
                          type="button"
                          className="workspace-command-modal__row-main"
                          onClick={() => onActivate(item.id)}
                          disabled={saving}
                        >
                          <div className="workspace-command-modal__row-copy">
                            <div className="workspace-command-modal__row-head">
                              <strong>{item.command}</strong>
                              <span className="workspace-clone__resource-tag">
                                {isActive ? "已激活" : "自定义"}
                              </span>
                            </div>
                            <p>{item.description || item.name}</p>
                          </div>
                        </button>
                        <div className="workspace-command-modal__row-actions">
                          <button
                            type="button"
                            className="workspace-model-modal__ghost"
                            onClick={() => onStartEdit(item.id)}
                            disabled={saving}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            className="workspace-model-modal__ghost workspace-command-modal__danger"
                            onClick={() => onDelete(item.id)}
                            disabled={saving}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {editorOpen ? (
            <section className="workspace-command-modal__editor">
              <div className="workspace-resource-modal__section-title">
                {editingCommandId ? "编辑命令" : "新建命令"}
              </div>
              <div className="workspace-command-modal__editor-grid">
                <label className="workspace-command-modal__field">
                  <span>命令名称</span>
                  <input
                    className="workspace-command-modal__input"
                    type="text"
                    value={draft.name}
                    placeholder="例如：Review UI"
                    onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
                    disabled={saving}
                  />
                </label>
                <label className="workspace-command-modal__field">
                  <span>命令说明</span>
                  <input
                    className="workspace-command-modal__input"
                    type="text"
                    value={draft.description}
                    placeholder="简短说明这个命令会做什么"
                    onChange={(event) => onDraftChange({ ...draft, description: event.target.value })}
                    disabled={saving}
                  />
                </label>
                <label className="workspace-command-modal__field workspace-command-modal__field--wide">
                  <span>命令值</span>
                  <div className="workspace-command-modal__preview">{commandPreview}</div>
                </label>
                <label className="workspace-command-modal__field workspace-command-modal__field--wide">
                  <span>命令指令</span>
                  <textarea
                    className="workspace-command-modal__textarea"
                    value={draft.instruction}
                    placeholder="输入发送前注入给模型的隐藏指令"
                    onChange={(event) => onDraftChange({ ...draft, instruction: event.target.value })}
                    disabled={saving}
                  />
                </label>
              </div>
              <div className="workspace-resource-modal__footer workspace-command-modal__footer">
                <button
                  type="button"
                  className="workspace-model-modal__ghost"
                  onClick={onCancelEdit}
                  disabled={saving}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="workspace-model-modal__primary"
                  onClick={onSaveDraft}
                  disabled={saving}
                >
                  {saving ? "保存中..." : editingCommandId ? "保存修改" : "创建命令"}
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
