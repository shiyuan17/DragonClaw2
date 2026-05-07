import { looksLikeMojibakeText, normalizeVisibleText, sanitizeReadableText } from "../../utils/text-mojibake";
import type { WorkspaceHistoryItem, WorkspaceUtilityPanel } from "./workspaceCloneTypes";

export type WorkspaceHistoryDebugItem = WorkspaceHistoryItem & {
  _historyTitleSource?: string;
};

export const WORKSPACE_DRAWER_TITLES: Record<Exclude<WorkspaceUtilityPanel, null>, string> = {
  history: "\u5386\u53f2\u4f1a\u8bdd",
  files: "\u6587\u4ef6",
  logs: "\u8fd0\u884c\u65e5\u5fd7",
  session: "\u4f1a\u8bdd\u83dc\u5355",
  schedule: "\u4efb\u52a1",
  workbench: "\u5de5\u4f5c\u53f0",
};

export function buildCalendarKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function isMeaningfulHistoryTitle(value: string) {
  return /[A-Za-z0-9\u4E00-\u9FFF]/.test(value);
}

export function normalizeVisibleHistoryTitle(value?: string | null) {
  const directTitle = normalizeVisibleText(value || "");
  if (
    directTitle
    && !/^agent:[^:]+:/.test(directTitle)
    && !looksLikeMojibakeText(directTitle)
    && isMeaningfulHistoryTitle(directTitle)
  ) {
    return directTitle;
  }

  const sanitizedTitle = sanitizeReadableText(value);
  if (
    sanitizedTitle
    && !/^agent:[^:]+:/.test(sanitizedTitle)
    && isMeaningfulHistoryTitle(sanitizedTitle)
  ) {
    return sanitizedTitle;
  }

  return "";
}

export function resolveHistoryCardTitle(item: WorkspaceHistoryItem) {
  const normalized = normalizeVisibleHistoryTitle(item.title);
  if (normalized) {
    return normalized;
  }

  if (item.kind === "task-run") {
    return "\u4efb\u52a1\u8fd0\u884c";
  }

  return item.isMain ? "\u4e3b\u4f1a\u8bdd" : "\u5386\u53f2\u4f1a\u8bdd";
}

export function isHistoryTitleDebugEnabled() {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem("workspace:debug-history-titles") === "1";
}
