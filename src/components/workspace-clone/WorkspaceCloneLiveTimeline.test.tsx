import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceCloneLiveTimeline } from "./WorkspaceCloneLiveTimeline";

describe("WorkspaceCloneLiveTimeline", () => {
  it("renders compact Chinese labels and status text", () => {
    render(<WorkspaceCloneLiveTimeline steps={[
      {
        id: "step-1",
        kind: "command",
        status: "success",
        title: "npm run build",
        time: "17:20",
      },
    ]} />);

    expect(screen.getByText("执行命令")).toBeTruthy();
    expect(screen.getByText("npm run build")).toBeTruthy();
    expect(screen.getByText("已完成")).toBeTruthy();
  });
});
