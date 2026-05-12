import { describe, expect, it } from "vitest";

import { formatWorkspaceTaskScheduleLine } from "./workspaceCloneTaskScheduleDisplay";

describe("workspaceCloneTaskScheduleDisplay", () => {
  it("formats one-shot schedules and falls back to raw text for invalid values", () => {
    const parsed = formatWorkspaceTaskScheduleLine({
      kind: "at",
      at: "2026-05-12T09:30:00Z",
    });
    expect(parsed).toContain("05/12");
    expect(parsed).toContain("09:30");

    expect(formatWorkspaceTaskScheduleLine({
      kind: "at",
      at: " not-a-date ",
    })).toContain("not-a-date");
  });

  it("formats interval schedules into readable summaries across boundaries", () => {
    expect(formatWorkspaceTaskScheduleLine({ kind: "every", everyMs: 30 * 60 * 1000 })).toContain("30");
    expect(formatWorkspaceTaskScheduleLine({ kind: "every", everyMs: 2 * 60 * 60 * 1000 })).toContain("2");
    expect(formatWorkspaceTaskScheduleLine({ kind: "every", everyMs: 24 * 60 * 60 * 1000 })).toContain("1");
    expect(formatWorkspaceTaskScheduleLine({ kind: "every", everyMs: 0 })).not.toBe("");
  });

  it("summarizes supported cron expressions and preserves unsupported raw cron text", () => {
    const daily = formatWorkspaceTaskScheduleLine({ kind: "cron", expr: "30 9 * * *" });
    expect(daily).toContain("09:30");
    expect(daily).not.toContain("30 9 * * *");

    const weekdayList = formatWorkspaceTaskScheduleLine({ kind: "cron", expr: "0 8 * * MON,WED" });
    expect(weekdayList).toContain("08:00");
    expect(weekdayList).not.toContain("Cron");

    const minuteStep = formatWorkspaceTaskScheduleLine({ kind: "cron", expr: "*/15 * * * *" });
    expect(minuteStep).toContain("15");
    expect(minuteStep).not.toContain("Cron");

    const staggered = formatWorkspaceTaskScheduleLine({
      kind: "cron",
      expr: "0 8 * * *",
      staggerMs: 1000,
    });
    expect(staggered).toContain("Cron");
    expect(staggered).toContain("0 8 * * *");

    const unsupported = formatWorkspaceTaskScheduleLine({ kind: "cron", expr: "0 8 * 1 *" });
    expect(unsupported).toContain("Cron");
    expect(unsupported).toContain("0 8 * 1 *");
  });
});
