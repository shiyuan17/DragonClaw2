import { describe, expect, it } from "vitest";

import {
  buildWorkspaceTaskScheduleFromView,
  isWorkspaceTaskTimeValueValid,
  resolveWorkspaceTaskScheduleView,
} from "./workspaceCloneTaskSchedule";

describe("workspaceCloneTaskSchedule", () => {
  it("validates time inputs after normalization", () => {
    expect(isWorkspaceTaskTimeValueValid("00:00")).toBe(true);
    expect(isWorkspaceTaskTimeValueValid(" 9:05 ")).toBe(true);
    expect(isWorkspaceTaskTimeValueValid("23:59")).toBe(true);
    expect(isWorkspaceTaskTimeValueValid("24:00")).toBe(false);
    expect(isWorkspaceTaskTimeValueValid("9:5")).toBe(false);
    expect(isWorkspaceTaskTimeValueValid("12:60")).toBe(false);
  });

  it("resolves once schedules and cron schedules into editable views when possible", () => {
    const once = resolveWorkspaceTaskScheduleView({
      kind: "at",
      at: "2026-05-12T09:30:00+08:00",
    });
    expect(once).toMatchObject({
      mode: "once",
      editable: true,
      dateValue: "2026-05-12",
      timeValue: "09:30",
      atSuffix: "+08:00",
      rawSummary: "2026-05-12T09:30:00+08:00",
    });

    expect(resolveWorkspaceTaskScheduleView({
      kind: "cron",
      expr: "30 9 * * *",
      tz: " Asia/Shanghai ",
    })).toMatchObject({
      mode: "daily",
      editable: true,
      timeValue: "09:30",
      cronTz: " Asia/Shanghai ",
    });

    expect(resolveWorkspaceTaskScheduleView({
      kind: "cron",
      expr: "15 8 * * MON",
    })).toMatchObject({
      mode: "weekly",
      editable: true,
      timeValue: "08:15",
      weekdayValue: "1",
    });

    expect(resolveWorkspaceTaskScheduleView({
      kind: "cron",
      expr: "0 7 * * 7",
    })).toMatchObject({
      mode: "weekly",
      weekdayValue: "0",
    });

    expect(resolveWorkspaceTaskScheduleView({
      kind: "cron",
      expr: "45 6 31 * *",
    })).toMatchObject({
      mode: "monthly",
      monthDayValue: "31",
      timeValue: "06:45",
    });
  });

  it("downgrades unsupported schedules to advanced views without losing raw text", () => {
    expect(resolveWorkspaceTaskScheduleView({
      kind: "at",
      at: "not-a-date",
    })).toMatchObject({
      mode: "advanced",
      editable: false,
      rawSummary: "单次任务",
      detail: "not-a-date",
    });

    expect(resolveWorkspaceTaskScheduleView({
      kind: "every",
      everyMs: 60000,
    })).toMatchObject({
      mode: "advanced",
      editable: false,
    });

    expect(resolveWorkspaceTaskScheduleView({
      kind: "cron",
      expr: "0 8 * 1 *",
    })).toMatchObject({
      mode: "advanced",
      rawSummary: "高级 Cron 规则",
      detail: "0 8 * 1 *",
    });

    expect(resolveWorkspaceTaskScheduleView({
      kind: "cron",
      expr: "bad cron expr",
      staggerMs: 1000,
    })).toMatchObject({
      mode: "advanced",
      rawSummary: "高级 Cron 规则",
      detail: "bad cron expr",
    });
  });

  it("builds once, daily, weekly, and monthly schedules from editable views", () => {
    expect(buildWorkspaceTaskScheduleFromView({
      mode: "once",
      dateValue: "2026-05-12",
      timeValue: "9:05",
      weekdayValue: "1",
      monthDayValue: "1",
      atSuffix: "Z",
    })).toEqual({
      kind: "at",
      at: "2026-05-12T09:05:00Z",
    });

    expect(buildWorkspaceTaskScheduleFromView({
      mode: "daily",
      dateValue: "",
      timeValue: "08:15",
      weekdayValue: "1",
      monthDayValue: "1",
      cronTz: " Asia/Shanghai ",
    })).toEqual({
      kind: "cron",
      expr: "15 8 * * *",
      tz: "Asia/Shanghai",
    });

    expect(buildWorkspaceTaskScheduleFromView({
      mode: "weekly",
      dateValue: "",
      timeValue: "10:30",
      weekdayValue: "MON",
      monthDayValue: "1",
    })).toEqual({
      kind: "cron",
      expr: "30 10 * * 1",
      tz: undefined,
    });

    expect(buildWorkspaceTaskScheduleFromView({
      mode: "monthly",
      dateValue: "",
      timeValue: "23:00",
      weekdayValue: "1",
      monthDayValue: "31",
    })).toEqual({
      kind: "cron",
      expr: "0 23 31 * *",
      tz: undefined,
    });
  });

  it("throws for invalid editable schedule inputs", () => {
    expect(() => buildWorkspaceTaskScheduleFromView({
      mode: "once",
      dateValue: "",
      timeValue: "09:00",
      weekdayValue: "1",
      monthDayValue: "1",
    })).toThrow();

    expect(() => buildWorkspaceTaskScheduleFromView({
      mode: "daily",
      dateValue: "",
      timeValue: "25:00",
      weekdayValue: "1",
      monthDayValue: "1",
    })).toThrow();

    expect(() => buildWorkspaceTaskScheduleFromView({
      mode: "weekly",
      dateValue: "",
      timeValue: "09:00",
      weekdayValue: "FUNDAY",
      monthDayValue: "1",
    })).toThrow();

    expect(() => buildWorkspaceTaskScheduleFromView({
      mode: "monthly",
      dateValue: "",
      timeValue: "09:00",
      weekdayValue: "1",
      monthDayValue: "32",
    })).toThrow();
  });
});
