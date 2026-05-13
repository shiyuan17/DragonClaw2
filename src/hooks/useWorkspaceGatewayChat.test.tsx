import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { gatewayMocks } from "./workspace-gateway/useWorkspaceGatewayChat.test-utils";
import { useWorkspaceGatewayChat } from "./useWorkspaceGatewayChat";
import { loadWorkspaceHistoryTitles } from "./workspace-gateway/history-titles";

describe("useWorkspaceGatewayChat", () => {
  beforeEach(() => {
    gatewayMocks.state.requests = [];
    gatewayMocks.state.sendRejectMessage = null;
    gatewayMocks.state.lastChatSend = null;
    gatewayMocks.state.lastClient = null;
    gatewayMocks.createNewSession.mockClear();
    gatewayMocks.runTaskInNewChat.mockClear();
    gatewayMocks.state.sessionsPayload = {
      ts: 1,
      path: "/sessions.json",
      count: 2,
      defaults: { model: null, contextTokens: null },
      sessions: [
        { key: "agent:main:main", kind: "direct", updatedAt: 10, label: "", displayName: "", model: "", modelProvider: "" },
        { key: "agent:main:secondary", kind: "direct", updatedAt: 20, label: "", displayName: "", model: "", modelProvider: "" },
      ],
    };
    gatewayMocks.state.historyBySession = {
      "agent:main:secondary": [
        { id: "history-1", role: "assistant", text: "最近一条历史消息", timestamp: 1, sessionKey: "agent:main:secondary" },
      ],
      "agent:main:main": [],
    };
    gatewayMocks.state.cacheRowsBySession = {};
    gatewayMocks.state.renderPagesBySession = {};
    gatewayMocks.state.invokes = [];
    gatewayMocks.state.cachePageParseCount = 0;
    gatewayMocks.state.renderPageParseCount = 0;
    gatewayMocks.state.compactParseCount = 0;
    gatewayMocks.state.slowHistorySessions = new Set();
    gatewayMocks.state.resolveHistoryBySession = {};
    vi.mocked(loadWorkspaceHistoryTitles).mockClear();
  });

  it("sends only to the currently selected session", async () => {
    const { result } = renderHook(() => useWorkspaceGatewayChat({
      running: true,
      servicePort: 18789,
      gatewayToken: "token",
    }));

    await waitFor(() => {
      expect(result.current.selectedSessionKey).toBe("agent:main:main");
    });

    await act(async () => {
      await result.current.sendMessage("检查当前项目规范并给出优化调整方案");
    });

    expect(gatewayMocks.state.lastChatSend?.sessionKey).toBe("agent:main:main");

    const { result: explicitResult } = renderHook(() => useWorkspaceGatewayChat({
      running: true,
      servicePort: 18789,
      gatewayToken: "token",
    }));

    await waitFor(() => {
      expect(explicitResult.current.selectedSessionKey).toBe("agent:main:main");
    });

    act(() => {
      explicitResult.current.selectSession("agent:main:secondary");
    });

    await waitFor(() => {
      expect(explicitResult.current.selectedSessionKey).toBe("agent:main:secondary");
    });

    await act(async () => {
      await explicitResult.current.sendMessage("继续跟进这段历史会话");
    });

    expect(gatewayMocks.state.lastChatSend?.sessionKey).toBe("agent:main:secondary");
  });

  it("shows persisted cached messages while selected session history refresh is pending", async () => {
    gatewayMocks.state.cacheRowsBySession["agent:main:secondary"] = {
      sessionKey: "agent:main:secondary",
      agentId: "main",
      updatedAt: 20,
      cachedAt: 19,
      title: "cached secondary",
      messagesJson: JSON.stringify([
        { id: "cached-1", role: "assistant", text: "cached secondary message", timestamp: 1, sessionKey: "agent:main:secondary" },
      ]),
    };
    gatewayMocks.state.historyBySession["agent:main:secondary"] = [
      { id: "gateway-1", role: "assistant", text: "gateway refreshed secondary message", timestamp: 2, sessionKey: "agent:main:secondary" },
    ];
    gatewayMocks.state.slowHistorySessions.add("agent:main:secondary");

    const { result } = renderHook(() => useWorkspaceGatewayChat({
      running: true,
      servicePort: 18789,
      gatewayToken: "token",
    }));

    await waitFor(() => {
      expect(result.current.selectedSessionKey).toBe("agent:main:main");
    });

    act(() => {
      result.current.selectSession("agent:main:secondary");
    });

    await waitFor(() => {
      expect(result.current.selectedSessionKey).toBe("agent:main:secondary");
      expect(result.current.messages[0]?.text).toBe("cached secondary message");
    });
    expect(result.current.historyLoading).toBe(false);

    await waitFor(() => {
      expect(gatewayMocks.state.resolveHistoryBySession["agent:main:secondary"]).toBeTruthy();
    });

    await act(async () => {
      gatewayMocks.state.resolveHistoryBySession["agent:main:secondary"]?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.messages[0]?.text).toBe("gateway refreshed secondary message");
    });
  });

  it("loads cached history one page at a time and prepends older messages on request", async () => {
    const cachedMessages = Array.from({ length: 65 }, (_, index) => ({
      id: `cached-${index}`,
      role: "assistant",
      text: `cached message ${index}`,
      timestamp: index,
      sessionKey: "agent:main:secondary",
    }));
    gatewayMocks.state.cacheRowsBySession["agent:main:secondary"] = {
      sessionKey: "agent:main:secondary",
      agentId: "main",
      updatedAt: 65,
      cachedAt: 65,
      title: "cached secondary",
      messagesJson: JSON.stringify(cachedMessages),
    };
    gatewayMocks.state.slowHistorySessions.add("agent:main:secondary");

    const { result } = renderHook(() => useWorkspaceGatewayChat({
      running: true,
      servicePort: 18789,
      gatewayToken: "token",
    }));

    await waitFor(() => {
      expect(result.current.selectedSessionKey).toBe("agent:main:main");
    });

    act(() => {
      result.current.selectSession("agent:main:secondary");
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(20);
      expect(result.current.messages[0]?.text).toBe("cached message 45");
      expect(result.current.historyPageState?.hasMoreBefore).toBe(true);
    });

    await act(async () => {
      await result.current.loadOlderHistoryPage();
    });

    expect(result.current.messages).toHaveLength(50);
    expect(result.current.messages[0]?.text).toBe("cached message 15");
    expect(result.current.historyPageState?.oldestIndex).toBe(15);
  });

  it("keeps heavy session switching on the preview/view-model path", async () => {
    const sessions = Array.from({ length: 80 }, (_, index) => ({
      key: `agent:main:session-${index}`,
      kind: "direct",
      updatedAt: 1_000 - index,
      label: "",
      displayName: "",
      model: "",
      modelProvider: "",
    }));
    gatewayMocks.state.sessionsPayload = {
      ts: 1,
      path: "/sessions.json",
      count: sessions.length + 1,
      defaults: { model: null, contextTokens: null },
      sessions: [
        { key: "agent:main:main", kind: "direct", updatedAt: 2_000, label: "", displayName: "", model: "", modelProvider: "" },
        ...sessions,
      ],
    };

    ["session-1", "session-2", "session-3"].forEach((suffix) => {
      const sessionKey = `agent:main:${suffix}`;
      gatewayMocks.state.cacheRowsBySession[sessionKey] = {
        sessionKey,
        agentId: "main",
        updatedAt: 100,
        cachedAt: 100,
        title: suffix,
        messagesJson: JSON.stringify(Array.from({ length: 1_000 }, (_, index) => ({
          id: `${suffix}-raw-${index}`,
          role: "assistant",
          text: `raw ${suffix} ${index} ${"x".repeat(200)}`,
          timestamp: index,
          sessionKey,
        }))),
      };
      gatewayMocks.state.renderPagesBySession[sessionKey] = Array.from({ length: 20 }, (_, index) => ({
        id: `${suffix}-preview-${index}`,
        role: "assistant",
        textPreview: `preview ${suffix} ${index}`,
        timestamp: index,
      }));
      gatewayMocks.state.slowHistorySessions.add(sessionKey);
    });

    const { result } = renderHook(() => useWorkspaceGatewayChat({
      running: true,
      servicePort: 18789,
      gatewayToken: "token",
    }));

    await waitFor(() => {
      expect(result.current.selectedSessionKey).toBe("agent:main:main");
    });

    const initialHistoryRequests = gatewayMocks.state.requests.filter((request) => request.method === "chat.history").length;
    gatewayMocks.state.cachePageParseCount = 0;
    gatewayMocks.state.renderPageParseCount = 0;

    for (const suffix of ["session-1", "session-2", "session-3"]) {
      const sessionKey = `agent:main:${suffix}`;
      act(() => {
        result.current.selectSession(sessionKey);
      });
      expect(result.current.selectedSessionKey).toBe(sessionKey);
      expect(gatewayMocks.state.cachePageParseCount).toBe(0);
      expect(gatewayMocks.state.renderPageParseCount).toBe(0);
      expect(gatewayMocks.state.requests.filter((request) => request.method === "chat.history")).toHaveLength(initialHistoryRequests);
      await waitFor(() => {
        expect(result.current.messages).toHaveLength(20);
        expect(result.current.messages[0]?.text).toBe(`preview ${suffix} 0`);
      });
    }

    const renderPageCalls = gatewayMocks.state.invokes.filter((entry) => entry.command === "load_workspace_chat_session_render_page").length;
    act(() => {
      result.current.selectSession("agent:main:session-1");
    });

    await waitFor(() => {
      expect(result.current.selectedSessionKey).toBe("agent:main:session-1");
      expect(result.current.messages[0]?.text).toBe("preview session-1 0");
    });
    expect(gatewayMocks.state.invokes.filter((entry) => entry.command === "load_workspace_chat_session_render_page")).toHaveLength(renderPageCalls);
    expect(gatewayMocks.state.cachePageParseCount).toBe(0);
    expect(gatewayMocks.state.renderPageParseCount).toBe(0);
  });

  it("skips gateway history refresh for cached sessions inside the freshness window", async () => {
    gatewayMocks.state.cacheRowsBySession["agent:main:secondary"] = {
      sessionKey: "agent:main:secondary",
      agentId: "main",
      updatedAt: 20,
      cachedAt: 19,
      title: "cached secondary",
      messagesJson: JSON.stringify([
        { id: "cached-1", role: "assistant", text: "cached secondary message", timestamp: 1, sessionKey: "agent:main:secondary" },
      ]),
    };
    gatewayMocks.state.slowHistorySessions.add("agent:main:secondary");

    const { result } = renderHook(() => useWorkspaceGatewayChat({
      running: true,
      servicePort: 18789,
      gatewayToken: "token",
    }));

    await waitFor(() => {
      expect(result.current.selectedSessionKey).toBe("agent:main:main");
    });

    act(() => {
      result.current.selectSession("agent:main:secondary");
    });
    await waitFor(() => {
      expect(result.current.messages[0]?.text).toBe("cached secondary message");
    });

    await waitFor(() => {
      expect(gatewayMocks.state.resolveHistoryBySession["agent:main:secondary"]).toBeTruthy();
    });
    await act(async () => {
      gatewayMocks.state.resolveHistoryBySession["agent:main:secondary"]?.();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.messages[0]?.text).toBe("最近一条历史消息");
    });
    const firstRefreshCount = gatewayMocks.state.requests.filter((request) => request.method === "chat.history").length;

    act(() => {
      result.current.selectSession("agent:main:main");
    });
    await waitFor(() => {
      expect(result.current.selectedSessionKey).toBe("agent:main:main");
    });
    act(() => {
      result.current.selectSession("agent:main:secondary");
    });
    await waitFor(() => {
      expect(result.current.selectedSessionKey).toBe("agent:main:secondary");
    });

    expect(gatewayMocks.state.requests.filter((request) => request.method === "chat.history")).toHaveLength(firstRefreshCount);
  });

  it("ignores stale history responses after rapid session switches", async () => {
    gatewayMocks.state.sessionsPayload = {
      ts: 1,
      path: "/sessions.json",
      count: 3,
      defaults: { model: null, contextTokens: null },
      sessions: [
        { key: "agent:main:main", kind: "direct", updatedAt: 10, label: "", displayName: "", model: "", modelProvider: "" },
        { key: "agent:main:secondary", kind: "direct", updatedAt: 20, label: "", displayName: "", model: "", modelProvider: "" },
        { key: "agent:main:tertiary", kind: "direct", updatedAt: 30, label: "", displayName: "", model: "", modelProvider: "" },
      ],
    };
    gatewayMocks.state.historyBySession = {
      "agent:main:main": [],
      "agent:main:secondary": [
        { id: "secondary-1", role: "assistant", text: "late secondary message", timestamp: 1, sessionKey: "agent:main:secondary" },
      ],
      "agent:main:tertiary": [
        { id: "tertiary-1", role: "assistant", text: "current tertiary message", timestamp: 2, sessionKey: "agent:main:tertiary" },
      ],
    };
    gatewayMocks.state.slowHistorySessions.add("agent:main:secondary");

    const { result } = renderHook(() => useWorkspaceGatewayChat({
      running: true,
      servicePort: 18789,
      gatewayToken: "token",
    }));

    await waitFor(() => {
      expect(result.current.selectedSessionKey).toBe("agent:main:main");
    });

    act(() => {
      result.current.selectSession("agent:main:secondary");
    });
    await waitFor(() => {
      expect(gatewayMocks.state.resolveHistoryBySession["agent:main:secondary"]).toBeTruthy();
    });

    act(() => {
      result.current.selectSession("agent:main:tertiary");
    });
    await waitFor(() => {
      expect(result.current.selectedSessionKey).toBe("agent:main:tertiary");
      expect(result.current.messages[0]?.text).toBe("current tertiary message");
    });

    await act(async () => {
      gatewayMocks.state.resolveHistoryBySession["agent:main:secondary"]?.();
      await Promise.resolve();
    });

    expect(result.current.selectedSessionKey).toBe("agent:main:tertiary");
    expect(result.current.messages[0]?.text).toBe("current tertiary message");
  });

  it("does not clear live transcript state when reselecting the current session", async () => {
    const { result } = renderHook(() => useWorkspaceGatewayChat({
      running: true,
      servicePort: 18789,
      gatewayToken: "token",
    }));

    await waitFor(() => {
      expect(result.current.selectedSessionKey).toBe("agent:main:main");
    });

    await act(async () => {
      await result.current.sendMessage("inspect the workspace");
    });

    const runId = gatewayMocks.state.lastChatSend?.idempotencyKey ?? "";
    act(() => {
      gatewayMocks.state.lastClient?.emit("agent", {
        runId,
        sessionKey: "agent:main:main",
        stream: "tool",
        ts: 100,
        data: { id: "tool-1", phase: "end", name: "exec", args: { command: "rg bootstrap" } },
      });
    });

    await waitFor(() => {
      expect(result.current.liveTranscriptItems).toHaveLength(1);
    });
    const historyRequestCount = gatewayMocks.state.requests
      .filter((request) => request.method === "chat.history").length;

    act(() => {
      result.current.selectSession("agent:main:main");
    });

    expect(result.current.liveTranscriptItems).toHaveLength(1);
    expect(gatewayMocks.state.requests.filter((request) => request.method === "chat.history")).toHaveLength(historyRequestCount);
  });

  it("does not refetch history titles after only the title cache changes", async () => {
    const { result } = renderHook(() => useWorkspaceGatewayChat({
      running: true,
      servicePort: 18789,
      gatewayToken: "token",
    }));

    await waitFor(() => {
      expect(result.current.selectedSessionKey).toBe("agent:main:main");
      expect(loadWorkspaceHistoryTitles).toHaveBeenCalled();
    });
    const initialTitleLoadCount = vi.mocked(loadWorkspaceHistoryTitles).mock.calls.length;

    act(() => {
      result.current.selectSession("agent:main:secondary");
    });

    await waitFor(() => {
      expect(result.current.messages[0]?.text).toBe("最近一条历史消息");
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(loadWorkspaceHistoryTitles).toHaveBeenCalledTimes(initialTitleLoadCount);
  });

  it("keeps tool calls and assistant deltas in transcript event order", async () => {
    const { result } = renderHook(() => useWorkspaceGatewayChat({
      running: true,
      servicePort: 18789,
      gatewayToken: "token",
    }));

    await waitFor(() => {
      expect(result.current.selectedSessionKey).toBe("agent:main:main");
    });

    await act(async () => {
      await result.current.sendMessage("inspect the workspace");
    });

    const runId = gatewayMocks.state.lastChatSend?.idempotencyKey ?? "";
    act(() => {
      gatewayMocks.state.lastClient?.emit("agent", {
        runId,
        sessionKey: "agent:main:main",
        stream: "tool",
        ts: 100,
        data: { id: "tool-1", phase: "end", name: "exec", args: { command: "rg bootstrap" } },
      });
      gatewayMocks.state.lastClient?.emit("chat", {
        runId,
        sessionKey: "agent:main:main",
        state: "delta",
        message: "I found the bootstrap entry.",
        ts: 101,
      });
      gatewayMocks.state.lastClient?.emit("agent", {
        runId,
        sessionKey: "agent:main:main",
        stream: "tool",
        ts: 102,
        data: { id: "tool-2", phase: "end", name: "search", args: { query: "chat session" } },
      });
      gatewayMocks.state.lastClient?.emit("chat", {
        runId,
        sessionKey: "agent:main:main",
        state: "delta",
        message: "Then I checked chat session routing.",
        ts: 103,
      });
    });

    await waitFor(() => {
      expect(result.current.liveTranscriptItems.map((item) => item.kind)).toEqual([
        "step",
        "assistant",
        "step",
        "assistant",
      ]);
    });
    expect(result.current.liveTranscriptItems[0]).toMatchObject({
      kind: "step",
      step: { title: "rg bootstrap" },
    });
    expect(result.current.liveTranscriptItems[1]).toMatchObject({
      kind: "assistant",
      text: "I found the bootstrap entry.",
    });
    expect(result.current.liveTranscriptItems[2]).toMatchObject({
      kind: "step",
      step: { title: "chat session" },
    });
    expect(result.current.liveTranscriptItems[3]).toMatchObject({
      kind: "assistant",
      text: "Then I checked chat session routing.",
    });
  });

  it("merges consecutive assistant transcript deltas and starts a new text item after tools", async () => {
    const { result } = renderHook(() => useWorkspaceGatewayChat({
      running: true,
      servicePort: 18789,
      gatewayToken: "token",
    }));

    await waitFor(() => {
      expect(result.current.selectedSessionKey).toBe("agent:main:main");
    });

    await act(async () => {
      await result.current.sendMessage("stream a response");
    });

    const runId = gatewayMocks.state.lastChatSend?.idempotencyKey ?? "";
    act(() => {
      gatewayMocks.state.lastClient?.emit("chat", {
        runId,
        sessionKey: "agent:main:main",
        state: "delta",
        message: "First sentence.",
        ts: 200,
      });
      gatewayMocks.state.lastClient?.emit("chat", {
        runId,
        sessionKey: "agent:main:main",
        state: "delta",
        message: "First sentence. Second sentence.",
        ts: 201,
      });
      gatewayMocks.state.lastClient?.emit("agent", {
        runId,
        sessionKey: "agent:main:main",
        stream: "tool",
        ts: 202,
        data: { id: "tool-after-text", phase: "end", name: "exec", args: { command: "npm test" } },
      });
      gatewayMocks.state.lastClient?.emit("chat", {
        runId,
        sessionKey: "agent:main:main",
        state: "delta",
        message: "After command.",
        ts: 203,
      });
    });

    await waitFor(() => {
      expect(result.current.liveTranscriptItems.map((item) => item.kind)).toEqual([
        "assistant",
        "step",
        "assistant",
      ]);
    });
    expect(result.current.liveTranscriptItems[0]).toMatchObject({
      kind: "assistant",
      text: "First sentence. Second sentence.",
    });
    expect(result.current.liveTranscriptItems[2]).toMatchObject({
      kind: "assistant",
      text: "After command.",
    });
  });

  it("updates stable transcript steps while keeping unstable exec calls separate", async () => {
    const { result } = renderHook(() => useWorkspaceGatewayChat({
      running: true,
      servicePort: 18789,
      gatewayToken: "token",
    }));

    await waitFor(() => {
      expect(result.current.selectedSessionKey).toBe("agent:main:main");
    });

    await act(async () => {
      await result.current.sendMessage("run commands");
    });

    const runId = gatewayMocks.state.lastChatSend?.idempotencyKey ?? "";
    act(() => {
      gatewayMocks.state.lastClient?.emit("agent", {
        runId,
        sessionKey: "agent:main:main",
        stream: "tool",
        ts: 300,
        data: { id: "stable-tool", phase: "start", name: "exec", args: { command: "npm run build" } },
      });
      gatewayMocks.state.lastClient?.emit("agent", {
        runId,
        sessionKey: "agent:main:main",
        stream: "tool",
        ts: 301,
        data: { id: "stable-tool", phase: "end", name: "exec", args: { command: "npm run build" } },
      });
      gatewayMocks.state.lastClient?.emit("agent", {
        runId,
        sessionKey: "agent:main:main",
        stream: "tool",
        ts: 302,
        data: { phase: "start", name: "exec", args: { command: "Get-ChildItem" } },
      });
      gatewayMocks.state.lastClient?.emit("agent", {
        runId,
        sessionKey: "agent:main:main",
        stream: "tool",
        ts: 303,
        data: { phase: "start", name: "exec", args: { command: "Write-Host done" } },
      });
    });

    await waitFor(() => {
      expect(result.current.liveTranscriptItems).toHaveLength(3);
    });
    expect(result.current.liveTranscriptItems[0]).toMatchObject({
      kind: "step",
      step: { id: "stable-tool", status: "success" },
    });
    expect(result.current.liveTranscriptItems.slice(1).map((item) => (
      item.kind === "step" ? item.step.title : ""
    ))).toEqual(["Get-ChildItem", "Write-Host done"]);
  });

  it("turns a lone thinking failure into an explicit model error notice", async () => {
    const { result } = renderHook(() => useWorkspaceGatewayChat({
      running: true,
      servicePort: 18789,
      gatewayToken: "token",
    }));

    await waitFor(() => {
      expect(result.current.selectedSessionKey).toBe("agent:main:main");
    });

    await act(async () => {
      await result.current.sendMessage("触发模型错误");
    });

    const runId = gatewayMocks.state.lastChatSend?.idempotencyKey ?? "";
    act(() => {
      gatewayMocks.state.lastClient?.emit("chat", {
        runId,
        sessionKey: "agent:main:main",
        state: "error",
        errorMessage: "provider timeout",
      });
    });

    await waitFor(() => {
      expect(result.current.chatFailure?.title).toBe("模型返回错误");
    });
    expect(result.current.chatFailure?.message).toContain("网络");
    expect(result.current.liveSteps[0]?.title).toBe("模型返回错误");
  });

  it("turns agent lifecycle auth failures into actionable chat failure notices", async () => {
    const { result } = renderHook(() => useWorkspaceGatewayChat({
      running: true,
      servicePort: 18789,
      gatewayToken: "token",
    }));

    await waitFor(() => {
      expect(result.current.selectedSessionKey).toBe("agent:main:main");
    });

    await act(async () => {
      await result.current.sendMessage("trigger token exhaustion");
    });

    const runId = gatewayMocks.state.lastChatSend?.idempotencyKey ?? "";
    act(() => {
      gatewayMocks.state.lastClient?.emit("agent", {
        runId,
        sessionKey: "agent:main:main",
        stream: "lifecycle",
        data: {
          phase: "end",
          isError: true,
          error: "API rate limit reached",
          rawErrorPreview: "401 TokenStatusExhausted[sk-test]",
          provider: "codexzh",
          model: "gpt-5.4",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.chatFailure?.source).toBe("agent_error");
    });
    expect(result.current.chatFailure?.title).toBe("模型运行失败");
    expect(result.current.chatFailure?.message).toContain("Token");
    expect(result.current.chatFailure?.message).toContain("codexzh/gpt-5.4");
    expect(result.current.liveSteps[0]?.title).toBe("模型运行失败");
  });

  it("surfaces reconnect failures as connection-loss notices instead of bare thinking errors", async () => {
    const { result } = renderHook(() => useWorkspaceGatewayChat({
      running: true,
      servicePort: 18789,
      gatewayToken: "token",
    }));

    await waitFor(() => {
      expect(result.current.selectedSessionKey).toBe("agent:main:main");
    });

    await act(async () => {
      await result.current.sendMessage("模拟断线");
    });

    act(() => {
      gatewayMocks.state.lastClient?.disconnect("Workspace gateway unavailable: connection lost");
    });

    await waitFor(() => {
      expect(result.current.chatFailure?.title).toBe("网关连接丢失");
    });
    expect(result.current.liveSteps[0]?.title).toBe("网关连接丢失");
  });
});
