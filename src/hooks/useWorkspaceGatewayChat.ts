import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WorkspaceGatewayClient, buildGatewayUrl, createAgentSessionKey, filterAgentSessions, findMainAgentSession, formatAgentAvatar, isAgentsListResult, isChatEventPayload, isSessionsListResult } from "./workspace-gateway/client";
import type { WorkspaceActiveSkillList, WorkspaceActiveSlashCommand, WorkspaceAgentCacheRow, WorkspaceChatSessionCacheRow, WorkspaceComposerAttachment, WorkspaceGatewayAgentsListResult, WorkspaceGatewaySessionsListResult, WorkspaceGatewayStatus, WorkspaceLiveStep, WorkspaceLiveStepStatus, WorkspaceMessage } from "../components/workspace-clone/workspaceCloneTypes";
import { buildWorkspaceGatewayChatAttachments } from "../components/workspace-clone/workspaceCloneChatAttachments";
import { buildWorkspaceComposerTransportMessage } from "../components/workspace-clone/workspaceCloneSlashCommands";
import { isWorkspaceRawProcessEcho, sanitizeWorkspaceAssistantContent } from "../components/workspace-clone/workspaceCloneMessageVisibility";
import type { CurrentConfig } from "../types";
import { buildAgentRecentSessionsById } from "./workspace-gateway/agent-recent-sessions";
import { buildCachedAgentsResult, parseCachedMessagesJson, sanitizeAgentsResult, serializeCachedMessages, sortSessionsByUpdatedAt, toAgentCachePayload } from "./workspace-gateway/session-cache";
import { buildSessionHistoryItem, extractAgentIdFromSessionKey, extractLastMeaningfulMessageSummary, normalizeGatewayMessage, resolveAgentSessionKey, resolveSessionHistoryTitleDetails, resolveStableSessionHistoryTitleDetails } from "./workspace-gateway/message-normalizers";
import { loadWorkspaceHistoryTitles } from "./workspace-gateway/history-titles";
import { applyHistoryTitleCacheUpdate, writeOptimisticSessionHistoryTitle } from "./workspace-gateway/history-title-state";
import { buildTaskRunHistoryItem } from "./workspace-gateway/task-run-sessions";
import { adoptWorkspaceActiveRunSession, bindWorkspaceTaskRunConversationToResult, clearWorkspaceActiveRunRefs, endWorkspaceActiveRun, ensureWorkspaceTaskRunConversationBound, initializeWorkspaceActiveRun } from "./workspace-gateway/task-run-bridge";
import { useWorkspaceLocalSessionMessages } from "./workspace-gateway/useWorkspaceLocalSessionMessages";
import { useWorkspaceCachedAgentLastMessages } from "./workspace-gateway/useWorkspaceCachedAgentLastMessages";
import { useWorkspaceManualSessionExecution } from "./workspace-gateway/useWorkspaceManualSessionExecution";
import { useWorkspaceTaskRunSessions } from "./workspace-gateway/useWorkspaceTaskRunSessions";
import { shouldSkipMirroredWorkspaceLiveStep } from "./workspace-gateway/live-step-dedupe";
import { captureWorkspaceChatMessageSent, type WorkspaceChatTelemetrySessionType } from "./workspace-gateway/chat-telemetry";
import { buildLiveStepFromAgentEvent, buildPostToolThinkingStep, getPostToolThinkingStepId, isRecord, isTerminalLiveStepStatus, toFiniteTimestamp, toStringValue, type WorkspaceGatewayAgentEventPayload, type WorkspaceLiveStepDedupeEntry, type WorkspaceLiveStepEventSource, updateLiveStepList } from "./workspace-gateway/live-steps";
import { formatClockTime } from "./workspace-gateway/time-formatters";
interface UseWorkspaceGatewayChatOptions {
  running: boolean;
  servicePort: number;
  gatewayToken?: string | null;
}
interface ChatHistoryPayload {
  messages?: unknown[];
}
const INITIAL_HISTORY_LIMIT = 50;
const SESSION_CACHE_KEEP_LIMIT = 20;
const MISSING_GATEWAY_TOKEN_ERROR = "本地网关 token 缺失或未同步，请检查 ~/.openclaw/openclaw.json，或重新保存 Provider 配置后再试。";
export function useWorkspaceGatewayChat({ running, servicePort, gatewayToken }: UseWorkspaceGatewayChatOptions) {
  const clientRef = useRef<WorkspaceGatewayClient | null>(null);
  const disconnectErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionGenerationRef = useRef(0);
  const currentSessionKeyRef = useRef("");
  const currentRunIdRef = useRef<string | null>(null);
  const activeRunAliasesRef = useRef<Set<string>>(new Set());
  const liveStepDedupeRef = useRef<Map<string, WorkspaceLiveStepDedupeEntry>>(new Map());
  const historyTitleFetchesRef = useRef<Set<string>>(new Set());
  const historyLoadSeqRef = useRef(0);
  const selectedAgentIdRef = useRef("");
  const preserveActiveRunSessionSwitchRef = useRef<string | null>(null);
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
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [resettingSession, setResettingSession] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<WorkspaceMessage | null>(null);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [liveSteps, setLiveSteps] = useState<WorkspaceLiveStep[]>([]);
  const [fallbackGatewayToken, setFallbackGatewayToken] = useState("");
  const [gatewayTokenRefreshState, setGatewayTokenRefreshState] = useState<"idle" | "loading" | "done">("idle");
  const connected = status === "connected";
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
  const clearPendingDisconnectError = useCallback(() => {
    if (disconnectErrorTimerRef.current) {
      clearTimeout(disconnectErrorTimerRef.current);
      disconnectErrorTimerRef.current = null;
    }
  }, []);

  const isStaleConnectionGeneration = useCallback((expectedGeneration?: number, client?: WorkspaceGatewayClient | null) => (
    (expectedGeneration !== undefined && connectionGenerationRef.current !== expectedGeneration) ||
    Boolean(client && clientRef.current !== client)
  ), []);

  const isCurrentHistoryLoad = useCallback((requestId: number, sessionKey: string, connectionGeneration?: number) => (
    !isStaleConnectionGeneration(connectionGeneration) &&
    historyLoadSeqRef.current === requestId &&
    currentSessionKeyRef.current === sessionKey
  ), [isStaleConnectionGeneration]);

  const resolveAssistantAuthor = useCallback(
    (sessionKey?: string | null) => {
      if (sessionKey) {
        const agentId = extractAgentIdFromSessionKey(sessionKey);
        const match = agentId ? agents.find((agent) => agent.id === agentId) : null;
        if (match) {
          return formatAgentAvatar(match);
        }
      }
      return selectedAgent ? formatAgentAvatar(selectedAgent) : "A";
    },
    [agents, selectedAgent],
  );

  const applyLiveStep = useCallback(
    (
      step: WorkspaceLiveStep,
      options?: {
        insertPostToolThinking?: boolean;
        bridgeRunId?: string;
        bridgeTimestamp?: number | null;
      },
    ) => {
      setLiveSteps((current) => {
        const next = updateLiveStepList(current, step);
        if (
          !options?.insertPostToolThinking ||
          !options.bridgeRunId ||
          hasAssistantTextDeltaRef.current ||
          !hasObservedNonThinkingStepRef.current
        ) {
          return next;
        }
        return updateLiveStepList(next, buildPostToolThinkingStep(options.bridgeRunId, options.bridgeTimestamp));
      });
    },
    [],
  );

  const removeTransientThinkingBridge = useCallback((runId?: string | null) => {
    if (!runId) return;
    setLiveSteps((current) => current.filter((step) => step.id !== getPostToolThinkingStepId(runId)));
  }, []);

  const shouldSkipMirroredLiveStep = useCallback((params: {
    step: WorkspaceLiveStep;
    payload: WorkspaceGatewayAgentEventPayload;
    source: WorkspaceLiveStepEventSource;
    runId: string;
    timestampMs: number;
  }) => shouldSkipMirroredWorkspaceLiveStep({ cache: liveStepDedupeRef.current, ...params }), []);

  const finishLiveSteps = useCallback((status: WorkspaceLiveStepStatus) => {
    setLiveSteps((current) => current.map((step) => (
      step.status === "running" || step.status === "pending"
        ? { ...step, status }
        : step
    )));
  }, []);

  useEffect(() => {
    currentSessionKeyRef.current = currentSessionKey;
  }, [currentSessionKey]);
  useEffect(() => {
    currentRunIdRef.current = activeRunId;
  }, [activeRunId]);
  useEffect(() => {
    selectedAgentIdRef.current = selectedAgentId;
  }, [selectedAgentId]);
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
  useEffect(() => {
    historyTitleCacheRef.current = historyTitleCache;
    sessionHistoryCacheRef.current = sessionHistoryCache;
  }, [historyTitleCache, sessionHistoryCache]);
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
  }) => initializeWorkspaceActiveRun({
    ...params,
    refs: { currentRunIdRef, activeRunAliasesRef, liveStepDedupeRef, hasObservedNonThinkingStepRef, hasAssistantTextDeltaRef },
    setters: { setSelectedSessionKey, setPendingUserMessage, setStreamText, setActiveRunId, setLiveSteps, setError },
  }), []);

  const preserveActiveRunSessionSwitch = useCallback((sessionKey: string) => { preserveActiveRunSessionSwitchRef.current = sessionKey.trim() || null; }, []);

  const endTaskRunConversationExecution = useCallback((expectedRunId?: string | null) => endWorkspaceActiveRun({
    expectedRunId,
    refs: { currentRunIdRef, activeRunAliasesRef, liveStepDedupeRef, hasObservedNonThinkingStepRef, hasAssistantTextDeltaRef },
    setters: { setPendingUserMessage, setStreamText, setActiveRunId, setLiveSteps },
    removeTransientThinkingBridge,
  }), [removeTransientThinkingBridge]);

  const updateSessionHistoryCache = useCallback((sessionKey: string, messages: unknown[]) => {
    if (!sessionKey) {
      return;
    }

    setSessionHistoryCache((current) => {
      const previous = current[sessionKey];
      if (previous === messages) {
        return current;
      }

      return {
        ...current,
        [sessionKey]: messages,
      };
    });
  }, []);

  const saveSessionHistoryCache = useCallback(
    async (
      sessionKey: string,
      agentId: string,
      messages: unknown[],
      updatedAt?: number | null,
      title?: string | null,
    ) => {
      if (!sessionKey || !agentId) {
        return;
      }

      await invoke("upsert_workspace_chat_session_cache", {
        sessionKey,
        agentId,
        updatedAt: updatedAt ?? null,
        title: title ?? null,
        messagesJson: serializeCachedMessages(messages),
      });
    },
    [],
  );

  const loadPersistedSessionHistoryCache = useCallback(async (sessionKey: string, agentId: string) => {
    if (!sessionKey || !agentId) return null;
    return invoke<WorkspaceChatSessionCacheRow | null>("load_workspace_chat_session_cache", { sessionKey, agentId });
  }, []);
  const cachedAgentLastMessageById = useWorkspaceCachedAgentLastMessages(agents, loadPersistedSessionHistoryCache);
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
      setSessionHistoryCache((current) => {
        let changed = false;
        const next: Record<string, unknown[]> = {};

        for (const [sessionKey, messages] of Object.entries(current)) {
          if (allowedSessionKeys.has(sessionKey)) {
            next[sessionKey] = messages;
            continue;
          }

          changed = true;
        }

        return changed ? next : current;
      });
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

  const loadSessionHistoryMessages = useCallback(
    async (sessionKey: string, limit = INITIAL_HISTORY_LIMIT) => {
      const client = clientRef.current;
      if (!client?.connected || !sessionKey) {
        return [];
      }

      const payload = await client.request<ChatHistoryPayload>("chat.history", {
        sessionKey,
        limit,
      });

      return Array.isArray(payload.messages) ? payload.messages : [];
    },
    [],
  );

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
      if (!sessionKey || !agentId) {
        return;
      }

      if (context.taskRunSession && !gatewaySessionKey) {
        setHistoryLoading(false);
        return;
      }

      const requestId = ++historyLoadSeqRef.current;
      const memoryCachedMessages = gatewaySessionKey ? sessionHistoryCacheRef.current[gatewaySessionKey] : undefined;
      let hasAnyCache = Array.isArray(memoryCachedMessages);
      let existingCachedTitle: string | null = gatewaySessionKey ? historyTitleCacheRef.current[gatewaySessionKey] ?? null : null;

      setHistoryLoading(false);

      const sessionRow = gatewaySessionKey ? sessionsResult?.sessions.find((session) => session.key === gatewaySessionKey) ?? null : null;

      if (!hasAnyCache) {
        try {
          const cachedRow = gatewaySessionKey
            ? await loadPersistedSessionHistoryCache(gatewaySessionKey, agentId)
            : null;
          if (!isCurrentHistoryLoad(requestId, sessionKey, options?.connectionGeneration)) {
            return;
          }

          if (cachedRow) {
            const cachedMessages = parseCachedMessagesJson(cachedRow.messagesJson);
            updateSessionHistoryCache(gatewaySessionKey, cachedMessages);
            hasAnyCache = true;

            const restoredTitle = resolveStableSessionHistoryTitleDetails(sessionRow ?? { key: gatewaySessionKey, displayName: undefined, label: undefined }, {
              currentTitle: historyTitleCacheRef.current[gatewaySessionKey],
              cachedTitle: cachedRow.title,
              persistedMessages: cachedMessages,
            });
            existingCachedTitle = restoredTitle.title;
            if (restoredTitle.title) {
              applyHistoryTitleCacheUpdate({ sessionKey: gatewaySessionKey, nextTitle: restoredTitle.title, setHistoryTitleCache });
            }

            if (restoredTitle.source !== "fallback" && cachedRow.title?.trim() !== restoredTitle.title) {
              await saveSessionHistoryCache(gatewaySessionKey, agentId, cachedMessages, cachedRow.updatedAt, restoredTitle.title).catch(() => undefined);
            }
          }
        } catch {
          // Ignore local cache failures and fall back to gateway refresh.
        }
      }

      if (!isCurrentHistoryLoad(requestId, sessionKey, options?.connectionGeneration)) {
        return;
      }

      if (!connected) {
        setHistoryLoading(false);
        return;
      }

      if (!hasAnyCache) {
        setHistoryLoading(true);
      }

      try {
        const messages = await loadSessionHistoryMessages(gatewaySessionKey, INITIAL_HISTORY_LIMIT);

        if (!isCurrentHistoryLoad(requestId, sessionKey, options?.connectionGeneration)) {
          return;
        }

        updateSessionHistoryCache(gatewaySessionKey, messages);

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
      } catch (loadError) {
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
      isCurrentHistoryLoad,
      isStaleConnectionGeneration,
      loadPersistedSessionHistoryCache,
      loadSessionHistoryMessages,
      resolveSessionContext,
      saveSessionHistoryCache,
      selectedAgentId,
      sessionsResult,
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

      void invoke("replace_workspace_agent_cache", {
        defaultId: nextAgentsPayload.defaultId,
        scope: nextAgentsPayload.scope,
        agents: toAgentCachePayload(nextAgentsPayload),
      }).catch(() => undefined);

      const currentSelectedAgentId = selectedAgentIdRef.current;
      const currentTaskRunSession = resolveTaskRunSession(currentSessionKeyRef.current);
      const nextAgentId =
        nextAgentsPayload.agents.some((agent) => agent.id === currentSelectedAgentId)
          ? currentSelectedAgentId
          : nextAgentsPayload.defaultId || nextAgentsPayload.agents[0]?.id || "";
      const nextSessionKey = currentTaskRunSession && currentTaskRunSession.agentId === nextAgentId
        ? currentTaskRunSession.key
        : nextAgentId
          ? resolveAgentSessionKey(sessionsPayload, nextAgentId, currentGatewaySessionKeyRef.current || currentSessionKeyRef.current)
          : "";

      if (isStaleConnectionGeneration(expectedGeneration, client)) {
        return;
      }

      setSelectedAgentId(nextAgentId);
      setSelectedSessionKey(nextSessionKey);
      void pruneSessionHistoryCache(sessionsPayload, currentGatewaySessionKeyRef.current || nextSessionKey).catch(() => undefined);
    } catch (bootstrapError) {
      if (isStaleConnectionGeneration(expectedGeneration, client)) {
        return;
      }

      clearPendingDisconnectError();
      setStatus("error");
      setError(bootstrapError instanceof Error ? bootstrapError.message : String(bootstrapError));
    }
  }, [clearPendingDisconnectError, isStaleConnectionGeneration, pruneSessionHistoryCache, resolveTaskRunSession]);

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
        if (nextText && !nextAssistantDelta.shouldHide && !hasAssistantTextDeltaRef.current) {
          hasAssistantTextDeltaRef.current = true;
          removeTransientThinkingBridge(currentRunIdRef.current);
        }
        setStreamText((current) => {
          if (!nextText || nextAssistantDelta.shouldHide) {
            return current;
          }
          if (!current || nextText.length >= current.length) {
            return nextText;
          }
          return current;
        });
        return;
      }

      if (payload.state === "error" && isCurrentRun) {
        finishLiveSteps("error");
        setError(payload.errorMessage ?? "聊天生成失败");
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
            setLiveSteps([]);
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
    [applyLiveStep, bindTaskRunConversationToResult, clearActiveRunRefs, finishLiveSteps, isKnownActiveRunId, loadHistory, loadSessions, preserveActiveRunSessionSwitch, removeTransientThinkingBridge, resolveTaskRunSession, selectedAgentId, shouldSkipMirroredLiveStep],
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
      setSessionHistoryCache({});
      setHistoryLoading(false);
      setSending(false);
      setResettingSession(false);
      setActiveRunId(null);
      setPendingUserMessage(null);
      setStreamText(null);
      clearActiveRunRefs();
      setLiveSteps([]);
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
    configuredGatewayToken,
    gatewayTokenRefreshState,
    isStaleConnectionGeneration,
    normalizedGatewayToken,
    running,
    servicePort,
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
    }
    void loadHistory(currentSessionKey, { agentId: selectedAgentId, connectionGeneration: connectionGenerationRef.current });
  }, [clearActiveRunRefs, connected, currentSessionKey, loadHistory, selectedAgentId]);

  useEffect(() => {
    if (!selectedAgentId) {
      if (selectedSessionKey) {
        setSelectedSessionKey("");
      }
      return;
    }

    const syntheticSession = resolveTaskRunSession(selectedSessionKey);
    if (syntheticSession) {
      if (syntheticSession.agentId !== selectedAgentId) {
        setSelectedSessionKey(resolveAgentSessionKey(sessionsResult, selectedAgentId));
      }
      return;
    }

    const nextSessionKey = resolveAgentSessionKey(sessionsResult, selectedAgentId, selectedSessionKey);
    if (nextSessionKey && nextSessionKey !== selectedSessionKey) {
      setSelectedSessionKey(nextSessionKey);
    }
  }, [resolveTaskRunSession, selectedAgentId, selectedSessionKey, sessionsResult]);

  useEffect(() => {
    if (!sessionsResult) {
      return;
    }

    const validSessionKeys = new Set(sessionsResult.sessions.map((session) => session.key));
    void pruneSessionHistoryCache(sessionsResult, currentSessionKeyRef.current).catch(() => undefined);
    setHistoryTitleCache((current) => {
      let changed = false;
      const next: Record<string, string> = {};

      for (const [sessionKey, title] of Object.entries(current)) {
        if (validSessionKeys.has(sessionKey)) {
          next[sessionKey] = title;
          continue;
        }

        changed = true;
      }

      return changed ? next : current;
    });

    historyTitleFetchesRef.current.forEach((sessionKey) => {
      if (!validSessionKeys.has(sessionKey)) {
        historyTitleFetchesRef.current.delete(sessionKey);
      }
    });
  }, [pruneSessionHistoryCache, sessionsResult]);

  const loadHistoryTitles = useCallback((options?: { agentIds?: string[]; sessionKeysByAgentId?: Record<string, string[]> }) => {
    const agentIds = options?.agentIds?.length ? options.agentIds : selectedAgentId ? [selectedAgentId] : [];
    if (agentIds.length === 0) return;
    void Promise.all(agentIds.map((agentId) => loadWorkspaceHistoryTitles({
      agentId, connected, sessionsResult, historyTitleCache, sessionKeys: options?.sessionKeysByAgentId?.[agentId], historyTitleFetches: historyTitleFetchesRef.current, setHistoryTitleCache,
      loadSessionHistoryMessages, loadPersistedSessionHistoryCache, updateSessionHistoryCache, saveSessionHistoryCache,
    }))).catch(() => undefined);
  }, [connected, historyTitleCache, loadPersistedSessionHistoryCache, loadSessionHistoryMessages, saveSessionHistoryCache, selectedAgentId, sessionsResult, updateSessionHistoryCache]);

  useEffect(() => { if (selectedAgentId && sessionsResult?.sessions.length) loadHistoryTitles({ agentIds: [selectedAgentId] }); }, [loadHistoryTitles, selectedAgentId, sessionsResult]);

  const selectAgent = useCallback((agentId: string) => { setSelectedAgentId(agentId); setSelectedSessionKey(resolveAgentSessionKey(sessionsResult, agentId)); }, [sessionsResult]);

  const selectSession = useCallback((sessionKey: string, fallbackAgentId?: string | null) => {
    const agentId = resolveSessionContext(sessionKey, fallbackAgentId).agentId;
    if (agentId) { setSelectedAgentId(agentId); setSelectedSessionKey(sessionKey); }
  }, [resolveSessionContext]);
  const refreshSessionHistory = useCallback((sessionKey: string, agentId?: string | null) => {
    const nextAgentId = resolveSessionContext(sessionKey, agentId || selectedAgentId).agentId;
    return connected && sessionKey && nextAgentId
      ? loadHistory(sessionKey, { agentId: nextAgentId, connectionGeneration: connectionGenerationRef.current }).then(() => true)
      : Promise.resolve(false);
  }, [connected, loadHistory, resolveSessionContext, selectedAgentId]);
  const sendMessage = useCallback(async (value: string, options?: { activeCommand?: WorkspaceActiveSlashCommand; activeSkills?: WorkspaceActiveSkillList; attachments?: WorkspaceComposerAttachment[]; workspaceDirectory?: string | null; targetSessionKey?: string | null; targetAgentId?: string | null; preserveSessionSwitch?: boolean; displayText?: string; transportText?: string; telemetrySessionType?: WorkspaceChatTelemetrySessionType }) => {
      const client = clientRef.current;
      const message = (options?.displayText ?? value).trim(); const outboundText = (options?.transportText ?? value).trim();
      const outgoingAttachments = options?.attachments ?? [];
      const hasAttachments = outgoingAttachments.length > 0;
      const transportMessage = options?.activeCommand || options?.activeSkills?.length || options?.workspaceDirectory?.trim()
        ? buildWorkspaceComposerTransportMessage({
            command: options?.activeCommand,
            skills: options?.activeSkills,
            workspaceDirectory: options?.workspaceDirectory,
            userMessage: outboundText,
          })
        : outboundText;
      const gatewaySessionKey = options?.targetSessionKey?.trim() || currentGatewaySessionKey || await ensureTaskRunConversationBound(currentSessionKey, selectedAgentId);
      const targetAgentId = options?.targetAgentId?.trim() || extractAgentIdFromSessionKey(gatewaySessionKey || "") || selectedAgentId;

      if (!client?.connected || !gatewaySessionKey || (!message && !hasAttachments) || (!outboundText && !hasAttachments) || !targetAgentId) {
        return false;
      }

      const runId = crypto.randomUUID();
      if (options?.preserveSessionSwitch) {
        preserveActiveRunSessionSwitch(gatewaySessionKey);
      }
      setSelectedAgentId(targetAgentId);
      writeOptimisticSessionHistoryTitle({ sessionKey: gatewaySessionKey, agentId: targetAgentId, displayText: message, sessionsResult, historyTitleCacheRef, sessionHistoryCacheRef, setHistoryTitleCache, saveSessionHistoryCache });
      initializeActiveRun({
        runId,
        sessionKey: gatewaySessionKey,
        pendingUserMessage: {
          id: `pending-${runId}`,
          role: "user",
          author: "你",
          text: message,
          attachments: outgoingAttachments.map((attachment) => ({ id: attachment.id, fileName: attachment.fileName, mimeType: attachment.mimeType, kind: attachment.kind, transportType: attachment.transportType, sizeBytes: attachment.sizeBytes, previewUrl: attachment.previewUrl ?? null })),
          time: formatClockTime(Date.now()),
        },
      });
      captureWorkspaceChatMessageSent(gatewaySessionKey, targetAgentId, options?.telemetrySessionType);
      setSending(true);

      try {
        await client.request("chat.send", {
          sessionKey: gatewaySessionKey,
          message: transportMessage,
          deliver: false,
          idempotencyKey: runId,
          attachments: buildWorkspaceGatewayChatAttachments(outgoingAttachments),
        });
        return true;
      } catch (sendError) {
        setPendingUserMessage(null);
        setStreamText(null);
        setActiveRunId(null);
        clearActiveRunRefs();
        setLiveSteps([]);
        setError(sendError instanceof Error ? sendError.message : String(sendError));
        return false;
      } finally {
        setSending(false);
      }
    }, [clearActiveRunRefs, currentGatewaySessionKey, currentSessionKey, ensureTaskRunConversationBound, initializeActiveRun, preserveActiveRunSessionSwitch, saveSessionHistoryCache, selectedAgentId, sessionsResult]);

  const { createNewSession, runTaskInNewChat } = useWorkspaceManualSessionExecution({
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
  const abortMessage = useCallback(async () => {
    const client = clientRef.current;
    if (!client?.connected || !currentGatewaySessionKey) {
      return false;
    }

    try {
      await client.request("chat.abort", currentRunIdRef.current
        ? { sessionKey: currentGatewaySessionKey, runId: currentRunIdRef.current }
        : { sessionKey: currentGatewaySessionKey });
      removeTransientThinkingBridge(currentRunIdRef.current);
      finishLiveSteps("aborted");
      return true;
    } catch (abortError) {
      setError(abortError instanceof Error ? abortError.message : String(abortError));
      return false;
    }
  }, [currentGatewaySessionKey, finishLiveSteps, removeTransientThinkingBridge]);

  const resetSession = useCallback(async () => {
    const client = clientRef.current;
    const gatewaySessionKey =
      currentGatewaySessionKey
      || await ensureTaskRunConversationBound(currentSessionKey, selectedAgentId);
    if (!client?.connected || !gatewaySessionKey) {
      return false;
    }

    setResettingSession(true);

    try {
      if (currentRunIdRef.current) {
        await client.request("chat.abort", {
          sessionKey: gatewaySessionKey,
          runId: currentRunIdRef.current,
        }).catch(() => undefined);
      }

      await client.request("sessions.reset", { key: gatewaySessionKey });
      setActiveRunId(null);
      setPendingUserMessage(null);
      setStreamText(null);
      clearActiveRunRefs();
      setLiveSteps([]);
      clearLocalSessionMessages(gatewaySessionKey);
      updateSessionHistoryCache(gatewaySessionKey, []);
      await saveSessionHistoryCache(
        gatewaySessionKey,
        extractAgentIdFromSessionKey(gatewaySessionKey) || selectedAgentId,
        [],
        null,
        null,
      ).catch(() => undefined);
      await Promise.all([
        loadSessions(),
        loadHistory(currentSessionKey, {
          agentId: selectedAgentId,
          connectionGeneration: connectionGenerationRef.current,
        }),
      ]);
      return true;
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : String(resetError));
      return false;
    } finally {
      setResettingSession(false);
    }
  }, [clearActiveRunRefs, clearLocalSessionMessages, currentGatewaySessionKey, currentSessionKey, ensureTaskRunConversationBound, loadHistory, loadSessions, saveSessionHistoryCache, selectedAgentId, updateSessionHistoryCache]);

  const request = useCallback(
    async <T = unknown>(method: string, params?: unknown) => {
      const client = clientRef.current;
      if (!client?.connected) {
        throw new Error("gateway not connected");
      }
      return client.request<T>(method, params);
    },
    [],
  );

  const historyItems = useMemo(() => {
    if (!selectedAgentId) {
      return [];
    }

    const taskRunHistoryItems = Object.values(taskRunSessions)
      .filter((session) => session.agentId === selectedAgentId)
      .map((session) => {
        const boundSessionUpdatedAt = session.boundSessionKey
          ? sessionsResult?.sessions.find((gatewaySession) => gatewaySession.key === session.boundSessionKey)?.updatedAt ?? null
          : null;
        return buildTaskRunHistoryItem(session, currentSessionKey, boundSessionUpdatedAt);
      });
    const hiddenGatewaySessionKeys = new Set(
      taskRunHistoryItems
        .map((item) => item.boundSessionKey?.trim() || "")
        .filter(Boolean),
    );
    const gatewayHistoryItems = filterAgentSessions(sessionsResult, selectedAgentId)
      .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
      .filter((session) => !hiddenGatewaySessionKeys.has(session.key))
      .map((session) => {
        const resolvedTitle = resolveSessionHistoryTitleDetails(session, { cachedTitle: historyTitleCache[session.key], memoryMessages: sessionHistoryCache[session.key] });
        const item = buildSessionHistoryItem(session, { cachedTitle: resolvedTitle.title, memoryMessages: sessionHistoryCache[session.key], currentSessionKey });
        return import.meta.env.DEV ? { ...item, _historyTitleSource: resolvedTitle.source } : item;
      });

    return [...taskRunHistoryItems, ...gatewayHistoryItems]
      .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
  }, [currentSessionKey, historyTitleCache, selectedAgentId, sessionHistoryCache, sessionsResult, taskRunSessions]);

  const agentRecentSessionsById = useMemo(() => buildAgentRecentSessionsById({
    agents, sessionsResult, historyTitleCache, sessionHistoryCache, currentSessionKey: currentGatewaySessionKey || currentSessionKey,
  }), [agents, currentGatewaySessionKey, currentSessionKey, historyTitleCache, sessionHistoryCache, sessionsResult]);

  const normalizedHistoryMessages = useMemo(() => (
    (currentGatewaySessionKey ? sessionHistoryCache[currentGatewaySessionKey] ?? [] : [])
      .map((message) => normalizeGatewayMessage(message, resolveAssistantAuthor))
      .filter((message): message is WorkspaceMessage => Boolean(message))
  ), [currentGatewaySessionKey, resolveAssistantAuthor, sessionHistoryCache]);

  const streamMessage = useMemo(() => {
    if (!activeRunId) {
      return null;
    }

    const nextText = streamText?.trim() || "";
    if (nextText && isWorkspaceRawProcessEcho(nextText)) {
      return null;
    }

    return {
      id: `stream-${activeRunId}`,
      role: "assistant" as const,
      author: resolveAssistantAuthor(currentGatewaySessionKey || currentSessionKey),
      text: nextText,
      time: "",
      status: "streaming" as const,
    };
  }, [activeRunId, currentGatewaySessionKey, currentSessionKey, resolveAssistantAuthor, streamText]);

  const messages = useMemo(() => {
    const merged = [...(currentTaskRunSession?.systemMessages ?? []), ...(currentGatewaySessionKey ? localSessionMessagesByKey[currentGatewaySessionKey] ?? [] : []), ...normalizedHistoryMessages];
    if (pendingUserMessage) {
      merged.push(pendingUserMessage);
    }
    if (streamMessage) {
      merged.push(streamMessage);
    }
    return merged;
  }, [currentGatewaySessionKey, currentTaskRunSession?.systemMessages, localSessionMessagesByKey, normalizedHistoryMessages, pendingUserMessage, streamMessage]);

  const agentLastMessageById = useMemo(() => {
    const next = { ...cachedAgentLastMessageById };

    for (const agent of agents) {
      const sortedSessionKeys = sortSessionsByUpdatedAt(filterAgentSessions(sessionsResult, agent.id))
        .map((session) => session.key);
      const knownSessionKeys = Object.keys(sessionHistoryCache)
        .filter((sessionKey) => sessionKey.startsWith(`agent:${agent.id}:`));
      const sessionKeys = Array.from(new Set([...sortedSessionKeys, ...knownSessionKeys]));

      for (const sessionKey of sessionKeys) {
        const rawMessages = sessionKey === currentSessionKey
          ? messages
          : sessionHistoryCache[sessionKey] ?? [];
        const summary = extractLastMeaningfulMessageSummary(rawMessages);
        if (summary) {
          next[agent.id] = summary;
          break;
        }
      }
    }

    return next;
  }, [agents, cachedAgentLastMessageById, currentSessionKey, messages, sessionHistoryCache, sessionsResult]);

  const currentMainSession = useMemo(
    () => (selectedAgentId ? findMainAgentSession(sessionsResult, selectedAgentId) : null),
    [selectedAgentId, sessionsResult],
  );

  return {
    status,
    connected,
    error,
    agents,
    agentsResult: effectiveAgentsResult,
    agentListSource,
    agentLastMessageById,
    sessionsResult,
    selectedAgentId,
    selectedAgent,
    selectedSessionKey: currentSessionKey,
    currentSessionKey,
    currentMainSession,
    historyItems,
    agentRecentSessionsById,
    messages,
    liveSteps,
    historyLoading,
    sending,
    resettingSession,
    isGenerating: Boolean(activeRunId),
    createNewSession,
    runTaskInNewChat,
    endTaskRunConversationExecution,
    bindTaskRunConversationToResult,
    ensureTaskRunConversationBound,
    selectAgent,
    selectSession,
    refreshSessionHistory,
    request,
    sendMessage,
    abortMessage,
    resetSession,
    loadHistoryTitles,
    reload: bootstrapGatewayState,
  };
}
