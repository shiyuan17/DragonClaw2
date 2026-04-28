import { WorkspaceCloneUtilityDrawer } from "./WorkspaceCloneUtilityDrawer";
import { WORKSPACE_HOME_SUGGESTIONS } from "./workspaceCloneData";
import type {
  WorkspaceEntity,
  WorkspaceGatewayStatus,
  WorkspaceHistoryItem,
  WorkspaceMessage,
  WorkspaceScheduleItem,
  WorkspaceUtilityPanel,
  WorkspaceWorkbenchItem,
} from "./workspaceCloneTypes";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";

interface WorkspaceCloneChatViewProps {
  selectedEntity: WorkspaceEntity | null;
  chatEnabled: boolean;
  messages: WorkspaceMessage[];
  connectionStatus: WorkspaceGatewayStatus;
  connectionError: string | null;
  historyLoading: boolean;
  isGenerating: boolean;
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
  chatEnabled,
  messages,
  connectionStatus,
  connectionError,
  historyLoading,
  isGenerating,
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
  const hasMessages = messages.length > 0;
  const showDisconnectedState = !chatEnabled || !running || connectionStatus === "error";
  const showConnectingState = running && connectionStatus === "connecting" && !hasMessages;

  return (
    <div className={`workspace-clone__chat-layout ${utilityPanel ? "drawer-open" : ""}`}>
      <div className="workspace-clone__chat-main">
        <div className="workspace-clone__canvas">
          {showDisconnectedState ? (
            <section className="workspace-clone__empty-state">
              <div className="workspace-clone__empty-state-icon">
                <WorkspaceCloneIcon name={running ? "terminal" : "panel"} size={18} strokeWidth={1.9} />
              </div>
              <div className="workspace-clone__empty-state-copy">
                <strong>
                  {!chatEnabled ? "频道和团队暂未接入真实会话" : running ? "首页聊天暂时连不上 OpenClaw" : "服务未启动"}
                </strong>
                <p>
                  {!chatEnabled
                    ? "本期只有“数字员工”标签会切到真实 Agent 主会话，频道和团队先继续保留占位。"
                    : connectionError || (running ? "请稍等服务恢复，或在右侧操作中重新打开控制台检查状态。" : "启动服务后，这里会接入真实 Agent 会话与聊天记录。")}
                </p>
              </div>
              <div className="workspace-clone__empty-state-actions">
                {!chatEnabled ? null : !running ? (
                  <button type="button" className="workspace-clone__composer-action-text is-solid" onClick={onStart}>
                    启动服务
                  </button>
                ) : (
                  <>
                    <button type="button" className="workspace-clone__composer-action-text is-solid" onClick={onOpenConsole}>
                      打开控制台
                    </button>
                    <button type="button" className="workspace-clone__composer-action-text" onClick={onOpenLogs}>
                      查看日志
                    </button>
                  </>
                )}
              </div>
            </section>
          ) : showConnectingState ? (
            <section className="workspace-clone__empty-state">
              <div className="workspace-clone__empty-state-icon">
                <WorkspaceCloneIcon name="sparkles" size={18} strokeWidth={1.9} />
              </div>
              <div className="workspace-clone__empty-state-copy">
                <strong>正在连接首页聊天</strong>
                <p>OpenClaw 网关就绪后，这里会自动拉取 Agent 列表和主会话历史。</p>
              </div>
            </section>
          ) : hasMessages ? (
            <div className="workspace-clone__message-list">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={[
                    "workspace-clone__message",
                    "workspace-clone__message--chat",
                    `is-${message.role}`,
                    message.status ? `is-${message.status}` : "",
                  ].join(" ").trim()}
                >
                  <div className="workspace-clone__message-marker">{message.author}</div>
                  <div className="workspace-clone__message-content">
                    <p>{message.text}</p>
                    <span>
                      {message.status === "streaming"
                        ? "生成中..."
                        : message.status === "pending"
                          ? "发送中..."
                          : message.time}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <section className="workspace-clone__welcome-state">
              <article className="workspace-clone__message workspace-clone__message--minimal">
                <div className="workspace-clone__message-marker">{selectedEntity?.avatarLabel || "主"}</div>
                <div className="workspace-clone__message-content">
                  <p>{historyLoading ? "正在同步当前 Agent 的会话记录..." : "我已经连上首页聊天入口，随时可以帮你拆解任务、生成方案或继续当前主会话。"}</p>
                  <span>{isGenerating ? "生成中..." : "主会话已就绪"}</span>
                </div>
              </article>

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
            </section>
          )}

          {hasMessages && <div className="workspace-clone__canvas-fill" />}
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
