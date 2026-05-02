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
  onClose: () => void;
  onSelectSessionSection: (section: WorkspaceSessionSectionKey) => void;
  onSelectHistorySession: (sessionKey: string) => void;
  onOpenRelatedResource: (resource: WorkspaceRelatedResource) => void;
  onOpenModelConfig: () => void;
}

const PANEL_TITLES: Record<Exclude<WorkspaceUtilityPanel, null>, string> = {
  history: "历史会话",
  logs: "运行日志",
  session: "会话菜单",
  schedule: "定时任务",
  workbench: "工作台",
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

export function WorkspaceCloneUtilityDrawer({
  panel,
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
  onClose,
  onSelectSessionSection,
  onSelectHistorySession,
  onOpenRelatedResource,
  onOpenModelConfig,
}: WorkspaceCloneUtilityDrawerProps) {
  if (!panel) {
    return null;
  }

  const enabledSkillCount = skillItems.filter((item) => item.tag === "已启用").length;
  const enabledToolCount = toolItems.filter((item) => item.enabled).length;
  const enabledScheduleCount = schedules.filter((item) => item.enabled).length;

  const sessionCards: Array<{
    key: WorkspaceSessionSectionKey;
    icon: Parameters<typeof WorkspaceCloneIcon>[0]["name"];
    summary: string;
  }> = [
    { key: "model", icon: "sparkles", summary: `${currentProviderName || "未配置"} / ${currentModelName || "未选择"}` },
    { key: "memory", icon: "book-open", summary: `${memoryItems.length} 条记忆摘要` },
    { key: "skills", icon: "cpu", summary: `${enabledSkillCount}/${skillItems.length} 项已启用` },
    { key: "commands", icon: "wand", summary: `${commandItems.length} 个常用命令` },
    { key: "tools", icon: "settings", summary: `${enabledToolCount}/${toolItems.length} 项已启用` },
    { key: "channel", icon: "message-circle", summary: `${channelItems.length} 个绑定入口` },
    { key: "schedule", icon: "calendar-clock", summary: `${enabledScheduleCount}/${schedules.length} 项已启用` },
  ];

  return (
    <aside className="workspace-clone__drawer">
      <header className="workspace-clone__drawer-head">
        <div>
          <strong>{PANEL_TITLES[panel]}</strong>
        </div>
        <button type="button" aria-label="关闭侧栏" onClick={onClose}>
          <WorkspaceCloneIcon name="x" size={16} strokeWidth={1.9} />
        </button>
      </header>

      <div className="workspace-clone__drawer-body">
        {panel === "session" && (
          <section className="workspace-clone__drawer-section">
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
                      return;
                    }
                    if (card.key === "memory") {
                      onOpenRelatedResource("memory");
                      return;
                    }
                    if (card.key === "skills") {
                      onOpenRelatedResource("skills");
                      return;
                    }
                    if (card.key === "tools") {
                      onOpenRelatedResource("tools");
                      return;
                    }
                    if (card.key === "commands") {
                      onOpenRelatedResource("commands");
                      return;
                    }
                    if (card.key === "channel") {
                      onOpenRelatedResource("channel");
                      return;
                    }
                    if (card.key === "schedule") {
                      onOpenRelatedResource("schedule");
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
        )}

        {panel === "history" && historyItems.map((item) => {
          const sessionKey = item.sessionKey || item.id;

          return (
            <button
              key={item.id}
              type="button"
              className={`workspace-clone__drawer-card workspace-clone__drawer-card--button ${item.active ? "is-active" : ""}`}
              onClick={() => onSelectHistorySession(sessionKey)}
            >
              <strong>{item.title}</strong>
              <small>{item.subtitle}</small>
              <span>{item.time}</span>
            </button>
          );
        })}

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
