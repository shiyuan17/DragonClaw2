import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import type {
  WorkspaceEntity,
  WorkspaceHistoryFilter,
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
  historyFilter: WorkspaceHistoryFilter;
  onClose: () => void;
  onSelectSessionSection: (section: WorkspaceSessionSectionKey) => void;
  onSelectHistoryFilter: (filter: WorkspaceHistoryFilter) => void;
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

const HISTORY_FILTERS: Array<{ key: WorkspaceHistoryFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "today", label: "今天" },
  { key: "yesterday", label: "昨天" },
];

function buildCalendarKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

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
  historyFilter,
  onClose,
  onSelectSessionSection,
  onSelectHistoryFilter,
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
  const now = new Date();
  const todayKey = buildCalendarKey(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterdayKey = buildCalendarKey(yesterdayDate);
  const filteredHistoryItems = historyItems.filter((item) => {
    if (historyFilter === "all") {
      return true;
    }

    if (!item.updatedAt) {
      return false;
    }

    const itemKey = buildCalendarKey(new Date(item.updatedAt));
    return historyFilter === "today" ? itemKey === todayKey : itemKey === yesterdayKey;
  });

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
        <div className="workspace-clone__drawer-head-top">
          <div>
            <strong>{PANEL_TITLES[panel]}</strong>
          </div>
          <button type="button" aria-label="关闭侧栏" onClick={onClose}>
            <WorkspaceCloneIcon name="x" size={16} strokeWidth={1.9} />
          </button>
        </div>
        {panel === "history" ? (
          <div className="workspace-clone__drawer-filters" role="tablist" aria-label="历史会话时间筛选">
            {HISTORY_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                className={`workspace-clone__drawer-filter ${historyFilter === filter.key ? "is-active" : ""}`}
                onClick={() => onSelectHistoryFilter(filter.key)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        ) : null}
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

        {panel === "history" && filteredHistoryItems.map((item) => {
          const sessionKey = item.sessionKey || item.id;

          return (
            <button
              key={item.id}
              type="button"
              className={`workspace-clone__drawer-card workspace-clone__drawer-card--button workspace-clone__drawer-card--history ${item.active ? "is-active" : ""}`}
              onClick={() => onSelectHistorySession(sessionKey)}
            >
              <strong className="workspace-clone__drawer-card-title">{item.title}</strong>
              <span className="workspace-clone__drawer-card-time">{item.time}</span>
            </button>
          );
        })}

        {panel === "history" && filteredHistoryItems.length === 0 ? (
          <section className="workspace-clone__empty-card workspace-clone__drawer-empty">
            <strong>暂无会话</strong>
            <small>{historyFilter === "all" ? "当前还没有可展示的历史会话。" : "当前筛选条件下没有匹配的历史会话。"}</small>
          </section>
        ) : null}

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
