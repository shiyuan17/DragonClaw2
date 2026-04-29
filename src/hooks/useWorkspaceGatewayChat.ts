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
} from "../components/workspace-clone/workspaceCloneGateway";
import type {
  WorkspaceGatewayAgentsListResult,
  WorkspaceGatewaySessionRow,
  WorkspaceGatewaySessionsListResult,
  WorkspaceGatewayStatus,
  WorkspaceHistoryItem,
  WorkspaceMessage,
} from "../components/workspace-clone/workspaceCloneTypes";

interface UseWorkspaceGatewayChatOptions {
  running: boolean;
  servicePort: number;
  gatewayToken?: string | null;
}

interface ChatHistoryPayload {
  messages?: unknown[];
}

function formatClockTime(timestamp?: number | null) {
  if (!timestamp) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatRelativeSessionTime(timestamp?: number | null) {
  if (!timestamp) {
    return "暂无记录";
  }

  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const dayLabel = sameDay
    ? "今天"
    : new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
      }).format(date);

  return `${dayLabel} ${formatClockTime(timestamp)}`;
}

function extractAgentIdFromSessionKey(sessionKey: string) {
  const match = /^agent:([^:]+):/.exec(sessionKey);
  return match?.[1] ?? null;
}

function extractTextFromContentBlock(block: unknown): string {
  if (typeof block === "string") {
    return block;
  }

  if (!block || typeof block !== "object") {
    return "";
  }

  const candidate = block as {
    type?: unknown;
    text?: unknown;
    content?: unknown;
    input?: unknown;
    output?: unknown;
  };

  if (typeof candidate.text === "string") {
    return candidate.text;
  }

  if (typeof candidate.content === "string") {
    return candidate.content;
  }

  if (typeof candidate.input === "string") {
    return candidate.input;
  }

  if (typeof candidate.output === "string") {
    return candidate.output;
  }

  return "";
}

function extractGatewayMessageText(message: unknown): string {
  if (typeof message === "string") {
    return message;
  }

  if (!message || typeof message !== "object") {
    return "";
  }

  const candidate = message as {
    text?: unknown;
    content?: unknown;
    message?: unknown;
  };

  if (typeof candidate.text === "string") {
    return candidate.text;
  }

  if (Array.isArray(candidate.content)) {
    return candidate.content.map(extractTextFromContentBlock).filter(Boolean).join("\n\n");
  }

  if (candidate.message) {
    return extractGatewayMessageText(candidate.message);
  }

  return "";
}

function normalizeGatewayMessage(
  raw: unknown,
  resolveAssistantAuthor: (sessionKey?: string | null) => string,
): WorkspaceMessage | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const message = raw as {
    id?: unknown;
    role?: unknown;
    content?: unknown;
    timestamp?: unknown;
    sessionKey?: unknown;
  };

  const role =
    typeof message.role === "string" &&
    ["assistant", "user", "system", "tool"].includes(message.role)
      ? (message.role as WorkspaceMessage["role"])
      : "assistant";
  const text = extractGatewayMessageText(message).trim();

  if (!text) {
    return null;
  }

  const sessionKey = typeof message.sessionKey === "string" ? message.sessionKey : null;
  const author =
    role === "assistant"
      ? resolveAssistantAuthor(sessionKey)
      : role === "user"
        ? "你"
        : role === "tool"
          ? "工具"
          : "系统";

  const timestamp = typeof message.timestamp === "number" ? message.timestamp : null;

  return {
    id: typeof message.id === "string" ? message.id : crypto.randomUUID(),
    role,
    author,
    text,
    time: formatClockTime(timestamp),
  };
}

function buildSessionHistoryItem(session: WorkspaceGatewaySessionRow): WorkspaceHistoryItem {
  const title =
    session.displayName?.trim() ||
    session.label?.trim() ||
    (session.key.endsWith(":main") ? "主会话" : session.key);
  const modelLabel = [session.modelProvider, session.model].filter(Boolean).join(" / ");

  return {
    id: session.key,
    title,
    subtitle: modelLabel || session.key,
    time: formatRelativeSessionTime(session.updatedAt),
  };
}

const MISSING_GATEWAY_TOKEN_ERROR = "本地网关 token 缺失或未同步，请检查 ~/.openclaw/openclaw.json，或重新保存 Provider 配置后再试。";

export function useWorkspaceGatewayChat({ running, servicePort, gatewayToken }: UseWorkspaceGatewayChatOptions) {
  const clientRef = useRef<WorkspaceGatewayClient | null>(null);
  const currentSessionKeyRef = useRef("");
  const currentRunIdRef = useRef<string | null>(null);

  const [status, setStatus] = useState<WorkspaceGatewayStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [agentsResult, setAgentsResult] = useState<WorkspaceGatewayAgentsListResult | null>(null);
  const [sessionsResult, setSessionsResult] = useState<WorkspaceGatewaySessionsListResult | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [historyRawMessages, setHistoryRawMessages] = useState<unknown[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [resettingSession, setResettingSession] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<WorkspaceMessage | null>(null);
  const [streamText, setStreamText] = useState<string | null>(null);

  const connected = status === "connected";
  const agents = agentsResult?.agents ?? [];
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );
  const currentSessionKey = selectedAgentId ? createAgentSessionKey(selectedAgentId) : "";
  const normalizedGatewayToken = gatewayToken?.trim() || "";

  useEffect(() => {
    currentSessionKeyRef.current = currentSessionKey;
  }, [currentSessionKey]);

  useEffect(() => {
    currentRunIdRef.current = activeRunId;
  }, [activeRunId]);

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
    return payload;
  }, []);

  const loadHistory = useCallback(
    async (sessionKey: string) => {
      const client = clientRef.current;
      if (!client?.connected || !sessionKey) {
        return;
      }

      setHistoryLoading(true);

      try {
        const payload = await client.request<ChatHistoryPayload>("chat.history", {
          sessionKey,
          limit: 200,
        });

        if (currentSessionKeyRef.current !== sessionKey) {
          return;
        }

        setHistoryRawMessages(Array.isArray(payload.messages) ? payload.messages : []);
        setError(null);
      } catch (loadError) {
        if (currentSessionKeyRef.current === sessionKey) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (currentSessionKeyRef.current === sessionKey) {
          setHistoryLoading(false);
        }
      }
    },
    [],
  );

  const bootstrapGatewayState = useCallback(async () => {
    const client = clientRef.current;
    if (!client?.connected) {
      return;
    }

    try {
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

      setAgentsResult(agentsPayload);
      setSessionsResult(sessionsPayload);
      setError(null);

      const nextAgentId =
        agentsPayload.agents.some((agent) => agent.id === selectedAgentId)
          ? selectedAgentId
          : agentsPayload.defaultId || agentsPayload.agents[0]?.id || "";

      setSelectedAgentId(nextAgentId);

      if (nextAgentId) {
        void loadHistory(createAgentSessionKey(nextAgentId));
      }
    } catch (bootstrapError) {
      setError(bootstrapError instanceof Error ? bootstrapError.message : String(bootstrapError));
    }
  }, [loadHistory, selectedAgentId]);

  const handleGatewayEvent = useCallback(
    (event: { event: string; payload?: unknown }) => {
      if (event.event !== "chat" || !isChatEventPayload(event.payload)) {
        return;
      }

      const payload = event.payload;
      const isCurrentSession = payload.sessionKey === currentSessionKeyRef.current;
      const isCurrentRun = !payload.runId || payload.runId === currentRunIdRef.current;

      if (!isCurrentSession) {
        if (payload.state === "final") {
          void loadSessions();
        }
        return;
      }

      if (payload.state === "delta" && isCurrentRun) {
        const nextText = extractGatewayMessageText(payload.message).trim();
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
        setError(payload.errorMessage ?? "聊天生成失败");
      }

      if (payload.state === "final" || (payload.state !== "delta" && isCurrentRun)) {
        if (isCurrentRun) {
          setActiveRunId(null);
          setPendingUserMessage(null);
          setStreamText(null);
        }
        void loadSessions();
        void loadHistory(currentSessionKeyRef.current);
      }
    },
    [loadHistory, loadSessions],
  );

  useEffect(() => {
    const resetGatewayState = (nextStatus: WorkspaceGatewayStatus, nextError: string | null) => {
      clientRef.current?.stop();
      clientRef.current = null;
      setStatus(nextStatus);
      setError(nextError);
      setAgentsResult(null);
      setSessionsResult(null);
      setSelectedAgentId("");
      setHistoryRawMessages([]);
      setHistoryLoading(false);
      setSending(false);
      setResettingSession(false);
      setActiveRunId(null);
      setPendingUserMessage(null);
      setStreamText(null);
    };

    if (!running || !servicePort) {
      resetGatewayState("idle", null);
      return;
    }

    if (!normalizedGatewayToken) {
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
        void bootstrapGatewayState();
      },
      onEvent: handleGatewayEvent,
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
  }, [bootstrapGatewayState, handleGatewayEvent, normalizedGatewayToken, running, servicePort]);

  useEffect(() => {
    if (!connected || !currentSessionKey) {
      return;
    }

    setHistoryRawMessages([]);
    setPendingUserMessage(null);
    setStreamText(null);
    setActiveRunId(null);
    void loadHistory(currentSessionKey);
    void loadSessions();
  }, [connected, currentSessionKey, loadHistory, loadSessions]);

  const sendMessage = useCallback(
    async (value: string) => {
      const client = clientRef.current;
      const message = value.trim();

      if (!client?.connected || !currentSessionKey || !message) {
        return false;
      }

      const runId = crypto.randomUUID();

      setPendingUserMessage({
        id: `pending-${runId}`,
        role: "user",
        author: "你",
        text: message,
        time: formatClockTime(Date.now()),
        status: "pending",
      });
      setStreamText("");
      setActiveRunId(runId);
      setSending(true);
      setError(null);

      try {
        await client.request("chat.send", {
          sessionKey: currentSessionKey,
          message,
          deliver: false,
          idempotencyKey: runId,
        });
        return true;
      } catch (sendError) {
        setPendingUserMessage(null);
        setStreamText(null);
        setActiveRunId(null);
        setError(sendError instanceof Error ? sendError.message : String(sendError));
        return false;
      } finally {
        setSending(false);
      }
    },
    [currentSessionKey],
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
      return true;
    } catch (abortError) {
      setError(abortError instanceof Error ? abortError.message : String(abortError));
      return false;
    }
  }, [currentSessionKey]);

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
      await Promise.all([loadSessions(), loadHistory(currentSessionKey)]);
      return true;
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : String(resetError));
      return false;
    } finally {
      setResettingSession(false);
    }
  }, [currentSessionKey, loadHistory, loadSessions]);

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
      .map(buildSessionHistoryItem);
  }, [selectedAgentId, sessionsResult]);

  const normalizedHistoryMessages = useMemo(
    () =>
      historyRawMessages
        .map((message) => normalizeGatewayMessage(message, resolveAssistantAuthor))
        .filter((message): message is WorkspaceMessage => Boolean(message)),
    [historyRawMessages, resolveAssistantAuthor],
  );

  const streamMessage = useMemo(() => {
    if (!activeRunId) {
      return null;
    }

    return {
      id: `stream-${activeRunId}`,
      role: "assistant" as const,
      author: resolveAssistantAuthor(currentSessionKey),
      text: streamText?.trim() || "正在思考...",
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

  const currentMainSession = useMemo(
    () => (selectedAgentId ? findMainAgentSession(sessionsResult, selectedAgentId) : null),
    [selectedAgentId, sessionsResult],
  );

  return {
    status,
    connected,
    error,
    agents,
    agentsResult,
    sessionsResult,
    selectedAgentId,
    selectedAgent,
    currentSessionKey,
    currentMainSession,
    historyItems,
    messages,
    historyLoading,
    sending,
    resettingSession,
    isGenerating: Boolean(activeRunId),
    selectAgent: setSelectedAgentId,
    request,
    sendMessage,
    abortMessage,
    resetSession,
    reload: bootstrapGatewayState,
  };
}
