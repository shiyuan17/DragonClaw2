import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useReducedMotion } from "framer-motion";
import dragonclawLogo from "../../assets/dragonclaw-logo.png";
import { WORKSPACE_HOME_SUGGESTIONS } from "./workspaceCloneData";
import { shouldHideWorkspaceMessage } from "./workspaceCloneMessageVisibility";
import type { WorkspaceChatFailureNotice } from "./workspaceCloneChatFailure";
import type {
  WorkspaceCronJob,
  WorkspaceCronRunRecord,
  WorkspaceChatFileItem,
  WorkspaceEntity,
  WorkspaceHistoryFilter,
  WorkspaceHistoryItem,
  WorkspaceLiveStep,
  WorkspaceMessage,
  WorkspaceRelatedResource,
  WorkspaceResourceItem,
  WorkspaceRuntimeLogItem,
  WorkspaceSessionSectionKey,
  WorkspaceToolItem,
  WorkspaceUtilityPanel,
  WorkspaceWorkbenchItem,
} from "./workspaceCloneTypes";
import type { WorkspaceSessionHistoryPageState } from "../../hooks/workspace-gateway/session-history-pages";
import type { WorkspaceLiveTranscriptItem } from "../../hooks/workspace-gateway/live-transcript";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import { WorkspaceCloneLiveTimeline } from "./WorkspaceCloneLiveTimeline";
import { WorkspaceCloneMessagePreview } from "./WorkspaceCloneMessagePreview";
import { WorkspaceCloneRunTranscript } from "./WorkspaceCloneRunTranscript";
import { WorkspaceCloneSessionWorkdirPicker } from "./WorkspaceCloneSessionWorkdirPicker";
import {
  WorkspaceCloneServiceStartupPanel,
  type WorkspaceServiceStartupLogLine,
  type WorkspaceServiceStartupPhase,
  type WorkspaceServiceStartupStep,
} from "./WorkspaceCloneServiceStartupPanel";
import { useWorkspaceCloneRenderPerfMark } from "./workspaceCloneRenderPerf";

const MESSAGE_BOTTOM_THRESHOLD_PX = 72;
const MESSAGE_RENDER_LIMIT = 60;
const loadWorkspaceCloneUtilityDrawer = () =>
  import("./WorkspaceCloneUtilityDrawer").then((module) => ({ default: module.WorkspaceCloneUtilityDrawer }));
const WorkspaceCloneUtilityDrawer = lazy(loadWorkspaceCloneUtilityDrawer);

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

void WorkspaceCloneDrawerFallback;

function renderAvatarMarker(entity: WorkspaceEntity | null, fallbackLabel: string) {
  if (entity?.avatarUrl) {
    return <img src={entity.avatarUrl} alt="" className="workspace-clone__message-marker-image" />;
  }

  return fallbackLabel;
}

function getChatFailureNoticeKey(chatFailure: WorkspaceChatFailureNotice | null) {
  if (!chatFailure) {
    return "";
  }

  return [
    chatFailure.source,
    chatFailure.sessionKey ?? "",
    chatFailure.runId ?? "",
    chatFailure.title,
    chatFailure.message,
  ].join("|");
}

interface WorkspaceCloneChatMessageRowProps {
  message: WorkspaceMessage;
  selectedEntity: WorkspaceEntity | null;
  liveSteps: WorkspaceLiveStep[];
  liveTranscriptItems: WorkspaceLiveTranscriptItem[];
  onBlankAreaClick: (event: ReactMouseEvent<HTMLElement>) => void;
}

export const WorkspaceCloneChatMessageRow = memo(function WorkspaceCloneChatMessageRow({
  message,
  selectedEntity,
  liveSteps,
  liveTranscriptItems,
  onBlankAreaClick,
}: WorkspaceCloneChatMessageRowProps) {
  const isStreaming = message.status === "streaming";
  const hasStreamText = message.text.trim().length > 0;
  const hasTranscript = isStreaming && liveTranscriptItems.length > 0;
  const showPreview = !hasTranscript && (!isStreaming || hasStreamText);
  const showMeta = !isStreaming && Boolean(message.time);

  return (
    <article
      className={[
        "workspace-clone__message",
        "workspace-clone__message--chat",
        `is-${message.role}`,
        message.status ? `is-${message.status}` : "",
      ].join(" ").trim()}
      onClick={onBlankAreaClick}
    >
      <div className="workspace-clone__message-marker">
        {message.role === "assistant"
          ? renderAvatarMarker(selectedEntity, message.author)
          : message.author}
      </div>
      <div className="workspace-clone__message-body">
        <div className="workspace-clone__message-content">
          {hasTranscript ? (
            <WorkspaceCloneRunTranscript assistantAuthor={message.author} items={liveTranscriptItems} />
          ) : isStreaming ? (
            <WorkspaceCloneLiveTimeline steps={liveSteps} />
          ) : null}
          {showPreview ? <WorkspaceCloneMessagePreview message={message} /> : null}
        </div>
        {showMeta ? <span className="workspace-clone__message-meta">{message.time}</span> : null}
      </div>
    </article>
  );
}, (previousProps, nextProps) => {
  if (previousProps.message !== nextProps.message) {
    return false;
  }
  if (previousProps.onBlankAreaClick !== nextProps.onBlankAreaClick) {
    return false;
  }
  if ((previousProps.selectedEntity?.avatarUrl ?? "") !== (nextProps.selectedEntity?.avatarUrl ?? "")) {
    return false;
  }
  if (previousProps.message.status === "streaming" || nextProps.message.status === "streaming") {
    return previousProps.liveSteps === nextProps.liveSteps
      && previousProps.liveTranscriptItems === nextProps.liveTranscriptItems;
  }
  return true;
});

export interface WorkspaceCloneChatViewProps {
  selectedEntity: WorkspaceEntity | null;
  chatEnabled: boolean;
  chatDisabledReason?: "channel-unbound" | "unsupported";
  messages: WorkspaceMessage[];
  liveSteps: WorkspaceLiveStep[];
  liveTranscriptItems: WorkspaceLiveTranscriptItem[];
  connectionError: string | null;
  pendingTaskRunBridge?: {
    title: string;
    message: string;
  } | null;
  historyLoading: boolean;
  historyPageState?: WorkspaceSessionHistoryPageState | null;
  isGenerating: boolean;
  utilityPanel: WorkspaceUtilityPanel;
  activeSessionSection: WorkspaceSessionSectionKey;
  historyItems: WorkspaceHistoryItem[];
  logs: WorkspaceRuntimeLogItem[];
  selectedRuntimeLogId: string | null;
  tasks: WorkspaceCronJob[];
  selectedTaskId: string | null;
  selectedTaskRuns: WorkspaceCronRunRecord[];
  taskLoading: boolean;
  taskRunsLoading: boolean;
  taskRunsLoadingId: string | null;
  taskActionJobId: string | null;
  optimisticRunningTaskIds: string[];
  startupPreview?: {
    title: string;
    previewSessionKey: string;
  } | null;
  chatFailure?: WorkspaceChatFailureNotice | null;
  gatewayConnected: boolean;
  workbenchItems: WorkspaceWorkbenchItem[];
  fileItems: WorkspaceChatFileItem[];
  memoryItems: WorkspaceResourceItem[];
  skillItems: WorkspaceResourceItem[];
  commandItems: WorkspaceResourceItem[];
  channelItems: WorkspaceResourceItem[];
  toolItems: WorkspaceToolItem[];
  currentModelName: string;
  currentProviderName: string;
  running: boolean;
  selectedWorkspaceDir: string;
  serviceStartup: {
    phase: WorkspaceServiceStartupPhase | "ready";
    message: string;
    steps: WorkspaceServiceStartupStep[];
    logs: WorkspaceServiceStartupLogLine[];
    error: string | null;
    showPanel: boolean;
  };
  showHomeSuggestions?: boolean;
  onCloseUtilityPanel: () => void;
  onSelectSessionSection: (section: WorkspaceSessionSectionKey) => void;
  onSelectHistorySession: (sessionKey: string) => void;
  onOpenRelatedResource: (resource: WorkspaceRelatedResource) => void;
  onOpenSettingsTextPreview: () => void;
  onStart: () => void;
  onOpenModelConfig: () => void;
  onOpenLogs: () => void;
  onSelectWorkspaceDir: () => Promise<void> | void;
  onClearWorkspaceDir: () => void;
  onOpenChatFile: (item: WorkspaceChatFileItem) => void;
  onOpenRuntimeLogDetail: (logId: string) => void;
  onRefreshTasks: () => void;
  onSelectTask: (taskId: string) => void;
  onToggleTaskEnabled: (task: WorkspaceCronJob) => void;
  onEditTask: (task: WorkspaceCronJob) => void;
  onRunTask: (task: WorkspaceCronJob) => void;
  onDeleteTask: (task: WorkspaceCronJob) => void;
  onContinueStartupPreview?: () => void;
  onRetryChatFailure?: () => void;
  onLoadOlderHistoryPage?: () => Promise<boolean> | boolean;
}

export function WorkspaceCloneChatView({
  selectedEntity,
  chatEnabled,
  chatDisabledReason,
  messages,
  liveSteps,
  liveTranscriptItems,
  connectionError,
  pendingTaskRunBridge = null,
  historyLoading,
  historyPageState = null,
  isGenerating,
  utilityPanel,
  activeSessionSection,
  historyItems,
  logs,
  selectedRuntimeLogId,
  tasks,
  selectedTaskId,
  selectedTaskRuns,
  taskLoading,
  taskRunsLoading,
  taskRunsLoadingId,
  taskActionJobId,
  optimisticRunningTaskIds,
  startupPreview = null,
  chatFailure = null,
  gatewayConnected,
  workbenchItems,
  fileItems,
  memoryItems,
  skillItems,
  commandItems,
  channelItems,
  toolItems,
  currentModelName,
  currentProviderName,
  running,
  selectedWorkspaceDir,
  serviceStartup,
  showHomeSuggestions = true,
  onCloseUtilityPanel,
  onSelectSessionSection,
  onSelectHistorySession,
  onOpenRelatedResource,
  onOpenSettingsTextPreview,
  onStart,
  onOpenModelConfig,
  onOpenLogs,
  onSelectWorkspaceDir,
  onClearWorkspaceDir,
  onOpenChatFile,
  onOpenRuntimeLogDetail,
  onRefreshTasks,
  onSelectTask,
  onToggleTaskEnabled,
  onEditTask,
  onRunTask,
  onDeleteTask,
  onContinueStartupPreview,
  onRetryChatFailure,
  onLoadOlderHistoryPage,
}: WorkspaceCloneChatViewProps) {
  useWorkspaceCloneRenderPerfMark("chat-view", `${messages.length}:${utilityPanel ?? "main"}`);
  const prefersReducedMotion = useReducedMotion();
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollVisibilityFrameRef = useRef<number | null>(null);
  const wasNearBottomRef = useRef(true);
  const lastMessageSignatureRef = useRef("");
  const lastSmoothScrollMessageIdRef = useRef("");
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<WorkspaceHistoryFilter>("all");
  const [dismissedChatFailureKey, setDismissedChatFailureKey] = useState("");
  const previousScrollHeightRef = useRef<number | null>(null);

  const showDisconnectedState = !chatEnabled;
  const showMissingTokenState = Boolean(connectionError?.includes("本地网关 token"));
  const showUnboundChannelState = !chatEnabled && chatDisabledReason === "channel-unbound";
  const chatFailureNoticeKey = getChatFailureNoticeKey(chatFailure);
  const showChatFailureNotice = Boolean(chatFailure && chatFailureNoticeKey !== dismissedChatFailureKey);
  const visibleMessages = useMemo(
    () => messages.filter((message) => !shouldHideWorkspaceMessage(message)),
    [messages],
  );
  const renderedMessages = useMemo(
    () => (visibleMessages.length > MESSAGE_RENDER_LIMIT ? visibleMessages.slice(-MESSAGE_RENDER_LIMIT) : visibleMessages),
    [visibleMessages],
  );
  const hasRenderableMessages = renderedMessages.length > 0 || liveSteps.length > 0 || liveTranscriptItems.length > 0;
  const showStartupPanel = chatEnabled && serviceStartup.showPanel && !hasRenderableMessages;
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
    liveTranscriptItems.length,
    liveTranscriptItems[liveTranscriptItems.length - 1]?.id ?? "",
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
    const nextVisible = !nearBottom;
    setShowScrollToBottom((current) => (current === nextVisible ? current : nextVisible));
  }, [isMessageScrollNearBottom]);

  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const element = messageScrollRef.current;
    if (!element) {
      return;
    }

    const nextBehavior = prefersReducedMotion && behavior === "smooth" ? "auto" : behavior;
    element.scrollTo({
      top: element.scrollHeight,
      behavior: nextBehavior,
    });
    wasNearBottomRef.current = true;
    setShowScrollToBottom(false);
  }, [prefersReducedMotion]);

  const scheduleScrollToBottomVisibilityUpdate = useCallback(() => {
    if (scrollVisibilityFrameRef.current !== null) {
      return;
    }

    scrollVisibilityFrameRef.current = window.requestAnimationFrame(() => {
      scrollVisibilityFrameRef.current = null;
      updateScrollToBottomVisibility();
    });
  }, [updateScrollToBottomVisibility]);

  const handleMessageScroll = useCallback(() => {
    scheduleScrollToBottomVisibilityUpdate();
    const element = messageScrollRef.current;
    if (!element || !historyPageState?.hasMoreBefore || historyPageState.loadingOlder || !onLoadOlderHistoryPage) {
      return;
    }
    if (element.scrollTop > 48) {
      return;
    }
    previousScrollHeightRef.current = element.scrollHeight;
    void Promise.resolve(onLoadOlderHistoryPage()).catch(() => undefined);
  }, [historyPageState?.hasMoreBefore, historyPageState?.loadingOlder, onLoadOlderHistoryPage, scheduleScrollToBottomVisibilityUpdate]);

  const dismissUtilityDrawerFromBlankArea = useCallback(() => {
    if (!utilityPanel) {
      return;
    }

    onCloseUtilityPanel();
  }, [onCloseUtilityPanel, utilityPanel]);

  const handleBlankAreaClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }

      dismissUtilityDrawerFromBlankArea();
    },
    [dismissUtilityDrawerFromBlankArea],
  );

  useEffect(() => {
    if (!hasRenderableMessages) {
      lastMessageSignatureRef.current = "";
      lastSmoothScrollMessageIdRef.current = "";
      previousScrollHeightRef.current = null;
      wasNearBottomRef.current = true;
      setShowScrollToBottom(false);
      return;
    }

    if (previousScrollHeightRef.current !== null) {
      const previousScrollHeight = previousScrollHeightRef.current;
      previousScrollHeightRef.current = null;
      lastMessageSignatureRef.current = messageSignature;
      window.requestAnimationFrame(() => {
        const element = messageScrollRef.current;
        if (!element) return;
        element.scrollTop += element.scrollHeight - previousScrollHeight;
        scheduleScrollToBottomVisibilityUpdate();
      });
      return;
    }

    const previousSignature = lastMessageSignatureRef.current;
    const shouldStickToBottom =
      !previousSignature ||
      lastMessage?.role === "user" ||
      wasNearBottomRef.current;

    lastMessageSignatureRef.current = messageSignature;

    if (!shouldStickToBottom) {
      scheduleScrollToBottomVisibilityUpdate();
      return;
    }

    const shouldUseSmoothScroll =
      lastMessage?.role === "user" &&
      Boolean(lastMessage?.id) &&
      lastSmoothScrollMessageIdRef.current !== lastMessage.id &&
      liveSteps.length === 0 &&
      liveTranscriptItems.length === 0;

    if (shouldUseSmoothScroll && lastMessage?.id) {
      lastSmoothScrollMessageIdRef.current = lastMessage.id;
    }

    window.requestAnimationFrame(() => {
      scrollMessagesToBottom(shouldUseSmoothScroll ? "smooth" : "auto");
    });
  }, [
    hasRenderableMessages,
    liveSteps.length,
    liveTranscriptItems.length,
    lastMessage?.id,
    lastMessage?.role,
    messageSignature,
    scheduleScrollToBottomVisibilityUpdate,
    scrollMessagesToBottom,
  ]);

  useEffect(() => {
    const prefetchTimer = window.setTimeout(() => {
      void loadWorkspaceCloneUtilityDrawer();
    }, 180);

    return () => {
      window.clearTimeout(prefetchTimer);
    };
  }, []);

  useEffect(() => () => {
    if (scrollVisibilityFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollVisibilityFrameRef.current);
    }
  }, []);

  return (
    <div className={`workspace-clone__chat-layout ${utilityPanel ? "drawer-open" : ""}`}>
      <div className="workspace-clone__chat-main">
        <div className="workspace-clone__canvas" onClick={handleBlankAreaClick}>
          {pendingTaskRunBridge ? (
            <div className="workspace-clone__task-feedback-card is-note">
              <strong>{pendingTaskRunBridge.title}</strong>
              <span>{pendingTaskRunBridge.message}</span>
            </div>
          ) : null}
          {startupPreview ? (
            <div className="workspace-clone__chat-notice is-preview" onClick={handleBlankAreaClick}>
              <div className="workspace-clone__chat-notice-copy">
                <strong>正在预览最近历史会话</strong>
                <span>当前显示的是“{startupPreview.title}”的历史记录。直接发送会从主会话开始，如需续接这段历史，请先切换到该会话。</span>
              </div>
              {onContinueStartupPreview ? (
                <button
                  type="button"
                  className="workspace-clone__composer-action-text"
                  onClick={(event) => {
                    event.stopPropagation();
                    onContinueStartupPreview();
                  }}
                >
                  继续此历史会话
                </button>
              ) : null}
            </div>
          ) : null}
          {showChatFailureNotice && chatFailure ? (
            <div className="workspace-clone__chat-notice is-error" onClick={handleBlankAreaClick}>
              <div className="workspace-clone__chat-notice-copy">
                <strong>{chatFailure.title}</strong>
                <span>{chatFailure.message}</span>
                <small>
                  来源：{chatFailure.source}
                  {chatFailure.sessionKey ? ` · session ${chatFailure.sessionKey}` : ""}
                  {chatFailure.runId ? ` · run ${chatFailure.runId}` : ""}
                </small>
              </div>
              <div className="workspace-clone__chat-notice-actions">
                {chatFailure.canRetry && onRetryChatFailure ? (
                  <button
                  type="button"
                  className="workspace-clone__composer-action-text is-solid"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRetryChatFailure();
                  }}
                  >
                    重试发送
                  </button>
                ) : null}
                <button
                  type="button"
                  className="workspace-clone__chat-notice-close"
                  aria-label="关闭提示"
                  title="关闭提示"
                  onClick={(event) => {
                    event.stopPropagation();
                    setDismissedChatFailureKey(chatFailureNoticeKey);
                  }}
                >
                  <WorkspaceCloneIcon name="x" size={14} strokeWidth={2} />
                </button>
              </div>
            </div>
          ) : null}
          {showStartupPanel && serviceStartup.phase !== "ready" ? (
            <WorkspaceCloneServiceStartupPanel
              phase={serviceStartup.phase}
              message={serviceStartup.message}
              steps={serviceStartup.steps}
              logs={serviceStartup.logs}
              error={serviceStartup.error}
              onRetry={onStart}
            />
          ) : showDisconnectedState ? (
            <section className="workspace-clone__empty-state" onClick={handleBlankAreaClick}>
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
          ) : hasRenderableMessages ? (
            <div className="workspace-clone__message-stage" onClick={handleBlankAreaClick}>
              <div
                ref={messageScrollRef}
                className="workspace-clone__message-scroll"
                onScroll={handleMessageScroll}
                onClick={handleBlankAreaClick}
              >
                <div className="workspace-clone__message-list" onClick={handleBlankAreaClick}>
                  {historyPageState?.loadingOlder ? (
                    <div className="workspace-clone__history-page-loading">正在加载更早消息...</div>
                  ) : null}
                  {renderedMessages.map((message) => {
                    return (
                      <WorkspaceCloneChatMessageRow
                        key={message.id}
                        message={message}
                        selectedEntity={selectedEntity}
                        liveSteps={liveSteps}
                        liveTranscriptItems={liveTranscriptItems}
                        onBlankAreaClick={handleBlankAreaClick}
                      />
                    );
                  })}
                  {(liveTranscriptItems.length > 0 || liveSteps.length > 0) && !hasStreamingMessage ? (
                    <article
                      className="workspace-clone__message workspace-clone__message--chat is-assistant is-live-status"
                      onClick={handleBlankAreaClick}
                    >
                      <div className="workspace-clone__message-marker">
                        {renderAvatarMarker(selectedEntity, selectedEntity?.avatarLabel || "A")}
                      </div>
                      <div className="workspace-clone__message-content">
                        {liveTranscriptItems.length > 0 ? (
                          <WorkspaceCloneRunTranscript
                            assistantAuthor={selectedEntity?.avatarLabel || "A"}
                            items={liveTranscriptItems}
                          />
                        ) : (
                          <WorkspaceCloneLiveTimeline steps={liveSteps} />
                        )}
                      </div>
                    </article>
                  ) : null}
                </div>
                <div className="workspace-clone__canvas-fill" onClick={dismissUtilityDrawerFromBlankArea} />
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
            <section className="workspace-clone__welcome-state" onClick={handleBlankAreaClick}>
              <div className="workspace-clone__welcome-hero">
                <div className="workspace-clone__welcome-logo-shell">
                  <img src={dragonclawLogo} alt="DragonClaw" className="workspace-clone__welcome-logo" />
                </div>
                <div className="workspace-clone__welcome-copy">
                  <strong>DragonClaw,让Ai更简单</strong>
                  <p>{historyLoading ? "正在准备当前会话..." : "选择工作目录后，这个会话会默认围绕该目录展开。"}</p>
                </div>
                <WorkspaceCloneSessionWorkdirPicker
                  variant="hero"
                  selectedPath={selectedWorkspaceDir}
                  onSelectDirectory={onSelectWorkspaceDir}
                  onClearDirectory={onClearWorkspaceDir}
                />
              </div>

              <article className="workspace-clone__message workspace-clone__message--minimal workspace-clone__welcome-legacy">
                <div className="workspace-clone__message-marker">
                  {renderAvatarMarker(selectedEntity, selectedEntity?.avatarLabel || "A")}
                </div>
                <div className="workspace-clone__message-content">
                  <p>
                    {historyLoading
                      ? "正在同步 Agent 会话记录..."
                      : "你可以直接给当前数字员工安排任务、提问，或从下方卡片快速进入常用工作流。"}
                  </p>
                  <span>{isGenerating ? "思考中..." : "试着发起第一条消息"}</span>
                </div>
              </article>

              {showHomeSuggestions && (
                <div className="workspace-clone__suggestion-strip workspace-clone__welcome-legacy">
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

      <div className={`workspace-clone__drawer-rail ${utilityPanel ? "is-open" : ""}`} aria-hidden={!utilityPanel}>
        {utilityPanel ? (
          <Suspense fallback={null}>
            <WorkspaceCloneUtilityDrawer
              panel={utilityPanel}
              selectedEntity={selectedEntity}
              activeSessionSection={activeSessionSection}
              historyItems={historyItems}
              logs={logs}
              selectedRuntimeLogId={selectedRuntimeLogId}
              tasks={tasks}
              selectedTaskId={selectedTaskId}
              selectedTaskRuns={selectedTaskRuns}
              taskLoading={taskLoading}
              taskRunsLoading={taskRunsLoading}
              taskRunsLoadingId={taskRunsLoadingId}
              taskActionJobId={taskActionJobId}
              optimisticRunningTaskIds={optimisticRunningTaskIds}
              gatewayConnected={gatewayConnected}
              workbenchItems={workbenchItems}
              fileItems={fileItems}
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
              onOpenRuntimeLogDetail={onOpenRuntimeLogDetail}
              onOpenChatFile={onOpenChatFile}
              onRefreshTasks={onRefreshTasks}
              onSelectTask={onSelectTask}
              onToggleTaskEnabled={onToggleTaskEnabled}
              onEditTask={onEditTask}
              onRunTask={onRunTask}
              onDeleteTask={onDeleteTask}
            />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}
