import { WorkspaceCloneUtilityDrawer } from "./WorkspaceCloneUtilityDrawer";
import { WORKSPACE_HOME_SUGGESTIONS } from "./workspaceCloneData";
import type {
  WorkspaceEntity,
  WorkspaceHistoryItem,
  WorkspaceMessage,
  WorkspaceScheduleItem,
  WorkspaceUtilityPanel,
  WorkspaceWorkbenchItem,
} from "./workspaceCloneTypes";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";

interface WorkspaceCloneChatViewProps {
  selectedEntity: WorkspaceEntity | null;
  messages: WorkspaceMessage[];
  utilityPanel: WorkspaceUtilityPanel;
  historyItems: WorkspaceHistoryItem[];
  logs: Array<{ id: string; title: string; subtitle: string }>;
  schedules: WorkspaceScheduleItem[];
  workbenchItems: WorkspaceWorkbenchItem[];
  currentModelName: string;
  currentProviderName: string;
  workspacePath: string;
  running: boolean;
  loading: boolean;
  onCloseUtilityPanel: () => void;
  onOpenSettingsTextPreview: () => void;
  onStart: () => void;
  onStop: () => void;
  onOpenConsole: () => void;
  onOpenModelSwitch: () => void;
  onOpenProviderConfig: () => void;
  onOpenLogs: () => void;
}

export function WorkspaceCloneChatView({
  selectedEntity,
  messages,
  utilityPanel,
  historyItems,
  logs,
  schedules,
  workbenchItems,
  currentModelName,
  currentProviderName,
  workspacePath,
  running,
  loading,
  onCloseUtilityPanel,
  onOpenSettingsTextPreview,
  onStart,
  onStop,
  onOpenConsole,
  onOpenModelSwitch,
  onOpenProviderConfig,
  onOpenLogs,
}: WorkspaceCloneChatViewProps) {
  const primaryMessage = messages[0] ?? null;

  return (
    <div className={`workspace-clone__chat-layout ${utilityPanel ? "drawer-open" : ""}`}>
      <div className="workspace-clone__chat-main">
        <div className="workspace-clone__canvas">
          {primaryMessage && (
            <article className="workspace-clone__message workspace-clone__message--minimal">
              <div className="workspace-clone__message-marker">{primaryMessage.author}</div>
              <div className="workspace-clone__message-content">
                <p>{primaryMessage.text}</p>
                <span>{primaryMessage.time}</span>
              </div>
            </article>
          )}

          <div className="workspace-clone__canvas-fill" />

          <div className="workspace-clone__suggestion-strip">
            {WORKSPACE_HOME_SUGGESTIONS.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className="workspace-clone__suggestion-card"
                onClick={index === 1 ? onOpenLogs : index === 2 ? onOpenSettingsTextPreview : undefined}
              >
                <span className="workspace-clone__suggestion-icon">
                  <WorkspaceCloneIcon
                    name={item.icon as Parameters<typeof WorkspaceCloneIcon>[0]["name"]}
                    size={15}
                    strokeWidth={1.9}
                  />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <WorkspaceCloneUtilityDrawer
        panel={utilityPanel}
        selectedEntity={selectedEntity}
        historyItems={historyItems}
        logs={logs}
        schedules={schedules}
        workbenchItems={workbenchItems}
        currentModelName={currentModelName}
        currentProviderName={currentProviderName}
        workspacePath={workspacePath}
        running={running}
        loading={loading}
        onClose={onCloseUtilityPanel}
        onOpenSettingsTextPreview={onOpenSettingsTextPreview}
        onOpenModelSwitch={onOpenModelSwitch}
        onOpenProviderConfig={onOpenProviderConfig}
        onStart={onStart}
        onStop={onStop}
        onOpenConsole={onOpenConsole}
      />
    </div>
  );
}
