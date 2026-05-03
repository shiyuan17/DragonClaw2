import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WORKSPACE_HOME_SUGGESTIONS } from "./workspaceCloneData";
import type {
  WorkspaceEntity,
  WorkspaceGatewayStatus,
  WorkspaceHistoryFilter,
  WorkspaceHistoryItem,
  WorkspaceLiveStep,
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
import { WorkspaceCloneLiveTimeline } from "./WorkspaceCloneLiveTimeline";
import { shouldHideWorkspaceMessage, WorkspaceCloneMessagePreview } from "./WorkspaceCloneMessagePreview";

const MESSAGE_BOTTOM_THRESHOLD_PX = 72;
const MESSAGE_RENDER_LIMIT = 100;
const WorkspaceCloneUtilityDrawer = lazy(() =>
  import("./WorkspaceCloneUtilityDrawer").then((module) => ({ default: module.WorkspaceCloneUtilityDrawer })),
);

function WorkspaceCloneDrawerFallback() {
  return (
    <aside className="workspace-clone__drawer">
      <div className="workspace-clone__drawer-head">
        <div>
          <span>Loading</span>
          <strong>正在加载</strong>
        </div>
      </div>
      <div className="workspace-clone__drawer-list">
        {["one", "two", "three"].map((item) => (
          <div key={item} className="workspace-clone__drawer-item">
            <span className="workspace-clone__drawer-item-icon" />
            <div>
              <strong>...</strong>
              <small>...</small>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

interface WorkspaceCloneChatViewProps {
  selectedEntity: WorkspaceEntity | null;
  chatEnabled: boolean;
  chatDisabledReason?: "channel-unbound" | "unsupported";
  messages: WorkspaceMessage[];
  liveSteps: WorkspaceLiveStep[];
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
  showHomeSuggestions?: boolean;
  onCloseUtilityPanel: () => void;
  onSelectSessionSection: (section: WorkspaceSessionSectionKey) => void;
  onSelectHistorySession: (sessionKey: string) => void;
  onOpenRelatedResource: (resource: WorkspaceRelatedResource) => void;
  onOpenSettingsTextPreview: () => void;
  onStart: () => void;
  onOpenModelConfig: () => void;
  onOpenLogs: () => void;
}

export function WorkspaceCloneChatView({
  selectedEntity,
  chatEnabled,
  chatDisabledReason,
  messages,
  liveSteps,
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
  showHomeSuggestions = true,
  onCloseUtilityPanel,
  onSelectSessionSection,
  onSelectHistorySession,
  onOpenRelatedResource,
  onOpenSettingsTextPreview,
  onStart,
  onOpenModelConfig,
  onOpenLogs,
}: WorkspaceCloneChatViewProps) {
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const wasNearBottomRef = useRef(true);
  const lastMessageSignatureRef = useRef("");
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<WorkspaceHistoryFilter>("all");

  const hasMessages = messages.length > 0 || liveSteps.length > 0;
  const showDisconnectedState = !chatEnabled || !running || connectionStatus === "error";
  const showConnectingState = running && connectionStatus === "connecting" && !hasMessages;
  const showMissingTokenState = Boolean(connectionError?.includes("本地网关 token"));
  const showUnboundChannelState = !chatEnabled && chatDisabledReason === "channel-unbound";
  const visibleMessages = useMemo(
    () => messages.filter((message) => !shouldHideWorkspaceMessage(message)),
    [messages],
  );
  const renderedMessages = useMemo(
    () => (visibleMessages.length > MESSAGE_RENDER_LIMIT ? visibleMessages.slice(-MESSAGE_RENDER_LIMIT) : visibleMessages),
    [visibleMessages],
  );
  const hasStreamingMessage = renderedMessages.some((message) => message.status === "streaming");
  const lastMessage = renderedMessages.length > 0 ? renderedMessages[renderedMessages.length - 1] : undefined;
  const lastLiveStep = liveSteps.length > 0 ? liveSteps[liveSteps.length - 1] : undefined;
  const messageSignature = [
    renderedMessages.length,
    lastMessage?.id ?? "",
    lastMessage?.role ?? "",
    lastMessage?.text.length ?? 0,
    liveSteps.length,
    lastLiveStep?.id ?? "",
    lastLiveStep?.status ?? "",
  ].join(":");

  const isMessageScrollNearBottom = useCallback(() => {
    const element = messageScrollRef.current;
    if (!element) {
      return true;
    }

    return element.scrollHeight - element.scrollTop - element.clientHeight <= MESSAGE_BOTTOM_THRESHOLD_PX;
  }, []);

  const updateScrollToBottomVisibility = useCallback(() => {
    const nearBottom = isMessageScrollNearBottom();
    wasNearBottomRef.current = nearBottom;
    setShowScrollToBottom(!nearBottom);
  }, [isMessageScrollNearBottom]);

  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const element = messageScrollRef.current;
    if (!element) {
      return;
    }

    element.scrollTo({
      top: element.scrollHeight,
      behavior,
    });
    wasNearBottomRef.current = true;
    setShowScrollToBottom(false);
  }, []);

  useEffect(() => {
    if (!hasMessages) {
      lastMessageSignatureRef.current = "";
      wasNearBottomRef.current = true;
      setShowScrollToBottom(false);
      return;
    }

    const previousSignature = lastMessageSignatureRef.current;
    const shouldStickToBottom =
      !previousSignature ||
      lastMessage?.role === "user" ||
      wasNearBottomRef.current;

    lastMessageSignatureRef.current = messageSignature;

    if (!shouldStickToBottom) {
      window.requestAnimationFrame(updateScrollToBottomVisibility);
      return;
    }

    window.requestAnimationFrame(() => {
      scrollMessagesToBottom(lastMessage?.role === "user" ? "smooth" : "auto");
    });
  }, [
    hasMessages,
    lastMessage?.role,
    messageSignature,
    scrollMessagesToBottom,
    updateScrollToBottomVisibility,
  ]);

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
                    ? showUnboundChannelState
                      ? "当前频道尚未绑定 Agent"
                      : "当前版本只有数字员工页会接入真实 Agent 会话"
                    : !running
                      ? "服务尚未启动"
                      : showMissingTokenState
                        ? "本地网关 token 未同步"
                        : "首页聊天暂时无法连接 OpenClaw"}
                </strong>
                <p>
                  {!chatEnabled
                    ? showUnboundChannelState
                      ? selectedEntity?.emptyHint || "请先完成频道绑定，绑定成功后首页主聊天区会直接复用目标 Agent 的主会话。"
                      : "当前阶段只有数字员工页会接入真实 Agent 主会话，其它区域仍保留工作台骨架。"
                    : connectionError || (running
                      ? "正在等待本地网关握手完成，你也可以先查看运行日志确认 OpenClaw 状态。"
                      : "启动服务后，这里会自动接入当前 Agent 的主会话。")}
                </p>
              </div>
              <div className="workspace-clone__empty-state-actions">
                {!chatEnabled ? null : !running ? (
                  <button type="button" className="workspace-clone__composer-action-text is-solid" onClick={onStart}>
                    启动服务
                  </button>
                ) : (
                  <button type="button" className="workspace-clone__composer-action-text is-solid" onClick={onOpenLogs}>
                    查看日志
                  </button>
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
            <div className="workspace-clone__message-stage">
              <div
                ref={messageScrollRef}
                className="workspace-clone__message-scroll"
                onScroll={updateScrollToBottomVisibility}
              >
                <div className="workspace-clone__message-list">
                  {renderedMessages.map((message) => {
                    const isStreaming = message.status === "streaming";
                    const hasStreamText = message.text.trim().length > 0;
                    const showPreview = !isStreaming || hasStreamText;
                    const showMeta = !isStreaming && Boolean(message.time);

                    return (
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
                          {isStreaming ? <WorkspaceCloneLiveTimeline steps={liveSteps} /> : null}
                          {showPreview ? <WorkspaceCloneMessagePreview message={message} /> : null}
                          {showMeta ? <span className="workspace-clone__message-meta">{message.time}</span> : null}
                        </div>
                      </article>
                    );
                  })}
                  {liveSteps.length > 0 && !hasStreamingMessage ? (
                    <article className="workspace-clone__message workspace-clone__message--chat is-assistant is-live-status">
                      <div className="workspace-clone__message-marker">{selectedEntity?.avatarLabel || "A"}</div>
                      <div className="workspace-clone__message-content">
                        <WorkspaceCloneLiveTimeline steps={liveSteps} />
                      </div>
                    </article>
                  ) : null}
                </div>
                <div className="workspace-clone__canvas-fill" />
              </div>
              {showScrollToBottom ? (
                <button
                  type="button"
                  className="workspace-clone__scroll-bottom"
                  aria-label="滚动到最新消息"
                  title="滚动到最新消息"
                  onClick={() => scrollMessagesToBottom("smooth")}
                >
                  <WorkspaceCloneIcon name="chevron" size={18} strokeWidth={2.2} />
                </button>
              ) : null}
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

              {showHomeSuggestions && (
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
              )}
            </section>
          )}
        </div>
      </div>

      {utilityPanel ? (
        <Suspense fallback={<WorkspaceCloneDrawerFallback />}>
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
            historyFilter={historyFilter}
            onSelectHistoryFilter={setHistoryFilter}
            onSelectHistorySession={onSelectHistorySession}
            onOpenRelatedResource={onOpenRelatedResource}
            onOpenModelConfig={onOpenModelConfig}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
