import { describe, expect, it, vi } from "vitest";
import type { WorkspaceLiveStep } from "../../components/workspace-clone/workspaceCloneTypes";

vi.mock("./time-formatters", () => ({
  formatClockTime: (timestamp: number) => `t-${timestamp}`,
}));

import {
  aggregateAdjacentCommandSteps,
  aggregateLiveTranscriptCommandItems,
  buildThinkingTranscriptItem,
  updateLiveTranscriptWithStep,
} from "./live-transcript";

function commandStep(id: string, status: WorkspaceLiveStep["status"] = "success"): WorkspaceLiveStep {
  return {
    id,
    kind: "command",
    action: "command",
    status,
    title: id,
    time: `t-${id}`,
  };
}

function readStep(id: string, status: WorkspaceLiveStep["status"] = "success"): WorkspaceLiveStep {
  return {
    id,
    kind: "tool",
    action: "read",
    status,
    title: id,
    time: `t-${id}`,
  };
}

describe("workspace live transcript", () => {
  it("keeps only one transient thinking step per run", () => {
    const initial = [buildThinkingTranscriptItem("run-1")];
    const next = updateLiveTranscriptWithStep(initial, {
      id: "run-1:post-tool-thinking",
      kind: "thinking",
      status: "running",
      title: "思考中",
      time: "t-2",
    });

    const thinkingItems = next.filter((item) => item.kind === "step" && item.step.kind === "thinking");

    expect(thinkingItems).toHaveLength(1);
    expect(thinkingItems[0]?.id).toBe("step:run-1:post-tool-thinking");
  });

  it("aggregates adjacent command steps with the same status", () => {
    const aggregated = aggregateAdjacentCommandSteps([
      commandStep("cmd-1"),
      commandStep("cmd-2"),
      { id: "read-1", kind: "tool", action: "read", status: "success", title: "README.md", time: "t-read" },
      commandStep("cmd-3", "running"),
      commandStep("cmd-4", "running"),
    ]);

    expect(aggregated).toHaveLength(3);
    expect(aggregated[0]).toMatchObject({
      action: "command",
      status: "success",
      title: "已运行 2 条命令",
      aggregateCount: 2,
    });
    expect(aggregated[1]?.title).toBe("README.md");
    expect(aggregated[2]).toMatchObject({
      action: "command",
      status: "running",
      title: "正在运行 2 条命令",
      aggregateCount: 2,
    });
  });

  it("aggregates adjacent read steps with the same status without crossing other actions", () => {
    const aggregated = aggregateAdjacentCommandSteps([
      readStep("read-1"),
      readStep("read-2"),
      commandStep("cmd-1"),
      readStep("read-3", "running"),
      readStep("read-4", "running"),
    ]);

    expect(aggregated).toHaveLength(3);
    expect(aggregated[0]).toMatchObject({
      action: "read",
      status: "success",
      title: "已读取 2 个文件",
      aggregateCount: 2,
    });
    expect(aggregated[1]?.title).toBe("cmd-1");
    expect(aggregated[2]).toMatchObject({
      action: "read",
      status: "running",
      title: "正在读取 2 个文件",
      aggregateCount: 2,
    });
  });

  it("lets assistant text break command aggregation", () => {
    const aggregated = aggregateLiveTranscriptCommandItems([
      { id: "step:cmd-1", kind: "step", step: commandStep("cmd-1") },
      { id: "assistant:1", kind: "assistant", text: "done", time: "t-a" },
      { id: "step:cmd-2", kind: "step", step: commandStep("cmd-2") },
      { id: "step:cmd-3", kind: "step", step: commandStep("cmd-3") },
    ]);

    expect(aggregated).toHaveLength(3);
    expect(aggregated[0]).toMatchObject({ kind: "step", step: { title: "cmd-1" } });
    expect(aggregated[1]).toMatchObject({ kind: "assistant", text: "done" });
    expect(aggregated[2]).toMatchObject({
      kind: "step",
      step: {
        title: "已运行 2 条命令",
        aggregateCount: 2,
      },
    });
  });
});
