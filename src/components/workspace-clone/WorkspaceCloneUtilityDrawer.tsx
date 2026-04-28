import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import type {
  WorkspaceEntity,
  WorkspaceHistoryItem,
  WorkspaceRelatedResource,
  WorkspaceResourceItem,
  WorkspaceScheduleItem,
  WorkspaceSessionSectionKey,
  WorkspaceToolItem,
  WorkspaceUtilityPanel,
  WorkspaceWorkbenchItem,
} from "./workspaceCloneTypes";

interface WorkspaceCloneUtilityDrawerProps {
  panel: WorkspaceUtilityPanel;
  selectedEntity: WorkspaceEntity | null;
  activeSessionSection: WorkspaceSessionSectionKey;
  historyItems: WorkspaceHistoryItem[];
  logs: Array<{ id: string; title: string; subtitle: string }>;
  schedules: WorkspaceScheduleItem[];
  workbenchItems: WorkspaceWorkbenchItem[];
  memoryItems: WorkspaceResourceItem[];
  skillItems: WorkspaceResourceItem[];
  commandItems: WorkspaceResourceItem[];
  channelItems: WorkspaceResourceItem[];
  toolItems: WorkspaceToolItem[];
  currentModelName: string;
  currentProviderName: string;
  workspacePath: string;
  running: boolean;
  loading: boolean;
  onClose: () => void;
  onSelectSessionSection: (section: WorkspaceSessionSectionKey) => void;
  onOpenRelatedResource: (resource: WorkspaceRelatedResource) => void;
  onOpenSettingsTextPreview: () => void;
  onOpenModelConfig: () => void;
  onStart: () => void;
  onStop: () => void;
  onOpenConsole: () => void;
}

const PANEL_TITLES: Record<Exclude<WorkspaceUtilityPanel, null>, string> = {
  history: "历史会话",
  logs: "运行日志",
  session: "会话菜单",
  schedule: "定时任务",
  workbench: "工作台",
};

const STATUS_LABELS: Record<NonNullable<WorkspaceEntity["status"]>, string> = {
  online: "在线",
  busy: "工作中",
  offline: "未连接",
};

const SECTION_TITLES: Record<WorkspaceSessionSectionKey, string> = {
  model: "模型",
  memory: "记忆",
  skills: "技能库",
  commands: "命令",
  tools: "工具权限",
  channel: "频道",
  schedule: "定时任务",
};

const SECTION_DESCRIPTIONS: Record<WorkspaceSessionSectionKey, string> = {
  model: "查看当前 Provider 和默认模型，并从这里进入切换与配置入口。",
  memory: "汇总当前会话的重点记忆与固定提示。",
  skills: "查看已启用的技能项，并继续进入更完整的技能列表。",
  commands: "承接常用命令和快捷指令入口。",
  tools: "集中查看当前工具权限与可用能力。",
  channel: "查看已绑定频道与会话入口。",
  schedule: "查看当前会话相关的定时任务摘要。",
};

export function WorkspaceCloneUtilityDrawer({
  panel,
  selectedEntity,
  activeSessionSection,
  historyItems,
  logs,
  schedules,
  workbenchItems,
  memoryItems,
  skillItems,
  commandItems,
  channelItems,
  toolItems,
  currentModelName,
  currentProviderName,
  workspacePath,
  running,
  loading,
  onClose,
  onSelectSessionSection,
  onOpenRelatedResource,
  onOpenSettingsTextPreview,
  onOpenModelConfig,
  onStart,
  onStop,
  onOpenConsole,
}: WorkspaceCloneUtilityDrawerProps) {
  if (!panel) return null;

  const enabledToolCount = toolItems.filter((item) => item.enabled).length;
  const enabledScheduleCount = schedules.filter((item) => item.enabled).length;
  const activeStatus = selectedEntity?.status || "offline";
  const currentSectionTitle = SECTION_TITLES[activeSessionSection];
  const currentSectionDescription = SECTION_DESCRIPTIONS[activeSessionSection];
  const listItemsMap: Partial<Record<WorkspaceSessionSectionKey, WorkspaceResourceItem[]>> = {
    memory: memoryItems,
    skills: skillItems,
    commands: commandItems,
    channel: channelItems,
    schedule: schedules.map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      tag: item.enabled ? "已启用" : "未启用",
    })),
  };

  const sessionCards: Array<{
    key: WorkspaceSessionSectionKey;
    icon: Parameters<typeof WorkspaceCloneIcon>[0]["name"];
    summary: string;
  }> = [
    { key: "model", icon: "sparkles", summary: `${currentProviderName || "未配置"} / ${currentModelName || "未选择"}` },
    { key: "memory", icon: "book-open", summary: `${memoryItems.length} 条记忆摘要` },
    { key: "skills", icon: "cpu", summary: `${skillItems.length} 项可用技能` },
    { key: "commands", icon: "wand", summary: `${commandItems.length} 个常用命令` },
    { key: "tools", icon: "settings", summary: `${enabledToolCount}/${toolItems.length} 已启用` },
    { key: "channel", icon: "message-circle", summary: `${channelItems.length} 个绑定入口` },
    { key: "schedule", icon: "calendar-clock", summary: `${enabledScheduleCount}/${schedules.length} 已启用` },
  ];

  const renderSessionDetail = () => {
    if (activeSessionSection === "model") {
      return (
        <section className="workspace-clone__drawer-card workspace-clone__session-detail-card">
          <div className="workspace-clone__drawer-section-title">当前模块</div>
          <div className="workspace-clone__session-detail-head">
            <div>
              <strong>{currentSectionTitle}</strong>
              <small>{currentSectionDescription}</small>
            </div>
            <span className="workspace-clone__resource-tag">Primary</span>
          </div>

          <div className="workspace-clone__session-meta-grid">
            <div>
              <span>当前模型</span>
              <strong>{currentModelName || "未选择"}</strong>
            </div>
            <div>
              <span>Provider</span>
              <strong>{currentProviderName || "未配置"}</strong>
            </div>
          </div>

          <div className="workspace-clone__session-actions">
            <button type="button" className="workspace-clone__composer-pill" onClick={onOpenModelConfig}>
              切换模型
            </button>
            <button type="button" className="workspace-clone__composer-pill" onClick={onOpenModelConfig}>
              配置 Provider
            </button>
          </div>
        </section>
      );
    }

    if (activeSessionSection === "tools") {
      return (
        <section className="workspace-clone__drawer-card workspace-clone__session-detail-card">
          <div className="workspace-clone__drawer-section-title">当前模块</div>
          <div className="workspace-clone__session-detail-head">
            <div>
              <strong>{currentSectionTitle}</strong>
              <small>{currentSectionDescription}</small>
            </div>
            <span className="workspace-clone__resource-tag">{enabledToolCount} 已启用</span>
          </div>

          <div className="workspace-clone__session-list">
            {toolItems.map((item) => (
              <div key={item.id} className="workspace-clone__resource-row workspace-clone__session-row">
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </div>
                <button type="button" className={item.enabled ? "is-enabled" : ""} onClick={() => onOpenRelatedResource("tools")}>
                  {item.enabled ? "已启用" : "未启用"}
                </button>
              </div>
            ))}
          </div>
        </section>
      );
    }

    const sectionItems = listItemsMap[activeSessionSection] || [];
    return (
      <section className="workspace-clone__drawer-card workspace-clone__session-detail-card">
        <div className="workspace-clone__drawer-section-title">当前模块</div>
        <div className="workspace-clone__session-detail-head">
          <div>
            <strong>{currentSectionTitle}</strong>
            <small>{currentSectionDescription}</small>
          </div>
          <button type="button" className="workspace-clone__composer-pill" onClick={() => onOpenRelatedResource(activeSessionSection)}>
            查看详情
          </button>
        </div>

        <div className="workspace-clone__session-list">
          {sectionItems.map((item) => (
            <div key={item.id} className="workspace-clone__resource-row workspace-clone__session-row">
              <div>
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
              </div>
              {item.tag && <span className="workspace-clone__resource-tag">{item.tag}</span>}
            </div>
          ))}
        </div>
      </section>
    );
  };

  return (
    <aside className="workspace-clone__drawer">
      <header className="workspace-clone__drawer-head">
        <div>
          <strong>{PANEL_TITLES[panel]}</strong>
          <small>
            {panel === "session"
              ? "围绕当前会话查看配置入口、资源摘要和最近状态。"
              : "保留当前面板结构，继续承接历史、日志与次级视图。"}
          </small>
        </div>
        <button type="button" aria-label="关闭侧栏" onClick={onClose}>
          <WorkspaceCloneIcon name="x" size={16} strokeWidth={1.9} />
        </button>
      </header>

      <div className="workspace-clone__drawer-body">
        {panel === "session" && (
          <>
            <section className="workspace-clone__drawer-card workspace-clone__drawer-card--hero workspace-clone__drawer-card--session">
              <div className={`workspace-clone__entity-avatar is-${selectedEntity?.accent || "main"} workspace-clone__entity-avatar--drawer`}>
                {selectedEntity?.avatarLabel || "A"}
              </div>
              <div className="workspace-clone__drawer-identity">
                <div className="workspace-clone__drawer-identity-main">
                  <strong>{selectedEntity?.name || "main"}</strong>
                  <span className={`workspace-clone__status-inline is-${activeStatus}`}>{STATUS_LABELS[activeStatus]}</span>
                </div>
                <small>{selectedEntity?.subtitle || "待命中"}</small>
                <p>{selectedEntity?.currentWork || "等待继续接入真实会话能力。"}</p>
              </div>
            </section>

            <section className="workspace-clone__drawer-section">
              <div className="workspace-clone__drawer-section-title">会话入口</div>
              <div className="workspace-clone__session-grid">
                {sessionCards.map((card) => (
                  <button
                    key={card.key}
                    type="button"
                    className={`workspace-clone__session-tile ${activeSessionSection === card.key ? "is-active" : ""}`}
                    onClick={() => {
                      onSelectSessionSection(card.key);
                      if (card.key === "model") {
                        onOpenModelConfig();
                      }
                    }}
                  >
                    <span className="workspace-clone__session-tile-icon">
                      <WorkspaceCloneIcon name={card.icon} size={15} strokeWidth={1.9} />
                    </span>
                    <div className="workspace-clone__session-tile-copy">
                      <strong>{SECTION_TITLES[card.key]}</strong>
                      <small>{card.summary}</small>
                    </div>
                    <WorkspaceCloneIcon name="chevron-right" size={13} strokeWidth={2} />
                  </button>
                ))}
              </div>
            </section>

            {renderSessionDetail()}

            <section className="workspace-clone__drawer-card workspace-clone__session-summary">
              <div className="workspace-clone__drawer-section-title">会话摘要</div>
              <div className="workspace-clone__session-meta-grid">
                <div>
                  <span>模型</span>
                  <strong>{currentProviderName || "未配置"} / {currentModelName || "未选择"}</strong>
                </div>
                <div>
                  <span>员工 ID</span>
                  <strong>{selectedEntity?.id || "main"}</strong>
                </div>
                <div>
                  <span>工具权限</span>
                  <strong>{enabledToolCount === toolItems.length ? "全量" : `${enabledToolCount}/${toolItems.length} 可用`}</strong>
                </div>
                <div>
                  <span>所属频道</span>
                  <strong>{channelItems[0]?.title || "main"}</strong>
                </div>
                <div>
                  <span>最近产出</span>
                  <strong>{selectedEntity?.recentOutput || "等待新输出"}</strong>
                </div>
                <div>
                  <span>工作目录</span>
                  <strong>{workspacePath || "未设置工作区"}</strong>
                </div>
              </div>

              <div className="workspace-clone__session-actions">
                <button type="button" className="workspace-clone__composer-pill" onClick={running ? onOpenConsole : onStart} disabled={loading}>
                  {running ? "打开控制台" : "启动服务"}
                </button>
                <button type="button" className="workspace-clone__composer-pill" onClick={onOpenSettingsTextPreview}>
                  查看工作区
                </button>
                {running && (
                  <button type="button" className="workspace-clone__composer-pill" onClick={onStop} disabled={loading}>
                    停止服务
                  </button>
                )}
              </div>
            </section>
          </>
        )}

        {panel === "history" && historyItems.map((item) => (
          <section key={item.id} className="workspace-clone__drawer-card">
            <strong>{item.title}</strong>
            <small>{item.subtitle}</small>
            <span>{item.time}</span>
          </section>
        ))}

        {panel === "logs" && logs.map((item) => (
          <section key={item.id} className="workspace-clone__drawer-card">
            <strong>{item.title}</strong>
            <small>{item.subtitle}</small>
          </section>
        ))}

        {panel === "schedule" && schedules.map((item) => (
          <section key={item.id} className="workspace-clone__drawer-card">
            <strong>{item.title}</strong>
            <small>{item.subtitle}</small>
            <span className={`workspace-clone__status-inline is-${item.tone}`}>{item.enabled ? "已启用" : "未启用"}</span>
          </section>
        ))}

        {panel === "workbench" && workbenchItems.map((item) => (
          <section key={item.id} className="workspace-clone__drawer-card">
            <strong>{item.title}</strong>
            <small>{item.detail}</small>
            <span>{item.time}</span>
          </section>
        ))}
      </div>
    </aside>
  );
}
