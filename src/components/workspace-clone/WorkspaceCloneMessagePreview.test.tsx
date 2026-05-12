import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
