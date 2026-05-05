import { lazy, Suspense } from "react";
import type { WorkspaceEntityType } from "../../types";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import type {
  ChannelBindingModalState,
  DirectoryContextMenuState,
  WorkspaceChannelAgentOption,
  WorkspaceEntity,
  WorkspaceTypeTab,
} from "./workspaceCloneTypes";

const WorkspaceCloneChannelBindingModal = lazy(() =>
  import("./WorkspaceCloneChannelBindingModal").then((module) => ({
    default: module.WorkspaceCloneChannelBindingModal,
  })),
);

interface WorkspaceCloneDirectoryProps {
  typeTabs: WorkspaceTypeTab[];
  activeType: WorkspaceEntityType;
  entities: WorkspaceEntity[];
  selectedEntityId: string;
  isCollapsed: boolean;
  searchQuery: string;
  contextMenu: DirectoryContextMenuState;
  channelBindingModal: ChannelBindingModalState;
  channelBindingAgents: WorkspaceChannelAgentOption[];
  channelBindingAgentId: string;
  channelBindingModalLoading: boolean;
  channelBindingModalSaving: boolean;
  channelBindingNotice: string;
  channelBindingError: string;
  weixinQrStarting: boolean;
  weixinQrPolling: boolean;
  weixinQrUrl: string;
  weixinQrImageUrl: string;
  weixinQrDetail: string;
  weixinQrLogs: string[];
  hasActiveWeixinQrSession: boolean;
  isCurrentWeixinChannelAlreadyBound: boolean;
  weixinQrStatusTone: string;
  weixinQrStatusText: string;
  feishuQrRequesting: boolean;
  feishuQrChecking: boolean;
  feishuQrVisible: boolean;
  feishuQrTargetUrl: string;
  feishuQrUserCode: string;
  feishuQrExpiresAtMs: number | null;
  feishuAppId: string;
  feishuAppSecret: string;
  feishuAppSecretConfigured: boolean;
  feishuAppSecretVisible: boolean;
  feishuDmPolicy: string;
  feishuManualExpanded: boolean;
  feishuAllowFromDraft: string;
  feishuAllowFromSessionIds: string[];
  onToggleCollapsed: () => void;
  onSelectType: (type: WorkspaceEntityType) => void;
  onSelectEntity: (entityId: string) => void;
  onSearchChange: (value: string) => void;
  onOpenContextMenu: (event: React.MouseEvent<HTMLButtonElement>, entity: WorkspaceEntity) => void;
  onCloseContextMenu: () => void;
  onOpenChannelBindingModal: (entity: WorkspaceEntity) => void;
  onCloseChannelBindingModal: () => void;
  onSelectChannelBindingAgent: (agentId: string) => void;
  onStartWeixinQrBinding: () => void;
  onOpenExternalBindingLink: (url: string) => void;
  onRequestFeishuQr: () => void;
  onCheckFeishuQr: () => void;
  onChangeFeishuAppId: (value: string) => void;
  onChangeFeishuAppSecret: (value: string) => void;
  onChangeFeishuDmPolicy: (value: string) => void;
  onChangeFeishuAllowFromDraft: (value: string) => void;
  onAddFeishuAllowFromSessionId: () => void;
  onRemoveFeishuAllowFromSessionId: (sessionId: string) => void;
  onToggleFeishuManualExpanded: () => void;
  onToggleFeishuAppSecretVisible: () => void;
  onSaveChannelBinding: () => void;
  onRemoveChannelBinding: (entityId: string) => void;
}

function renderEntityAvatar(entity: WorkspaceEntity) {
  if (entity.avatarUrl) {
    return <img src={entity.avatarUrl} alt="" className="workspace-clone__entity-avatar-image" />;
  }
  if (entity.iconSrc) {
    return <img src={entity.iconSrc} alt="" className="workspace-clone__entity-avatar-image" />;
  }
  if (entity.memberLabels?.length) {
    return (
      <span className="workspace-clone__avatar-stack-inline">
        {entity.memberLabels.slice(0, 3).map((label) => (
          <span key={`${entity.id}-${label}`} className="workspace-clone__avatar-stack-chip">{label}</span>
        ))}
      </span>
    );
  }
  return entity.avatarLabel;
}

function renderChannelButton(
  entity: WorkspaceEntity,
  selectedEntityId: string,
  onSelectEntity: (entityId: string) => void,
  onOpenContextMenu: (event: React.MouseEvent<HTMLButtonElement>, entity: WorkspaceEntity) => void,
  onOpenChannelBindingModal: (entity: WorkspaceEntity) => void,
) {
  const handleClick = () => {
    onSelectEntity(entity.id);
    if (entity.isCatalogEntry) {
      onOpenChannelBindingModal(entity);
    }
  };

  return (
    <button
      key={entity.id}
      className={[
        "workspace-clone__entity-item",
        "workspace-clone__entity-item--channel",
        entity.isCatalogEntry ? "workspace-clone__entity-item--channel-catalog" : "workspace-clone__entity-item--channel-chat",
        selectedEntityId === entity.id ? "is-active" : "",
        entity.isCatalogEntry ? "is-catalog" : "",
      ].join(" ").trim()}
      type="button"
      onClick={handleClick}
      onContextMenu={(event) => {
        if (!entity.isBoundChannel) {
          return;
        }
        event.preventDefault();
        onOpenContextMenu(event, entity);
      }}
    >
      <span className="workspace-clone__entity-main workspace-clone__entity-main--channel">
        <span className="workspace-clone__entity-avatar workspace-clone__entity-avatar--channel">
          {renderEntityAvatar(entity)}
        </span>
        <span className="workspace-clone__entity-text workspace-clone__entity-text--channel">
          <strong>{entity.isCatalogEntry ? entity.name : entity.channelLabel || entity.name}</strong>
          {!entity.isCatalogEntry && <small>{entity.subtitle}</small>}
        </span>
      </span>
      <span className="workspace-clone__entity-actions workspace-clone__entity-actions--channel">
        {entity.isBoundChannel ? (
          <span
            className="workspace-clone__entity-link workspace-clone__entity-link--channel"
            role="button"
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
              onOpenChannelBindingModal(entity);
            }}
          >
            配置
          </span>
        ) : null}
        <i className={`workspace-clone__entity-status is-${entity.status}`} />
      </span>
    </button>
  );
}

function renderEntityButton(
  entity: WorkspaceEntity,
  selectedEntityId: string,
  activeType: WorkspaceEntityType,
  onSelectEntity: (entityId: string) => void,
  onOpenContextMenu: (event: React.MouseEvent<HTMLButtonElement>, entity: WorkspaceEntity) => void,
  onOpenChannelBindingModal: (entity: WorkspaceEntity) => void,
) {
  if (activeType === "channels") {
    return renderChannelButton(
      entity,
      selectedEntityId,
      onSelectEntity,
      onOpenContextMenu,
      onOpenChannelBindingModal,
    );
  }

  return (
    <button
      key={entity.id}
      className={`workspace-clone__entity-item ${selectedEntityId === entity.id ? "is-active" : ""} ${entity.isCatalogEntry ? "is-catalog" : ""}`}
      type="button"
      onClick={() => onSelectEntity(entity.id)}
      onContextMenu={(event) => {
        if (!entity.isBoundChannel) {
          return;
        }
        event.preventDefault();
        onOpenContextMenu(event, entity);
      }}
    >
      <span className={`workspace-clone__entity-avatar is-${entity.accent}`}>
        {renderEntityAvatar(entity)}
      </span>
      <span className="workspace-clone__entity-text">
        <strong>{entity.name}</strong>
        {entity.subtitle ? <small title={entity.subtitle}>{entity.subtitle}</small> : null}
      </span>
      <i className={`workspace-clone__entity-status is-${entity.status}`} />
    </button>
  );
}

export function WorkspaceCloneDirectory({
  typeTabs,
  activeType,
  entities,
  selectedEntityId,
  isCollapsed,
  searchQuery: _searchQuery,
  contextMenu,
  channelBindingModal,
  channelBindingAgents,
  channelBindingAgentId,
  channelBindingModalLoading,
  channelBindingModalSaving,
  channelBindingNotice,
  channelBindingError,
  weixinQrStarting,
  weixinQrPolling,
  weixinQrUrl,
  weixinQrImageUrl,
  weixinQrDetail,
  weixinQrLogs,
  hasActiveWeixinQrSession,
  isCurrentWeixinChannelAlreadyBound,
  weixinQrStatusTone,
  weixinQrStatusText,
  feishuQrRequesting,
  feishuQrChecking,
  feishuQrVisible,
  feishuQrTargetUrl,
  feishuQrUserCode,
  feishuQrExpiresAtMs,
  feishuAppId,
  feishuAppSecret,
  feishuAppSecretConfigured,
  feishuAppSecretVisible,
  feishuDmPolicy,
  feishuManualExpanded,
  feishuAllowFromDraft,
  feishuAllowFromSessionIds,
  onToggleCollapsed,
  onSelectType,
  onSelectEntity,
  onSearchChange: _onSearchChange,
  onOpenContextMenu,
  onCloseContextMenu,
  onOpenChannelBindingModal,
  onCloseChannelBindingModal,
  onSelectChannelBindingAgent,
  onStartWeixinQrBinding,
  onOpenExternalBindingLink,
  onRequestFeishuQr,
  onCheckFeishuQr,
  onChangeFeishuAppId,
  onChangeFeishuAppSecret,
  onChangeFeishuDmPolicy,
  onChangeFeishuAllowFromDraft,
  onAddFeishuAllowFromSessionId,
  onRemoveFeishuAllowFromSessionId,
  onToggleFeishuManualExpanded,
  onToggleFeishuAppSecretVisible,
  onSaveChannelBinding,
  onRemoveChannelBinding,
}: WorkspaceCloneDirectoryProps) {
  const emptyLabel = activeType === "channels" ? "暂无频道结果" : activeType === "teams" ? "暂无团队结果" : "暂无数字员工结果";
  const directoryToggleLabel = isCollapsed ? "展开目录栏" : "收起目录栏";
  const visibleEntities = activeType === "agents" ? entities : entities.slice(0, 6);
  const boundChannels = activeType === "channels" ? entities.filter((entity) => entity.isBoundChannel) : [];
  const catalogChannels = activeType === "channels" ? entities.filter((entity) => entity.isCatalogEntry) : [];

  return (
    <>
      <aside className={`workspace-clone__directory ${isCollapsed ? "is-collapsed" : ""}`}>
        <div className="workspace-clone__edge-trigger workspace-clone__edge-trigger--directory">
          <button className="workspace-clone__directory-edge-btn" type="button" title={directoryToggleLabel} onClick={onToggleCollapsed}>
            <WorkspaceCloneIcon
              name="chevron-right"
              size={14}
              strokeWidth={2}
              className={`workspace-clone__directory-edge-icon ${isCollapsed ? "is-collapsed" : ""}`}
            />
          </button>
        </div>
        {isCollapsed ? (
          <div className="workspace-clone__directory-mini-rail">
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
                  onClick={() => {
                    onSelectEntity(entity.id);
                    if (activeType === "channels" && entity.isCatalogEntry) {
                      onOpenChannelBindingModal(entity);
                    }
                  }}
                >
                  <span className="workspace-clone__mini-entity-avatar">
                    {entity.avatarUrl ? (
                      <img src={entity.avatarUrl} alt="" className="workspace-clone__entity-avatar-image" />
                    ) : entity.iconSrc ? (
                      <img src={entity.iconSrc} alt="" className="workspace-clone__entity-avatar-image" />
                    ) : (
                      entity.avatarLabel
                    )}
                  </span>
                  <i className={`workspace-clone__mini-entity-status is-${entity.status}`} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
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

            {activeType === "channels" ? (
              <section className="workspace-clone__entity-list workspace-clone__entity-list--channels">
                <div className="workspace-clone__directory-section">
                  <div className="workspace-clone__directory-section-head">
                    <strong>频道会话</strong>
                    <small>{boundChannels.length > 0 ? `${boundChannels.length} 个已绑定账号` : "暂无已绑定频道"}</small>
                  </div>
                  {boundChannels.length > 0 ? (
                    boundChannels.map((entity) =>
                      renderEntityButton(
                        entity,
                        selectedEntityId,
                        activeType,
                        onSelectEntity,
                        onOpenContextMenu,
                        onOpenChannelBindingModal,
                      ),
                    )
                  ) : (
                    <div className="workspace-clone__entity-empty workspace-clone__entity-empty--compact">
                      <div className="workspace-clone__empty-card">
                        <strong>还没有已绑定频道</strong>
                        <small>先完成微信或飞书绑定，随后频道会以会话卡形式出现在这里。</small>
                      </div>
                    </div>
                  )}
                </div>

                <div className="workspace-clone__directory-section">
                  <div className="workspace-clone__directory-section-head">
                    <strong>频道目录</strong>
                    <small>首批展示 8 个平台</small>
                  </div>
                  <div className="workspace-clone__directory-channel-grid">
                    {catalogChannels.map((entity) =>
                      renderEntityButton(
                        entity,
                        selectedEntityId,
                        activeType,
                        onSelectEntity,
                        onOpenContextMenu,
                        onOpenChannelBindingModal,
                      ),
                    )}
                  </div>
                </div>
              </section>
            ) : (
              <section className={`workspace-clone__entity-list ${activeType === "agents" ? "is-agents" : ""}`}>
                {visibleEntities.length > 0 ? (
                  visibleEntities.map((entity) =>
                    renderEntityButton(
                      entity,
                      selectedEntityId,
                      activeType,
                      onSelectEntity,
                      onOpenContextMenu,
                      onOpenChannelBindingModal,
                    ),
                  )
                ) : (
                  <div className="workspace-clone__entity-empty">
                    <div className="workspace-clone__empty-card">
                      <strong>{emptyLabel}</strong>
                      <small>当前阶段只保留目录区层级、搜索、选中态和上下文菜单结构。</small>
                    </div>
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {contextMenu && (
          <div className="workspace-clone__context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <strong>{contextMenu.title}</strong>
            {contextMenu.kind === "channel" ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onCloseContextMenu();
                    const target = entities.find((entity) => entity.id === contextMenu.entityId);
                    if (target) {
                      onOpenChannelBindingModal(target);
                    }
                  }}
                >
                  查看绑定
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCloseContextMenu();
                    onRemoveChannelBinding(contextMenu.entityId);
                  }}
                >
                  删除绑定
                </button>
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

      {channelBindingModal.open ? (
        <Suspense fallback={null}>
          <WorkspaceCloneChannelBindingModal
            state={channelBindingModal}
            availableAgents={channelBindingAgents}
            selectedAgentId={channelBindingAgentId}
            modalLoading={channelBindingModalLoading}
            modalSaving={channelBindingModalSaving}
            modalNotice={channelBindingNotice}
            modalError={channelBindingError}
            weixinQrStarting={weixinQrStarting}
            weixinQrPolling={weixinQrPolling}
            weixinQrUrl={weixinQrUrl}
            weixinQrImageUrl={weixinQrImageUrl}
            weixinQrDetail={weixinQrDetail}
            weixinQrLogs={weixinQrLogs}
            hasActiveWeixinQrSession={hasActiveWeixinQrSession}
            isCurrentWeixinChannelAlreadyBound={isCurrentWeixinChannelAlreadyBound}
            weixinQrStatusTone={weixinQrStatusTone}
            weixinQrStatusText={weixinQrStatusText}
            feishuQrRequesting={feishuQrRequesting}
            feishuQrChecking={feishuQrChecking}
            feishuQrVisible={feishuQrVisible}
            feishuQrTargetUrl={feishuQrTargetUrl}
            feishuQrUserCode={feishuQrUserCode}
            feishuQrExpiresAtMs={feishuQrExpiresAtMs}
            feishuAppId={feishuAppId}
            feishuAppSecret={feishuAppSecret}
            feishuAppSecretConfigured={feishuAppSecretConfigured}
            feishuAppSecretVisible={feishuAppSecretVisible}
            feishuDmPolicy={feishuDmPolicy}
            feishuManualExpanded={feishuManualExpanded}
            feishuAllowFromDraft={feishuAllowFromDraft}
            feishuAllowFromSessionIds={feishuAllowFromSessionIds}
            onClose={onCloseChannelBindingModal}
            onSelectAgent={onSelectChannelBindingAgent}
            onStartWeixinQrBinding={onStartWeixinQrBinding}
            onOpenExternalLink={onOpenExternalBindingLink}
            onRequestFeishuQr={onRequestFeishuQr}
            onCheckFeishuQr={onCheckFeishuQr}
            onChangeFeishuAppId={onChangeFeishuAppId}
            onChangeFeishuAppSecret={onChangeFeishuAppSecret}
            onChangeFeishuDmPolicy={onChangeFeishuDmPolicy}
            onChangeFeishuAllowFromDraft={onChangeFeishuAllowFromDraft}
            onAddFeishuAllowFromSessionId={onAddFeishuAllowFromSessionId}
            onRemoveFeishuAllowFromSessionId={onRemoveFeishuAllowFromSessionId}
            onToggleFeishuManualExpanded={onToggleFeishuManualExpanded}
            onToggleFeishuAppSecretVisible={onToggleFeishuAppSecretVisible}
            onSaveBinding={onSaveChannelBinding}
          />
        </Suspense>
      ) : null}
    </>
  );
}
