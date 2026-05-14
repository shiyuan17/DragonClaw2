import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { WorkspaceGatewayClient, buildGatewayUrl, createAgentSessionKey, findMainAgentSession, isAgentsListResult, isChatEventPayload, isSessionsListResult } from "./workspace-gateway/client";
import type { WorkspaceAgentCacheRow, WorkspaceGatewayAgentsListResult, WorkspaceGatewaySessionsListResult, WorkspaceGatewayStatus, WorkspaceLiveStep, WorkspaceLiveStepStatus, WorkspaceMessage } from "../components/workspace-clone/workspaceCloneTypes";
import type { WorkspaceChatFailureNotice, WorkspaceChatFailureSource } from "../components/workspace-clone/workspaceCloneChatFailure";
import { sanitizeWorkspaceAssistantContent } from "../components/workspace-clone/workspaceCloneMessageVisibility";
import type { CurrentConfig } from "../types";
import { buildAgentRecentSessionsById } from "./workspace-gateway/agent-recent-sessions";
import { buildCachedAgentsResult, sanitizeAgentsResult, serializeCachedMessages, sortSessionsByUpdatedAt, toAgentCachePayload } from "./workspace-gateway/session-cache";
import { extractAgentIdFromSessionKey, resolveAgentSessionKey, resolveStableSessionHistoryTitleDetails } from "./workspace-gateway/message-normalizers";
import { loadWorkspaceHistoryTitleBatches } from "./workspace-gateway/history-titles";
import { applyHistoryTitleCacheUpdate } from "./workspace-gateway/history-title-state";
import { adoptWorkspaceActiveRunSession, bindWorkspaceTaskRunConversationToResult, clearWorkspaceActiveRunRefs, endWorkspaceActiveRun, ensureWorkspaceTaskRunConversationBound, initializeWorkspaceActiveRun } from "./workspace-gateway/task-run-bridge";
import { useWorkspaceLocalSessionMessages } from "./workspace-gateway/useWorkspaceLocalSessionMessages";
import { useWorkspaceCachedAgentLastMessages } from "./workspace-gateway/useWorkspaceCachedAgentLastMessages";
import { useWorkspaceManualSessionExecution } from "./workspace-gateway/useWorkspaceManualSessionExecution";
import { useWorkspaceStartupPreview } from "./workspace-gateway/useWorkspaceStartupPreview";
import { useWorkspaceTaskRunSessions } from "./workspace-gateway/useWorkspaceTaskRunSessions";
import { buildWorkspaceChatFailureNotice, buildWorkspaceFailureLiveStep, humanizeWorkspaceChatFailureMessage, replaceWorkspaceThinkingStepWithFailure, resolveWorkspaceAgentFailureMessage, resolveWorkspaceChatFailureSessionKind } from "./workspace-gateway/chat-failure";
import { buildWorkspaceAgentLastMessageById, buildWorkspaceHistoryItems, buildWorkspaceMessages, buildWorkspaceNormalizedHistoryMessages, buildWorkspaceStartupPreview, buildWorkspaceStreamMessage } from "./workspace-gateway/chat-derived-state";
import { abortWorkspaceGatewayMessage, resetWorkspaceGatewaySession } from "./workspace-gateway/chat-session-actions";
import { applyWorkspaceLiveStepUpdate, finishWorkspaceLiveSteps, removeWorkspaceTransientThinkingBridge, resolveWorkspaceAssistantAuthor } from "./workspace-gateway/chat-live-state";
import { shouldSkipMirroredWorkspaceLiveStep } from "./workspace-gateway/live-step-dedupe";
import { buildLiveStepFromAgentEvent, isRecord, isTerminalLiveStepStatus, toFiniteTimestamp, toStringValue, type WorkspaceGatewayAgentEventPayload, type WorkspaceLiveStepDedupeEntry, type WorkspaceLiveStepEventSource } from "./workspace-gateway/live-steps";
import { mergeWorkspaceStreamText } from "./workspace-gateway/stream-text-buffer";
import { resolveWorkspaceStartupPreviewState } from "./workspace-gateway/startup-preview";
import { sendWorkspaceGatewayMessage, type SendWorkspaceGatewayMessageOptions } from "./workspace-gateway/send-message";
import { useWorkspaceLiveTranscript } from "./workspace-gateway/live-transcript";
import { SESSION_HISTORY_INITIAL_PAGE_LIMIT, SESSION_HISTORY_OLDER_PAGE_LIMIT, buildSessionHistoryPageStateFromGatewayMessages, loadOlderWorkspaceSessionHistoryPage, type WorkspaceChatSessionCachePage, type WorkspaceSessionHistoryPageState } from "./workspace-gateway/session-history-pages";
import { applySessionHistoryMessagesUpdate, applySessionMessagesSummaryUpdate, applySessionSummaryUpdate, clearSessionPageState, deleteMissingSessionKeys, filterSessionHistoryCacheByKeys, filterSessionPageStateByKeys, filterSessionSummaryByKeys } from "./workspace-gateway/session-history-cache-state";
import { THREAD_RENDER_PAGE_LIMIT, THREAD_RENDER_WINDOW_LIMIT, buildThreadViewModelFromRawMessages, buildThreadViewModelFromRenderPage, filterThreadViewModelsByKeys, upsertThreadViewModel, type WorkspaceChatSessionRenderPage, type WorkspaceSessionSwitchPerfEntry, type WorkspaceThreadViewModel } from "./workspace-gateway/thread-view-models";
import { markSessionSwitchPerf } from "./workspace-gateway/session-switch-perf";
import { loadWorkspaceSessionCachePageWithDedupe, loadWorkspaceSessionRenderPageWithDedupe } from "./workspace-gateway/session-cache-loaders";
interface UseWorkspaceGatewayChatOptions { running: boolean; servicePort: number; gatewayToken?: string | null; }
const INITIAL_HISTORY_LIMIT = 50;
const SESSION_CACHE_KEEP_LIMIT = 20;
const MISSING_GATEWAY_TOKEN_ERROR = "本地网关 token 缺失或未同步，请检查 ~/.openclaw/openclaw.json，或重新保存 Provider 配置后再试。";
export function useWorkspaceGatewayChat({ running, servicePort, gatewayToken }: UseWorkspaceGatewayChatOptions) {
  const clientRef = useRef<WorkspaceGatewayClient | null>(null);
  const disconnectErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionGenerationRef = useRef(0);
  const currentSessionKeyRef = useRef("");
  const displayedHistorySessionKeyRef = useRef("");
  const currentRunIdRef = useRef<string | null>(null);
  const activeRunAliasesRef = useRef<Set<string>>(new Set());
  const liveStepDedupeRef = useRef<Map<string, WorkspaceLiveStepDedupeEntry>>(new Map());
  const historyTitleFetchesRef = useRef<Set<string>>(new Set());
  const historyTitleLoadBatchesRef = useRef<Set<string>>(new Set());
  const historyLoadSeqRef = useRef(0);
  const historyPageLoadSeqRef = useRef(0);
  const historyPageFetchesRef = useRef<Map<string, Promise<WorkspaceChatSessionCachePage | null>>>(new Map());
  const historyRenderPageFetchesRef = useRef<Map<string, Promise<WorkspaceChatSessionRenderPage | null>>>(new Map());
  const historyRefreshFetchesRef = useRef<Map<string, Promise<unknown[]>>>(new Map());
  const historyRefreshMetaRef = useRef<Map<string, { loadedAt: number; updatedAt: number | null }>>(new Map());
  const historyWarmFetchesRef = useRef<Set<string>>(new Set());
  const sessionSwitchPerfRef = useRef<Map<string, WorkspaceSessionSwitchPerfEntry>>(new Map());
  const selectedAgentIdRef = useRef("");
  const preserveActiveRunSessionSwitchRef = useRef<string | null>(null);
  const sendingRef = useRef(false);
  const lastSendAttemptRef = useRef<{ value: string; options?: SendWorkspaceGatewayMessageOptions } | null>(null);
  const bootstrapGatewayStateRef = useRef<(connectionGeneration?: number) => Promise<void>>(async () => {});
  const handleGatewayEventRef = useRef<(event: { event: string; payload?: unknown }) => void>(() => {});
  const hasObservedNonThinkingStepRef = useRef(false);
  const hasAssistantTextDeltaRef = useRef(false);

  const [status, setStatus] = useState<WorkspaceGatewayStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [agentsResult, setAgentsResult] = useState<WorkspaceGatewayAgentsListResult | null>(null);
  const [cachedAgentsResult, setCachedAgentsResult] = useState<WorkspaceGatewayAgentsListResult | null>(null);
  const [sessionsResult, setSessionsResult] = useState<WorkspaceGatewaySessionsListResult | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedSessionKey, setSelectedSessionKey] = useState("");
  const [historyTitleCache, setHistoryTitleCache] = useState<Record<string, string>>({});
  const [sessionHistoryCache, setSessionHistoryCache] = useState<Record<string, unknown[]>>({});
  const [threadViewModelsByKey, setThreadViewModelsByKey] = useState<Record<string, WorkspaceThreadViewModel>>({});
  const [sessionSummaryByKey, setSessionSummaryByKey] = useState<Record<string, string>>({});
  const [sessionHistoryPageStateByKey, setSessionHistoryPageStateByKey] = useState<Record<string, WorkspaceSessionHistoryPageState>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [resettingSession, setResettingSession] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<WorkspaceMessage | null>(null);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [liveSteps, setLiveSteps] = useState<WorkspaceLiveStep[]>([]);
  const [chatFailure, setChatFailure] = useState<WorkspaceChatFailureNotice | null>(null);
  const [fallbackGatewayToken, setFallbackGatewayToken] = useState("");
  const [gatewayTokenRefreshState, setGatewayTokenRefreshState] = useState<"idle" | "loading" | "done">("idle");
  const connected = status === "connected";
  const [, startSessionTransition] = useTransition();
  const effectiveAgentsResult = agentsResult ?? cachedAgentsResult;
  const agentListSource = agentsResult ? "gateway" : cachedAgentsResult ? "cache" : "none";
  const agents = effectiveAgentsResult?.agents ?? [];
  const selectedAgent = useMemo(() => agents.find((agent) => agent.id === selectedAgentId) ?? null, [agents, selectedAgentId]);
  const currentSessionKey = selectedSessionKey || (selectedAgentId ? createAgentSessionKey(selectedAgentId) : "");
  const { taskRunSessions, currentTaskRunSession, currentGatewaySessionKey, currentGatewaySessionKeyRef, resolveTaskRunSession, patchTaskRunSession, resolveSessionContext } = useWorkspaceTaskRunSessions(currentSessionKey);
  const { localSessionMessagesByKey, appendLocalSessionSystemMessage, clearLocalSessionMessages } = useWorkspaceLocalSessionMessages();
  const configuredGatewayToken = gatewayToken?.trim() || "";
  const normalizedGatewayToken = configuredGatewayToken || fallbackGatewayToken.trim();
  const historyTitleCacheRef = useRef<Record<string, string>>({});
  const sessionHistoryCacheRef = useRef<Record<string, unknown[]>>({});
  const threadViewModelsByKeyRef = useRef<Record<string, WorkspaceThreadViewModel>>({});
  const sessionSummaryByKeyRef = useRef<Record<string, string>>({});
  const sessionHistoryPageStateRef = useRef<Record<string, WorkspaceSessionHistoryPageState>>({});
  const { liveTranscriptItems, clearLiveTranscript, initializeLiveTranscript, appendLiveTranscriptStep, appendLiveTranscriptAssistantDelta, finishLiveTranscript, replaceThinkingTranscriptWithFailure } = useWorkspaceLiveTranscript();
  const { startupPreviewState, setStartupPreviewState, clearStartupPreview, startupPreviewActive, startupPreviewDisplaySessionKey } = useWorkspaceStartupPreview({ selectedAgentId, selectedSessionKey: currentSessionKey, sessionsResult });
  const clearChatFailure = useCallback(() => {
    setChatFailure(null);
  }, []);
  const clearPendingDisconnectError = useCallback(() => {
    if (disconnectErrorTimerRef.current) {
      clearTimeout(disconnectErrorTimerRef.current);
      disconnectErrorTimerRef.current = null;
    }
  }, []);
  const reportChatFailure = useCallback((params: {
    title: string;
    message: string;
    source: WorkspaceChatFailureSource;
    sessionKey?: string | null;
    runId?: string | null;
    replaceThinkingStep?: boolean;
  }) => {
    const sessionKey = params.sessionKey?.trim() || currentGatewaySessionKeyRef.current || currentSessionKeyRef.current || "";
    const runId = params.runId?.trim() || currentRunIdRef.current || null;
    const message = params.message.trim();
    setChatFailure(buildWorkspaceChatFailureNotice({
      title: params.title,
      message,
      source: params.source,
      sessionKey,
      runId,
      sessionKind: resolveWorkspaceChatFailureSessionKind({
        sessionKey,
        previewSessionKey: startupPreviewState?.previewSessionKey,
        isTaskRunSession: Boolean(resolveTaskRunSession(sessionKey)),
      }),
      canRetry: Boolean(lastSendAttemptRef.current),
    }));
    if (!params.replaceThinkingStep) {
      return;
    }
    const failureStep = buildWorkspaceFailureLiveStep({ runId, title: params.title, detail: message });
    setLiveSteps((current) => replaceWorkspaceThinkingStepWithFailure({
      current,
      runId,
      title: params.title,
      detail: message,
      time: failureStep.time,
    }));
    replaceThinkingTranscriptWithFailure(failureStep);
  }, [replaceThinkingTranscriptWithFailure, resolveTaskRunSession, startupPreviewState]);

  const isStaleConnectionGeneration = useCallback((expectedGeneration?: number, client?: WorkspaceGatewayClient | null) => (
    (expectedGeneration !== undefined && connectionGenerationRef.current !== expectedGeneration) ||
    Boolean(client && clientRef.current !== client)
  ), []);

  const isCurrentHistoryLoad = useCallback((requestId: number, sessionKey: string, connectionGeneration?: number) => (
    !isStaleConnectionGeneration(connectionGeneration) &&
    historyLoadSeqRef.current === requestId &&
    displayedHistorySessionKeyRef.current === sessionKey
  ), [isStaleConnectionGeneration]);

  const resolveAssistantAuthor = useCallback((sessionKey?: string | null) => resolveWorkspaceAssistantAuthor({ agents, selectedAgent, sessionKey }), [agents, selectedAgent]);

  const applyLiveStep = useCallback(
    (
      step: WorkspaceLiveStep,
      options?: {
        insertPostToolThinking?: boolean;
        bridgeRunId?: string;
        bridgeTimestamp?: number | null;
      },
    ) => {
      appendLiveTranscriptStep(step);
      setLiveSteps((current) => applyWorkspaceLiveStepUpdate({
        current,
        step,
        hasAssistantTextDelta: hasAssistantTextDeltaRef.current,
        hasObservedNonThinkingStep: hasObservedNonThinkingStepRef.current,
        options,
      }));
    },
    [appendLiveTranscriptStep],
  );

  const removeTransientThinkingBridge = useCallback((runId?: string | null) => setLiveSteps((current) => removeWorkspaceTransientThinkingBridge(current, runId)), []);

  const shouldSkipMirroredLiveStep = useCallback((params: {
    step: WorkspaceLiveStep;
    payload: WorkspaceGatewayAgentEventPayload;
    source: WorkspaceLiveStepEventSource;
    runId: string;
    timestampMs: number;
  }) => shouldSkipMirroredWorkspaceLiveStep({ cache: liveStepDedupeRef.current, ...params }), []);

  const finishLiveSteps = useCallback((status: WorkspaceLiveStepStatus) => {
    setLiveSteps((current) => finishWorkspaceLiveSteps(current, status));
    finishLiveTranscript(status);
  }, [finishLiveTranscript]);

  useEffect(() => { currentSessionKeyRef.current = currentSessionKey; }, [currentSessionKey]);
  useEffect(() => { markSessionSwitchPerf(sessionSwitchPerfRef.current, currentSessionKey, "shellCommitAt"); }, [currentSessionKey]);
  useEffect(() => { displayedHistorySessionKeyRef.current = startupPreviewDisplaySessionKey || currentSessionKey; }, [currentSessionKey, startupPreviewDisplaySessionKey]);
  useEffect(() => { currentRunIdRef.current = activeRunId; }, [activeRunId]);
  useEffect(() => { sendingRef.current = sending; }, [sending]);
  useEffect(() => { selectedAgentIdRef.current = selectedAgentId; }, [selectedAgentId]);
  useEffect(() => {
    if (agents.length === 0) {
      return;
    }

    const selectedAgentExists = selectedAgentId
      ? agents.some((agent) => agent.id === selectedAgentId)
      : false;
    const nextAgentId = selectedAgentExists
      ? selectedAgentId
      : effectiveAgentsResult?.defaultId || agents[0].id;

    if (nextAgentId && nextAgentId !== selectedAgentId) {
      setSelectedAgentId(nextAgentId);
    }

    if (nextAgentId && !selectedSessionKey) {
      setSelectedSessionKey(createAgentSessionKey(nextAgentId));
    }
  }, [agents, effectiveAgentsResult?.defaultId, selectedAgentId, selectedSessionKey]);
  useEffect(() => { historyTitleCacheRef.current = historyTitleCache; sessionHistoryCacheRef.current = sessionHistoryCache; threadViewModelsByKeyRef.current = threadViewModelsByKey; sessionSummaryByKeyRef.current = sessionSummaryByKey; sessionHistoryPageStateRef.current = sessionHistoryPageStateByKey; }, [historyTitleCache, sessionHistoryCache, sessionHistoryPageStateByKey, sessionSummaryByKey, threadViewModelsByKey]);
  useEffect(() => {
    if (!running) {
      setFallbackGatewayToken("");
      setGatewayTokenRefreshState("idle");
      return;
    }

    if (configuredGatewayToken) {
      setFallbackGatewayToken("");
      setGatewayTokenRefreshState("idle");
      return;
    }

    let cancelled = false;
    setGatewayTokenRefreshState("loading");

    async function refreshGatewayToken() {
      await invoke("migrate_gateway_config").catch(() => undefined);
      const config = await invoke<CurrentConfig>("get_current_config").catch(() => null);
      if (cancelled) {
      }

      setFallbackGatewayToken(config?.gateway_token?.trim() || "");
      setGatewayTokenRefreshState("done");
    }

    void refreshGatewayToken();

    return () => {
      cancelled = true;
    };
  }, [configuredGatewayToken, running]);

  useEffect(() => {
    let cancelled = false;

    async function loadAgentCache() {
      const rows = await invoke<WorkspaceAgentCacheRow[]>("list_workspace_agent_cache").catch(() => []);
      if (cancelled) {
        return;
      }

      const result = buildCachedAgentsResult(rows);
      setCachedAgentsResult(result);

      if (!result) {
        return;
      }

      const nextAgentId = result.defaultId || result.agents[0]?.id || "";
      if (nextAgentId) {
        setSelectedAgentId((current) => current || nextAgentId);
        setSelectedSessionKey((current) => current || createAgentSessionKey(nextAgentId));
      }
    }

    void loadAgentCache();

    return () => {
      cancelled = true;
    };
  }, []);

  const clearActiveRunRefs = useCallback(() => clearWorkspaceActiveRunRefs({
    currentRunIdRef,
    activeRunAliasesRef,
    liveStepDedupeRef,
    hasObservedNonThinkingStepRef,
    hasAssistantTextDeltaRef,
  }), []);

  const initializeActiveRun = useCallback((params: {
    runId: string;
    sessionKey?: string;
    pendingUserMessage?: WorkspaceMessage | null;
  }) => {
    initializeWorkspaceActiveRun({
      ...params,
      refs: { currentRunIdRef, activeRunAliasesRef, liveStepDedupeRef, hasObservedNonThinkingStepRef, hasAssistantTextDeltaRef },
      setters: { setSelectedSessionKey, setPendingUserMessage, setStreamText, setActiveRunId, setLiveSteps, setError },
    });
    initializeLiveTranscript(params.runId);
  }, [initializeLiveTranscript]);

  const preserveActiveRunSessionSwitch = useCallback((sessionKey: string) => { preserveActiveRunSessionSwitchRef.current = sessionKey.trim() || null; }, []);

  const endTaskRunConversationExecution = useCallback((expectedRunId?: string | null) => {
    const ended = endWorkspaceActiveRun({
      expectedRunId,
      refs: { currentRunIdRef, activeRunAliasesRef, liveStepDedupeRef, hasObservedNonThinkingStepRef, hasAssistantTextDeltaRef },
      setters: { setPendingUserMessage, setStreamText, setActiveRunId, setLiveSteps },
      removeTransientThinkingBridge,
    });
    if (ended) {
      clearLiveTranscript();
    }
    return ended;
  }, [clearLiveTranscript, removeTransientThinkingBridge]);

  const applyThreadViewModel = useCallback((viewModel: WorkspaceThreadViewModel) => setThreadViewModelsByKey((current) => upsertThreadViewModel(current, viewModel)), []);

  const updateSessionHistoryCache = useCallback((sessionKey: string, messages: unknown[]) => {
    if (!sessionKey) {
      return;
    }

    setSessionHistoryCache((current) => applySessionHistoryMessagesUpdate(current, sessionKey, messages));
    if (messages.length === 0) {
      setSessionHistoryPageStateByKey((current) => clearSessionPageState(current, sessionKey));
    }
    setSessionSummaryByKey((current) => applySessionMessagesSummaryUpdate(current, sessionKey, messages));
    applyThreadViewModel(buildThreadViewModelFromRawMessages(sessionKey, messages, resolveAssistantAuthor, sessionHistoryPageStateRef.current[sessionKey]));
  }, [applyThreadViewModel, resolveAssistantAuthor]);

  const updateSessionSummary = useCallback((sessionKey: string, summary?: string | null) => {
    if (!sessionKey) return;
    setSessionSummaryByKey((current) => applySessionSummaryUpdate(current, sessionKey, summary));
  }, []);

  const saveSessionHistoryCache = useCallback(async (sessionKey: string, agentId: string, messages: unknown[], updatedAt?: number | null, title?: string | null) => {
    if (!sessionKey || !agentId) return;
    await invoke("upsert_workspace_chat_session_cache", { sessionKey, agentId, updatedAt: updatedAt ?? null, title: title ?? null, messagesJson: serializeCachedMessages(messages) });
  }, []);

  const loadPersistedSessionHistoryCachePage = useCallback(async (sessionKey: string, agentId: string, beforeIndex?: number | null, limit?: number | null) => loadWorkspaceSessionCachePageWithDedupe(historyPageFetchesRef.current, sessionKey, agentId, beforeIndex, limit ?? SESSION_HISTORY_INITIAL_PAGE_LIMIT), []);
  const loadPersistedSessionRenderPage = useCallback(async (sessionKey: string, agentId: string, beforeIndex?: number | null, limit = THREAD_RENDER_PAGE_LIMIT) => loadWorkspaceSessionRenderPageWithDedupe(historyRenderPageFetchesRef.current, sessionKey, agentId, beforeIndex, limit), []);
  const warmSessionHistoryCachePages = useCallback((agentId?: string | null, sessionKeys?: string[] | null) => {
    const key = `${agentId ?? "*"}:${sessionKeys?.length ? [...sessionKeys].sort().join("|") : "*"}`;
    if (historyWarmFetchesRef.current.has(key)) return;
    historyWarmFetchesRef.current.add(key);
    void invoke("warm_workspace_chat_session_cache_pages", {
      agentId: agentId ?? null,
      sessionKeys: sessionKeys?.length ? sessionKeys : null,
      limitSessions: 3,
      pageLimit: SESSION_HISTORY_OLDER_PAGE_LIMIT,
    }).catch(() => undefined).finally(() => { historyWarmFetchesRef.current.delete(key); });
  }, []);
  const cachedAgentLastMessageById = useWorkspaceCachedAgentLastMessages(agents);
  const pruneSessionHistoryCache = useCallback(
    async (
      nextSessionsResult: WorkspaceGatewaySessionsListResult | null,
      pinnedSessionKey?: string | null,
    ) => {
      if (!nextSessionsResult) {
        return;
      }

      const keepSessionKeys = sortSessionsByUpdatedAt(nextSessionsResult.sessions)
        .slice(0, SESSION_CACHE_KEEP_LIMIT)
        .map((session) => session.key);

      if (pinnedSessionKey && !keepSessionKeys.includes(pinnedSessionKey)) {
        keepSessionKeys.push(pinnedSessionKey);
      }

      const normalizedKeepSessionKeys = Array.from(new Set(keepSessionKeys.filter(Boolean)));
      await invoke("prune_workspace_chat_session_cache", {
        keepSessionKeys: normalizedKeepSessionKeys,
      });

      const allowedSessionKeys = new Set(normalizedKeepSessionKeys);
      setSessionHistoryCache((current) => filterSessionHistoryCacheByKeys(current, allowedSessionKeys));
      setThreadViewModelsByKey((current) => filterThreadViewModelsByKeys(current, allowedSessionKeys));
      setSessionHistoryPageStateByKey((current) => filterSessionPageStateByKeys(current, allowedSessionKeys));
      setSessionSummaryByKey((current) => filterSessionSummaryByKeys(current, allowedSessionKeys));
    },
    [],
  );

  const isKnownActiveRunId = useCallback((runId?: string | null) => {
    if (!runId) {
      return true;
    }
    return runId === currentRunIdRef.current || activeRunAliasesRef.current.has(runId);
  }, []);

  const loadSessions = useCallback(async () => {
    const client = clientRef.current;
    if (!client?.connected) {
      return null;
    }

    const payload = await client.request("sessions.list", {});
    if (!isSessionsListResult(payload)) {
      throw new Error("sessions.list 返回格式不正确");
    }

    setSessionsResult(payload);
    void pruneSessionHistoryCache(payload, currentGatewaySessionKeyRef.current || currentSessionKeyRef.current).catch(() => undefined);
    return payload;
  }, [pruneSessionHistoryCache]);

  const loadSessionHistoryMessages = useCallback(async (sessionKey: string, limit = INITIAL_HISTORY_LIMIT) => {
    const client = clientRef.current;
    if (!client?.connected || !sessionKey) return [];
    const key = `${sessionKey}:${limit}`;
    const existing = historyRefreshFetchesRef.current.get(key);
    if (existing) return existing;
    const request = client.request<{ messages?: unknown[] }>("chat.history", { sessionKey, limit })
      .then((payload) => (Array.isArray(payload.messages) ? payload.messages : []))
      .finally(() => {
        historyRefreshFetchesRef.current.delete(key);
      });
    historyRefreshFetchesRef.current.set(key, request);
    return request;
  }, []);

  const loadHistory = useCallback(
    async (
      sessionKey: string,
      options?: {
        agentId?: string;
        connectionGeneration?: number;
      },
    ) => {
      const context = resolveSessionContext(sessionKey, options?.agentId || selectedAgentId);
      const agentId = context.agentId;
      const gatewaySessionKey = context.gatewaySessionKey;
      const isStartupPreviewHistory = Boolean(
        startupPreviewActive
        && startupPreviewState
        && gatewaySessionKey
        && startupPreviewState.previewSessionKey === gatewaySessionKey,
      );
      if (!sessionKey || !agentId) {
        return;
      }

      if (context.taskRunSession && !gatewaySessionKey) {
        setHistoryLoading(false);
        return;
      }

      const requestId = ++historyLoadSeqRef.current;
      const memoryCachedMessages = gatewaySessionKey ? sessionHistoryCacheRef.current[gatewaySessionKey] : undefined;
      const cachedViewModel = gatewaySessionKey ? threadViewModelsByKeyRef.current[gatewaySessionKey] : null;
      const cachedViewModelPageState = cachedViewModel?.pageState ?? null;
      let hasAnyCache = Array.isArray(memoryCachedMessages) || Boolean(cachedViewModel);
      let existingCachedTitle: string | null = gatewaySessionKey ? historyTitleCacheRef.current[gatewaySessionKey] ?? null : null;

      setHistoryLoading(false);
      if (gatewaySessionKey && cachedViewModelPageState && !sessionHistoryPageStateRef.current[gatewaySessionKey]) {
        setSessionHistoryPageStateByKey((current) => ({ ...current, [gatewaySessionKey]: cachedViewModelPageState }));
      }

      const sessionRow = gatewaySessionKey ? sessionsResult?.sessions.find((session) => session.key === gatewaySessionKey) ?? null : null;

      if (!hasAnyCache && gatewaySessionKey) {
        const renderPage = await loadPersistedSessionRenderPage(gatewaySessionKey, agentId, null, THREAD_RENDER_PAGE_LIMIT).catch(() => null);
        if (!isCurrentHistoryLoad(requestId, sessionKey, options?.connectionGeneration)) return;
        if (renderPage?.messages.length) { const viewModel = buildThreadViewModelFromRenderPage(renderPage, resolveAssistantAuthor); applyThreadViewModel(viewModel); setSessionHistoryPageStateByKey((current) => ({ ...current, [gatewaySessionKey]: viewModel.pageState ?? current[gatewaySessionKey] })); existingCachedTitle = renderPage.title ?? existingCachedTitle; hasAnyCache = true; markSessionSwitchPerf(sessionSwitchPerfRef.current, gatewaySessionKey, "renderPageLoadedAt"); }
      }

      if (!isCurrentHistoryLoad(requestId, sessionKey, options?.connectionGeneration)) {
        return;
      }

      if (!connected) {
        if (isStartupPreviewHistory) {
          clearStartupPreview();
        }
        setHistoryLoading(false);
        return;
      }

      const refreshMeta = gatewaySessionKey ? historyRefreshMetaRef.current.get(gatewaySessionKey) : null;
      if (
        hasAnyCache
        && refreshMeta
        && refreshMeta.updatedAt === (sessionRow?.updatedAt ?? null)
        && Date.now() - refreshMeta.loadedAt < 30_000
      ) {
        setHistoryLoading(false);
        return;
      }

      if (!hasAnyCache) {
        setHistoryLoading(true);
      } else { await new Promise<void>((resolve) => window.setTimeout(resolve, 80)); if (!isCurrentHistoryLoad(requestId, sessionKey, options?.connectionGeneration)) return; }

      try {
        const messages = await loadSessionHistoryMessages(gatewaySessionKey, INITIAL_HISTORY_LIMIT);

        if (!isCurrentHistoryLoad(requestId, sessionKey, options?.connectionGeneration)) {
          return;
        }

        historyRefreshMetaRef.current.set(gatewaySessionKey, {
          loadedAt: Date.now(),
          updatedAt: sessionRow?.updatedAt ?? null,
        });
        startSessionTransition(() => {
          updateSessionHistoryCache(gatewaySessionKey, messages);
          setSessionHistoryPageStateByKey((current) => ({
            ...current,
            [gatewaySessionKey]: buildSessionHistoryPageStateFromGatewayMessages(messages, current[gatewaySessionKey]),
          }));
        });

        const nextTitle = resolveStableSessionHistoryTitleDetails(sessionRow ?? { key: gatewaySessionKey, displayName: undefined, label: undefined }, {
          currentTitle: historyTitleCacheRef.current[gatewaySessionKey],
          cachedTitle: existingCachedTitle,
          memoryMessages: messages,
        }).title;
        if (nextTitle) {
          applyHistoryTitleCacheUpdate({ sessionKey: gatewaySessionKey, nextTitle, setHistoryTitleCache });
        }

        await saveSessionHistoryCache(
          gatewaySessionKey,
          agentId,
          messages,
          sessionRow?.updatedAt ?? null,
          nextTitle ?? existingCachedTitle,
        ).catch(() => undefined);
        setError(null);
        if (isStartupPreviewHistory) {
          clearChatFailure();
        }
      } catch (loadError) {
        if (isStartupPreviewHistory) {
          clearStartupPreview();
        }
        if (!hasAnyCache && isCurrentHistoryLoad(requestId, sessionKey, options?.connectionGeneration)) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (isCurrentHistoryLoad(requestId, sessionKey, options?.connectionGeneration)) {
          setHistoryLoading(false);
        }
      }
    },
    [
      connected,
      clearChatFailure,
      clearStartupPreview,
      isCurrentHistoryLoad,
      applyThreadViewModel,
      loadPersistedSessionHistoryCachePage,
      loadPersistedSessionRenderPage,
      loadSessionHistoryMessages,
      resolveSessionContext,
      resolveAssistantAuthor,
      saveSessionHistoryCache,
      selectedAgentId,
      sessionsResult,
      startSessionTransition,
      startupPreviewActive,
      startupPreviewState,
      updateSessionHistoryCache,
    ],
  );

  const bootstrapGatewayState = useCallback(async (expectedGeneration?: number) => {
    const client = clientRef.current;
    if (!client?.connected || isStaleConnectionGeneration(expectedGeneration, client)) {
      return;
    }

    try {
      await client.request("sessions.subscribe", {}).catch(() => undefined);

      const [agentsPayload, sessionsPayload] = await Promise.all([
        client.request("agents.list", {}),
        client.request("sessions.list", {}),
      ]);

      if (isStaleConnectionGeneration(expectedGeneration, client)) {
        return;
      }

      if (!isAgentsListResult(agentsPayload)) {
        throw new Error("agents.list 返回格式不正确");
      }

      if (!isSessionsListResult(sessionsPayload)) {
        throw new Error("sessions.list 返回格式不正确");
      }

      const nextAgentsPayload = sanitizeAgentsResult(agentsPayload);
      setAgentsResult(nextAgentsPayload);
      setCachedAgentsResult(nextAgentsPayload.agents.length > 0 ? nextAgentsPayload : null);
      setSessionsResult(sessionsPayload);
      clearPendingDisconnectError();
      setStatus("connected");
      setError(null);
      clearChatFailure();

      void invoke("replace_workspace_agent_cache", {
        defaultId: nextAgentsPayload.defaultId,
        scope: nextAgentsPayload.scope,
        agents: toAgentCachePayload(nextAgentsPayload),
      }).catch(() => undefined);

      const currentSelectedAgentId = selectedAgentIdRef.current;
      const hadGatewayStateBeforeBootstrap = Boolean(agentsResult || sessionsResult);
      const currentTaskRunSession = resolveTaskRunSession(currentSessionKeyRef.current);
      const nextAgentId =
        nextAgentsPayload.agents.some((agent) => agent.id === currentSelectedAgentId)
          ? currentSelectedAgentId
          : nextAgentsPayload.defaultId || nextAgentsPayload.agents[0]?.id || "";
      const nextPreviewState = nextAgentId
        ? resolveWorkspaceStartupPreviewState(sessionsPayload, nextAgentId)
        : null;
      const nextSessionKey = currentTaskRunSession && currentTaskRunSession.agentId === nextAgentId
        ? currentTaskRunSession.key
        : nextAgentId
          ? hadGatewayStateBeforeBootstrap
            ? resolveAgentSessionKey(sessionsPayload, nextAgentId, currentGatewaySessionKeyRef.current || currentSessionKeyRef.current)
            : createAgentSessionKey(nextAgentId)
          : "";

      if (isStaleConnectionGeneration(expectedGeneration, client)) {
        return;
      }

      setSelectedAgentId(nextAgentId);
      setSelectedSessionKey(nextSessionKey);
      setStartupPreviewState(
        !hadGatewayStateBeforeBootstrap
        && !currentTaskRunSession
        && nextPreviewState
        && nextSessionKey === nextPreviewState.mainSessionKey
          ? nextPreviewState
          : null,
      );
      void pruneSessionHistoryCache(sessionsPayload, currentGatewaySessionKeyRef.current || nextSessionKey).catch(() => undefined);
    } catch (bootstrapError) {
      if (isStaleConnectionGeneration(expectedGeneration, client)) {
        return;
      }

      clearPendingDisconnectError();
      setStatus("error");
      setError(bootstrapError instanceof Error ? bootstrapError.message : String(bootstrapError));
    }
  }, [agentsResult, clearChatFailure, clearPendingDisconnectError, isStaleConnectionGeneration, pruneSessionHistoryCache, resolveTaskRunSession, sessionsResult]);

  const bindTaskRunConversationToResult = useCallback(async (sessionKey: string, result: { sessionKey?: string | null; sessionId?: string | null }) => (
    bindWorkspaceTaskRunConversationToResult({
    sessionKey, result, sessionsResult, loadSessions, loadHistory, patchTaskRunSession, resolveTaskRunSession, connectionGeneration: connectionGenerationRef.current,
  })), [loadHistory, loadSessions, patchTaskRunSession, resolveTaskRunSession, sessionsResult]);

  const ensureTaskRunConversationBound = useCallback(async (sessionKey: string, fallbackAgentId?: string | null) => (
    ensureWorkspaceTaskRunConversationBound({
      sessionKey, fallbackAgentId, selectedAgentId: selectedAgentIdRef.current || selectedAgentId, sessionsResult, loadSessions, resolveTaskRunSession, resolveSessionContext, bindTaskRunConversationToResult,
    })
  ), [bindTaskRunConversationToResult, loadSessions, resolveSessionContext, resolveTaskRunSession, selectedAgentId, sessionsResult]);

  const handleGatewayEvent = useCallback(
    (event: { event: string; payload?: unknown }) => {
      if ((event.event === "agent" || event.event === "session.tool") && isRecord(event.payload)) {
        const payload = event.payload as WorkspaceGatewayAgentEventPayload;
        const eventSource = event.event as WorkspaceLiveStepEventSource;
        const payloadSessionKey = toStringValue(payload.sessionKey);
        const payloadRunId = toStringValue(payload.runId);
        const currentRunId = currentRunIdRef.current;
        const activeAliases = activeRunAliasesRef.current;
        const currentDisplaySessionKey = currentSessionKeyRef.current;
        const currentTaskRunSession = resolveTaskRunSession(currentDisplaySessionKey);
        const isUnboundCurrentTaskRun = Boolean(currentTaskRunSession && !currentTaskRunSession.boundSessionKey);
        const matchesCurrentRun = isKnownActiveRunId(payloadRunId);

        if (!currentRunId) {
          return;
        }

        if (payloadRunId && !matchesCurrentRun) {
          return;
        }

        const shouldAdoptResolvedRunSession = Boolean(payloadSessionKey && payloadRunId && matchesCurrentRun && payloadSessionKey !== currentGatewaySessionKeyRef.current);

        if (payloadSessionKey && payloadSessionKey !== currentGatewaySessionKeyRef.current && !(
          (isUnboundCurrentTaskRun && matchesCurrentRun) || shouldAdoptResolvedRunSession
        )) {
          return;
        }

        if (payloadRunId) {
          activeAliases.add(payloadRunId);
        }

        if (isUnboundCurrentTaskRun && payloadSessionKey && matchesCurrentRun) {
          void bindTaskRunConversationToResult(currentDisplaySessionKey, {
            sessionKey: payloadSessionKey,
          });
        } else if (shouldAdoptResolvedRunSession) {
          adoptWorkspaceActiveRunSession({ sessionKey: payloadSessionKey, fallbackAgentId: selectedAgentIdRef.current, preserveActiveRunSessionSwitch, setSelectedAgentId, setSelectedSessionKey });
        }

        const step = buildLiveStepFromAgentEvent(payload, payloadRunId || currentRunId || "run");
        if (step) {
          const data = isRecord(payload.data) ? payload.data : {};
          const stream = toStringValue(payload.stream);
          const timestampMs = toFiniteTimestamp(payload.ts) ?? Date.now();
          const dedupeRunId = payloadRunId || currentRunId || "run";
          if (
            shouldSkipMirroredLiveStep({
              step,
              payload,
              source: eventSource,
              runId: dedupeRunId,
              timestampMs,
            })
          ) {
            return;
          }

          if (step.kind !== "thinking") {
            hasObservedNonThinkingStepRef.current = true;
          }

          applyLiveStep(step, {
            insertPostToolThinking: step.kind !== "thinking" && isTerminalLiveStepStatus(step.status),
            bridgeRunId: dedupeRunId,
            bridgeTimestamp: timestampMs,
          });

          const isAgentLifecycleFailure = Boolean(
            eventSource === "agent"
            && (stream === "lifecycle" || stream === "thinking")
            && step.status === "error"
            && (data.isError === true || data.error !== undefined || toStringValue(data.status) === "failed" || toStringValue(data.phase) === "error"),
          );
          if (isAgentLifecycleFailure) {
            const failureMessage = resolveWorkspaceAgentFailureMessage(data);
            reportChatFailure({
              title: "模型运行失败",
              message: failureMessage,
              source: "agent_error",
              sessionKey: payloadSessionKey || currentGatewaySessionKeyRef.current || currentSessionKeyRef.current,
              runId: payloadRunId || currentRunId,
              replaceThinkingStep: true,
            });
            setError(failureMessage);
          }
        }
        return;
      }

      if (event.event !== "chat" || !isChatEventPayload(event.payload)) {
        return;
      }

      const payload = event.payload;
      const currentDisplaySessionKey = currentSessionKeyRef.current;
      const currentTaskRunSession = resolveTaskRunSession(currentDisplaySessionKey);
      const isUnboundCurrentTaskRun = Boolean(currentTaskRunSession && !currentTaskRunSession.boundSessionKey);
      const isCurrentRun = isKnownActiveRunId(payload.runId);
      const shouldAdoptResolvedRunSession = Boolean(payload.sessionKey && payload.runId && isCurrentRun && payload.sessionKey !== currentGatewaySessionKeyRef.current);
      let isCurrentSession = payload.sessionKey === currentGatewaySessionKeyRef.current;

      if (!isCurrentSession && isUnboundCurrentTaskRun && isCurrentRun) {
        isCurrentSession = true;
        if (payload.sessionKey) {
          void bindTaskRunConversationToResult(currentDisplaySessionKey, {
            sessionKey: payload.sessionKey,
          });
        }
      } else if (!isCurrentSession && shouldAdoptResolvedRunSession) {
        isCurrentSession = true;
        adoptWorkspaceActiveRunSession({ sessionKey: payload.sessionKey, fallbackAgentId: selectedAgentIdRef.current, preserveActiveRunSessionSwitch, setSelectedAgentId, setSelectedSessionKey });
      }

      if (!isCurrentSession) {
        if (payload.state === "final") {
          void loadSessions();
        }
        return;
      }

      if (payload.state === "delta" && isCurrentRun) {
        const nextAssistantDelta = sanitizeWorkspaceAssistantContent(payload.message);
        const nextText = nextAssistantDelta.text.trim();
        const timestampMs = toFiniteTimestamp((payload as { ts?: unknown }).ts) ?? Date.now();
        if (nextText && !nextAssistantDelta.shouldHide && !hasAssistantTextDeltaRef.current) {
          hasAssistantTextDeltaRef.current = true;
          removeTransientThinkingBridge(currentRunIdRef.current);
          clearChatFailure();
        }
        if (nextText && !nextAssistantDelta.shouldHide) {
          appendLiveTranscriptAssistantDelta({
            runId: payload.runId,
            text: nextText,
            timestampMs,
          });
        }
        setStreamText((current) => {
          if (!nextText || nextAssistantDelta.shouldHide) {
            return current;
          }
          return mergeWorkspaceStreamText(current, nextText);
        });
        return;
      }

      if (payload.state === "error" && isCurrentRun) {
        const errorMessage = humanizeWorkspaceChatFailureMessage(payload.errorMessage?.trim() || "聊天生成失败");
        reportChatFailure({
          title: "模型返回错误",
          message: errorMessage,
          source: "chat_error",
          sessionKey: payload.sessionKey,
          runId: payload.runId,
          replaceThinkingStep: true,
        });
        setError(errorMessage);
      }

      if (payload.state === "aborted" && isCurrentRun) {
        finishLiveSteps("aborted");
      }

      if (payload.state === "final" || (payload.state !== "delta" && isCurrentRun)) {
        if (isCurrentRun) {
          removeTransientThinkingBridge(currentRunIdRef.current);
          setActiveRunId(null);
          setPendingUserMessage(null);
          setStreamText(null);
          clearActiveRunRefs();
          if (payload.state === "final") {
            lastSendAttemptRef.current = null;
            clearChatFailure();
          }
          if (payload.state === "final") {
            setLiveSteps([]);
            clearLiveTranscript();
          }
        }
        void loadSessions();
        const historySessionKey = payload.sessionKey || currentGatewaySessionKeyRef.current || currentSessionKeyRef.current;
        void loadHistory(historySessionKey, {
          agentId: extractAgentIdFromSessionKey(historySessionKey) || selectedAgentId,
          connectionGeneration: connectionGenerationRef.current,
        });
      }
    },
    [appendLiveTranscriptAssistantDelta, applyLiveStep, bindTaskRunConversationToResult, clearActiveRunRefs, clearChatFailure, clearLiveTranscript, finishLiveSteps, isKnownActiveRunId, loadHistory, loadSessions, preserveActiveRunSessionSwitch, removeTransientThinkingBridge, reportChatFailure, resolveTaskRunSession, selectedAgentId, shouldSkipMirroredLiveStep],
  );

  useEffect(() => {
    bootstrapGatewayStateRef.current = bootstrapGatewayState;
  }, [bootstrapGatewayState]);

  useEffect(() => {
    handleGatewayEventRef.current = handleGatewayEvent;
  }, [handleGatewayEvent]);

  useEffect(() => {
    const resetGatewayState = (nextStatus: WorkspaceGatewayStatus, nextError: string | null) => {
      connectionGenerationRef.current += 1;
      clearPendingDisconnectError();
      clientRef.current?.stop();
      clientRef.current = null;
      setStatus(nextStatus);
      setError(nextError);
      setAgentsResult(null);
      setSessionsResult(null);
      setSelectedAgentId("");
      setSelectedSessionKey("");
      setStartupPreviewState(null);
      setChatFailure(null);
      setSessionHistoryCache({});
      setHistoryLoading(false);
      setSending(false);
      setResettingSession(false);
      setActiveRunId(null);
      setPendingUserMessage(null);
      setStreamText(null);
      clearActiveRunRefs();
      setLiveSteps([]);
      clearLiveTranscript();
    };

    const connectionGeneration = connectionGenerationRef.current + 1;
    connectionGenerationRef.current = connectionGeneration;

    if (!running || !servicePort) {
      resetGatewayState("idle", null);
      return;
    }

    if (!normalizedGatewayToken) {
      if (!configuredGatewayToken && gatewayTokenRefreshState !== "done") {
        setStatus("connecting");
        setError(null);
        return; /*
          setError(message ?? "网关连接已断开");
      */ }
      resetGatewayState("error", MISSING_GATEWAY_TOKEN_ERROR);
      return;
    }

    const client = new WorkspaceGatewayClient({
      url: buildGatewayUrl(servicePort),
      token: normalizedGatewayToken,
      onConnecting: () => {
        if (isStaleConnectionGeneration(connectionGeneration, client)) {
          return;
        }
        clearPendingDisconnectError();
        setStatus("connecting");
        setError(null);
      },
      onConnected: () => {
        if (isStaleConnectionGeneration(connectionGeneration, client)) {
          return;
        }
        clearPendingDisconnectError();
        setStatus("connecting");
        setError(null);
        void bootstrapGatewayStateRef.current(connectionGeneration);
      },
      onEvent: (event) => {
        if (isStaleConnectionGeneration(connectionGeneration, client)) {
          return;
        }
        handleGatewayEventRef.current(event);
      },
      onDisconnected: (message) => {
        if (isStaleConnectionGeneration(connectionGeneration, client)) {
          return;
        }
        clearPendingDisconnectError();
        if (startupPreviewActive) {
          clearStartupPreview();
        }
        if (currentRunIdRef.current || sendingRef.current) {
          reportChatFailure({
            title: "网关连接丢失",
            message: message ?? "网关连接已断开，正在尝试重新连接。",
            source: "disconnect",
            sessionKey: currentGatewaySessionKeyRef.current || currentSessionKeyRef.current,
            runId: currentRunIdRef.current,
            replaceThinkingStep: true,
          });
          setPendingUserMessage(null);
          setStreamText(null);
          setActiveRunId(null);
          clearActiveRunRefs();
        }
        setStatus("connecting");
        setError(null);
        disconnectErrorTimerRef.current = setTimeout(() => {
          if (isStaleConnectionGeneration(connectionGeneration, client) || client.connected) {
            return;
          }

          setError(message ?? "网关连接已断开");
          setStatus("error");
        }, 1500); /*
        return;
        setError(message ?? "首页聊天连接已断开");
      */ },
    });

    clientRef.current = client;
    client.start();

    return () => {
      clearPendingDisconnectError();
      if (connectionGenerationRef.current === connectionGeneration) {
        connectionGenerationRef.current += 1;
      }
      if (clientRef.current === client) {
        clientRef.current = null;
      }
      client.stop();
    };
  }, [
    clearPendingDisconnectError,
    clearActiveRunRefs,
    clearStartupPreview,
    configuredGatewayToken,
    gatewayTokenRefreshState,
    isStaleConnectionGeneration,
    normalizedGatewayToken,
    reportChatFailure,
    running,
    servicePort,
    startupPreviewActive,
    clearLiveTranscript,
  ]);

  useEffect(() => {
    if (!connected || !currentSessionKey) {
      return;
    }

    const shouldPreserveActiveRun = preserveActiveRunSessionSwitchRef.current === currentSessionKey;
    preserveActiveRunSessionSwitchRef.current = null;
    if (!shouldPreserveActiveRun) {
      setPendingUserMessage(null);
      setStreamText(null);
      setActiveRunId(null);
      clearActiveRunRefs();
      setLiveSteps([]);
      clearLiveTranscript();
    }
    void loadHistory(startupPreviewDisplaySessionKey || currentSessionKey, {
      agentId: selectedAgentId,
      connectionGeneration: connectionGenerationRef.current,
    });
  }, [clearActiveRunRefs, clearLiveTranscript, connected, currentSessionKey, loadHistory, selectedAgentId, startupPreviewDisplaySessionKey]);

  useEffect(() => {
    if (!selectedAgentId) {
      if (selectedSessionKey) {
        setSelectedSessionKey("");
      }
      if (startupPreviewState) {
        clearStartupPreview();
      }
      return;
    }

    const syntheticSession = resolveTaskRunSession(selectedSessionKey);
    if (syntheticSession) {
      if (startupPreviewState) {
        clearStartupPreview();
      }
      if (syntheticSession.agentId !== selectedAgentId) {
        setSelectedSessionKey(resolveAgentSessionKey(sessionsResult, selectedAgentId));
      }
      return;
    }

    if (startupPreviewState) {
      if (!startupPreviewActive) {
        clearStartupPreview();
        return;
      }
      return;
    }

    const nextSessionKey = resolveAgentSessionKey(sessionsResult, selectedAgentId, selectedSessionKey);
    if (nextSessionKey && nextSessionKey !== selectedSessionKey) {
      setSelectedSessionKey(nextSessionKey);
    }
  }, [clearStartupPreview, resolveTaskRunSession, selectedAgentId, selectedSessionKey, sessionsResult, startupPreviewActive, startupPreviewState]);

  useEffect(() => {
    if (!sessionsResult) {
      return;
    }

    const validSessionKeys = new Set(sessionsResult.sessions.map((session) => session.key));
    void pruneSessionHistoryCache(sessionsResult, currentSessionKeyRef.current).catch(() => undefined);
    setHistoryTitleCache((current) => filterSessionSummaryByKeys(current, validSessionKeys));
    setThreadViewModelsByKey((current) => filterThreadViewModelsByKeys(current, validSessionKeys));
    setSessionSummaryByKey((current) => filterSessionSummaryByKeys(current, validSessionKeys));
    deleteMissingSessionKeys(historyTitleFetchesRef.current, validSessionKeys);
  }, [pruneSessionHistoryCache, sessionsResult]);

  const loadHistoryTitles = useCallback((options?: { agentIds?: string[]; sessionKeysByAgentId?: Record<string, string[]> }) => {
    const agentIds = options?.agentIds?.length ? options.agentIds : selectedAgentId ? [selectedAgentId] : [];
    if (agentIds.length === 0) return;
    loadWorkspaceHistoryTitleBatches({
      agentIds, connected, sessionsResult, sessionKeysByAgentId: options?.sessionKeysByAgentId,
      historyTitleFetches: historyTitleFetchesRef.current, historyTitleLoadBatches: historyTitleLoadBatchesRef.current, getHistoryTitleCache: () => historyTitleCacheRef.current,
      setHistoryTitleCache, updateSessionSummary,
    });
    for (const agentId of agentIds) {
      warmSessionHistoryCachePages(agentId, options?.sessionKeysByAgentId?.[agentId]);
    }
  }, [connected, selectedAgentId, sessionsResult, updateSessionSummary, warmSessionHistoryCachePages]);

  useEffect(() => { if (selectedAgentId && sessionsResult?.sessions.length) loadHistoryTitles({ agentIds: [selectedAgentId] }); }, [loadHistoryTitles, selectedAgentId, sessionsResult]);
  useEffect(() => {
    if (connected && selectedAgentId && sessionsResult?.sessions.length) {
      warmSessionHistoryCachePages(selectedAgentId);
    }
  }, [connected, selectedAgentId, sessionsResult, warmSessionHistoryCachePages]);

  const selectAgent = useCallback((agentId: string) => {
    lastSendAttemptRef.current = null;
    clearChatFailure();
    clearLiveTranscript();
    clearStartupPreview();
    setSelectedAgentId(agentId);
    setSelectedSessionKey(resolveAgentSessionKey(sessionsResult, agentId));
  }, [clearChatFailure, clearLiveTranscript, clearStartupPreview, sessionsResult]);

  const selectSession = useCallback((sessionKey: string, fallbackAgentId?: string | null) => {
    const agentId = resolveSessionContext(sessionKey, fallbackAgentId).agentId;
    if (!agentId || (!startupPreviewActive && agentId === selectedAgentId && sessionKey === currentSessionKey)) {
      return;
    }
    markSessionSwitchPerf(sessionSwitchPerfRef.current, sessionKey, "clickAt");
    lastSendAttemptRef.current = null;
    setSelectedAgentId(agentId);
    setSelectedSessionKey(sessionKey);
    if (startupPreviewActive) {
      startSessionTransition(() => {
        clearStartupPreview();
      });
    }
  }, [clearStartupPreview, currentSessionKey, resolveSessionContext, selectedAgentId, startSessionTransition, startupPreviewActive]);
  const refreshSessionHistory = useCallback((sessionKey: string, agentId?: string | null) => {
    const nextAgentId = resolveSessionContext(sessionKey, agentId || selectedAgentId).agentId;
    return connected && sessionKey && nextAgentId ? loadHistory(sessionKey, { agentId: nextAgentId, connectionGeneration: connectionGenerationRef.current }).then(() => true) : Promise.resolve(false);
  }, [connected, loadHistory, resolveSessionContext, selectedAgentId]);
  const loadOlderHistoryPage = useCallback(() => loadOlderWorkspaceSessionHistoryPage({
    sessionKey: currentGatewaySessionKey || currentSessionKey, selectedAgentId, historyPageLoadSeqRef, currentGatewaySessionKeyRef, currentSessionKeyRef,
    sessionHistoryPageStateRef, sessionHistoryCacheRef, resolveSessionContext, loadPersistedSessionHistoryCachePage, setSessionHistoryPageStateByKey, updateSessionHistoryCache,
  }), [currentGatewaySessionKey, currentSessionKey, loadPersistedSessionHistoryCachePage, resolveSessionContext, selectedAgentId, updateSessionHistoryCache]);
  const continueStartupPreview = useCallback(() => {
    if (!startupPreviewActive || !startupPreviewState) {
      return false;
    }
    clearChatFailure();
    clearLiveTranscript();
    lastSendAttemptRef.current = null;
    setSelectedAgentId(startupPreviewState.agentId);
    setSelectedSessionKey(startupPreviewState.previewSessionKey);
    clearStartupPreview();
    return true;
  }, [clearChatFailure, clearLiveTranscript, clearStartupPreview, startupPreviewActive, startupPreviewState]);
  const sendMessage = useCallback((value: string, options?: SendWorkspaceGatewayMessageOptions) => {
    lastSendAttemptRef.current = { value, options };
    clearChatFailure();
    if (startupPreviewActive) {
      clearStartupPreview();
    }
    return sendWorkspaceGatewayMessage({
      client: clientRef.current,
      value,
      options,
      currentGatewaySessionKey,
      currentSessionKey,
      selectedAgentId,
      ensureTaskRunConversationBound,
      setSelectedAgentId,
      preserveActiveRunSessionSwitch,
      initializeActiveRun,
      sessionsResult,
      historyTitleCacheRef,
      sessionHistoryCacheRef,
      setHistoryTitleCache,
      saveSessionHistoryCache,
      onSendError: (sendError) => {
        const message = sendError instanceof Error ? sendError.message : String(sendError);
        setPendingUserMessage(null);
        setStreamText(null);
        setActiveRunId(null);
        clearActiveRunRefs();
        reportChatFailure({
          title: "会话发送失败",
          message,
          source: "send",
          sessionKey: currentGatewaySessionKey || currentSessionKey,
          replaceThinkingStep: true,
        });
        setError(message);
      },
      setSending,
    });
  }, [clearActiveRunRefs, clearChatFailure, clearStartupPreview, currentGatewaySessionKey, currentSessionKey, ensureTaskRunConversationBound, initializeActiveRun, preserveActiveRunSessionSwitch, reportChatFailure, saveSessionHistoryCache, selectedAgentId, sessionsResult, startupPreviewActive]);

  const { createNewSession: createNewSessionBase, runTaskInNewChat: runTaskInNewChatBase } = useWorkspaceManualSessionExecution({
    clientRef,
    selectedAgentId,
    selectedAgentIdRef,
    currentGatewaySessionKey,
    currentSessionKeyRef,
    sessionsResult,
    loadSessions,
    clearActiveRunRefs,
    appendLocalSessionSystemMessage,
    sendMessage,
    setSelectedAgentId,
    setSelectedSessionKey,
    setPendingUserMessage,
    setStreamText,
    setActiveRunId,
    setLiveSteps,
    setResettingSession,
    setError,
  });
  const createNewSession = useCallback(async () => {
    lastSendAttemptRef.current = null;
    clearChatFailure();
    clearLiveTranscript();
    clearStartupPreview();
    return createNewSessionBase();
  }, [clearChatFailure, clearLiveTranscript, clearStartupPreview, createNewSessionBase]);
  const runTaskInNewChat = useCallback(async (options: Parameters<typeof runTaskInNewChatBase>[0]) => {
    lastSendAttemptRef.current = null;
    clearChatFailure();
    clearLiveTranscript();
    clearStartupPreview();
    return runTaskInNewChatBase(options);
  }, [clearChatFailure, clearLiveTranscript, clearStartupPreview, runTaskInNewChatBase]);
  const abortMessage = useCallback(() => abortWorkspaceGatewayMessage({
    client: clientRef.current,
    currentGatewaySessionKey,
    currentRunId: currentRunIdRef.current,
    finishLiveSteps,
    removeTransientThinkingBridge,
    setError,
  }), [currentGatewaySessionKey, finishLiveSteps, removeTransientThinkingBridge]);

  const resetSession = useCallback(async () => {
    lastSendAttemptRef.current = null;
    clearChatFailure();
    clearLiveTranscript();
    clearStartupPreview();
    return resetWorkspaceGatewaySession({
      client: clientRef.current,
      currentGatewaySessionKey,
      currentRunId: currentRunIdRef.current,
      currentSessionKey,
      selectedAgentId,
      ensureTaskRunConversationBound,
      clearActiveRunRefs,
      clearLocalSessionMessages,
      loadHistory,
      loadSessions,
      saveSessionHistoryCache,
      updateSessionHistoryCache,
      connectionGeneration: connectionGenerationRef.current,
      setActiveRunId,
      setError,
      setLiveSteps,
      setPendingUserMessage,
      setResettingSession,
      setStreamText,
    });
  }, [clearActiveRunRefs, clearChatFailure, clearLiveTranscript, clearLocalSessionMessages, clearStartupPreview, currentGatewaySessionKey, currentSessionKey, ensureTaskRunConversationBound, loadHistory, loadSessions, saveSessionHistoryCache, selectedAgentId, updateSessionHistoryCache]);

  const request = useCallback(async <T = unknown>(method: string, params?: unknown) => {
    const client = clientRef.current;
    if (!client?.connected) {
      throw new Error("gateway not connected");
    }
    return client.request<T>(method, params);
  }, []);

  const historyItems = useMemo(() => buildWorkspaceHistoryItems({ currentSessionKey, historyTitleCache, sessionSummaryByKey, selectedAgentId, sessionsResult, taskRunSessions }), [currentSessionKey, historyTitleCache, selectedAgentId, sessionSummaryByKey, sessionsResult, taskRunSessions]);

  const agentRecentSessionsById = useMemo(() => buildAgentRecentSessionsById({
    agents, sessionsResult, historyTitleCache, sessionHistoryCache: {},
  }), [agents, historyTitleCache, sessionsResult]);

  const displayedHistorySessionKey = startupPreviewActive ? startupPreviewDisplaySessionKey : currentGatewaySessionKey;
  const currentHistoryPageState = displayedHistorySessionKey ? sessionHistoryPageStateByKey[displayedHistorySessionKey] ?? null : null;
  const currentThreadViewModel = displayedHistorySessionKey ? threadViewModelsByKey[displayedHistorySessionKey] ?? null : null;
  useEffect(() => { if (currentThreadViewModel) markSessionSwitchPerf(sessionSwitchPerfRef.current, currentThreadViewModel.sessionKey, currentThreadViewModel.richHydrated ? "richHydratedAt" : "firstPreviewPaintAt"); }, [currentThreadViewModel?.hydratedAt, currentThreadViewModel?.richHydrated, currentThreadViewModel?.sessionKey]);
  const normalizedHistoryMessages = useMemo(() => currentThreadViewModel?.normalizedVisibleMessages ?? buildWorkspaceNormalizedHistoryMessages({ displayedHistorySessionKey, resolveAssistantAuthor, sessionHistoryCache, windowLimit: THREAD_RENDER_WINDOW_LIMIT }), [currentThreadViewModel, displayedHistorySessionKey, resolveAssistantAuthor, sessionHistoryCache]);
  const streamMessage = useMemo(() => buildWorkspaceStreamMessage({ activeRunId, currentGatewaySessionKey, currentSessionKey, resolveAssistantAuthor, streamText }), [activeRunId, currentGatewaySessionKey, currentSessionKey, resolveAssistantAuthor, streamText]);
  const messages = useMemo(() => buildWorkspaceMessages({ currentGatewaySessionKey, currentTaskRunSystemMessages: currentTaskRunSession?.systemMessages, localSessionMessagesByKey, normalizedHistoryMessages, pendingUserMessage, startupPreviewActive, streamMessage }), [currentGatewaySessionKey, currentTaskRunSession?.systemMessages, localSessionMessagesByKey, normalizedHistoryMessages, pendingUserMessage, startupPreviewActive, streamMessage]);
  const agentLastMessageById = useMemo(() => buildWorkspaceAgentLastMessageById({ agents, cachedAgentLastMessageById, sessionSummaryByKey, sessionsResult }), [agents, cachedAgentLastMessageById, sessionSummaryByKey, sessionsResult]);
  const currentMainSession = useMemo(() => (selectedAgentId ? findMainAgentSession(sessionsResult, selectedAgentId) : null), [selectedAgentId, sessionsResult]);
  const startupPreview = useMemo(() => buildWorkspaceStartupPreview({ historyTitleCache, sessionsResult, startupPreviewActive, startupPreviewState }), [historyTitleCache, sessionsResult, startupPreviewActive, startupPreviewState]);
  const retryLastSend = useCallback(() => {
    const lastAttempt = lastSendAttemptRef.current;
    return lastAttempt ? sendMessage(lastAttempt.value, lastAttempt.options) : Promise.resolve(false);
  }, [sendMessage]);

  return { status, connected, error, agents, agentsResult: effectiveAgentsResult, agentListSource, agentLastMessageById, sessionsResult, selectedAgentId, selectedAgent, selectedSessionKey: currentSessionKey, currentSessionKey, currentMainSession, historyItems, agentRecentSessionsById, messages, liveSteps, liveTranscriptItems, chatFailure, startupPreview, historyLoading, historyPageState: currentHistoryPageState, sending, resettingSession, isGenerating: Boolean(activeRunId), createNewSession, runTaskInNewChat, endTaskRunConversationExecution, bindTaskRunConversationToResult, ensureTaskRunConversationBound, selectAgent, selectSession, continueStartupPreview, refreshSessionHistory, loadOlderHistoryPage, request, sendMessage, retryLastSend, abortMessage, resetSession, loadHistoryTitles, reload: bootstrapGatewayState };
}
