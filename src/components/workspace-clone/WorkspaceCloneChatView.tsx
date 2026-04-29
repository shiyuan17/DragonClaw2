import { WorkspaceCloneUtilityDrawer } from "./WorkspaceCloneUtilityDrawer";
import { WORKSPACE_HOME_SUGGESTIONS } from "./workspaceCloneData";
import type {
  WorkspaceEntity,
  WorkspaceGatewayStatus,
  WorkspaceHistoryItem,
  WorkspaceMessage,
  WorkspaceRelatedResource,
  WorkspaceResourceItem,
  WorkspaceScheduleItem,
  WorkspaceSessionSectionKey,
  WorkspaceToolItem,
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
  running: boolean;
  onCloseUtilityPanel: () => void;
  onSelectSessionSection: (section: WorkspaceSessionSectionKey) => void;
  onOpenRelatedResource: (resource: WorkspaceRelatedResource) => void;
  onOpenSettingsTextPreview: () => void;
  onStart: () => void;
  onOpenConsole: () => void;
  onOpenModelConfig: () => void;
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
  running,
  onCloseUtilityPanel,
  onSelectSessionSection,
  onOpenRelatedResource,
  onOpenSettingsTextPreview,
  onStart,
  onOpenConsole,
  onOpenModelConfig,
  onOpenLogs,
}: WorkspaceCloneChatViewProps) {
  const hasMessages = messages.length > 0;
  const showDisconnectedState = !chatEnabled || !running || connectionStatus === "error";
  const showConnectingState = running && connectionStatus === "connecting" && !hasMessages;
  const showMissingTokenState = Boolean(connectionError?.includes("本地网关 token"));

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
                  {!chatEnabled
                    ? "当前仅首页聊天接入数字员工"
                    : !running
                      ? "服务尚未启动"
                      : showMissingTokenState
                        ? "本地网关 token 未同步"
                        : "首页聊天暂时无法连接 OpenClaw"}
                </strong>
                <p>
                  {!chatEnabled
                    ? "当前版本只把“数字员工”页签接入真实 Agent 会话，其它区域仍保留工作台骨架。"
                    : connectionError || (running
                      ? "正在等待本地网关握手完成，你也可以先打开控制台确认 OpenClaw 状态。"
                      : "启动服务后，这里会自动接入当前 Agent 的主会话。")}
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
                <p>OpenClaw 网关就绪后，这里会自动拉取真实 Agent 列表和主会话历史。</p>
              </div>
            </section>
          ) : hasMessages ? (
            <div className="workspace-clone__message-scroll">
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
                          ? "思考中..."
                          : message.status === "pending"
                            ? "发送中..."
                            : message.time}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
              <div className="workspace-clone__canvas-fill" />
            </div>
          ) : (
            <section className="workspace-clone__welcome-state">
              <article className="workspace-clone__message workspace-clone__message--minimal">
                <div className="workspace-clone__message-marker">{selectedEntity?.avatarLabel || "A"}</div>
                <div className="workspace-clone__message-content">
                  <p>
                    {historyLoading
                      ? "正在同步 Agent 会话记录..."
                      : "你可以直接给当前数字员工安排任务、提问，或从下方卡片快速进入常用工作流。"}
                  </p>
                  <span>{isGenerating ? "思考中..." : "试着发起第一条消息"}</span>
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
        </div>
      </div>

      <WorkspaceCloneUtilityDrawer
        panel={utilityPanel}
        selectedEntity={selectedEntity}
        activeSessionSection={activeSessionSection}
        historyItems={historyItems}
        logs={logs}
        schedules={schedules}
        workbenchItems={workbenchItems}
        memoryItems={memoryItems}
        skillItems={skillItems}
        commandItems={commandItems}
        channelItems={channelItems}
        toolItems={toolItems}
        currentModelName={currentModelName}
        currentProviderName={currentProviderName}
        onClose={onCloseUtilityPanel}
        onSelectSessionSection={onSelectSessionSection}
        onOpenRelatedResource={onOpenRelatedResource}
        onOpenModelConfig={onOpenModelConfig}
      />
    </div>
  );
}
