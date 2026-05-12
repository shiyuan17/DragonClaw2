import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceCronJob, WorkspaceCronRunRecord } from "../../components/workspace-clone/workspaceCloneTypes";
import {
  RUN_RESULT_SESSION_POLL_DELAY_MS,
  buildRunRecordSignature,
  buildRunRecordTimestamp,
  createPendingRunNowBridge,
  getRunSkipNotice,
  getRunSkipTone,
  pollResolvedRunSession,
  resolveNewRunRecord,
} from "./workspaceCronTaskRunHelpers";

function createRun(overrides: Partial<WorkspaceCronRunRecord> = {}): WorkspaceCronRunRecord {
  return {
    action: "finished",
    jobId: "job-1",
    ts: 100,
    ...overrides,
  };
}

function createJob(overrides: Partial<WorkspaceCronJob> = {}): WorkspaceCronJob {
  return {
    id: "job-1",
    name: "每日报告",
    enabled: true,
    createdAtMs: 1,
    updatedAtMs: 2,
    schedule: { kind: "cron", expr: "0 9 * * *", tz: "Asia/Shanghai" },
    sessionTarget: "main",
    wakeMode: "next-heartbeat",
    payload: { kind: "systemEvent", text: "整理日报" },
    state: {},
    ...overrides,
  };
}

describe("workspaceCronTaskRunHelpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds signatures and timestamps defensively", () => {
    expect(buildRunRecordSignature()).toBe("");
    expect(buildRunRecordTimestamp()).toBe(0);
    expect(buildRunRecordSignature(createRun({
      runId: "run-1",
      runAtMs: 120,
      sessionKey: "agent:main:main",
      sessionId: "session-1",
      status: "ok",
    }))).toBe("100:run-1:120:agent:main:main:session-1:ok");
    expect(buildRunRecordTimestamp(createRun({ runAtMs: 120 }))).toBe(120);
  });

  it("matches new runs by run id before falling back to timestamp and signature", () => {
    const previousTopSignature = buildRunRecordSignature(createRun({ runId: "run-0" }));

    expect(resolveNewRunRecord(
      [createRun({ runId: "run-1", sessionKey: "agent:main:main" })],
      previousTopSignature,
      100,
      " run-1 ",
    )?.runId).toBe("run-1");

    expect(resolveNewRunRecord(
      [createRun({ runId: "run-2" })],
      previousTopSignature,
      100,
      "run-missing",
    )).toBeNull();

    expect(resolveNewRunRecord(
      [createRun({ ts: 150, runId: "" })],
      "",
      120,
    )?.ts).toBe(150);

    expect(resolveNewRunRecord(
      [createRun({ runId: "run-0" }), createRun({ runId: "run-3", ts: 160 })],
      previousTopSignature,
      100,
    )?.runId).toBe("run-3");
  });

  it("returns notices and tones for each skip reason", () => {
    expect(getRunSkipNotice("already-running")).toContain("已在运行");
    expect(getRunSkipNotice("invalid-spec")).toContain("配置当前不可执行");
    expect(getRunSkipNotice("not-due")).toContain("未到执行时机");
    expect(getRunSkipTone("already-running")).toBe("warning");
    expect(getRunSkipTone("invalid-spec")).toBe("error");
    expect(getRunSkipTone("not-due")).toBe("info");
  });

  it("polls until a resolved session appears", async () => {
    const loadTaskRuns = vi.fn()
      .mockResolvedValueOnce([createRun({ runId: "run-1" })])
      .mockResolvedValueOnce([createRun({ runId: "run-1", sessionKey: "agent:main:main", sessionId: "session-1" })]);

    const promise = pollResolvedRunSession({
      jobId: "job-1",
      previousTopSignature: "",
      previousLatestTimestamp: 90,
      expectedRunId: "run-1",
      loadTaskRuns,
      isStillActive: () => true,
    });

    await vi.advanceTimersByTimeAsync(RUN_RESULT_SESSION_POLL_DELAY_MS);
    await expect(promise).resolves.toMatchObject({
      sessionKey: "agent:main:main",
      sessionId: "session-1",
      latestRun: expect.objectContaining({ runId: "run-1" }),
    });
    expect(loadTaskRuns).toHaveBeenCalledTimes(2);
  });

  it("returns the terminal run when no session is resolved", async () => {
    const terminalRun = createRun({ runId: "run-2", status: "error", error: "failed" });
    const loadTaskRuns = vi.fn().mockResolvedValue([terminalRun]);

    const promise = pollResolvedRunSession({
      jobId: "job-1",
      previousTopSignature: "",
      previousLatestTimestamp: 90,
      expectedRunId: "run-2",
      loadTaskRuns,
      isStillActive: () => false,
    });

    await expect(promise).resolves.toMatchObject({
      sessionKey: null,
      sessionId: null,
      latestRun: terminalRun,
    });
    expect(loadTaskRuns).toHaveBeenCalledTimes(1);
  });

  it("creates pending bridges with normalized run ids and task display title", () => {
    const bridge = createPendingRunNowBridge({
      job: createJob(),
      agentId: "main",
      enqueued: true,
      previousTopSignature: "prev",
      previousLatestTimestamp: 123,
      runId: " run-3 ",
      message: "任务已进入执行队列",
    });

    expect(bridge).toMatchObject({
      jobId: "job-1",
      agentId: "main",
      runId: "run-3",
      previousTopSignature: "prev",
      previousLatestTimestamp: 123,
      payloadKind: "systemEvent",
      message: "任务已进入执行队列",
    });
    expect(bridge.taskDisplayTitle).toBeTruthy();
  });
});
