import { useMemo } from "react";
import { Modal } from "../ui/Modal";
import { MAIN_AGENT_DISPLAY_NAME } from "../../data/agencyRoster";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import {
  buildToolCategoryCounts,
  buildVisibleToolGroups,
} from "./workspaceCloneAgentResources";
import type { WorkspaceToolCategory, WorkspaceToolOption } from "./workspaceCloneTypes";

interface WorkspaceCloneToolPermissionsModalProps {
  show: boolean;
  agentName: string;
  items: WorkspaceToolOption[];
  activeCategory: WorkspaceToolCategory;
  profileLabel: string;
  loading: boolean;
  saving: boolean;
  notice: string;
  error: string;
  onClose: () => void;
  onRefresh: () => void;
  onChangeCategory: (value: WorkspaceToolCategory) => void;
  onToggleTool: (toolId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onSave: () => void;
}

export function WorkspaceCloneToolPermissionsModal({
  show,
  agentName,
  items,
  activeCategory,
  profileLabel,
  loading,
  saving,
  onClose,
  onRefresh,
  onChangeCategory,
  onToggleTool,
  onSelectAll,
  onClear,
  onSave,
}: WorkspaceCloneToolPermissionsModalProps) {
  const selectedCount = items.filter((item) => item.selected).length;
  const categoryCounts = useMemo(() => buildToolCategoryCounts(items), [items]);
  const visibleGroups = useMemo(
    () => buildVisibleToolGroups(items, activeCategory),
    [activeCategory, items],
  );

  return (
    <Modal
      show={show}
      onClose={onClose}
      maxWidth={920}
      overlayClassName="workspace-resource-modal__overlay"
      contentClassName="workspace-resource-modal__surface"
    >
      <div className="workspace-resource-modal">
        <div className="workspace-resource-modal__header">
          <div>
            <h3>{agentName || MAIN_AGENT_DISPLAY_NAME} · 工具权限</h3>
            <p>保存后下一条消息会立即按新的工具权限执行。</p>
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
              aria-label="关闭工具权限弹窗"
            >
              <WorkspaceCloneIcon name="x" size={15} strokeWidth={1.9} />
            </button>
          </div>
        </div>

        <div className="workspace-resource-modal__body">
          <div className="workspace-resource-modal__meta">
            <span>权限档位：{profileLabel}</span>
            <span>已启用 {selectedCount} / {items.length}</span>
          </div>

          <div className="workspace-resource-modal__toolbar-actions workspace-resource-modal__toolbar-actions--split">
            <div className="workspace-resource-modal__chips" role="group" aria-label="工具分类筛选">
              <button
                type="button"
                className={`workspace-resource-modal__chip ${activeCategory === "all" ? "is-active" : ""}`}
                aria-pressed={activeCategory === "all"}
                onClick={() => onChangeCategory("all")}
              >
                全部
                <em>{items.length}</em>
              </button>
              {categoryCounts.map((category) => (
                <button
                  key={category.key}
                  type="button"
                  className={`workspace-resource-modal__chip ${activeCategory === category.key ? "is-active" : ""}`}
                  aria-pressed={activeCategory === category.key}
                  onClick={() => onChangeCategory(category.key)}
                >
                  {category.label}
                  <em>{category.count}</em>
                </button>
              ))}
            </div>
            <div className="workspace-resource-modal__toolbar-actions">
              <button type="button" className="workspace-model-modal__ghost" onClick={onSelectAll} disabled={loading || saving}>
                全选
              </button>
              <button type="button" className="workspace-model-modal__ghost" onClick={onClear} disabled={loading || saving}>
                清空
              </button>
            </div>
          </div>

          <div className="workspace-resource-modal__list workspace-resource-modal__list--grouped">
            {loading ? (
              <div className="workspace-resource-modal__empty">正在加载工具权限配置...</div>
            ) : visibleGroups.length === 0 ? (
              <div className="workspace-resource-modal__empty">当前分类下没有可显示的工具。</div>
            ) : (
              visibleGroups.map((group) => (
                <section key={group.key} className="workspace-resource-modal__group">
                  <h4 className="workspace-resource-modal__group-title">{group.label}</h4>
                  <div className="workspace-resource-modal__group-grid">
                    {group.tools.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`workspace-resource-modal__item ${item.selected ? "is-selected" : ""}`}
                        onClick={() => onToggleTool(item.id)}
                        disabled={saving}
                      >
                        <span className={`workspace-resource-modal__checkbox ${item.selected ? "is-selected" : ""}`} aria-hidden="true" />
                        <div className="workspace-resource-modal__item-copy">
                          <div className="workspace-resource-modal__item-head">
                            <strong>{item.title}</strong>
                            <span className="workspace-clone__resource-tag">{item.selected ? "已启用" : item.tag}</span>
                          </div>
                          <p>{item.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>

          <div className="workspace-resource-modal__footer">
            <button type="button" className="workspace-model-modal__primary" onClick={onSave} disabled={loading || saving}>
              {saving ? "保存中..." : "保存工具权限"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
