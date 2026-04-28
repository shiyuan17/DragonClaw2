import type { WorkspaceEntityType } from "../../types";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import type {
  ChannelBindingModalState,
  DirectoryContextMenuState,
  WorkspaceEntity,
  WorkspaceTypeTab,
} from "./workspaceCloneTypes";
import { WorkspaceCloneChannelBindingModal } from "./WorkspaceCloneChannelBindingModal";

interface WorkspaceCloneDirectoryProps {
  typeTabs: WorkspaceTypeTab[];
  activeType: WorkspaceEntityType;
  entities: WorkspaceEntity[];
  selectedEntityId: string;
  isCollapsed: boolean;
  searchQuery: string;
  contextMenu: DirectoryContextMenuState;
  channelBindingModal: ChannelBindingModalState;
  onToggleCollapsed: () => void;
  onSelectType: (type: WorkspaceEntityType) => void;
  onSelectEntity: (entityId: string) => void;
  onSearchChange: (value: string) => void;
  onOpenContextMenu: (event: React.MouseEvent<HTMLButtonElement>, entity: WorkspaceEntity) => void;
  onCloseContextMenu: () => void;
  onOpenChannelBindingModal: (entity: WorkspaceEntity) => void;
  onCloseChannelBindingModal: () => void;
  onSelectChannelBindingView: (view: ChannelBindingModalState["view"]) => void;
}

export function WorkspaceCloneDirectory({
  typeTabs,
  activeType,
  entities,
  selectedEntityId,
  isCollapsed,
  searchQuery,
  contextMenu,
  channelBindingModal,
  onToggleCollapsed,
  onSelectType,
  onSelectEntity,
  onSearchChange,
  onOpenContextMenu,
  onCloseContextMenu,
  onOpenChannelBindingModal,
  onCloseChannelBindingModal,
  onSelectChannelBindingView,
}: WorkspaceCloneDirectoryProps) {
  const visibleEntities = activeType === "agents" ? entities : entities.slice(0, 3);
  const emptyLabel = activeType === "channels" ? "暂无频道结果" : activeType === "teams" ? "暂无团队结果" : "暂无数字员工结果";

  return (
    <>
      <aside className={`workspace-clone__directory ${isCollapsed ? "is-collapsed" : ""}`}>
        {isCollapsed ? (
          <>
            <div className="workspace-clone__directory-mini-head">
              <button className="workspace-clone__mini-create" type="button" title="快捷新建">+</button>
            </div>
            <div className="workspace-clone__mini-tabs">
              {typeTabs.map((tab) => (
                <button
                  key={tab.key}
                  className={`workspace-clone__mini-tab ${tab.key === activeType ? "is-active" : ""}`}
                  type="button"
                  title={tab.label}
                  onClick={() => onSelectType(tab.key)}
                >
                  <WorkspaceCloneIcon name={tab.icon as Parameters<typeof WorkspaceCloneIcon>[0]["name"]} size={15} strokeWidth={1.9} />
                </button>
              ))}
            </div>
            <div className="workspace-clone__mini-entities">
              {visibleEntities.map((entity) => (
                <button
                  key={entity.id}
                  className={`workspace-clone__mini-entity ${selectedEntityId === entity.id ? "is-active" : ""}`}
                  type="button"
                  title={entity.name}
                  onClick={() => onSelectEntity(entity.id)}
                >
                  <span>{entity.avatarLabel}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <header className="workspace-clone__directory-head">
              <label className="workspace-clone__search-box">
                <WorkspaceCloneIcon name="search" size={14} strokeWidth={1.9} />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder={activeType === "channels" ? "搜索频道" : activeType === "teams" ? "搜索团队" : "搜索 Agent"}
                />
              </label>
              <button className="workspace-clone__icon-btn" type="button" title="快捷新建">+</button>
            </header>

            <div className="workspace-clone__type-tabs">
              {typeTabs.map((tab) => (
                <button
                  key={tab.key}
                  className={`workspace-clone__type-tab ${activeType === tab.key ? "is-active" : ""}`}
                  type="button"
                  onClick={() => onSelectType(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <section className={`workspace-clone__entity-list ${activeType === "agents" ? "is-agents" : ""}`}>
              {visibleEntities.length > 0 ? (
                visibleEntities.map((entity) => (
                  <button
                    key={entity.id}
                    className={`workspace-clone__entity-item ${selectedEntityId === entity.id ? "is-active" : ""}`}
                    type="button"
                    onClick={() => onSelectEntity(entity.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      onOpenContextMenu(event, entity);
                    }}
                  >
                    <span className={`workspace-clone__entity-avatar is-${entity.accent}`}>
                      {entity.memberLabels?.length ? (
                        <span className="workspace-clone__avatar-stack-inline">
                          {entity.memberLabels.slice(0, 3).map((label) => (
                            <span key={`${entity.id}-${label}`} className="workspace-clone__avatar-stack-chip">{label}</span>
                          ))}
                        </span>
                      ) : entity.avatarLabel}
                    </span>
                    <span className="workspace-clone__entity-text">
                      <strong>{entity.name}</strong>
                      <small>{entity.subtitle}</small>
                    </span>
                    <i className={`workspace-clone__entity-status is-${entity.status}`} />
                    {activeType === "channels" && (
                      <button
                        className="workspace-clone__entity-link"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenChannelBindingModal(entity);
                        }}
                      >
                        绑定
                      </button>
                    )}
                  </button>
                ))
              ) : (
                <div className="workspace-clone__entity-empty">
                  <div className="workspace-clone__empty-card">
                    <strong>{emptyLabel}</strong>
                    <small>当前阶段只保留目录区层级、搜索、选中态和上下文菜单结构。</small>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        <button
          className="workspace-clone__directory-edge-btn"
          type="button"
          title={isCollapsed ? "展开目录栏" : "收起目录栏"}
          onClick={onToggleCollapsed}
        >
          {isCollapsed ? ">" : "<"}
        </button>

        {contextMenu && (
          <div className="workspace-clone__context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <strong>{contextMenu.title}</strong>
            {contextMenu.kind === "channel" ? (
              <>
                <button type="button" onClick={onCloseContextMenu}>查看绑定</button>
                <button type="button" onClick={onCloseContextMenu}>删除配置</button>
              </>
            ) : contextMenu.kind === "team" ? (
              <>
                <button type="button" onClick={onCloseContextMenu}>编辑团队</button>
                <button type="button" onClick={onCloseContextMenu}>成员管理</button>
              </>
            ) : (
              <>
                <button type="button" onClick={onCloseContextMenu}>查看资料</button>
                <button type="button" onClick={onCloseContextMenu}>移除成员</button>
              </>
            )}
          </div>
        )}
      </aside>

      <WorkspaceCloneChannelBindingModal
        state={channelBindingModal}
        onClose={onCloseChannelBindingModal}
        onSelectView={onSelectChannelBindingView}
      />
    </>
  );
}
