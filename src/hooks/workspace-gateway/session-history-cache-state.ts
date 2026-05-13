import { extractLastMeaningfulMessageSummary } from "./message-normalizers";
import type { WorkspaceSessionHistoryPageState } from "./session-history-pages";

export function applySessionHistoryMessagesUpdate(
  current: Record<string, unknown[]>,
  sessionKey: string,
  messages: unknown[],
) {
  const previous = current[sessionKey];
  if (
    previous === messages
    || (
      previous?.length === messages.length
      && previous.every((message, index) => message === messages[index])
    )
  ) {
    return current;
  }

  return {
    ...current,
    [sessionKey]: messages,
  };
}

export function clearSessionPageState(
  current: Record<string, WorkspaceSessionHistoryPageState>,
  sessionKey: string,
) {
  if (!current[sessionKey]) {
    return current;
  }
  const next = { ...current };
  delete next[sessionKey];
  return next;
}

export function applySessionSummaryUpdate(
  current: Record<string, string>,
  sessionKey: string,
  summary?: string | null,
) {
  const normalized = summary?.trim() || "";
  if (!normalized) {
    if (!current[sessionKey]) {
      return current;
    }
    const next = { ...current };
    delete next[sessionKey];
    return next;
  }

  return current[sessionKey] === normalized ? current : { ...current, [sessionKey]: normalized };
}

export function applySessionMessagesSummaryUpdate(
  current: Record<string, string>,
  sessionKey: string,
  messages: unknown[],
) {
  return applySessionSummaryUpdate(current, sessionKey, extractLastMeaningfulMessageSummary(messages));
}

export function filterSessionHistoryCacheByKeys(
  current: Record<string, unknown[]>,
  allowedSessionKeys: Set<string>,
) {
  let changed = false;
  const next: Record<string, unknown[]> = {};

  for (const [sessionKey, messages] of Object.entries(current)) {
    if (allowedSessionKeys.has(sessionKey)) {
      next[sessionKey] = messages;
      continue;
    }
    changed = true;
  }

  return changed ? next : current;
}

export function filterSessionPageStateByKeys(
  current: Record<string, WorkspaceSessionHistoryPageState>,
  allowedSessionKeys: Set<string>,
) {
  let changed = false;
  const next: Record<string, WorkspaceSessionHistoryPageState> = {};

  for (const [sessionKey, state] of Object.entries(current)) {
    if (allowedSessionKeys.has(sessionKey)) {
      next[sessionKey] = state;
      continue;
    }
    changed = true;
  }

  return changed ? next : current;
}

export function filterSessionSummaryByKeys(
  current: Record<string, string>,
  allowedSessionKeys: Set<string>,
) {
  let changed = false;
  const next: Record<string, string> = {};

  for (const [sessionKey, summary] of Object.entries(current)) {
    if (allowedSessionKeys.has(sessionKey)) {
      next[sessionKey] = summary;
      continue;
    }
    changed = true;
  }

  return changed ? next : current;
}

export function deleteMissingSessionKeys(keys: Set<string>, allowedSessionKeys: Set<string>) {
  keys.forEach((sessionKey) => {
    if (!allowedSessionKeys.has(sessionKey)) {
      keys.delete(sessionKey);
    }
  });
}
