import { resolveWorkspaceAgentDisplayName } from "../../data/agencyRoster";
import type {
  WorkspaceGatewayAgentRow,
  WorkspaceGatewayAgentsListResult,
  WorkspaceGatewaySkillStatusResult,
  WorkspaceGatewaySessionRow,
  WorkspaceGatewaySessionsListResult,
} from "../../components/workspace-clone/workspaceCloneTypes";

const GATEWAY_PROTOCOL_VERSION = 3;
const CONNECT_DELAY_MS = 250;
const CONNECT_REQUEST_TIMEOUT_MS = 5_000;
const RECONNECT_BASE_MS = 900;
const RECONNECT_MAX_MS = 10_000;

type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
};

type GatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code?: string; message?: string };
};

type GatewayHelloOk = {
  type: "hello-ok";
  protocol: number;
  features?: { methods?: string[]; events?: string[] };
};

type GatewayPendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

export type WorkspaceGatewayChatEventPayload = {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};

interface WorkspaceGatewayClientOptions {
  url: string;
  token: string;
  onConnecting?: () => void;
  onConnected?: (hello: GatewayHelloOk) => void;
  onEvent?: (frame: GatewayEventFrame) => void;
  onDisconnected?: (errorMessage?: string) => void;
}

function buildConnectParams(token: string, _nonce?: string | null) {
  return {
    minProtocol: GATEWAY_PROTOCOL_VERSION,
    maxProtocol: GATEWAY_PROTOCOL_VERSION,
    client: {
      id: "openclaw-control-ui",
      version: "dragonclaw-homepage",
      platform: navigator.platform || "web",
      mode: "webchat",
      instanceId: "dragonclaw-homepage",
    },
    role: "operator",
    scopes: ["operator.admin", "operator.approvals", "operator.pairing"],
    caps: ["tool-events"],
    auth: {
      token,
    },
    locale: navigator.language,
    userAgent: navigator.userAgent,
  };
}

function formatGatewayDisconnectMessageLegacy(url: string, message?: string | null) {
  const detail = message?.trim() || "连接已断开";
  return `WebSocket 网关连接不可用：${detail}；url=${url}`;
}

function formatGatewayDisconnectMessage(url: string, message?: string | null) {
  formatGatewayDisconnectMessageLegacy(url, message);
  const detail = message?.trim() || "connection closed";
  return `Workspace gateway unavailable: ${detail} (url=${url})`;
}

function normalizeGatewayDisconnectMessage(message?: string | null) {
  const detail = message?.trim();
  if (!detail) {
    return detail;
  }
  if (detail.includes("WebSocket error")) {
    return "browser WebSocket error before gateway handshake completed";
  }
  if (detail.includes("{detail}")) {
    return "connect request failed before gateway handshake completed";
  }
  if (detail.includes("connect") && detail.includes("ms")) {
    return detail.replace(/connect.*?(\d+ms).*$/i, "connect request timed out after $1");
  }
  return detail;
}

export class WorkspaceGatewayClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, GatewayPendingRequest>();
  private stopped = false;
  private handshakeTimer: number | null = null;
  private connectRequestTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private connectNonce: string | null = null;
  private hasConnected = false;
  private reconnectDelayMs = RECONNECT_BASE_MS;
  private socketSeq = 0;
  private activeSocketSeq = 0;

  constructor(private options: WorkspaceGatewayClientOptions) {}

  start() {
    this.stopped = false;
    this.open();
  }

  stop() {
    this.stopped = true;
    this.hasConnected = false;
    this.connectNonce = null;
    this.clearTimers();
    this.rejectPending(new Error("gateway client stopped"));
    this.ws?.close();
    this.ws = null;
    this.activeSocketSeq = 0;
  }

  get connected() {
    return this.hasConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("gateway not connected"));
    }

    const id = crypto.randomUUID();
    this.ws.send(JSON.stringify({ type: "req", id, method, params }));

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
    });
  }

  private open() {
    if (this.stopped) {
      return;
    }

    this.clearReconnectTimer();
    this.hasConnected = false;
    this.options.onConnecting?.();

    const ws = new WebSocket(this.options.url);
    const socketSeq = ++this.socketSeq;
    this.activeSocketSeq = socketSeq;
    this.ws = ws;

    ws.addEventListener("open", () => {
      if (!this.isCurrentSocket(ws, socketSeq)) {
        return;
      }
      this.clearHandshakeTimer();
      this.handshakeTimer = window.setTimeout(() => {
        void this.sendConnect(ws, socketSeq);
      }, CONNECT_DELAY_MS);
    });

    ws.addEventListener("message", (event) => {
      this.handleMessage(String(event.data ?? ""), ws, socketSeq);
    });

    ws.addEventListener("close", (event) => {
      const reason = String(event.reason ?? "");
      const closeDetail = [`close code=${event.code}`, reason ? `reason=${reason}` : ""]
        .filter(Boolean)
        .join(", ");
      this.handleDisconnect(ws, socketSeq, closeDetail || "WebSocket closed");
    });

    ws.addEventListener("error", () => {
      this.handleDisconnect(ws, socketSeq, "浏览器 WebSocket error 事件，可能是端口未监听、服务未启动完成或 token/RPC 校验失败");
    });
  }

  private isCurrentSocket(socket: WebSocket, socketSeq: number) {
    return !this.stopped && this.ws === socket && this.activeSocketSeq === socketSeq;
  }

  private handleMessage(raw: string, socket: WebSocket, socketSeq: number) {
    if (!this.isCurrentSocket(socket, socketSeq)) {
      return;
    }

    let parsed: GatewayEventFrame | GatewayResponseFrame | null = null;
    try {
      parsed = JSON.parse(raw) as GatewayEventFrame | GatewayResponseFrame;
    } catch {
      return;
    }

    if (!parsed) {
      return;
    }

    if (parsed.type === "event") {
      if (parsed.event === "connect.challenge") {
        const payload =
          parsed.payload && typeof parsed.payload === "object"
            ? (parsed.payload as { nonce?: unknown })
            : undefined;
        this.connectNonce = typeof payload?.nonce === "string" ? payload.nonce : null;
        this.clearHandshakeTimer();
        void this.sendConnect(socket, socketSeq);
        return;
      }

      this.options.onEvent?.(parsed);
      return;
    }

    const pending = this.pending.get(parsed.id);
    if (!pending) {
      return;
    }

    this.pending.delete(parsed.id);

    if (parsed.ok) {
      pending.resolve(parsed.payload);
      return;
    }

    pending.reject(new Error(parsed.error?.message ?? "gateway request failed"));
  }

  private async sendConnect(socket: WebSocket, socketSeq: number) {
    if (!this.isCurrentSocket(socket, socketSeq) || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      this.clearConnectRequestTimer();
      this.connectRequestTimer = window.setTimeout(() => {
        this.handleDisconnect(socket, socketSeq, `connect 请求 ${CONNECT_REQUEST_TIMEOUT_MS}ms 超时`);
      }, CONNECT_REQUEST_TIMEOUT_MS);
      const hello = await this.request<GatewayHelloOk>("connect", buildConnectParams(this.options.token, this.connectNonce));
      this.clearConnectRequestTimer();
      if (!this.isCurrentSocket(socket, socketSeq)) {
        return;
      }
      this.hasConnected = true;
      this.reconnectDelayMs = RECONNECT_BASE_MS;
      this.options.onConnected?.(hello);
    } catch (error) {
      this.clearConnectRequestTimer();
      const detail = error instanceof Error ? error.message : String(error);
      this.handleDisconnect(socket, socketSeq, `connect 请求失败：${detail}`);
    }
  }

  private handleDisconnect(socket: WebSocket, socketSeq: number, errorMessage?: string) {
    if (!this.isCurrentSocket(socket, socketSeq)) {
      return;
    }

    this.clearHandshakeTimer();
    this.clearConnectRequestTimer();
    this.clearReconnectTimer();

    try {
      socket.close();
    } catch {
      // ignore
    }

    this.ws = null;
    this.activeSocketSeq = 0;
    this.hasConnected = false;
    const disconnectMessage = formatGatewayDisconnectMessage(
      this.options.url,
      normalizeGatewayDisconnectMessage(errorMessage),
    );
    this.rejectPending(new Error(disconnectMessage));
    this.options.onDisconnected?.(disconnectMessage);

    if (this.stopped) {
      return;
    }

    this.reconnectTimer = window.setTimeout(() => {
      this.open();
    }, this.reconnectDelayMs);
    this.reconnectDelayMs = Math.min(Math.round(this.reconnectDelayMs * 1.6), RECONNECT_MAX_MS);
  }

  private rejectPending(error: Error) {
    for (const [, pending] of this.pending) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  private clearTimers() {
    this.clearHandshakeTimer();
    this.clearConnectRequestTimer();
    this.clearReconnectTimer();
  }

  private clearHandshakeTimer() {
    if (this.handshakeTimer !== null) {
      window.clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearConnectRequestTimer() {
    if (this.connectRequestTimer !== null) {
      window.clearTimeout(this.connectRequestTimer);
      this.connectRequestTimer = null;
    }
  }
}

export function buildGatewayUrl(port: number) {
  return `ws://127.0.0.1:${port}`;
}

export function createAgentSessionKey(agentId: string) {
  return `agent:${agentId}:main`;
}

export function formatAgentName(agent: WorkspaceGatewayAgentRow) {
  return resolveWorkspaceAgentDisplayName(
    agent.id,
    agent.identity?.name?.trim() || agent.name?.trim() || agent.id,
  );
}

export function formatAgentAvatar(agent: WorkspaceGatewayAgentRow) {
  const emoji = agent.identity?.emoji?.trim();
  if (emoji) {
    return emoji;
  }

  const label = formatAgentName(agent).trim();
  return label.slice(0, 1).toUpperCase() || "A";
}

export function filterAgentSessions(result: WorkspaceGatewaySessionsListResult | null, agentId: string) {
  if (!result) {
    return [];
  }

  const prefix = `agent:${agentId}:`;
  return result.sessions.filter((session) => session.key.startsWith(prefix));
}

export function findMainAgentSession(
  result: WorkspaceGatewaySessionsListResult | null,
  agentId: string,
): WorkspaceGatewaySessionRow | null {
  const mainKey = createAgentSessionKey(agentId);
  return result?.sessions.find((session) => session.key === mainKey) ?? null;
}

export function isChatEventPayload(payload: unknown): payload is WorkspaceGatewayChatEventPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<WorkspaceGatewayChatEventPayload>;
  return (
    typeof candidate.runId === "string" &&
    typeof candidate.sessionKey === "string" &&
    typeof candidate.state === "string"
  );
}

export function isAgentsListResult(payload: unknown): payload is WorkspaceGatewayAgentsListResult {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<WorkspaceGatewayAgentsListResult>;
  return typeof candidate.defaultId === "string" && Array.isArray(candidate.agents);
}

export function isSessionsListResult(payload: unknown): payload is WorkspaceGatewaySessionsListResult {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<WorkspaceGatewaySessionsListResult>;
  return typeof candidate.ts === "number" && Array.isArray(candidate.sessions);
}

export function isGatewaySkillStatusResult(payload: unknown): payload is WorkspaceGatewaySkillStatusResult {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<WorkspaceGatewaySkillStatusResult>;
  return typeof candidate.workspaceDir === "string" && Array.isArray(candidate.skills);
}
