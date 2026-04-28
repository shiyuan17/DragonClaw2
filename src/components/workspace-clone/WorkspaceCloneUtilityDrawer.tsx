import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import type { WorkspaceEntity, WorkspaceHistoryItem, WorkspaceScheduleItem, WorkspaceUtilityPanel, WorkspaceWorkbenchItem } from "./workspaceCloneTypes";

interface WorkspaceCloneUtilityDrawerProps {
  panel: WorkspaceUtilityPanel;
  selectedEntity: WorkspaceEntity | null;
  historyItems: WorkspaceHistoryItem[];
  logs: Array<{ id: string; title: string; subtitle: string }>;
  schedules: WorkspaceScheduleItem[];
  workbenchItems: WorkspaceWorkbenchItem[];
  currentModelName: string;
  currentProviderName: string;
  workspacePath: string;
  running: boolean;
  loading: boolean;
  onClose: () => void;
  onOpenSettingsTextPreview: () => void;
  onOpenModelSwitch: () => void;
  onOpenProviderConfig: () => void;
  onStart: () => void;
  onStop: () => void;
  onOpenConsole: () => void;
}

const PANEL_TITLES: Record<Exclude<WorkspaceUtilityPanel, null>, string> = {
  history: "历史记录",
  logs: "运行日志",
  settings: "Agent 详情",
  schedule: "定时任务",
  workbench: "工作台",
};

export function WorkspaceCloneUtilityDrawer({
  panel,
  selectedEntity,
  historyItems,
  logs,
  schedules,
  workbenchItems,
  currentModelName,
  currentProviderName,
  workspacePath,
  running,
  loading,
  onClose,
  onOpenSettingsTextPreview,
  onOpenModelSwitch,
  onOpenProviderConfig,
  onStart,
  onStop,
  onOpenConsole,
}: WorkspaceCloneUtilityDrawerProps) {
  if (!panel) return null;

  return (
    <aside className="workspace-clone__drawer">
      <header className="workspace-clone__drawer-head">
        <div>
          <strong>{PANEL_TITLES[panel]}</strong>
          <small>当前只保留界面层和本地开合，不接入真实保存或刷新逻辑。</small>
        </div>
        <button type="button" aria-label="关闭抽屉" onClick={onClose}>
          <WorkspaceCloneIcon name="x" size={16} strokeWidth={1.9} />
        </button>
      </header>

      <div className="workspace-clone__drawer-body">
        {panel === "settings" && (
          <>
            <section className="workspace-clone__drawer-card workspace-clone__drawer-card--hero">
              <div className={`workspace-clone__entity-avatar is-${selectedEntity?.accent || "main"} workspace-clone__entity-avatar--drawer`}>
                {selectedEntity?.avatarLabel || "A"}
              </div>
              <div className="workspace-clone__drawer-identity">
                <strong>{selectedEntity?.name || "main"}</strong>
                <small>{selectedEntity?.subtitle || "待命中"}</small>
              </div>
            </section>

            <section className="workspace-clone__drawer-section">
              <div className="workspace-clone__drawer-section-title">服务动作</div>
              <div className="workspace-clone__drawer-grid">
                <button type="button" className="workspace-clone__drawer-tile" onClick={running ? onStop : onStart} disabled={loading}>
                  <span>{running ? "停止服务" : "启动服务"}</span>
                  <small>{running ? "保持当前服务逻辑不变" : "仅从抽屉入口触发服务启动"}</small>
                </button>
                <button type="button" className="workspace-clone__drawer-tile" onClick={onOpenConsole} disabled={!running}>
                  <span>打开控制台</span>
                  <small>{running ? "访问本地控制台" : "服务未启动时保持禁用"}</small>
                </button>
              </div>
            </section>

            <section className="workspace-clone__drawer-section">
              <div className="workspace-clone__drawer-section-title">配置入口</div>
              <div className="workspace-clone__drawer-grid">
                <button type="button" className="workspace-clone__drawer-tile" onClick={onOpenModelSwitch}>
                  <span>模型</span>
                  <small>{currentModelName}</small>
                </button>
                <button type="button" className="workspace-clone__drawer-tile" onClick={onOpenProviderConfig}>
                  <span>Provider</span>
                  <small>{currentProviderName}</small>
                </button>
                <button type="button" className="workspace-clone__drawer-tile" onClick={onOpenSettingsTextPreview}>
                  <span>工作区</span>
                  <small>{workspacePath || "未设置工作区路径"}</small>
                </button>
                <button type="button" className="workspace-clone__drawer-tile">
                  <span>定时任务</span>
                  <small>{schedules.filter((item) => item.enabled).length} 个启用</small>
                </button>
              </div>
            </section>

            <section className="workspace-clone__drawer-card">
              <strong>当前工作</strong>
              <small>{selectedEntity?.currentWork || "等待后续迁移真实业务功能。"}</small>
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
