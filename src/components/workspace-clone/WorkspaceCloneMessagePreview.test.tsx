import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceCloneMessagePreview, resolveWorkspaceMessageDisplayParts } from "./WorkspaceCloneMessagePreview";
import type { WorkspaceMessage } from "./workspaceCloneTypes";

function buildMessage(overrides: Partial<WorkspaceMessage>): WorkspaceMessage {
  return {
    id: "message-1",
    role: "user",
    author: "你",
    text: "",
    time: "",
    ...overrides,
  };
}

describe("WorkspaceCloneMessagePreview", () => {
  it("resolves a command prefix as a display tag and removes it from body content", () => {
    const parts = resolveWorkspaceMessageDisplayParts(buildMessage({
      text: "/plan 给出优化方案",
    }));

    expect(parts).toEqual({
      commandTag: "/plan",
      skillTags: [],
      content: "给出优化方案",
    });
  });

  it("renders command and skill tags for user messages", () => {
    render(<WorkspaceCloneMessagePreview message={buildMessage({
      text: "/plan 给出优化方案",
      commandTag: "/plan",
      skillTags: ["代码审查"],
    })} />);

    expect(screen.getByText("/plan")).toBeTruthy();
    expect(screen.getByText("代码审查")).toBeTruthy();
    expect(screen.getByText("给出优化方案")).toBeTruthy();
  });

  it("renders streaming assistant markdown instead of forcing plain text", () => {
    const { container } = render(<WorkspaceCloneMessagePreview message={buildMessage({
      role: "assistant",
      author: "A",
      status: "streaming",
      text: "**结论**\n\n- 第一项\n- 第二项",
    })} />);

    expect(container.querySelector("strong")?.textContent).toBe("结论");
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("renders incomplete streaming markdown previews tolerantly", () => {
    const { container } = render(<WorkspaceCloneMessagePreview message={buildMessage({
      role: "assistant",
      author: "A",
      status: "streaming",
      text: "```ts\nconst value = 1",
    })} />);

    expect(container.querySelector("pre code")?.textContent).toContain("const value = 1");
  });

  it("formats unfenced path lists as a readable code block", () => {
    const { container } = render(<WorkspaceCloneMessagePreview message={buildMessage({
      role: "assistant",
      author: "A",
      text: [
        "D:\\Github\\DragonClaw2\\src-tauri\\src\\chat_cache.rs",
        "D:\\Github\\DragonClaw2\\src-tauri\\src\\control_ui.rs",
        "D:\\Github\\DragonClaw2\\src-tauri\\src\\openclaw_cli.rs",
      ].join("\n"),
    })} />);

    expect(container.querySelector(".workspace-clone__message-codeblock pre code")?.textContent)
      .toContain("chat_cache.rs");
  });

  it("formats unfenced source snippets as a readable code block", () => {
    const { container } = render(<WorkspaceCloneMessagePreview message={buildMessage({
      role: "assistant",
      author: "A",
      text: [
        "import { invoke } from \"@tauri-apps/api/core\";",
        "import { useEffect, useState } from \"react\";",
        "",
        "export function useExample() {",
        "  const [ready, setReady] = useState(false);",
        "  return ready;",
        "}",
      ].join("\n"),
    })} />);

    expect(container.querySelector(".workspace-clone__message-codeblock.is-ts pre code")?.textContent)
      .toContain("useExample");
  });

  it("renders fenced code with language chrome and copy action", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<WorkspaceCloneMessagePreview message={buildMessage({
      role: "assistant",
      author: "A",
      text: "```ts\nconst value = 1;\n```",
    })} />);

    expect(screen.getByText("ts")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy ts code" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("const value = 1;");
    });
  });

  it("wraps markdown tables in a scroll shell", () => {
    const { container } = render(<WorkspaceCloneMessagePreview message={buildMessage({
      role: "assistant",
      author: "A",
      text: "| Name | Status |\n| --- | --- |\n| DragonClaw | Ready |",
    })} />);

    expect(container.querySelector(".workspace-clone__message-table-shell table")).toBeTruthy();
  });

  it("renders task lists without interactive checkbox inputs", () => {
    const { container } = render(<WorkspaceCloneMessagePreview message={buildMessage({
      role: "assistant",
      author: "A",
      text: "- [x] Done\n- [ ] Pending",
    })} />);

    expect(container.querySelectorAll(".workspace-clone__message-taskbox")).toHaveLength(2);
    expect(container.querySelector("input[type='checkbox']")).toBeNull();
  });

  it("labels mermaid source blocks without rendering diagrams", () => {
    const { container } = render(<WorkspaceCloneMessagePreview message={buildMessage({
      role: "assistant",
      author: "A",
      text: "```mermaid\ngraph TD\n  A --> B\n```",
    })} />);

    expect(screen.getByText("Mermaid")).toBeTruthy();
    expect(container.querySelector(".workspace-clone__message-codeblock.is-mermaid pre code")?.textContent).toContain("graph TD");
  });
});
