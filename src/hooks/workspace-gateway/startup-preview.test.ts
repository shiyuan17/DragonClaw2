import { describe, expect, it } from "vitest";
import type { WorkspaceGatewaySessionsListResult } from "../../components/workspace-clone/workspaceCloneTypes";
import {
  isWorkspaceStartupPreviewActive,
  resolveWorkspaceStartupPreviewDisplaySessionKey,
  resolveWorkspaceStartupPreviewState,
} from "./startup-preview";

function buildSessionsResult(
  sessions: WorkspaceGatewaySessionsListResult["sessions"],
): WorkspaceGatewaySessionsListResult {
  return {
    ts: 1,
    path: "/sessions.json",
    count: sessions.length,
    defaults: { model: null, contextTokens: null },
    sessions,
  };
}

describe("workspace startup preview helpers", () => {
  it("does not create a preview when the agent only has the main session", () => {
    const previewState = resolveWorkspaceStartupPreviewState(buildSessionsResult([
      { key: "agent:main:main", kind: "direct", updatedAt: 10, label: "", displayName: "", model: "", modelProvider: "" },
    ]), "main");

    expect(previewState).toBeNull();
  });

  it("selects the newest non-main session for the same agent when it is newer than main", () => {
    const previewState = resolveWorkspaceStartupPreviewState(buildSessionsResult([
      { key: "agent:main:main", kind: "direct", updatedAt: 10, label: "", displayName: "", model: "", modelProvider: "" },
      { key: "agent:main:secondary-a", kind: "direct", updatedAt: 50, label: "", displayName: "", model: "", modelProvider: "" },
      { key: "agent:main:secondary-b", kind: "direct", updatedAt: 20, label: "", displayName: "", model: "", modelProvider: "" },
    ]), "main");

    expect(previewState).toEqual({
      agentId: "main",
      mainSessionKey: "agent:main:main",
      previewSessionKey: "agent:main:secondary-a",
    });
  });

  it("ignores newer sessions from other agents", () => {
    const previewState = resolveWorkspaceStartupPreviewState(buildSessionsResult([
      { key: "agent:main:main", kind: "direct", updatedAt: 30, label: "", displayName: "", model: "", modelProvider: "" },
      { key: "agent:other:secondary", kind: "direct", updatedAt: 90, label: "", displayName: "", model: "", modelProvider: "" },
    ]), "main");

    expect(previewState).toBeNull();
  });

  it("uses the preview session as the display only while main stays selected", () => {
    const previewState = {
      agentId: "main",
      mainSessionKey: "agent:main:main",
      previewSessionKey: "agent:main:secondary-a",
    };

    expect(isWorkspaceStartupPreviewActive(previewState, "main", "agent:main:main")).toBe(true);
    expect(resolveWorkspaceStartupPreviewDisplaySessionKey(previewState, "main", "agent:main:main")).toBe("agent:main:secondary-a");
    expect(resolveWorkspaceStartupPreviewDisplaySessionKey(previewState, "main", "agent:main:secondary-a")).toBe("agent:main:secondary-a");
  });
});
