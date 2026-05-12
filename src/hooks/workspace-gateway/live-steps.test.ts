import { describe, expect, it, vi } from "vitest";
import type { WorkspaceLiveStep } from "../../components/workspace-clone/workspaceCloneTypes";

vi.mock("./time-formatters", () => ({
  formatClockTime: (timestamp: number) => `t-${timestamp}`,
}));

import {
  buildLiveStepDedupeKey,
  buildLiveStepFromAgentEvent,
  buildLiveStepOperationKey,
  buildLiveStepSignatureKey,
  buildLiveStepStableKey,
  buildPostToolThinkingStep,
  extractLiveStepStableId,
  getPostToolThinkingStepId,
  isTerminalLiveStepStatus,
  normalizeLiveStepSignaturePart,
  updateLiveStepList,
} from "./live-steps";

describe("workspace live steps", () => {
  it("normalizes stable ids and signature fragments", () => {
    expect(extractLiveStepStableId({
      itemId: " item-1 ",
      toolCallId: "tool-1",
      id: "fallback",
    })).toBe("item-1");
    expect(buildLiveStepStableKey({ tool_call_id: " Tool Call " })).toBe("stable:tool call");
    expect(buildLiveStepStableKey({})).toBe("");
    expect(normalizeLiveStepSignaturePart("  HELLO   world  ")).toBe("hello world");
  });

  it("builds thinking, tool, and patch live steps from gateway events", () => {
    const thinkingStep = buildLiveStepFromAgentEvent({
      stream: "lifecycle",
      ts: 1000,
      data: { phase: "start", title: "Thinking..." },
    }, "run-1");
    expect(thinkingStep).toEqual({
      id: "run-1:thinking",
      kind: "thinking",
      status: "running",
      title: "Thinking...",
      detail: undefined,
      time: "t-1000",
    });

    const toolStep = buildLiveStepFromAgentEvent({
      stream: "tool",
      ts: 1010,
      data: {
        tool_call_id: "call-1",
        phase: "end",
        name: "shell",
        args: { command: "pnpm test\n--watch" },
        summary: "finished cleanly",
      },
    }, "run-1");
    expect(toolStep).toMatchObject({
      id: "call-1",
      kind: "command",
      status: "success",
      title: "pnpm test",
      detail: "finished cleanly",
      time: "t-1010",
    });

    const patchStep = buildLiveStepFromAgentEvent({
      stream: "patch",
      ts: 1020,
      data: {
        id: "patch-1",
        title: "Apply patch",
        status: "completed",
        error: "unexpected",
      },
    }, "run-1");
    expect(patchStep).toMatchObject({
      id: "patch-1",
      kind: "patch",
      status: "error",
      title: "Apply patch",
      time: "t-1020",
    });
  });

  it("falls back to Date.now for invalid timestamps and returns null for unsupported streams", () => {
    vi.spyOn(Date, "now").mockReturnValue(555);

    const itemStep = buildLiveStepFromAgentEvent({
      stream: "item",
      ts: "not-a-number",
      data: {
        name: "Search docs",
        kind: "search",
        state: "running",
      },
    }, "run-2");
    expect(itemStep).toMatchObject({
      id: "run-2:Search docs",
      kind: "search",
      status: "running",
      title: "Search docs",
      time: "t-555",
    });

    expect(buildLiveStepFromAgentEvent({ stream: "unknown", data: {} }, "run-2")).toBeNull();
  });

  it("updates live-step lists by merging ids, removing running thinking placeholders, and capping length", () => {
    const current: WorkspaceLiveStep[] = [
      { id: "thinking-running", kind: "thinking", status: "running", title: "Thinking", time: "t-1" },
      { id: "thinking-success", kind: "thinking", status: "success", title: "Done", time: "t-2" },
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `step-${index}`,
        kind: "tool" as const,
        status: "success" as const,
        title: `Step ${index}`,
        time: `t-${index + 3}`,
      })),
    ];

    const merged = updateLiveStepList(current, {
      id: "step-3",
      kind: "tool",
      status: "error",
      title: "Step 3",
      detail: "failed",
      time: "t-99",
    });
    expect(merged.find((step) => step.id === "thinking-running")).toBeUndefined();
    expect(merged.find((step) => step.id === "thinking-success")).toBeDefined();
    expect(merged.find((step) => step.id === "step-3")).toMatchObject({
      status: "error",
      detail: "failed",
      time: "t-99",
    });

    const capped = updateLiveStepList(merged, {
      id: "step-99",
      kind: "tool",
      status: "success",
      title: "Newest",
      time: "t-100",
    });
    expect(capped).toHaveLength(6);
    expect(capped[capped.length - 1]?.id).toBe("step-99");
  });

  it("builds post-tool thinking placeholders and dedupe keys", () => {
    expect(getPostToolThinkingStepId("run-3")).toBe("run-3:post-tool-thinking");
    expect(isTerminalLiveStepStatus("success")).toBe(true);
    expect(isTerminalLiveStepStatus("running")).toBe(false);

    const step = buildPostToolThinkingStep("run-3", 1234);
    expect(step).toEqual({
      id: "run-3:post-tool-thinking",
      kind: "thinking",
      status: "running",
      title: "思考中",
      time: "t-1234",
    });

    const signatureInput = {
      step: {
        id: "tool-1",
        kind: "tool" as const,
        status: "running" as const,
        title: "  Search   Docs ",
        detail: "  Query   terms ",
        time: "t-1",
      },
      payload: {
        sessionKey: " Agent:Ops:Main ",
      },
      runId: "run-3",
    };

    expect(buildLiveStepOperationKey(signatureInput)).toBe(
      "operation:tool:search docs:query terms:agent:ops:main",
    );
    expect(buildLiveStepSignatureKey(signatureInput)).toBe(
      "operation:tool:search docs:query terms:agent:ops:main:running",
    );
    expect(buildLiveStepDedupeKey(signatureInput)).toBe(
      "operation:tool:search docs:query terms:agent:ops:main:running",
    );
  });
});
