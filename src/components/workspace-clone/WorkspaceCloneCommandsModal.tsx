import { useMemo } from "react";
import { Modal } from "../ui/Modal";
import { MAIN_AGENT_DISPLAY_NAME } from "../../data/agencyRoster";
import { WORKSPACE_COMMAND_ITEMS } from "./workspaceCloneData";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import type {
  WorkspaceSlashCommandDefinition,
  WorkspaceSlashCommandDraftInput,
  WorkspaceSlashCommandSource,
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

function getCommandSourceLabel(source: WorkspaceSlashCommandSource) {
  return source === "builtin" ? "系统" : "自定义";
}

function getCommandSummary(item: WorkspaceSlashCommandDefinition) {
  if (item.description.trim()) {
    return item.description.trim();
  }

  return item.name.trim() || "未填写说明";
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
  const builtinItems = useMemo(() => items.filter((item) => item.source === "builtin"), [items]);
  const customItems = useMemo(() => items.filter((item) => item.source === "custom"), [items]);
  const mergedItems = useMemo(() => [...builtinItems, ...customItems], [builtinItems, customItems]);
  const normalizedQuery = search.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    if (!normalizedQuery) {
      return mergedItems;
    }

    return mergedItems.filter((item) =>
      `${item.command} ${item.name} ${item.description}`.toLowerCase().includes(normalizedQuery),
    );
  }, [mergedItems, normalizedQuery]);

  const showSearchEmpty = !loading && normalizedQuery.length > 0 && filteredItems.length === 0;
  const showGlobalEmpty = !loading && normalizedQuery.length === 0 && mergedItems.length === 0;

  return (
    <>
      <Modal
        show={show}
        onClose={onClose}
        maxWidth={960}
        overlayClassName="workspace-resource-modal__overlay"
        contentClassName="workspace-resource-modal__surface"
      >
        <div className="workspace-resource-modal workspace-command-modal">
          <div className="workspace-resource-modal__header">
            <div>
              <h3>{agentName || MAIN_AGENT_DISPLAY_NAME} / 命令管理</h3>
              <p>全局共享命令会作用于所有聊天。这里统一展示系统命令与自定义命令，新增和编辑都在独立表单中完成。</p>
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
                <span className="workspace-resource-modal__count">共 {mergedItems.length} 个命令</span>
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

            {loading ? (
              <div className="workspace-resource-modal__empty">正在加载命令配置...</div>
            ) : showSearchEmpty ? (
              <div className="workspace-resource-modal__empty">没有找到匹配的命令，试试更短的关键词。</div>
            ) : showGlobalEmpty ? (
              <div className="workspace-command-modal__empty-stack">
                <div className="workspace-resource-modal__empty workspace-command-modal__empty-copy">
                  当前还没有命令，可以先把常用 Prompt 或固定流程整理成快捷入口。
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
              <div className="workspace-resource-modal__list workspace-command-modal__list">
                {filteredItems.map((item) => {
                  const isActive = item.id === activeCommandId;
                  const isBuiltin = item.source === "builtin";
                  const summary = getCommandSummary(item);
                  const showName = item.name.trim() && item.name.trim() !== summary;
                  const sourceToneClass =
                    item.source === "builtin"
                      ? "workspace-command-modal__tag--builtin"
                      : "workspace-command-modal__tag--custom";

                  return (
                    <div
                      key={item.id}
                      className={[
                        "workspace-command-modal__row",
                        isActive ? "is-active" : "",
                        isBuiltin ? "is-readonly" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {isBuiltin ? (
                        <div className="workspace-command-modal__row-main is-static">
                          <div className="workspace-command-modal__row-copy">
                            <div className="workspace-command-modal__row-head">
                              <div className="workspace-command-modal__command-line">
                                <strong>{item.command}</strong>
                                <div className="workspace-command-modal__meta">
                                  <span className={`workspace-command-modal__tag ${sourceToneClass}`}>
                                    {getCommandSourceLabel(item.source)}
                                  </span>
                                  {isActive ? (
                                    <span className="workspace-command-modal__tag workspace-command-modal__tag--active">
                                      已启用
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              {showName ? <span className="workspace-command-modal__row-name">{item.name}</span> : null}
                            </div>
                            <p>{summary}</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="workspace-command-modal__row-main"
                            onClick={() => onActivate(item.id)}
                            disabled={saving}
                          >
                            <div className="workspace-command-modal__row-copy">
                              <div className="workspace-command-modal__row-head">
                                <div className="workspace-command-modal__command-line">
                                  <strong>{item.command}</strong>
                                  <div className="workspace-command-modal__meta">
                                    <span className={`workspace-command-modal__tag ${sourceToneClass}`}>
                                      {getCommandSourceLabel(item.source)}
                                    </span>
                                    {isActive ? (
                                      <span className="workspace-command-modal__tag workspace-command-modal__tag--active">
                                        已启用
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                {showName ? (
                                  <span className="workspace-command-modal__row-name">{item.name}</span>
                                ) : null}
                              </div>
                              <p>{summary}</p>
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
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        show={show && editorOpen}
        onClose={onCancelEdit}
        maxWidth={720}
        overlayClassName="workspace-command-editor-modal__overlay"
        contentClassName="workspace-command-editor-modal__surface"
      >
        <div className="workspace-command-editor-modal">
          <div className="workspace-command-editor-modal__header">
            <div>
              <h3>{editingCommandId ? "编辑命令" : "新建命令"}</h3>
              <p>把常用提示词和固定流程整理成可复用的 Slash Command，后续在聊天输入框里就能快速调用。</p>
            </div>
            <button
              type="button"
              className="workspace-model-modal__icon"
              onClick={onCancelEdit}
              aria-label="关闭命令编辑弹窗"
            >
              <WorkspaceCloneIcon name="x" size={15} strokeWidth={1.9} />
            </button>
          </div>

          <div className="workspace-command-editor-modal__body">
            <label className="workspace-command-modal__field">
              <span>命令名称</span>
              <input
                className="workspace-command-modal__input"
                type="text"
                value={draft.name}
                placeholder="例如：提示词优化"
                onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
                disabled={saving}
              />
            </label>

            <label className="workspace-command-modal__field">
              <span>描述 / 命令指令</span>
              <textarea
                className="workspace-command-modal__textarea workspace-command-modal__textarea--compact"
                value={draft.description}
                placeholder="输入这条命令要执行的提示词或说明内容，保存后会沿用现有 Slash Command 行为。"
                onChange={(event) =>
                  onDraftChange({
                    ...draft,
                    description: event.target.value,
                    instruction: event.target.value,
                  })
                }
                disabled={saving}
              />
            </label>

            <label className="workspace-command-modal__field">
              <span>命令值</span>
              <input
                className="workspace-command-modal__input"
                type="text"
                value={draft.command}
                placeholder="例如：/prompt-optimize"
                onChange={(event) => onDraftChange({ ...draft, command: event.target.value })}
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
        </div>
      </Modal>
    </>
  );
}
