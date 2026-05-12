import { describe, expect, it } from "vitest";
import type { WorkspaceMessage } from "./workspaceCloneTypes";

import {
  buildWorkspaceChatFileItems,
  isWorkspaceUrlTarget,
  resolveWorkspaceLocalOpenPath,
} from "./workspaceCloneChatFiles";

function createMessage(overrides: Partial<WorkspaceMessage>): WorkspaceMessage {
  return {
    id: "message-1",
    role: "user",
    author: "User",
    text: "",
    time: "09:00",
    ...overrides,
  };
}

describe("workspaceCloneChatFiles", () => {
  it("extracts supported targets from chat text, categories them, and ignores non-chat roles", () => {
    const items = buildWorkspaceChatFileItems([
      createMessage({
        id: "ignored-system",
        role: "system",
        text: "[Ignored](https://example.com/ignored.pdf)",
      }),
      createMessage({
        id: "user-1",
        text: [
          "Open [Plan](https://example.com/plan.docx)",
          "`/tmp/report.xlsx`",
          "\"C:\\tmp\\audio.mp3\"",
          "https://example.com/home",
          "/tmp/unknown.bin",
        ].join(" "),
      }),
      createMessage({
        id: "assistant-1",
        role: "assistant",
        author: "Assistant",
        time: "09:05",
        text: "Use file:///C:/tmp/image.png and /tmp/slides.pptx as references.",
      }),
    ]);

    const byTarget = new Map(items.map((item) => [item.target, item]));
    expect(items).toHaveLength(6);
    expect(byTarget.get("https://example.com/plan.docx")).toMatchObject({
      title: "Plan",
      category: "document",
      sourceRole: "user",
      messageId: "user-1",
    });
    expect(byTarget.get("/tmp/report.xlsx")?.category).toBe("excel");
    expect(byTarget.get("C:/tmp/audio.mp3")?.category).toBe("audio");
    expect(byTarget.get("https://example.com/home")?.category).toBe("website");
    expect(byTarget.get("file:///C:/tmp/image.png")?.category).toBe("image");
    expect(byTarget.get("/tmp/slides.pptx")?.category).toBe("ppt");
  });

  it("deduplicates normalized targets, keeps the latest message metadata, and truncates previews", () => {
    const longTail = "x".repeat(150);
    const items = buildWorkspaceChatFileItems([
      createMessage({
        id: "user-1",
        text: "Look at https://example.com/deck.pdf#intro and C:\\tmp\\brief.pdf",
      }),
      createMessage({
        id: "assistant-1",
        role: "assistant",
        author: "Assistant",
        time: "09:10",
        text: `Repeat https://example.com/deck.pdf and C:/tmp/brief.pdf ${longTail}`,
      }),
    ]);

    const byTarget = new Map(items.map((item) => [item.target, item]));
    expect(items).toHaveLength(2);
    expect(byTarget.get("https://example.com/deck.pdf")).toMatchObject({
      messageId: "assistant-1",
      sourceRole: "assistant",
      title: "deck.pdf",
    });
    expect(byTarget.get("C:/tmp/brief.pdf")).toMatchObject({
      messageId: "assistant-1",
      category: "document",
    });
    expect(byTarget.get("https://example.com/deck.pdf")?.messagePreview).toHaveLength(120);
    expect(byTarget.get("https://example.com/deck.pdf")?.messagePreview.endsWith("...")).toBe(true);
  });

  it("normalizes local file-open paths and distinguishes web URLs from local targets", () => {
    expect(resolveWorkspaceLocalOpenPath("file:///C:/Program%20Files/DragonClaw/demo.png"))
      .toBe("C:/Program Files/DragonClaw/demo.png");
    expect(resolveWorkspaceLocalOpenPath("file:///tmp/demo%20file.txt"))
      .toBe("/tmp/demo file.txt");
    expect(resolveWorkspaceLocalOpenPath("https://example.com/demo.pdf"))
      .toBe("https://example.com/demo.pdf");

    expect(isWorkspaceUrlTarget("https://example.com/demo.pdf")).toBe(true);
    expect(isWorkspaceUrlTarget("file:///tmp/demo.pdf")).toBe(false);
    expect(isWorkspaceUrlTarget("C:/tmp/demo.pdf")).toBe(false);
  });
});
