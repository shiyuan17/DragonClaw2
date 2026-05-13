import { vi } from "vitest";

const hoistedGatewayMocks = vi.hoisted(() => {
  const createNewSession = vi.fn(async () => "agent:main:main");
  const runTaskInNewChat = vi.fn(async () => true);

  const state = {
    agentsPayload: {
      defaultId: "main",
      agents: [{ id: "main", name: "Main Agent", identity: { name: "Main Agent" } }],
    },
    sessionsPayload: {
      ts: 1,
      path: "/sessions.json",
      count: 2,
      defaults: { model: null, contextTokens: null },
      sessions: [
        { key: "agent:main:main", kind: "direct", updatedAt: 10, label: "", displayName: "", model: "", modelProvider: "" },
        { key: "agent:main:secondary", kind: "direct", updatedAt: 20, label: "", displayName: "", model: "", modelProvider: "" },
      ],
    },
    historyBySession: {
      "agent:main:secondary": [
        { id: "history-1", role: "assistant", text: "recent history message", timestamp: 1, sessionKey: "agent:main:secondary" },
      ],
      "agent:main:main": [],
    } as Record<string, unknown[]>,
    cacheRowsBySession: {} as Record<string, {
      sessionKey: string;
      agentId: string;
      updatedAt: number | null;
      cachedAt: number | null;
      title: string | null;
      messagesJson: string;
    }>,
    renderPagesBySession: {} as Record<string, Array<{ id?: string; role?: string; textPreview: string; timestamp?: number | null }>>,
    invokes: [] as Array<{ command: string; params: unknown }>,
    cachePageParseCount: 0,
    renderPageParseCount: 0,
    compactParseCount: 0,
    slowHistorySessions: new Set<string>(),
    resolveHistoryBySession: {} as Record<string, (() => void) | undefined>,
    requests: [] as Array<{ method: string; params: unknown }>,
    sendRejectMessage: null as string | null,
    lastChatSend: null as null | { sessionKey: string; idempotencyKey: string; message: string },
    lastClient: null as FakeGatewayClient | null,
  };

  class FakeGatewayClient {
    connected = false;

    constructor(private options: {
      onConnecting?: () => void;
      onConnected?: (hello: { type: "hello-ok"; protocol: number }) => void;
      onEvent?: (frame: { event: string; payload?: unknown }) => void;
      onDisconnected?: (message?: string) => void;
    }) {
      state.lastClient = this;
    }

    start() {
      this.connected = true;
      this.options.onConnecting?.();
      this.options.onConnected?.({ type: "hello-ok", protocol: 3 });
    }

    stop() {
      this.connected = false;
    }

    async request(method: string, params?: unknown) {
      state.requests.push({ method, params });
      if (method === "sessions.subscribe") return {};
      if (method === "agents.list") return state.agentsPayload;
      if (method === "sessions.list") return state.sessionsPayload;
      if (method === "chat.history") {
        const sessionKey = (params as { sessionKey?: string })?.sessionKey ?? "";
        if (state.slowHistorySessions.has(sessionKey)) {
          await new Promise<void>((resolve) => {
            state.resolveHistoryBySession[sessionKey] = resolve;
          });
        }
        return { messages: state.historyBySession[sessionKey] ?? [] };
      }
      if (method === "chat.send") {
        if (state.sendRejectMessage) throw new Error(state.sendRejectMessage);
        state.lastChatSend = params as { sessionKey: string; idempotencyKey: string; message: string };
        return {};
      }
      return {};
    }

    emit(event: string, payload?: unknown) {
      this.options.onEvent?.({ event, payload });
    }

    disconnect(message?: string) {
      this.connected = false;
      this.options.onDisconnected?.(message);
    }
  }

  return { state, FakeGatewayClient, createNewSession, runTaskInNewChat };
});

export const gatewayMocks = hoistedGatewayMocks;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, params?: unknown) => {
    gatewayMocks.state.invokes.push({ command, params });
    if (command === "list_workspace_agent_cache") return [];
    if (command === "list_workspace_chat_session_cache") {
      const agentId = (params as { agentId?: string })?.agentId ?? "";
      return Object.values(gatewayMocks.state.cacheRowsBySession)
        .filter((row) => row.agentId === agentId)
        .map(({ messagesJson: _messagesJson, ...row }) => row);
    }
    if (command === "list_workspace_chat_session_cache_compact") {
      const agentId = (params as { agentId?: string })?.agentId ?? "";
      const limit = (params as { limit?: number | null })?.limit ?? 20;
      return Object.values(gatewayMocks.state.cacheRowsBySession)
        .filter((row) => row.agentId === agentId)
        .slice(0, limit)
        .map((row) => {
          gatewayMocks.state.compactParseCount += 1;
          const messages = JSON.parse(row.messagesJson || "[]") as Array<{ text?: string }>;
          return {
            sessionKey: row.sessionKey,
            agentId: row.agentId,
            updatedAt: row.updatedAt,
            cachedAt: row.cachedAt,
            title: row.title,
            lastMessageSummary: messages.length ? messages[messages.length - 1]?.text ?? null : null,
            messageCount: messages.length,
            hasMessageRows: messages.length > 0,
          };
        });
    }
    if (command === "warm_workspace_chat_session_cache_pages") {
      return { migratedSessions: 0, skippedSessions: 0, failedSessions: [] };
    }
    if (command === "load_workspace_chat_session_cache") {
      const sessionKey = (params as { sessionKey?: string })?.sessionKey ?? "";
      return gatewayMocks.state.cacheRowsBySession[sessionKey] ?? null;
    }
    if (command === "load_workspace_chat_session_cache_page") {
      const { sessionKey = "", agentId = "", beforeIndex = null, limit = 30 } = params as {
        sessionKey?: string;
        agentId?: string;
        beforeIndex?: number | null;
        limit?: number;
      };
      const row = gatewayMocks.state.cacheRowsBySession[sessionKey];
      if (!row || row.agentId !== agentId) return null;
      gatewayMocks.state.cachePageParseCount += 1;
      const messages = JSON.parse(row.messagesJson || "[]") as unknown[];
      const end = beforeIndex === null || beforeIndex === undefined ? messages.length : Math.max(0, beforeIndex);
      const start = Math.max(0, end - limit);
      return {
        sessionKey,
        agentId,
        messages: messages.slice(start, end),
        total: messages.length,
        startIndex: messages.length > 0 && start < end ? start : null,
        endIndex: messages.length > 0 && start < end ? end - 1 : null,
        hasMoreBefore: start > 0,
        updatedAt: row.updatedAt,
        cachedAt: row.cachedAt,
        title: row.title,
      };
    }
    if (command === "load_workspace_chat_session_render_page") {
      const { sessionKey = "", agentId = "", beforeIndex = null, limit = 20 } = params as { sessionKey?: string; agentId?: string; beforeIndex?: number | null; limit?: number };
      const row = gatewayMocks.state.cacheRowsBySession[sessionKey];
      if (!row || row.agentId !== agentId) return null;
      const renderRows = gatewayMocks.state.renderPagesBySession[sessionKey];
      const messages = renderRows
        ? renderRows.map((message) => ({ id: message.id, role: message.role, text: message.textPreview, timestamp: message.timestamp ?? undefined }))
        : (() => {
          gatewayMocks.state.renderPageParseCount += 1;
          return JSON.parse(row.messagesJson || "[]") as Array<{ id?: string; role?: string; text?: string; timestamp?: number }>;
        })();
      const end = beforeIndex === null || beforeIndex === undefined ? messages.length : Math.max(0, beforeIndex);
      const start = Math.max(0, end - limit);
      return {
        sessionKey,
        agentId,
        messages: messages.slice(start, end).map((message, offset) => ({
          index: start + offset,
          id: message.id,
          role: message.role ?? "assistant",
          textPreview: message.text ?? "",
          timestamp: message.timestamp ?? null,
          textHash: message.text ? String(message.text.length) : null,
          renderKind: "plain",
          fullTextLength: message.text?.length ?? 0,
          truncated: false,
        })),
        total: messages.length,
        startIndex: messages.length > 0 && start < end ? start : null,
        endIndex: messages.length > 0 && start < end ? end - 1 : null,
        hasMoreBefore: start > 0,
        updatedAt: row.updatedAt,
        cachedAt: row.cachedAt,
        title: row.title,
      };
    }
    return null;
  }),
}));

vi.mock("../workspace-gateway/client", () => ({
  WorkspaceGatewayClient: gatewayMocks.FakeGatewayClient,
  buildGatewayUrl: (port: number) => `ws://127.0.0.1:${port}`,
  createAgentSessionKey: (agentId: string) => `agent:${agentId}:main`,
  filterAgentSessions: (result: { sessions?: Array<{ key: string }> } | null, agentId: string) =>
    (result?.sessions ?? []).filter((session) => session.key.startsWith(`agent:${agentId}:`)),
  findMainAgentSession: (result: { sessions?: Array<{ key: string }> } | null, agentId: string) =>
    (result?.sessions ?? []).find((session) => session.key === `agent:${agentId}:main`) ?? null,
  formatAgentAvatar: () => "A",
  isAgentsListResult: (value: unknown) => Boolean((value as { agents?: unknown[] })?.agents),
  isSessionsListResult: (value: unknown) => Boolean((value as { sessions?: unknown[] })?.sessions),
  isChatEventPayload: (value: unknown) =>
    typeof (value as { runId?: unknown })?.runId === "string"
    && typeof (value as { state?: unknown })?.state === "string",
}));

vi.mock("../workspace-gateway/history-titles", () => {
  const loadWorkspaceHistoryTitles = vi.fn(async () => undefined);
  return {
    loadWorkspaceHistoryTitles,
    loadWorkspaceHistoryTitleBatches: vi.fn((params: { agentIds: string[] }) => {
      params.agentIds.forEach(() => {
        void loadWorkspaceHistoryTitles();
      });
    }),
  };
});

vi.mock("../workspace-gateway/useWorkspaceLocalSessionMessages", () => ({
  useWorkspaceLocalSessionMessages: () => ({
    localSessionMessagesByKey: {},
    appendLocalSessionSystemMessage: () => undefined,
    clearLocalSessionMessages: () => undefined,
  }),
}));

vi.mock("../workspace-gateway/useWorkspaceCachedAgentLastMessages", () => ({
  useWorkspaceCachedAgentLastMessages: () => ({}),
}));

vi.mock("../workspace-gateway/useWorkspaceManualSessionExecution", () => ({
  useWorkspaceManualSessionExecution: () => ({
    createNewSession: gatewayMocks.createNewSession,
    runTaskInNewChat: gatewayMocks.runTaskInNewChat,
  }),
}));
