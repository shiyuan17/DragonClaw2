import type { LogEntry } from "../../types";
import type {
  WorkspaceRuntimeLogCategory,
  WorkspaceRuntimeLogCategoryFilter,
  WorkspaceRuntimeLogDetailSection,
  WorkspaceRuntimeLogItem,
  WorkspaceRuntimeLogRawType,
} from "./workspaceCloneTypes";
import { sanitizeReadableText } from "../../utils/text-mojibake";

const SYSTEM_EVENT_PATTERN =
  /(^|\s)\[ws\]|\bgateway\b|\bopenclaw\b|\bservice\b|\bwebsocket\b|\bconnection\b|\bconnected\b|\bconnecting\b|\bdisconnected\b|\bstartup\b|\blaunch\b|\bdiagnostic\b|\bliveness\b|\bheartbeat\b|\blistening\b|\bready\b|\brpc\b|\btoken\b|\bauth\b|\bunauthorized\b|\bport\b|\bremoved\b/i;

const RAW_TYPE_PATTERNS: Array<{ rawType: WorkspaceRuntimeLogRawType; pattern: RegExp }> = [
  { rawType: "skill", pattern: /\bskill(?:_call|_result|s)?\b|\u6280\u80fd(?::?\u8c03\u7528)?/i },
  { rawType: "patch", pattern: /\bapply_patch\b|\bpatch\b/i },
  { rawType: "search", pattern: /\bsearch(?:_query)?\b|\bimage_query\b|\bweb\.search\b/i },
  { rawType: "command", pattern: /\bshell(?:_command)?\b|\bexec\b|\bterminal\b|\bcommand(?:_output)?\b/i },
  { rawType: "approval", pattern: /\bapproval\b|\brequest_user_input\b/i },
  { rawType: "plan", pattern: /\bupdate_plan\b|\bplan\b/i },
  { rawType: "thinking", pattern: /\bthinking\b|\banalysis\b|\u601d\u8003/i },
  { rawType: "tool", pattern: /\btool(?:_call|_result|s)?\b|\brecipient_name\b/i },
];

const CATEGORY_LABELS: Record<WorkspaceRuntimeLogCategory, string> = {
  tool: "\u5de5\u5177\u8c03\u7528",
  skill: "\u6280\u80fd\u8c03\u7528",
  system: "\u7cfb\u7edf\u4e8b\u4ef6",
  other: "\u5176\u4ed6",
};

const RAW_TYPE_LABELS: Record<WorkspaceRuntimeLogRawType, string> = {
  tool: "tool",
  skill: "skill",
  command: "command",
  search: "search",
  plan: "plan",
  approval: "approval",
  patch: "patch",
  thinking: "thinking",
  system: "system-event",
  other: "other",
};

export const WORKSPACE_RUNTIME_LOG_FILTERS: Array<{
  key: WorkspaceRuntimeLogCategoryFilter;
  label: string;
}> = [
  { key: "all", label: "\u5168\u90e8" },
  { key: "tool", label: "\u5de5\u5177" },
  { key: "skill", label: "\u6280\u80fd" },
  { key: "system", label: "\u7cfb\u7edf" },
  { key: "other", label: "\u5176\u4ed6" },
];

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function normalizeInlineText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripAnsiCodes(value: string) {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function stripLeadingTimestamp(value: string) {
  return value.replace(
    /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?\s*/i,
    "",
  ).trim();
}

function buildReadableMessage(value: string) {
  const withoutAnsi = stripAnsiCodes(value);
  const collapsed = normalizeInlineText(withoutAnsi);
  return stripLeadingTimestamp(collapsed) || collapsed;
}

function pickFirstNonEmpty(values: string[]) {
  for (const value of values) {
    const normalized = normalizeInlineText(value);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function resolveRawType(message: string): WorkspaceRuntimeLogRawType {
  for (const candidate of RAW_TYPE_PATTERNS) {
    if (candidate.pattern.test(message)) {
      return candidate.rawType;
    }
  }

  if (SYSTEM_EVENT_PATTERN.test(message)) {
    return "system";
  }

  return "other";
}

function resolveCategory(rawType: WorkspaceRuntimeLogRawType): WorkspaceRuntimeLogCategory {
  if (rawType === "tool" || rawType === "command" || rawType === "search" || rawType === "patch") {
    return "tool";
  }
  if (rawType === "skill") {
    return "skill";
  }
  if (rawType === "system") {
    return "system";
  }
  return "other";
}

function buildTitle(entry: LogEntry, cleanedMessage: string) {
  const primaryLine = buildReadableMessage(cleanedMessage.split("\n", 1)[0] ?? cleanedMessage);
  const humanized = sanitizeReadableText(entry.humanized);

  if (humanized) {
    return truncateText(humanized, 88);
  }

  return truncateText(primaryLine || "\u65e5\u5fd7\u4e8b\u4ef6", 88);
}

function buildSummary(entry: LogEntry, cleanedMessage: string, title: string) {
  const summary = pickFirstNonEmpty([
    sanitizeReadableText(entry.humanized),
    buildReadableMessage(cleanedMessage),
    title,
    "\u65e5\u5fd7\u5185\u5bb9\u4e3a\u7a7a",
  ]);

  return truncateText(summary || "\u65e5\u5fd7\u5185\u5bb9\u4e3a\u7a7a", 220);
}

function buildDetailSections(entry: LogEntry, summary: string): WorkspaceRuntimeLogDetailSection[] {
  const sections: WorkspaceRuntimeLogDetailSection[] = [];
  const humanized = sanitizeReadableText(entry.humanized);

  if (humanized && humanized !== summary) {
    sections.push({
      id: "humanized",
      label: "\u4eba\u8bdd\u6458\u8981",
      content: humanized,
      tone: "summary",
    });
  }

  sections.push({
    id: "raw",
    label: "\u539f\u59cb\u65e5\u5fd7",
    content: entry.message.trim() || "(empty)",
    tone: "raw",
  });

  return sections;
}

export function getWorkspaceRuntimeLogCategoryLabel(category: WorkspaceRuntimeLogCategory) {
  return CATEGORY_LABELS[category];
}

export function getWorkspaceRuntimeLogRawTypeLabel(rawType: WorkspaceRuntimeLogRawType) {
  return RAW_TYPE_LABELS[rawType];
}

export function buildWorkspaceRuntimeLogs(logs: LogEntry[]): WorkspaceRuntimeLogItem[] {
  return logs
    .slice(-120)
    .reverse()
    .map((entry, index) => {
      const cleanedMessage = entry.message.trim();
      const rawType = resolveRawType(cleanedMessage);
      const category = resolveCategory(rawType);
      const title = buildTitle(entry, cleanedMessage);
      const summary = buildSummary(entry, cleanedMessage, title);

      return {
        id: `runtime-log-${logs.length - index}-${entry.time}-${entry.level}`,
        time: entry.time,
        level: entry.level,
        message: entry.message,
        humanized: entry.humanized,
        category,
        rawType,
        title,
        summary,
        detailSections: buildDetailSections(entry, summary),
      };
    });
}

export function filterWorkspaceRuntimeLogs(
  logs: WorkspaceRuntimeLogItem[],
  filter: WorkspaceRuntimeLogCategoryFilter,
) {
  if (filter === "all") {
    return logs;
  }

  return logs.filter((item) => item.category === filter);
}
