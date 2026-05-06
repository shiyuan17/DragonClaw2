import type { WorkspaceCronSchedule } from "./workspaceCloneTypes";

const CRON_WEEKDAY_NAMES: Record<string, string> = {
  SUN: "0",
  MON: "1",
  TUE: "2",
  WED: "3",
  THU: "4",
  FRI: "5",
  SAT: "6",
};

const WEEKDAY_LABELS: Record<string, string> = {
  "0": "周日",
  "1": "周一",
  "2": "周二",
  "3": "周三",
  "4": "周四",
  "5": "周五",
  "6": "周六",
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatShortDate(dateValue: string) {
  const match = dateValue.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}/${match[2]}` : dateValue;
}

function extractAtParts(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/,
  );

  if (match) {
    return { dateValue: match[1], timeValue: match[2] };
  }

  const fallbackDate = new Date(trimmed);
  if (Number.isNaN(fallbackDate.getTime())) {
    return null;
  }

  return {
    dateValue: `${fallbackDate.getFullYear()}-${pad2(fallbackDate.getMonth() + 1)}-${pad2(fallbackDate.getDate())}`,
    timeValue: `${pad2(fallbackDate.getHours())}:${pad2(fallbackDate.getMinutes())}`,
  };
}

function parseCronFields(expr: string) {
  const parts = expr.trim().split(/\s+/);
  return parts.length === 5
    ? { minute: parts[0], hour: parts[1], dayOfMonth: parts[2], month: parts[3], dayOfWeek: parts[4] }
    : null;
}

function parseNumericToken(token: string, min: number, max: number) {
  if (!/^\d+$/.test(token)) {
    return null;
  }

  const value = Number(token);
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
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

function formatWeekdayToken(token: string) {
  const labels = token
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .map((part) => {
      if (part.includes("/") ) {
        return null;
      }

      if (part.includes("-")) {
        const [startToken, endToken] = part.split("-");
        const start = normalizeWeekdayToken(startToken ?? "");
        const end = normalizeWeekdayToken(endToken ?? "");
        return start && end ? `${WEEKDAY_LABELS[start]}至${WEEKDAY_LABELS[end]}` : null;
      }

      const weekday = normalizeWeekdayToken(part);
      return weekday ? WEEKDAY_LABELS[weekday] : null;
    })
    .filter((value): value is string => Boolean(value));

  return labels.length > 0 ? labels.join("、") : null;
}

function formatMonthDayToken(token: string) {
  const labels = token
    .split(",")
    .map((part) => part.trim())
    .map((part) => {
      if (part.includes("/") || part.includes("-")) {
        return null;
      }

      const value = parseNumericToken(part, 1, 31);
      return value === null ? null : `${value} 日`;
    })
    .filter((value): value is string => Boolean(value));

  return labels.length > 0 ? labels.join("、") : null;
}

function formatEveryInterval(everyMs: number) {
  if (!Number.isFinite(everyMs) || everyMs <= 0) {
    return "固定间隔";
  }

  const totalMinutes = everyMs / 60000;
  if (Number.isInteger(totalMinutes) && totalMinutes < 60) {
    return `每 ${totalMinutes} 分钟`;
  }

  const totalHours = everyMs / 3600000;
  if (Number.isInteger(totalHours) && totalHours < 24) {
    return `每 ${totalHours} 小时`;
  }

  const totalDays = everyMs / 86400000;
  if (Number.isInteger(totalDays)) {
    return `每 ${totalDays} 天`;
  }

  return `每 ${Math.round(everyMs / 1000)} 秒`;
}

function formatCronExpressionSummary(expr: string) {
  const cron = parseCronFields(expr);
  if (!cron || cron.month !== "*") {
    return null;
  }

  const hour = parseNumericToken(cron.hour, 0, 23);
  const minute = parseNumericToken(cron.minute, 0, 59);
  const timeValue = hour !== null && minute !== null ? `${pad2(hour)}:${pad2(minute)}` : "";

  if (hour !== null && minute !== null) {
    if (cron.dayOfMonth === "*" && cron.dayOfWeek === "*") {
      return `每天 ${timeValue}`;
    }

    if (cron.dayOfMonth === "*") {
      const weekdayText = formatWeekdayToken(cron.dayOfWeek);
      if (weekdayText) {
        return `每${weekdayText} ${timeValue}`;
      }
    }

    if (cron.dayOfWeek === "*") {
      const monthDayText = formatMonthDayToken(cron.dayOfMonth);
      if (monthDayText) {
        return `每月 ${monthDayText} ${timeValue}`;
      }
    }
  }

  const minuteStep = /^\*\/(\d+)$/.exec(cron.minute)?.[1];
  if (minuteStep && cron.hour === "*" && cron.dayOfMonth === "*" && cron.month === "*" && cron.dayOfWeek === "*") {
    return `每 ${Number(minuteStep)} 分钟`;
  }

  const hourStep = /^\*\/(\d+)$/.exec(cron.hour)?.[1];
  if (hourStep && minute !== null && cron.dayOfMonth === "*" && cron.month === "*" && cron.dayOfWeek === "*") {
    return minute === 0 ? `每 ${Number(hourStep)} 小时` : `每 ${Number(hourStep)} 小时 ${pad2(minute)} 分`;
  }

  if (hour === null && minute !== null && cron.hour === "*" && cron.dayOfMonth === "*" && cron.month === "*" && cron.dayOfWeek === "*") {
    return `每小时 ${pad2(minute)} 分`;
  }

  return null;
}

export function formatWorkspaceTaskScheduleLine(schedule: WorkspaceCronSchedule) {
  if (schedule.kind === "at") {
    const parts = extractAtParts(schedule.at);
    return parts
      ? `单次 · ${formatShortDate(parts.dateValue)} ${parts.timeValue}`
      : `单次 · ${schedule.at.trim()}`;
  }

  if (schedule.kind === "every") {
    return formatEveryInterval(schedule.everyMs);
  }

  if (schedule.staggerMs) {
    return `Cron · ${schedule.expr.trim()}`;
  }

  return formatCronExpressionSummary(schedule.expr) ?? `Cron · ${schedule.expr.trim()}`;
}
