import { afterEach, describe, expect, it } from "vitest";

import {
  loadWorkspaceAgentWorkdirs,
  normalizeWorkspaceAgentWorkdirs,
  normalizeWorkspaceAgentWorkdirKey,
  resolveWorkspaceAgentWorkdir,
  resolveWorkspaceChatAgentId,
  updateWorkspaceAgentWorkdirs,
} from "./workspaceCloneAgentWorkdirState";

const STORAGE_KEY = "dragonclaw.workspace.agent-workdirs.v1";

describe("workspaceCloneAgentWorkdirState", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("normalizes persisted agent workdirs defensively", () => {
    expect(normalizeWorkspaceAgentWorkdirKey(" Main ")).toBe("main");
    expect(
      normalizeWorkspaceAgentWorkdirs({
        " Main ": " D:\\Github\\DragonClaw2 ",
        assistant: "   ",
        "": "D:\\Ignored",
        invalid: 123,
      }),
    ).toEqual({
      main: "D:\\Github\\DragonClaw2",
    });
  });

  it("loads valid persisted agent workdirs and ignores malformed storage", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        Main: "D:\\Github\\DragonClaw2",
        assistant: "D:\\Github\\AnotherProject",
      }),
    );

    expect(loadWorkspaceAgentWorkdirs()).toEqual({
      main: "D:\\Github\\DragonClaw2",
      assistant: "D:\\Github\\AnotherProject",
    });

    window.localStorage.setItem(STORAGE_KEY, "{bad json");
    expect(loadWorkspaceAgentWorkdirs()).toEqual({});
  });

  it("updates per-agent defaults without leaking between agents", () => {
    const stateAfterMain = updateWorkspaceAgentWorkdirs({}, " Main ", " D:\\Github\\DragonClaw2 ");
    expect(resolveWorkspaceAgentWorkdir(stateAfterMain, "main")).toBe("D:\\Github\\DragonClaw2");

    const rehydratedState = normalizeWorkspaceAgentWorkdirs(stateAfterMain);
    expect(resolveWorkspaceAgentWorkdir(rehydratedState, "MAIN")).toBe("D:\\Github\\DragonClaw2");

    const nextSessionSameAgentState = updateWorkspaceAgentWorkdirs(
      rehydratedState,
      "main",
      "D:\\Github\\DragonClaw2",
    );
    expect(resolveWorkspaceAgentWorkdir(nextSessionSameAgentState, "main")).toBe("D:\\Github\\DragonClaw2");
    expect(resolveWorkspaceAgentWorkdir(nextSessionSameAgentState, "assistant")).toBe("");

    const stateAfterAssistant = updateWorkspaceAgentWorkdirs(
      nextSessionSameAgentState,
      "assistant",
      "D:\\Github\\AssistantProject",
    );
    expect(resolveWorkspaceAgentWorkdir(stateAfterAssistant, "main")).toBe("D:\\Github\\DragonClaw2");
    expect(resolveWorkspaceAgentWorkdir(stateAfterAssistant, "assistant")).toBe("D:\\Github\\AssistantProject");
  });

  it("clears an agent default and makes old or new sessions read the latest value", () => {
    const withMain = updateWorkspaceAgentWorkdirs({}, "main", "D:\\Github\\DragonClaw2");
    const updatedMain = updateWorkspaceAgentWorkdirs(withMain, "main", "D:\\Github\\DragonClaw3");

    expect(resolveWorkspaceAgentWorkdir(updatedMain, "main")).toBe("D:\\Github\\DragonClaw3");

    const clearedMain = updateWorkspaceAgentWorkdirs(updatedMain, "main", "");
    expect(resolveWorkspaceAgentWorkdir(clearedMain, "main")).toBe("");
  });

  it("resolves the active chat agent for agent and bound-channel chats", () => {
    expect(
      resolveWorkspaceChatAgentId({
        activeType: "agents",
        selectedEntityId: "assistant",
        selectedAgentId: "main",
      }),
    ).toBe("assistant");

    expect(
      resolveWorkspaceChatAgentId({
        activeType: "channels",
        selectedEntityId: "weixin",
        selectedEntityRuntimeAgentId: "support",
        selectedAgentId: "main",
      }),
    ).toBe("support");

    expect(
      resolveWorkspaceChatAgentId({
        activeType: "teams",
        selectedEntityId: "ops",
        selectedAgentId: "main",
      }),
    ).toBe("");
  });
});
