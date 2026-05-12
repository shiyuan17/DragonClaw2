import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceGatewaySessionsListResult } from "../../components/workspace-clone/workspaceCloneTypes";

const rosterMocks = vi.hoisted(() => ({
  resolveWorkspaceAgentDisplayName: vi.fn((agentId: string, fallback: string) => fallback || agentId || ""),
}));

vi.mock("../../data/agencyRoster", () => ({
  resolveWorkspaceAgentDisplayName: rosterMocks.resolveWorkspaceAgentDisplayName,
}));

import {
  WorkspaceGatewayClient,
  buildGatewayUrl,
  createAgentSessionKey,
  filterAgentSessions,
  findMainAgentSession,
  formatAgentAvatar,
  formatAgentName,
  isAgentsListResult,
  isChatEventPayload,
  isGatewaySkillStatusResult,
  isSessionsListResult,
} from "./client";

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  private listeners: Record<string, Array<(event: any) => void>> = {};

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: any) => void) {
    this.listeners[type] ??= [];
    this.listeners[type]?.push(listener);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }

  emitOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open", {});
  }

  emitMessage(payload: unknown) {
    this.emit("message", { data: payload });
  }

  emitClose(code = 1000, reason = "") {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", { code, reason });
  }

  private emit(type: string, event: any) {
    for (const listener of this.listeners[type] ?? []) {
      listener(event);
    }
  }
}

describe("workspace-gateway client", () => {
  let requestId = 0;

  beforeEach(() => {
    requestId = 0;
    FakeWebSocket.instances = [];
    rosterMocks.resolveWorkspaceAgentDisplayName.mockClear();
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => `req-${++requestId}`),
    });
  });

  it("starts with a challenge nonce and completes the gateway handshake", async () => {
    const onConnecting = vi.fn();
    const onConnected = vi.fn();
    const client = new WorkspaceGatewayClient({
      url: "ws://127.0.0.1:1420",
      token: "secret-token",
      onConnecting,
      onConnected,
    });

    client.start();
    expect(onConnecting).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(1);

    const socket = FakeWebSocket.instances[0]!;
    socket.emitOpen();
    await vi.advanceTimersByTimeAsync(200);
    expect(socket.sent).toHaveLength(0);

    socket.emitMessage(JSON.stringify({
      type: "event",
      event: "connect.challenge",
      payload: { nonce: "nonce-1" },
    }));
    await Promise.resolve();

    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0] ?? "{}")).toMatchObject({
      type: "req",
      id: "req-1",
      method: "connect",
      params: {
        auth: { token: "secret-token" },
      },
    });

    socket.emitMessage(JSON.stringify({
      type: "res",
      id: "req-1",
      ok: true,
      payload: { type: "hello-ok", protocol: 3 },
    }));
    await Promise.resolve();

    expect(onConnected).toHaveBeenCalledWith({ type: "hello-ok", protocol: 3 });
    expect(client.connected).toBe(true);

    await vi.advanceTimersByTimeAsync(500);
    expect(socket.sent).toHaveLength(1);
  });

  it("rejects requests while disconnected and propagates server-side request errors", async () => {
    const client = new WorkspaceGatewayClient({
      url: "ws://127.0.0.1:1420",
      token: "secret-token",
    });

    await expect(client.request("sessions.list")).rejects.toThrow("gateway not connected");

    client.start();
    const socket = FakeWebSocket.instances[0]!;
    socket.emitOpen();
    await vi.advanceTimersByTimeAsync(250);

    socket.emitMessage(JSON.stringify({
      type: "res",
      id: "req-1",
      ok: true,
      payload: { type: "hello-ok", protocol: 3 },
    }));
    await Promise.resolve();

    const requestPromise = client.request("agents.list");
    expect(JSON.parse(socket.sent[1] ?? "{}")).toMatchObject({
      type: "req",
      id: "req-2",
      method: "agents.list",
    });

    socket.emitMessage(JSON.stringify({
      type: "res",
      id: "unknown-id",
      ok: false,
      error: { message: "ignored" },
    }));
    socket.emitMessage(JSON.stringify({
      type: "res",
      id: "req-2",
      ok: false,
      error: { message: "server exploded" },
    }));

    await expect(requestPromise).rejects.toThrow("server exploded");
  });

  it("rejects pending requests when stopped and does not reconnect afterwards", async () => {
    const onDisconnected = vi.fn();
    const client = new WorkspaceGatewayClient({
      url: "ws://127.0.0.1:1420",
      token: "secret-token",
      onDisconnected,
    });

    client.start();
    const socket = FakeWebSocket.instances[0]!;
    socket.emitOpen();
    await vi.advanceTimersByTimeAsync(250);
    socket.emitMessage(JSON.stringify({
      type: "res",
      id: "req-1",
      ok: true,
      payload: { type: "hello-ok", protocol: 3 },
    }));
    await Promise.resolve();

    const requestPromise = client.request("sessions.list");
    client.stop();

    await expect(requestPromise).rejects.toThrow("gateway client stopped");
    socket.emitClose(1006, "lost");
    await vi.advanceTimersByTimeAsync(5000);

    expect(onDisconnected).not.toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(client.connected).toBe(false);
  });

  it("formats agent/session helpers and validates gateway payload shapes", () => {
    expect(buildGatewayUrl(1420)).toBe("ws://127.0.0.1:1420");
    expect(createAgentSessionKey("ops")).toBe("agent:ops:main");

    expect(formatAgentName({
      id: "ops",
      name: "fallback",
      identity: { name: " Analyst " },
    })).toBe("Analyst");
    expect(rosterMocks.resolveWorkspaceAgentDisplayName).toHaveBeenCalledWith("ops", "Analyst");

    expect(formatAgentAvatar({
      id: "ops",
      name: "fallback",
      identity: { emoji: "🛠️", name: "Analyst" },
    })).toBe("🛠️");
    expect(formatAgentAvatar({
      id: "ops",
      name: "fallback",
      identity: { name: "analyst" },
    })).toBe("A");
    expect(formatAgentAvatar({ id: "", name: "" })).toBe("A");

    const sessions: WorkspaceGatewaySessionsListResult = {
      ts: 1,
      path: "/tmp/sessions.json",
      count: 3,
      defaults: { model: null, contextTokens: null },
      sessions: [
        { key: "agent:ops:main", kind: "direct", updatedAt: 3 },
        { key: "agent:ops:secondary", kind: "direct", updatedAt: 2 },
        { key: "agent:other:main", kind: "direct", updatedAt: 1 },
      ],
    };

    expect(filterAgentSessions(sessions, "ops").map((entry) => entry.key)).toEqual([
      "agent:ops:main",
      "agent:ops:secondary",
    ]);
    expect(filterAgentSessions(null, "ops")).toEqual([]);
    expect(findMainAgentSession(sessions, "ops")?.key).toBe("agent:ops:main");
    expect(findMainAgentSession(sessions, "missing")).toBeNull();

    expect(isChatEventPayload({ runId: "run-1", sessionKey: "agent:ops:main", state: "delta" })).toBe(true);
    expect(isChatEventPayload({ runId: "run-1", sessionKey: 1, state: "delta" })).toBe(false);

    expect(isAgentsListResult({ defaultId: "ops", agents: [] })).toBe(true);
    expect(isAgentsListResult({ defaultId: 1, agents: [] })).toBe(false);

    expect(isSessionsListResult(sessions)).toBe(true);
    expect(isSessionsListResult({ ts: "1", sessions: [] })).toBe(false);

    expect(isGatewaySkillStatusResult({ workspaceDir: "/tmp", skills: [] })).toBe(true);
    expect(isGatewaySkillStatusResult({ workspaceDir: null, skills: [] })).toBe(false);
  });
});
