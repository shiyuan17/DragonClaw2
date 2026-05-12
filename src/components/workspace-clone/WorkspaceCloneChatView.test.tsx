import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceCloneChatMessageRow } from "./WorkspaceCloneChatView";
import type { WorkspaceMessage } from "./workspaceCloneTypes";

vi.mock("framer-motion", () => ({
  useReducedMotion: () => false,
}));

function buildMessage(overrides: Partial<WorkspaceMessage>): WorkspaceMessage {
  return {
    id: "message-1",
    role: "user",
    author: "你",
    text: "提供优化聊天执行计划",
    time: "17:50",
    ...overrides,
  };
}

describe("WorkspaceCloneChatMessageRow", () => {
  it("renders user message time outside the bubble content", () => {
    render(
      <WorkspaceCloneChatMessageRow
        message={buildMessage({ commandTag: "/plan" })}
        selectedEntity={null}
        liveSteps={[]}
        onBlankAreaClick={() => undefined}
      />,
    );

    const time = screen.getByText("17:50");
    const content = document.querySelector(".workspace-clone__message-content");

    expect(content).toBeTruthy();
    expect(content?.contains(time)).toBe(false);
    expect(time.closest(".workspace-clone__message-body")).toBeTruthy();
  });
});
