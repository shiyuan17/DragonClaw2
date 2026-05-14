import { describe, expect, it } from "vitest";
import { buildWorkspaceMessageRenderState } from "./workspaceChatMessageRenderState";
import type { WorkspaceMessage } from "./workspaceCloneTypes";

function buildMessage(overrides: Partial<WorkspaceMessage>): WorkspaceMessage {
  return {
    id: "message-1",
    role: "assistant",
    author: "A",
    text: "",
    time: "",
    ...overrides,
  };
}

describe("workspaceChatMessageRenderState", () => {
  it("hides raw process echoes before they reach the render list", () => {
    const render = buildWorkspaceMessageRenderState(buildMessage({
      text: [
        "D:\\Github\\DragonClaw2\\src-tauri\\src\\chat_cache.rs",
        "D:\\Github\\DragonClaw2\\src-tauri\\src\\control_ui.rs",
        "D:\\Github\\DragonClaw2\\src-tauri\\src\\openclaw_cli.rs",
        "D:\\Github\\DragonClaw2\\src-tauri\\src\\skillhub_runtime.rs",
        "D:\\Github\\DragonClaw2\\src-tauri\\src\\channels\\qr_session.rs",
        "D:\\Github\\DragonClaw2\\src-tauri\\src\\skillhub_runtime\\bootstrap.rs",
        "D:\\Github\\DragonClaw2\\src-tauri\\src\\skillhub_runtime\\tests.rs",
        "D:\\Github\\DragonClaw2\\src-tauri\\src\\download.rs",
      ].join("\n"),
    }));

    expect(render.hidden).toBe(true);
    expect(render.content).toBe("");
  });

  it("precomputes markdown kind and file targets", () => {
    const render = buildWorkspaceMessageRenderState(buildMessage({
      text: "**Done**\n\nSee [report](D:\\Github\\DragonClaw2\\docs\\report.md).",
    }));

    expect(render.hidden).toBe(false);
    expect(render.previewKind).toBe("markdown");
    expect(render.fileTargets).toEqual([
      { label: "report", target: "D:\\Github\\DragonClaw2\\docs\\report.md" },
    ]);
  });

  it("extracts user command display parts without markdown work", () => {
    const render = buildWorkspaceMessageRenderState(buildMessage({
      role: "user",
      author: "You",
      commandTag: "/plan",
      text: "/plan 优化聊天切换",
    }));

    expect(render.previewKind).toBe("plain");
    expect(render.commandTag).toBe("/plan");
    expect(render.content).toBe("优化聊天切换");
  });
});
