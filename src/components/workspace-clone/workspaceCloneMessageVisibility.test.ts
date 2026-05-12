import { describe, expect, it } from "vitest";
import { sanitizeWorkspaceAssistantText, shouldHideWorkspaceMessage } from "./workspaceCloneMessageVisibility";
import type { WorkspaceMessage } from "./workspaceCloneTypes";

describe("workspaceCloneMessageVisibility", () => {
  it("hides directory listings and no-output process exits", () => {
    expect(sanitizeWorkspaceAssistantText(".agents .git docs node_modules package.json tsconfig.json vite.config.ts src src-tauri README.md").shouldHide).toBe(true);
    expect(sanitizeWorkspaceAssistantText("(no output)").shouldHide).toBe(true);
    expect(sanitizeWorkspaceAssistantText("(no output recorded) Process exited with signal SIGKILL.").shouldHide).toBe(true);
    expect(sanitizeWorkspaceAssistantText("Process exited with code 0.").shouldHide).toBe(true);
  });

  it("hides PowerShell command-not-found transcripts", () => {
    const result = sanitizeWorkspaceAssistantText([
      "rg : 无法将 “rg” 项识别为 cmdlet、函数、脚本文件或可运行程序的名称。请检查名称的拼写，如果包括路径，请确保路径正确，然后再试一次。 所在位置 行:1 字符:1",
      "+ rg --files -g \"specs/*/spec.md\" -g \".specify/feature.json\"",
    ].join("\n"));

    expect(result.shouldHide).toBe(true);
  });

  it("hides internal prompt file raw dumps without hiding normal explanations", () => {
    const rawDump = sanitizeWorkspaceAssistantText([
      "SOUL.md - Who You Are",
      "",
      "You're not a chatbot. You're becoming someone.",
      "",
      "## Core Truths",
      "- Be genuinely helpful, not performatively helpful.",
      "- Have opinions.",
      "",
      "## Boundaries",
      "- Private things stay private. Period.",
      "- When in doubt, ask before acting externally.",
    ].join("\n"));

    expect(rawDump.shouldHide).toBe(true);
    expect(sanitizeWorkspaceAssistantText("我检查了 SOUL.md，它主要描述 Agent 的沟通风格。").shouldHide).toBe(false);
  });

  it("hides hidden workspace transport blocks", () => {
    const result = sanitizeWorkspaceAssistantText([
      "[DC_WORKSPACE_DIRECTORY_V1]",
      "cwd: D:\\Github\\DragonClaw2",
      "scope: current-session",
      "instructions:",
      "Treat this directory as the default working directory.",
      "",
      "[DC_WORKSPACE_SLASH_COMMAND_V1]",
      "command: /plan",
      "instruction:",
      "Hidden instruction.",
      "",
      "user message:",
      "给出优化方案",
    ].join("\n"));

    expect(result.shouldHide).toBe(true);
  });

  it("trims raw process tails after user-facing assistant text", () => {
    const result = sanitizeWorkspaceAssistantText([
      "最终结论：可以优化输出流程。",
      "",
      "(no output recorded) Process exited with signal SIGKILL.",
    ].join("\n"));

    expect(result).toEqual({
      text: "最终结论：可以优化输出流程。",
      shouldHide: false,
    });
  });

  it("always hides tool role messages", () => {
    const message: WorkspaceMessage = {
      id: "tool-1",
      role: "tool",
      author: "tool",
      text: "raw output",
      time: "",
    };

    expect(shouldHideWorkspaceMessage(message)).toBe(true);
  });
});
