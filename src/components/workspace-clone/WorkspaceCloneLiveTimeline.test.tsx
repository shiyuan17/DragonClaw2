import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceCloneLiveTimeline } from "./WorkspaceCloneLiveTimeline";

describe("WorkspaceCloneLiveTimeline", () => {
  it("renders action-aware Codex-style labels and status text", () => {
    render(<WorkspaceCloneLiveTimeline steps={[
      {
        id: "step-1",
        kind: "tool",
        action: "create",
        status: "success",
        title: "report.md",
        time: "17:20",
      },
      {
        id: "step-2",
        kind: "patch",
        action: "edit",
        status: "running",
        title: "app.tsx",
        time: "17:21",
      },
      {
        id: "step-3",
        kind: "command",
        action: "command",
        status: "success",
        title: "npm run build",
        time: "17:22",
      },
    ]} />);

    expect(screen.getByText("已创建")).toBeTruthy();
    expect(screen.getByText("report.md")).toBeTruthy();
    expect(screen.getByText("正在编辑")).toBeTruthy();
    expect(screen.getByLabelText("正在编辑")).toBeTruthy();
    expect(screen.getByText("已运行命令")).toBeTruthy();
    expect(screen.getByText("npm run build")).toBeTruthy();
    expect(screen.getAllByText("已完成")).toHaveLength(2);
  });

  it("keeps tool and command steps in source order as individual rows", () => {
    render(<WorkspaceCloneLiveTimeline steps={[
      {
        id: "step-1",
        kind: "search",
        action: "search",
        status: "success",
        title: "memory_search",
        detail: "DragonClaw2 prior work",
        time: "17:20",
      },
      {
        id: "step-2",
        kind: "tool",
        action: "read",
        status: "success",
        title: "read",
        detail: "from USER.md",
        time: "17:21",
      },
      {
        id: "step-3",
        kind: "command",
        action: "command",
        status: "running",
        title: "npm run build",
        time: "17:22",
      },
    ]} />);

    const rows = [...document.querySelectorAll(".workspace-clone__live-step")];

    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain("memory_search");
    expect(rows[0]?.textContent).toContain("DragonClaw2 prior work");
    expect(rows[0]?.textContent).toContain("已完成");
    expect(rows[0]?.textContent).toContain("17:20");
    expect(rows[1]?.textContent).toContain("read");
    expect(rows[1]?.textContent).toContain("from USER.md");
    expect(rows[1]?.textContent).toContain("已完成");
    expect(rows[1]?.textContent).toContain("17:21");
    expect(rows[2]?.textContent).toContain("npm run build");
  });

  it("aggregates adjacent command rows in the fallback timeline", () => {
    render(<WorkspaceCloneLiveTimeline steps={[
      {
        id: "step-1",
        kind: "command",
        action: "command",
        status: "success",
        title: "exec",
        time: "17:20",
      },
      {
        id: "step-2",
        kind: "command",
        action: "command",
        status: "success",
        title: "exec",
        time: "17:21",
      },
      {
        id: "step-3",
        kind: "search",
        action: "search",
        status: "success",
        title: "workspace",
        time: "17:22",
      },
    ]} />);

    const rows = [...document.querySelectorAll(".workspace-clone__live-step")];

    expect(rows).toHaveLength(2);
    expect(screen.getByText("已运行 2 条命令")).toBeTruthy();
    expect(rows[1]?.textContent).toContain("workspace");
  });

  it("aggregates adjacent read rows in the fallback timeline", () => {
    render(<WorkspaceCloneLiveTimeline steps={[
      {
        id: "step-1",
        kind: "tool",
        action: "read",
        status: "success",
        title: "README.md",
        time: "17:20",
      },
      {
        id: "step-2",
        kind: "tool",
        action: "read",
        status: "success",
        title: "package.json",
        time: "17:21",
      },
      {
        id: "step-3",
        kind: "search",
        action: "search",
        status: "success",
        title: "workspace",
        time: "17:22",
      },
    ]} />);

    const rows = [...document.querySelectorAll(".workspace-clone__live-step")];

    expect(rows).toHaveLength(2);
    expect(screen.getByText("已读取 2 个文件")).toBeTruthy();
    expect(rows[1]?.textContent).toContain("workspace");
  });
});
