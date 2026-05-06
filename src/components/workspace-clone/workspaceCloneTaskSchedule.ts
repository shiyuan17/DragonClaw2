import type { WorkspaceCronSchedule } from "./workspaceCloneTypes";

export type WorkspaceTaskScheduleMode = "once" | "daily" | "weekly" | "monthly" | "advanced";

export interface WorkspaceTaskScheduleView {
  mode: WorkspaceTaskScheduleMode;
  label: string;
  detail: string;
  editable: boolean;
  dateValue: string;
  timeValue: string;
  weekdayValue: string;
  monthDayValue: string;
  atSuffix: string;
  cronTz: string;
  rawSummary: string;
}

export const WORKSPACE_TASK_TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? 0 : 30;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
});

export const WORKSPACE_TASK_WEEKDAY_OPTIONS = [
  { value: "1", label: "周一" },
  { value: "2", label: "周二" },
  { value: "3", label: "周三" },
  { value: "4", label: "周四" },
  { value: "5", label: "周五" },
  { value: "6", label: "周六" },
  { value: "0", label: "周日" },
] as const;

export const WORKSPACE_TASK_MONTHDAY_OPTIONS = Array.from({ length: 31 }, (_, index) => {
  const value = String(index + 1);
  return { value, label: `${value} 日` };
});

const WEEKDAY_LABELS = Object.fromEntries(
  WORKSPACE_TASK_WEEKDAY_OPTIONS.map((option) => [option.value, option.label]),
) as Record<string, string>;

const CRON_WEEKDAY_NAMES: Record<string, string> = {
  SUN: "0",
  MON: "1",
  TUE: "2",
  WED: "3",
  THU: "4",
  FRI: "5",
  SAT: "6",
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function normalizeTimeText(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return trimmed;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return trimmed;
  }

  return `${pad2(hour)}:${pad2(minute)}`;
}

export function isWorkspaceTaskTimeValueValid(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(normalizeTimeText(value));
}

function formatDateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatTimeInputValue(date: Date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function formatShortDate(dateValue: string) {
  const match = dateValue.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!match) {
    return dateValue;
  }

  return `${match[1]}/${match[2]}`;
}

function buildAdvancedScheduleView(rawSummary: string, detail = ""): WorkspaceTaskScheduleView {
  return {
    mode: "advanced",
    label: "高级 Cron 规则",
    detail,
    editable: false,
    dateValue: "",
    timeValue: "",
    weekdayValue: "1",
    monthDayValue: "1",
    atSuffix: "",
    cronTz: "",
    rawSummary,
  };
}

function extractAtParts(value: string) {
  const trimmed = value.trim();
  const directMatch = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/,
  );
  if (directMatch) {
    return {
      dateValue: directMatch[1],
      timeValue: directMatch[2],
      atSuffix: directMatch[3] ?? "",
    };
  }

  const fallbackDate = new Date(trimmed);
  if (Number.isNaN(fallbackDate.getTime())) {
    return null;
  }

  return {
    dateValue: formatDateInputValue(fallbackDate),
    timeValue: formatTimeInputValue(fallbackDate),
    atSuffix: "",
  };
}

function parseCronFields(expr: string) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    return null;
  }

  return {
    minute: parts[0],
    hour: parts[1],
    dayOfMonth: parts[2],
    month: parts[3],
    dayOfWeek: parts[4],
  };
}

function parseNumericToken(token: string, min: number, max: number) {
  if (!/^\d+$/.test(token)) {
    return null;
  }

  const value = Number(token);
  if (!Number.isInteger(value) || value < min || value > max) {
    return null;
  }

  return value;
}

function normalizeWeekdayToken(token: string) {
  const normalized = token.trim().toUpperCase();
  const fromName = CRON_WEEKDAY_NAMES[normalized];
  if (fromName) {
    return fromName;
  }

  const numeric = parseNumericToken(normalized, 0, 7);
  if (numeric === null) {
    return null;
  }

  return numeric === 7 ? "0" : String(numeric);
}

function formatWeekdayValue(value: string) {
  return WEEKDAY_LABELS[value] ?? value;
}

export function resolveWorkspaceTaskScheduleView(schedule: WorkspaceCronSchedule): WorkspaceTaskScheduleView {
  if (schedule.kind === "at") {
    const parts = extractAtParts(schedule.at);
    if (!parts) {
      return buildAdvancedScheduleView("单次任务", schedule.at);
    }

    return {
      mode: "once",
      label: "单次",
      detail: `${formatShortDate(parts.dateValue)} ${parts.timeValue}`,
      editable: true,
      dateValue: parts.dateValue,
      timeValue: parts.timeValue,
      weekdayValue: "1",
      monthDayValue: "1",
      atSuffix: parts.atSuffix,
      cronTz: "",
      rawSummary: schedule.at,
    };
  }

  if (schedule.kind === "every") {
    return buildAdvancedScheduleView("固定间隔任务", "当前规则由固定间隔触发");
  }

  if (schedule.staggerMs) {
    return buildAdvancedScheduleView("高级 Cron 规则", schedule.expr);
  }

  const cron = parseCronFields(schedule.expr);
  if (!cron) {
    return buildAdvancedScheduleView("高级 Cron 规则", schedule.expr);
  }

  const hour = parseNumericToken(cron.hour, 0, 23);
  const minute = parseNumericToken(cron.minute, 0, 59);
  if (hour === null || minute === null) {
    return buildAdvancedScheduleView("高级 Cron 规则", schedule.expr);
  }

  const timeValue = `${pad2(hour)}:${pad2(minute)}`;
  if (cron.month !== "*") {
    return buildAdvancedScheduleView("高级 Cron 规则", schedule.expr);
  }

  if (cron.dayOfMonth === "*" && cron.dayOfWeek === "*") {
    return {
      mode: "daily",
      label: "每天",
      detail: timeValue,
      editable: true,
      dateValue: "",
      timeValue,
      weekdayValue: "1",
      monthDayValue: "1",
      atSuffix: "",
      cronTz: schedule.tz ?? "",
      rawSummary: schedule.expr,
    };
  }

  if (cron.dayOfMonth === "*") {
    const weekdayValue = normalizeWeekdayToken(cron.dayOfWeek);
    if (!weekdayValue) {
      return buildAdvancedScheduleView("高级 Cron 规则", schedule.expr);
    }

    return {
      mode: "weekly",
      label: `每${formatWeekdayValue(weekdayValue)}`,
      detail: timeValue,
      editable: true,
      dateValue: "",
      timeValue,
      weekdayValue,
      monthDayValue: "1",
      atSuffix: "",
      cronTz: schedule.tz ?? "",
      rawSummary: schedule.expr,
    };
  }

  if (cron.dayOfWeek === "*") {
    const monthDay = parseNumericToken(cron.dayOfMonth, 1, 31);
    if (monthDay === null) {
      return buildAdvancedScheduleView("高级 Cron 规则", schedule.expr);
    }

    return {
      mode: "monthly",
      label: `每月 ${monthDay} 日`,
      detail: timeValue,
      editable: true,
      dateValue: "",
      timeValue,
      weekdayValue: "1",
      monthDayValue: String(monthDay),
      atSuffix: "",
      cronTz: schedule.tz ?? "",
      rawSummary: schedule.expr,
    };
  }

  return buildAdvancedScheduleView("高级 Cron 规则", schedule.expr);
}

export function buildWorkspaceTaskScheduleFromView(input: {
  mode: Exclude<WorkspaceTaskScheduleMode, "advanced">;
  dateValue: string;
  timeValue: string;
  weekdayValue: string;
  monthDayValue: string;
  atSuffix?: string;
  cronTz?: string;
}): WorkspaceCronSchedule {
  const timeValue = normalizeTimeText(input.timeValue);
  if (!isWorkspaceTaskTimeValueValid(timeValue)) {
    throw new Error("请输入有效的时间，格式为 HH:mm");
  }

  const [hour, minute] = timeValue.split(":").map(Number);

  switch (input.mode) {
    case "once": {
      if (!input.dateValue.trim()) {
        throw new Error("请选择单次执行日期");
      }

      const suffix = input.atSuffix?.trim() ?? "";
      return {
        kind: "at",
        at: `${input.dateValue}T${pad2(hour)}:${pad2(minute)}:00${suffix}`,
      };
    }
    case "daily":
      return {
        kind: "cron",
        expr: `${minute} ${hour} * * *`,
        tz: input.cronTz?.trim() || undefined,
      };
    case "weekly": {
      const weekdayValue = normalizeWeekdayToken(input.weekdayValue);
      if (!weekdayValue) {
        throw new Error("请选择每周执行的星期");
      }

      return {
        kind: "cron",
        expr: `${minute} ${hour} * * ${weekdayValue}`,
        tz: input.cronTz?.trim() || undefined,
      };
    }
    case "monthly": {
      const monthDay = parseNumericToken(input.monthDayValue, 1, 31);
      if (monthDay === null) {
        throw new Error("请选择每月执行日期");
      }

      return {
        kind: "cron",
        expr: `${minute} ${hour} ${monthDay} * *`,
        tz: input.cronTz?.trim() || undefined,
      };
    }
    default:
      throw new Error("当前执行时间规则暂不支持编辑");
  }
}
