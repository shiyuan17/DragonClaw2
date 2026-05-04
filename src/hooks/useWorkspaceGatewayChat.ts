import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  WorkspaceGatewayClient,
  buildGatewayUrl,
  createAgentSessionKey,
  filterAgentSessions,
  findMainAgentSession,
  formatAgentAvatar,
  isAgentsListResult,
  isChatEventPayload,
  isSessionsListResult,
} from "./workspace-gateway/client";
import type {
  WorkspaceAgentCacheRow,
  WorkspaceChatSessionCacheRow,
  WorkspaceChatSessionCacheSummary,
  WorkspaceGatewayAgentsListResult,
  WorkspaceGatewaySessionsListResult,
  WorkspaceGatewayStatus,
  WorkspaceLiveStep,
  WorkspaceLiveStepStatus,
  WorkspaceActiveSlashCommand,
  WorkspaceMessage,
} from "../components/workspace-clone/workspaceCloneTypes";
import { buildWorkspaceSlashCommandTransportMessage } from "../components/workspace-clone/workspaceCloneSlashCommands";
import type { CurrentConfig } from "../types";
import {
  buildCachedAgentsResult,
  parseCachedMessagesJson,
  sanitizeAgentsResult,
  serializeCachedMessages,
  sortSessionsByUpdatedAt,
  toAgentCachePayload,
} from "./workspace-gateway/session-cache";
import {
  buildSessionHistoryItem,
  extractAgentIdFromSessionKey,
  extractFirstMeaningfulSessionTitle,
  extractGatewayMessageText,
  extractLastMeaningfulMessageSummary,
  normalizeGatewayMessage,
  resolveAgentSessionKey,
} from "./workspace-gateway/message-normalizers";
import {
  buildLiveStepDedupeKey,
  buildLiveStepFromAgentEvent,
  buildPostToolThinkingStep,
  extractLiveStepStableId,
  getPostToolThinkingStepId,
  isRecord,
  isTerminalLiveStepStatus,
  LIVE_STEP_DEDUPE_WINDOW_MS,
  normalizeLiveStepSignaturePart,
  toFiniteTimestamp,
  toStringValue,
  type WorkspaceGatewayAgentEventPayload,
  type WorkspaceLiveStepDedupeEntry,
  type WorkspaceLiveStepEventSource,
  updateLiveStepList,
} from "./workspace-gateway/live-steps";
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
  const currentSessionKeyRef = useRef("");
  const currentRunIdRef = useRef<string | null>(null);
  const activeRunAliasesRef = useRef<Set<string>>(new Set());
  const liveStepDedupeRef = useRef<Map<string, WorkspaceLiveStepDedupeEntry>>(new Map());
  const historyTitleFetchesRef = useRef<Set<string>>(new Set());
  const historyLoadSeqRef = useRef(0);
  const selectedAgentIdRef = useRef("");
  const bootstrapGatewayStateRef = useRef<() => Promise<void>>(async () => {});
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
  const [cachedAgentLastMessageById, setCachedAgentLastMessageById] = useState<Record<string, string>>({});
  const [fallbackGatewayToken, setFallbackGatewayToken] = useState("");
  const [gatewayTokenRefreshState, setGatewayTokenRefreshState] = useState<"idle" | "loading" | "done">("idle");

  const connected = status === "connected";
  const effectiveAgentsResult = agentsResult ?? cachedAgentsResult;
  const agentListSource = agentsResult ? "gateway" : cachedAgentsResult ? "cache" : "none";
  const agents = effectiveAgentsResult?.agents ?? [];
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );
  const currentSessionKey = selectedSessionKey || (selectedAgentId ? createAgentSessionKey(selectedAgentId) : "");
  const configuredGatewayToken = gatewayToken?.trim() || "";
  const normalizedGatewayToken = configuredGatewayToken || fallbackGatewayToken.trim();
  const sessionHistoryCacheRef = useRef<Record<string, unknown[]>>({});

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

        return updateLiveStepList(
          next,
          buildPostToolThinkingStep(options.bridgeRunId, options.bridgeTimestamp),
        );
      });
    },
    [],
  );

  const removeTransientThinkingBridge = useCallback((runId?: string | null) => {
    if (!runId) {
      return;
    }

    const bridgeStepId = getPostToolThinkingStepId(runId);
    setLiveSteps((current) => current.filter((step) => step.id !== bridgeStepId));
  }, []);

  const shouldSkipMirroredLiveStep = useCallback(
    (params: {
      step: WorkspaceLiveStep;
      payload: WorkspaceGatewayAgentEventPayload;
      source: WorkspaceLiveStepEventSource;
      runId: string;
      timestampMs: number;
    }) => {
      if (params.step.kind === "thinking") {
        return false;
      }

      const data = isRecord(params.payload.data) ? params.payload.data : {};
      const stableId = extractLiveStepStableId(data);
      if (stableId) {
        liveStepDedupeRef.current.set(`stable:${normalizeLiveStepSignaturePart(stableId)}`, {
          source: params.source,
          timestampMs: params.timestampMs,
        });
        return false;
      }

      const dedupeKey = buildLiveStepDedupeKey({
        step: params.step,
        payload: params.payload,
        runId: params.runId,
      });
      const previous = liveStepDedupeRef.current.get(dedupeKey);

      if (
        previous &&
        previous.source !== params.source &&
        Math.abs(params.timestampMs - previous.timestampMs) <= LIVE_STEP_DEDUPE_WINDOW_MS
      ) {
        return true;
      }

      liveStepDedupeRef.current.set(dedupeKey, {
        source: params.source,
        timestampMs: params.timestampMs,
      });
      return false;
    },
    [],
  );

  const finishLiveSteps = useCallback((status: WorkspaceLiveStepStatus) => {
    setLiveSteps((current) =>
      current.map((step) =>
        step.status === "running" || step.status === "pending"
          ? { ...step, status }
          : step,
      ),
    );
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
    sessionHistoryCacheRef.current = sessionHistoryCache;
  }, [sessionHistoryCache]);

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
        return;
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

  const clearActiveRunRefs = useCallback(() => {
    currentRunIdRef.current = null;
    activeRunAliasesRef.current.clear();
    liveStepDedupeRef.current.clear();
    hasObservedNonThinkingStepRef.current = false;
    hasAssistantTextDeltaRef.current = false;
  }, []);

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

  const loadPersistedSessionHistoryCache = useCallback(
    async (sessionKey: string, agentId: string) => {
      if (!sessionKey || !agentId) {
        return null;
      }

      return invoke<WorkspaceChatSessionCacheRow | null>(
        "load_workspace_chat_session_cache",
        {
          sessionKey,
          agentId,
        },
      );
    },
    [],
  );

  useEffect(() => {
    if (agents.length === 0) {
      setCachedAgentLastMessageById({});
      return;
    }

    let cancelled = false;

    async function loadAgentLastMessages() {
      const entries = await Promise.all(
        agents.map(async (agent) => {
          const rows = await invoke<WorkspaceChatSessionCacheSummary[]>("list_workspace_chat_session_cache", {
            agentId: agent.id,
          }).catch(() => []);

          const sortedRows = [...rows].sort(
            (left, right) => (right.updatedAt ?? right.cachedAt ?? 0) - (left.updatedAt ?? left.cachedAt ?? 0),
          );

          for (const row of sortedRows) {
            const cachedRow = await loadPersistedSessionHistoryCache(row.sessionKey, agent.id).catch(() => null);
            const summary = cachedRow ? extractLastMeaningfulMessageSummary(parseCachedMessagesJson(cachedRow.messagesJson)) : null;
            if (summary) {
              return [agent.id, summary] as const;
            }
          }

          return [agent.id, ""] as const;
        }),
      );

      if (cancelled) {
        return;
      }

      setCachedAgentLastMessageById((current) => {
        const next = { ...current };
        for (const agent of agents) {
          delete next[agent.id];
        }
        for (const [agentId, summary] of entries) {
          if (summary) {
            next[agentId] = summary;
          }
        }
        return next;
      });
    }

    void loadAgentLastMessages();

    return () => {
      cancelled = true;
    };
  }, [agents, loadPersistedSessionHistoryCache]);

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
    void pruneSessionHistoryCache(payload, currentSessionKeyRef.current).catch(() => undefined);
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
      },
    ) => {
      const agentId = options?.agentId || extractAgentIdFromSessionKey(sessionKey) || selectedAgentId;
      if (!sessionKey || !agentId) {
        return;
      }

      const requestId = ++historyLoadSeqRef.current;
      const memoryCachedMessages = sessionHistoryCacheRef.current[sessionKey];
      let hasAnyCache = Array.isArray(memoryCachedMessages);
      let existingCachedTitle: string | null = null;

      setHistoryLoading(false);

      if (!hasAnyCache) {
        try {
          const cachedRow = await loadPersistedSessionHistoryCache(sessionKey, agentId);
          if (historyLoadSeqRef.current !== requestId || currentSessionKeyRef.current !== sessionKey) {
            return;
          }

          if (cachedRow) {
            const cachedMessages = parseCachedMessagesJson(cachedRow.messagesJson);
            updateSessionHistoryCache(sessionKey, cachedMessages);
            hasAnyCache = true;

            const cachedTitle = cachedRow.title?.trim();
            existingCachedTitle = cachedTitle || null;
            if (cachedTitle) {
              setHistoryTitleCache((current) => (
                current[sessionKey] === cachedTitle
                  ? current
                  : { ...current, [sessionKey]: cachedTitle }
              ));
            }
          }
        } catch {
          // Ignore local cache failures and fall back to gateway refresh.
        }
      }

      if (historyLoadSeqRef.current !== requestId || currentSessionKeyRef.current !== sessionKey) {
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
        const messages = await loadSessionHistoryMessages(sessionKey, INITIAL_HISTORY_LIMIT);

        if (historyLoadSeqRef.current !== requestId || currentSessionKeyRef.current !== sessionKey) {
          return;
        }

        updateSessionHistoryCache(sessionKey, messages);

        const sessionRow = sessionsResult?.sessions.find((session) => session.key === sessionKey) ?? null;
        const nextTitle = extractFirstMeaningfulSessionTitle(messages);
        if (nextTitle) {
          setHistoryTitleCache((current) => (
            current[sessionKey] === nextTitle
              ? current
              : { ...current, [sessionKey]: nextTitle }
          ));
        }

        await saveSessionHistoryCache(
          sessionKey,
          agentId,
          messages,
          sessionRow?.updatedAt ?? null,
          nextTitle ?? existingCachedTitle,
        ).catch(() => undefined);
        setError(null);
      } catch (loadError) {
        if (!hasAnyCache && historyLoadSeqRef.current === requestId && currentSessionKeyRef.current === sessionKey) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (historyLoadSeqRef.current === requestId && currentSessionKeyRef.current === sessionKey) {
          setHistoryLoading(false);
        }
      }
    },
    [
      connected,
      loadPersistedSessionHistoryCache,
      loadSessionHistoryMessages,
      saveSessionHistoryCache,
      selectedAgentId,
      sessionsResult,
      updateSessionHistoryCache,
    ],
  );

  const bootstrapGatewayState = useCallback(async () => {
    const client = clientRef.current;
    if (!client?.connected) {
      return;
    }

    try {
      await client.request("sessions.subscribe", {}).catch(() => undefined);

      const [agentsPayload, sessionsPayload] = await Promise.all([
        client.request("agents.list", {}),
        client.request("sessions.list", {}),
      ]);

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
      setError(null);

      void invoke("replace_workspace_agent_cache", {
        defaultId: nextAgentsPayload.defaultId,
        scope: nextAgentsPayload.scope,
        agents: toAgentCachePayload(nextAgentsPayload),
      }).catch(() => undefined);

      const currentSelectedAgentId = selectedAgentIdRef.current;
      const nextAgentId =
        nextAgentsPayload.agents.some((agent) => agent.id === currentSelectedAgentId)
          ? currentSelectedAgentId
          : nextAgentsPayload.defaultId || nextAgentsPayload.agents[0]?.id || "";
      const nextSessionKey = nextAgentId
        ? resolveAgentSessionKey(sessionsPayload, nextAgentId, currentSessionKeyRef.current)
        : "";

      setSelectedAgentId(nextAgentId);
      setSelectedSessionKey(nextSessionKey);
      void pruneSessionHistoryCache(sessionsPayload, nextSessionKey).catch(() => undefined);
    } catch (bootstrapError) {
      setError(bootstrapError instanceof Error ? bootstrapError.message : String(bootstrapError));
    }
  }, [pruneSessionHistoryCache]);

  const handleGatewayEvent = useCallback(
    (event: { event: string; payload?: unknown }) => {
      if ((event.event === "agent" || event.event === "session.tool") && isRecord(event.payload)) {
        const payload = event.payload as WorkspaceGatewayAgentEventPayload;
        const eventSource = event.event as WorkspaceLiveStepEventSource;
        const payloadSessionKey = toStringValue(payload.sessionKey);
        const payloadRunId = toStringValue(payload.runId);
        const currentRunId = currentRunIdRef.current;
        const activeAliases = activeRunAliasesRef.current;

        if (!currentRunId) {
          return;
        }

        if (payloadSessionKey && payloadSessionKey !== currentSessionKeyRef.current) {
          return;
        }

        if (!payloadSessionKey && payloadRunId && payloadRunId !== currentRunId && !activeAliases.has(payloadRunId)) {
          return;
        }

        if (payloadRunId) {
          activeAliases.add(payloadRunId);
        }

        const step = buildLiveStepFromAgentEvent(payload, payloadRunId || currentRunId || "run");
        if (step) {
          const timestampMs = toFiniteTimestamp(payload.ts) ?? Date.now();
          const dedupeRunId = currentRunId || payloadRunId || "run";
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
      const isCurrentSession = payload.sessionKey === currentSessionKeyRef.current;
      const isCurrentRun = isKnownActiveRunId(payload.runId);

      if (!isCurrentSession) {
        if (payload.state === "final") {
          void loadSessions();
        }
        return;
      }

      if (payload.state === "delta" && isCurrentRun) {
        const nextText = extractGatewayMessageText(payload.message).trim();
        if (nextText && !hasAssistantTextDeltaRef.current) {
          hasAssistantTextDeltaRef.current = true;
          removeTransientThinkingBridge(currentRunIdRef.current);
        }
        setStreamText((current) => {
          if (!nextText) {
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
        void loadHistory(currentSessionKeyRef.current, { agentId: extractAgentIdFromSessionKey(currentSessionKeyRef.current) || selectedAgentId });
      }
    },
    [applyLiveStep, clearActiveRunRefs, finishLiveSteps, isKnownActiveRunId, loadHistory, loadSessions, removeTransientThinkingBridge, selectedAgentId, shouldSkipMirroredLiveStep],
  );

  useEffect(() => {
    bootstrapGatewayStateRef.current = bootstrapGatewayState;
  }, [bootstrapGatewayState]);

  useEffect(() => {
    handleGatewayEventRef.current = handleGatewayEvent;
  }, [handleGatewayEvent]);

  useEffect(() => {
    const resetGatewayState = (nextStatus: WorkspaceGatewayStatus, nextError: string | null) => {
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

    if (!running || !servicePort) {
      resetGatewayState("idle", null);
      return;
    }

    if (!normalizedGatewayToken) {
      if (!configuredGatewayToken && gatewayTokenRefreshState !== "done") {
        setStatus("connecting");
        setError(null);
        return;
      }
      resetGatewayState("error", MISSING_GATEWAY_TOKEN_ERROR);
      return;
    }

    const client = new WorkspaceGatewayClient({
      url: buildGatewayUrl(servicePort),
      token: normalizedGatewayToken,
      onConnecting: () => {
        setStatus("connecting");
      },
      onConnected: () => {
        setStatus("connected");
        void bootstrapGatewayStateRef.current();
      },
      onEvent: (event) => {
        handleGatewayEventRef.current(event);
      },
      onDisconnected: (message) => {
        setStatus("error");
        setError(message ?? "首页聊天连接已断开");
      },
    });

    clientRef.current = client;
    client.start();

    return () => {
      if (clientRef.current === client) {
        clientRef.current = null;
      }
      client.stop();
    };
  }, [
    clearActiveRunRefs,
    configuredGatewayToken,
    gatewayTokenRefreshState,
    normalizedGatewayToken,
    running,
    servicePort,
  ]);

  useEffect(() => {
    if (!connected || !currentSessionKey) {
      return;
    }

    setPendingUserMessage(null);
    setStreamText(null);
    setActiveRunId(null);
    clearActiveRunRefs();
    setLiveSteps([]);
    void loadHistory(currentSessionKey, { agentId: selectedAgentId });
  }, [clearActiveRunRefs, connected, currentSessionKey, loadHistory, selectedAgentId]);

  useEffect(() => {
    if (!selectedAgentId) {
      if (selectedSessionKey) {
        setSelectedSessionKey("");
      }
      return;
    }

    const nextSessionKey = resolveAgentSessionKey(sessionsResult, selectedAgentId, selectedSessionKey);
    if (nextSessionKey && nextSessionKey !== selectedSessionKey) {
      setSelectedSessionKey(nextSessionKey);
    }
  }, [selectedAgentId, selectedSessionKey, sessionsResult]);

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

  const loadHistoryTitles = useCallback(() => {
    if (!selectedAgentId) {
      return;
    }

    void (async () => {
      const cachedRows = await invoke<WorkspaceChatSessionCacheSummary[]>("list_workspace_chat_session_cache", {
        agentId: selectedAgentId,
      }).catch(() => []);
      const cachedTitleKeys = new Set<string>();

      setHistoryTitleCache((current) => {
        let changed = false;
        const next = { ...current };

        cachedRows.forEach((row) => {
          const cachedTitle = row.title?.trim();
          if (!cachedTitle) {
            return;
          }

          cachedTitleKeys.add(row.sessionKey);
          if (next[row.sessionKey] === cachedTitle) {
            return;
          }

          next[row.sessionKey] = cachedTitle;
          changed = true;
        });

        return changed ? next : current;
      });

      if (!connected) {
        return;
      }

      const sessions = sortSessionsByUpdatedAt(filterAgentSessions(sessionsResult, selectedAgentId));

      sessions.forEach((session) => {
        if (cachedTitleKeys.has(session.key) || historyTitleFetchesRef.current.has(session.key)) {
          return;
        }

        historyTitleFetchesRef.current.add(session.key);

        void loadSessionHistoryMessages(session.key, 40)
          .then((messages) => {
            const nextTitle = extractFirstMeaningfulSessionTitle(messages);
            if (nextTitle) {
              setHistoryTitleCache((current) => (
                current[session.key] === nextTitle
                  ? current
                  : { ...current, [session.key]: nextTitle }
              ));
            }

            updateSessionHistoryCache(session.key, messages);
            return saveSessionHistoryCache(
              session.key,
              selectedAgentId,
              messages,
              session.updatedAt ?? null,
              nextTitle ?? cachedRows.find((row) => row.sessionKey === session.key)?.title ?? null,
            ).catch(() => undefined);
          })
          .catch(() => undefined)
          .finally(() => {
            historyTitleFetchesRef.current.delete(session.key);
          });
      });
    })().catch(() => undefined);
  }, [
    connected,
    loadSessionHistoryMessages,
    saveSessionHistoryCache,
    selectedAgentId,
    sessionsResult,
    updateSessionHistoryCache,
  ]);

  const selectAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
    setSelectedSessionKey(resolveAgentSessionKey(sessionsResult, agentId));
  }, [sessionsResult]);

  const selectSession = useCallback((sessionKey: string) => {
    const agentId = extractAgentIdFromSessionKey(sessionKey);
    if (!agentId) {
      return;
    }

    setSelectedAgentId(agentId);
    setSelectedSessionKey(sessionKey);
  }, []);

  const sendMessage = useCallback(
    async (
      value: string,
      options?: {
        activeCommand?: WorkspaceActiveSlashCommand;
      },
    ) => {
      const client = clientRef.current;
      const message = value.trim();
      const transportMessage = options?.activeCommand
        ? buildWorkspaceSlashCommandTransportMessage({
            command: options.activeCommand,
            userMessage: message,
          })
        : message;

      if (!client?.connected || !currentSessionKey || !message) {
        return false;
      }

      const runId = crypto.randomUUID();
      currentRunIdRef.current = runId;
      activeRunAliasesRef.current = new Set([runId]);
      liveStepDedupeRef.current.clear();
      hasObservedNonThinkingStepRef.current = false;
      hasAssistantTextDeltaRef.current = false;

      setPendingUserMessage({
        id: `pending-${runId}`,
        role: "user",
        author: "你",
        text: message,
        time: formatClockTime(Date.now()),
      });
      setStreamText("");
      setActiveRunId(runId);
      setLiveSteps([
        {
          id: `${runId}:thinking`,
          kind: "thinking",
          status: "running",
          title: "思考中",
          time: formatClockTime(Date.now()),
        },
      ]);
      setSending(true);
      setError(null);

      try {
        await client.request("chat.send", {
          sessionKey: currentSessionKey,
          message: transportMessage,
          deliver: false,
          idempotencyKey: runId,
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
    },
    [clearActiveRunRefs, currentSessionKey],
  );

  const abortMessage = useCallback(async () => {
    const client = clientRef.current;
    if (!client?.connected || !currentSessionKey) {
      return false;
    }

    try {
      await client.request("chat.abort", currentRunIdRef.current
        ? { sessionKey: currentSessionKey, runId: currentRunIdRef.current }
        : { sessionKey: currentSessionKey });
      removeTransientThinkingBridge(currentRunIdRef.current);
      finishLiveSteps("aborted");
      return true;
    } catch (abortError) {
      setError(abortError instanceof Error ? abortError.message : String(abortError));
      return false;
    }
  }, [currentSessionKey, finishLiveSteps, removeTransientThinkingBridge]);

  const resetSession = useCallback(async () => {
    const client = clientRef.current;
    if (!client?.connected || !currentSessionKey) {
      return false;
    }

    setResettingSession(true);

    try {
      if (currentRunIdRef.current) {
        await client.request("chat.abort", {
          sessionKey: currentSessionKey,
          runId: currentRunIdRef.current,
        }).catch(() => undefined);
      }

      await client.request("sessions.reset", { key: currentSessionKey });
      setActiveRunId(null);
      setPendingUserMessage(null);
      setStreamText(null);
      clearActiveRunRefs();
      setLiveSteps([]);
      updateSessionHistoryCache(currentSessionKey, []);
      await saveSessionHistoryCache(
        currentSessionKey,
        extractAgentIdFromSessionKey(currentSessionKey) || selectedAgentId,
        [],
        null,
        null,
      ).catch(() => undefined);
      await Promise.all([loadSessions(), loadHistory(currentSessionKey, { agentId: selectedAgentId })]);
      return true;
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : String(resetError));
      return false;
    } finally {
      setResettingSession(false);
    }
  }, [clearActiveRunRefs, currentSessionKey, loadHistory, loadSessions, saveSessionHistoryCache, selectedAgentId, updateSessionHistoryCache]);

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

    return filterAgentSessions(sessionsResult, selectedAgentId)
      .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
      .map((session) => buildSessionHistoryItem(session, {
        cachedTitle: historyTitleCache[session.key],
        currentSessionKey,
      }));
  }, [currentSessionKey, historyTitleCache, selectedAgentId, sessionsResult]);

  const normalizedHistoryMessages = useMemo(
    () =>
      (sessionHistoryCache[currentSessionKey] ?? [])
        .map((message) => normalizeGatewayMessage(message, resolveAssistantAuthor))
        .filter((message): message is WorkspaceMessage => Boolean(message)),
    [currentSessionKey, resolveAssistantAuthor, sessionHistoryCache],
  );

  const streamMessage = useMemo(() => {
    if (!activeRunId) {
      return null;
    }

    return {
      id: `stream-${activeRunId}`,
      role: "assistant" as const,
      author: resolveAssistantAuthor(currentSessionKey),
      text: streamText?.trim() || "",
      time: "",
      status: "streaming" as const,
    };
  }, [activeRunId, currentSessionKey, resolveAssistantAuthor, streamText]);

  const messages = useMemo(() => {
    const merged = [...normalizedHistoryMessages];
    if (pendingUserMessage) {
      merged.push(pendingUserMessage);
    }
    if (streamMessage) {
      merged.push(streamMessage);
    }
    return merged;
  }, [normalizedHistoryMessages, pendingUserMessage, streamMessage]);

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
    messages,
    liveSteps,
    historyLoading,
    sending,
    resettingSession,
    isGenerating: Boolean(activeRunId),
    selectAgent,
    selectSession,
    request,
    sendMessage,
    abortMessage,
    resetSession,
    loadHistoryTitles,
    reload: bootstrapGatewayState,
  };
}
