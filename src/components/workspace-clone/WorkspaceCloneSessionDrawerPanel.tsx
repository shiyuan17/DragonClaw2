import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import type {
  WorkspaceRelatedResource,
  WorkspaceResourceItem,
  WorkspaceSessionSectionKey,
  WorkspaceToolItem,
} from "./workspaceCloneTypes";

interface WorkspaceCloneSessionDrawerPanelProps {
  activeSessionSection: WorkspaceSessionSectionKey;
  memoryItems: WorkspaceResourceItem[];
  skillItems: WorkspaceResourceItem[];
  commandItems: WorkspaceResourceItem[];
  channelItems: WorkspaceResourceItem[];
  toolItems: WorkspaceToolItem[];
  tasksCount: number;
  enabledTaskCount: number;
  currentModelName: string;
  currentProviderName: string;
  onSelectSessionSection: (section: WorkspaceSessionSectionKey) => void;
  onOpenRelatedResource: (resource: WorkspaceRelatedResource) => void;
  onOpenModelConfig: () => void;
}

const SECTION_TITLES: Record<WorkspaceSessionSectionKey, string> = {
  model: "模型",
  memory: "记忆",
  skills: "技能库",
  commands: "命令",
  tools: "工具权限",
  channel: "频道",
  schedule: "任务",
};

export function WorkspaceCloneSessionDrawerPanel({
  activeSessionSection,
  memoryItems,
  skillItems,
  commandItems,
  channelItems,
  toolItems,
  tasksCount,
  enabledTaskCount,
  currentModelName,
  currentProviderName,
  onSelectSessionSection,
  onOpenRelatedResource,
  onOpenModelConfig,
}: WorkspaceCloneSessionDrawerPanelProps) {
  const enabledSkillCount = skillItems.filter((item) => item.tag === "已启用").length;
  const enabledToolCount = toolItems.filter((item) => item.enabled).length;
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
    { key: "schedule", icon: "calendar-clock", summary: `${enabledTaskCount}/${tasksCount} 个启用任务` },
  ];

  return (
    <div className="workspace-clone__drawer-body">
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
    </div>
  );
}
