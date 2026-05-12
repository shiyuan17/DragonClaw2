import { describe, expect, it } from "vitest";
import {
  WORKSPACE_BUILTIN_SLASH_COMMANDS,
  buildWorkspaceVisibleComposerMessage,
  stripWorkspaceComposerTransportBlocks,
} from "./workspaceCloneSlashCommands";

describe("workspaceCloneSlashCommands", () => {
  it("keeps builtin /plan execution logic hidden from user-visible replies", () => {
    const planCommand = WORKSPACE_BUILTIN_SLASH_COMMANDS.find((command) => command.command === "/plan");

    expect(planCommand).toBeTruthy();
    expect(planCommand?.instruction).toContain("The planning-strategy selection is internal command logic.");
    expect(planCommand?.instruction).toContain("do not say whether you chose Spec Kit mode or Codex-style mode");
    expect(planCommand?.instruction).toContain("Do not include preambles such as 'Spec detection result'");
  });

  it("builds the visible slash-command message without leaking transport blocks", () => {
    const visible = buildWorkspaceVisibleComposerMessage({
      command: {
        id: "builtin-plan",
        command: "/plan",
        name: "Plan",
        description: "",
        instruction: "",
        source: "builtin",
      },
      userMessage: "给出优化方案",
    });

    expect(visible).toBe("/plan 给出优化方案");
    expect(stripWorkspaceComposerTransportBlocks([
      "[DC_WORKSPACE_DIRECTORY_V1]",
      "cwd: D:\\Github\\DragonClaw2",
      "",
      "[DC_WORKSPACE_SLASH_COMMAND_V1]",
      "command: /plan",
      "instruction:",
      "Hidden planning instructions.",
      "",
      "user message:",
      "给出优化方案",
    ].join("\n"))).toBe("/plan 给出优化方案");
  });
});
