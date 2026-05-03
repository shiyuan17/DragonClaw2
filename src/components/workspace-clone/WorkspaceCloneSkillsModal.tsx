import { useMemo } from "react";
import { Modal } from "../ui/Modal";
import { MAIN_AGENT_DISPLAY_NAME } from "../../data/agencyRoster";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import type { WorkspaceSkillCategory, WorkspaceSkillOption } from "./workspaceCloneTypes";

const SKILL_STATUS_LABELS: Partial<Record<WorkspaceSkillOption["tag"], string>> = {
  Disabled: "已禁用",
  Blocked: "受限",
  Configured: "仅配置中",
};

interface WorkspaceCloneSkillsModalProps {
  show: boolean;
  agentName: string;
  items: WorkspaceSkillOption[];
  search: string;
  activeCategory: WorkspaceSkillCategory;
  loading: boolean;
  saving: boolean;
  notice: string;
  error: string;
  onClose: () => void;
  onRefresh: () => void;
  onSearchChange: (value: string) => void;
  onChangeCategory: (value: WorkspaceSkillCategory) => void;
  onToggleSkill: (skillId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onSave: () => void;
}

export function WorkspaceCloneSkillsModal({
  show,
  agentName,
  items,
  search,
  activeCategory,
  loading,
  saving,
  onClose,
  onRefresh,
  onSearchChange,
  onChangeCategory,
  onToggleSkill,
  onSelectAll,
  onClear,
  onSave,
}: WorkspaceCloneSkillsModalProps) {
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return items;
    }

    return items.filter((item) =>
      `${item.title} ${item.description} ${item.tag}`.toLowerCase().includes(query),
    );
  }, [items, search]);

  const builtInItems = useMemo(
    () => filteredItems.filter((item) => item.category === "builtIn"),
    [filteredItems],
  );
  const installedItems = useMemo(
    () => filteredItems.filter((item) => item.category === "installed"),
    [filteredItems],
  );
  const activeItems = activeCategory === "builtIn" ? builtInItems : installedItems;
  const selectedCount = items.filter((item) => item.selected).length;

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
            <h3>{agentName || MAIN_AGENT_DISPLAY_NAME} · 技能库</h3>
            <p>保存后会清理当前主会话的技能快照，下一条消息按新配置生效。</p>
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
              aria-label="关闭技能库弹窗"
            >
              <WorkspaceCloneIcon name="x" size={15} strokeWidth={1.9} />
            </button>
          </div>
        </div>

        <div className="workspace-resource-modal__body">
          <div className="workspace-resource-modal__toolbar">
            <div className="workspace-resource-modal__search">
              <input
                type="search"
                value={search}
                placeholder="筛选技能名称或描述"
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </div>
            <div className="workspace-resource-modal__toolbar-actions">
              <span className="workspace-resource-modal__count">{selectedCount} / {items.length} 已启用</span>
              <button type="button" className="workspace-model-modal__ghost" onClick={onSelectAll} disabled={loading || saving}>
                全选
              </button>
              <button type="button" className="workspace-model-modal__ghost" onClick={onClear} disabled={loading || saving}>
                清空
              </button>
            </div>
          </div>

          <div className="workspace-resource-modal__switch" role="group" aria-label="技能分类切换">
            <button
              type="button"
              className={`workspace-resource-modal__switch-button ${activeCategory === "builtIn" ? "is-active" : ""}`}
              aria-pressed={activeCategory === "builtIn"}
              onClick={() => onChangeCategory("builtIn")}
            >
              内置技能
              <em>{builtInItems.length}</em>
            </button>
            <button
              type="button"
              className={`workspace-resource-modal__switch-button ${activeCategory === "installed" ? "is-active" : ""}`}
              aria-pressed={activeCategory === "installed"}
              onClick={() => onChangeCategory("installed")}
            >
              安装技能
              <em>{installedItems.length}</em>
            </button>
          </div>

          <div className="workspace-resource-modal__section-title">
            {activeCategory === "builtIn" ? "内置技能" : "安装技能"}
          </div>

          <div className="workspace-resource-modal__list">
            {loading ? (
              <div className="workspace-resource-modal__empty">正在加载技能配置...</div>
            ) : activeItems.length === 0 ? (
              <div className="workspace-resource-modal__empty">当前分类下没有匹配的技能。</div>
            ) : (
              activeItems.map((item) => {
                const statusLabel = SKILL_STATUS_LABELS[item.tag];

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`workspace-resource-modal__item ${item.selected ? "is-selected" : ""}`}
                    onClick={() => onToggleSkill(item.id)}
                    disabled={saving}
                  >
                    <span
                      className={`workspace-resource-modal__checkbox ${item.selected ? "is-selected" : ""}`}
                      aria-hidden="true"
                    />
                    <div className="workspace-resource-modal__item-copy">
                      <div className="workspace-resource-modal__item-head">
                        <strong>{item.title}</strong>
                      </div>
                      <p>{item.description}</p>
                      {statusLabel ? (
                        <div className="workspace-resource-modal__item-meta">
                          <span className="workspace-resource-modal__item-chip">{statusLabel}</span>
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="workspace-resource-modal__footer">
            <button type="button" className="workspace-model-modal__primary" onClick={onSave} disabled={loading || saving}>
              {saving ? "保存中..." : "保存技能配置"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
