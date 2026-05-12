import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceGatewaySessionsListResult } from "../../components/workspace-clone/workspaceCloneTypes";

const messageVisibilityMocks = vi.hoisted(() => ({
  isWorkspaceRawProcessEcho: vi.fn<(text: string) => boolean>(),
  sanitizeWorkspaceAssistantContent: vi.fn<
    (content: unknown) => { text: string; shouldHide: boolean }
  >(),
}));

vi.mock("../../components/workspace-clone/workspaceCloneMessageVisibility", () => ({
  isWorkspaceRawProcessEcho: messageVisibilityMocks.isWorkspaceRawProcessEcho,
  sanitizeWorkspaceAssistantContent: messageVisibilityMocks.sanitizeWorkspaceAssistantContent,
}));

vi.mock("../../components/workspace-clone/workspaceCloneManualTaskExecution", () => ({
  stripWorkspaceHiddenPromptBlocks: (value: string) => value.replace(/<hidden>[\s\S]*?<\/hidden>/g, "").trim(),
}));

import {
  extractFirstMeaningfulSessionTitle,
  normalizeGatewayMessage,
  resolveAgentSessionKey,
  resolveSessionHistoryTitleDetails,
  sanitizeMeaningfulSessionTitle,
} from "./message-normalizers";

describe("message-normalizers", () => {
  beforeEach(() => {
    messageVisibilityMocks.isWorkspaceRawProcessEcho.mockReset();
    messageVisibilityMocks.sanitizeWorkspaceAssistantContent.mockReset();
    messageVisibilityMocks.isWorkspaceRawProcessEcho.mockReturnValue(false);
    messageVisibilityMocks.sanitizeWorkspaceAssistantContent.mockImplementation((content) => ({
      text: typeof (content as { text?: unknown })?.text === "string"
        ? (((content as { text?: string }).text ?? "").replace(/<hidden>[\s\S]*?<\/hidden>/g, "").trim())
        : "",
      shouldHide: false,
    }));
  });

  it("ignores tool messages entirely", () => {
    const normalized = normalizeGatewayMessage(
      { role: "tool", text: "raw tool output" },
      () => "Assistant",
    );

    expect(normalized).toBeNull();
  });

  it("hides assistant raw process echo content", () => {
    messageVisibilityMocks.isWorkspaceRawProcessEcho.mockReturnValue(true);

    const normalized = normalizeGatewayMessage(
      { role: "assistant", text: "pwsh.exe -c something" },
      () => "Assistant",
    );

    expect(normalized).toBeNull();
  });

  it("keeps attachment-only messages and resolves authors by role", () => {
    const normalized = normalizeGatewayMessage(
      {
        id: "message-1",
        role: "user",
        sessionKey: "agent:ops:main",
        content: [
          {
            type: "attachment",
            attachment: {
              url: "C:/tmp/brief.pdf",
              label: "brief.pdf",
              mimeType: "application/pdf",
            },
          },
        ],
      },
      () => "Assistant",
    );

    expect(normalized).toMatchObject({
      id: "message-1",
      role: "user",
      author: "你",
      text: "",
    });
    expect(normalized?.attachments).toHaveLength(1);
    expect(normalized?.attachments?.[0]).toMatchObject({
      fileName: "brief.pdf",
      kind: "document",
    });
  });

  it("uses assistant author resolver and strips hidden prompt blocks", () => {
    const normalized = normalizeGatewayMessage(
      {
        role: "assistant",
        sessionKey: "agent:analyst:main",
        text: "<hidden>guardrail</hidden>\n最终回答",
      },
      (sessionKey) => `assistant:${sessionKey}`,
    );

    expect(normalized).toMatchObject({
      role: "assistant",
      author: "assistant:agent:analyst:main",
      text: "最终回答",
    });
  });

  it("shows slash command user intent without hidden transport blocks", () => {
    const normalized = normalizeGatewayMessage(
      {
        role: "user",
        text: [
          "[DC_WORKSPACE_DIRECTORY_V1]",
          "cwd: D:\\Github\\DragonClaw2",
          "scope: current-session",
          "instructions:",
          "Treat this directory as the default working directory.",
          "",
          "[DC_WORKSPACE_SLASH_COMMAND_V1]",
          "command: /plan",
          "name: Plan",
          "source: builtin",
          "instruction:",
          "Hidden planning instructions.",
          "",
          "user message:",
          "给出优化方案",
        ].join("\n"),
      },
      () => "Assistant",
    );

    expect(normalized).toMatchObject({
      role: "user",
      text: "/plan 给出优化方案",
    });
    expect(normalized?.text).not.toContain("[DC_WORKSPACE");
    expect(normalized?.text).not.toContain("instruction:");
    expect(normalized?.text).not.toContain("cwd:");
  });

  it("rejects raw, meaningless, and mojibake-like titles", () => {
    expect(sanitizeMeaningfulSessionTitle("agent:ops:main")).toBeNull();
    expect(sanitizeMeaningfulSessionTitle("[object object]")).toBeNull();
    expect(sanitizeMeaningfulSessionTitle("计划\uFFFD")).toBeNull();
    expect(sanitizeMeaningfulSessionTitle("  合法标题  ")).toBe("合法标题");
  });

  it("extracts the first meaningful user title from message history", () => {
    const title = extractFirstMeaningfulSessionTitle([
      { role: "assistant", text: "ignored" },
      { role: "user", text: "agent:ops:main" },
      { role: "user", text: "  请整理本周渠道复盘  " },
    ]);

    expect(title).toBe("请整理本周渠道复盘");
  });

  it("prefers cache, then memory, then fallback when resolving history titles", () => {
    expect(resolveSessionHistoryTitleDetails(
      { key: "agent:ops:main", displayName: "运营 Agent", label: "运营" },
      {
        cachedTitle: "缓存标题",
        memoryMessages: [{ role: "user", text: "内存标题" }],
      },
    )).toEqual({ title: "缓存标题", source: "cache" });

    expect(resolveSessionHistoryTitleDetails(
      { key: "agent:ops:main", displayName: "", label: "" },
      {
        cachedTitle: "agent:ops:main",
        memoryMessages: [{ role: "user", text: "内存标题" }],
      },
    )).toEqual({ title: "内存标题", source: "memory" });

    expect(resolveSessionHistoryTitleDetails(
      { key: "agent:ops:main", displayName: "", label: "" },
      {},
    )).toEqual({ title: "主会话", source: "fallback" });
  });

  it("falls back to the main or first agent session key when preferred key is unavailable", () => {
    const result: WorkspaceGatewaySessionsListResult = {
      ts: 1,
      path: "/sessions.json",
      count: 3,
      defaults: { model: null, contextTokens: null },
      sessions: [
        { key: "agent:ops:secondary", kind: "direct", updatedAt: 1, label: "", displayName: "", model: "", modelProvider: "" },
        { key: "agent:ops:main", kind: "direct", updatedAt: 2, label: "", displayName: "", model: "", modelProvider: "" },
        { key: "agent:other:main", kind: "direct", updatedAt: 3, label: "", displayName: "", model: "", modelProvider: "" },
      ],
    };

    expect(resolveAgentSessionKey(result, "ops", "agent:ops:secondary")).toBe("agent:ops:secondary");
    expect(resolveAgentSessionKey(result, "ops", "agent:ops:missing")).toBe("agent:ops:main");
    expect(resolveAgentSessionKey({
      ts: 1,
      path: "/sessions.json",
      count: 0,
      defaults: { model: null, contextTokens: null },
      sessions: [],
    } satisfies WorkspaceGatewaySessionsListResult, "ops")).toBe("agent:ops:main");
  });
});
