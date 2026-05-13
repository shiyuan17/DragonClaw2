import { applyHistoryTitleCacheUpdate } from "./history-title-state";
import { resolveStableSessionHistoryTitleDetails } from "./message-normalizers";

export const SESSION_HISTORY_INITIAL_PAGE_LIMIT = 20;
export const SESSION_HISTORY_OLDER_PAGE_LIMIT = 30;
export const SESSION_HISTORY_RENDER_WINDOW_LIMIT = 90;

export interface WorkspaceChatSessionCachePage {
  sessionKey: string;
  agentId: string;
  messages: unknown[];
  total: number;
  startIndex: number | null;
  endIndex: number | null;
  hasMoreBefore: boolean;
  updatedAt?: number | null;
  cachedAt: number;
  title?: string | null;
}

export interface WorkspaceChatSessionCacheCompactRow {
  sessionKey: string;
  agentId: string;
  updatedAt: number | null;
  cachedAt: number;
  title?: string | null;
  lastMessageSummary?: string | null;
  messageCount: number;
  hasMessageRows: boolean;
}

export interface WorkspaceSessionHistoryPageState {
  messages: unknown[];
  oldestIndex: number | null;
  newestIndex: number | null;
  hasMoreBefore: boolean;
  loadingOlder: boolean;
  loadedFromCache: boolean;
  total: number;
}

type SessionHistoryPageStateMap = Record<string, WorkspaceSessionHistoryPageState>;
type StateSetter<T> = (value: T | ((current: T) => T)) => void;
type RefValue<T> = { current: T };

interface LoadOlderWorkspaceSessionHistoryPageOptions {
  sessionKey: string;
  selectedAgentId: string;
  historyPageLoadSeqRef: RefValue<number>;
  currentGatewaySessionKeyRef: RefValue<string>;
  currentSessionKeyRef: RefValue<string>;
  sessionHistoryPageStateRef: RefValue<SessionHistoryPageStateMap>;
  sessionHistoryCacheRef: RefValue<Record<string, unknown[]>>;
  resolveSessionContext: (sessionKey: string, fallbackAgentId?: string | null) => {
    agentId: string;
    gatewaySessionKey: string;
  };
  loadPersistedSessionHistoryCachePage: (
    sessionKey: string,
    agentId: string,
    beforeIndex?: number | null,
    limit?: number | null,
  ) => Promise<WorkspaceChatSessionCachePage | null>;
  setSessionHistoryPageStateByKey: StateSetter<SessionHistoryPageStateMap>;
  updateSessionHistoryCache: (sessionKey: string, messages: unknown[]) => void;
}

interface RestoreWorkspaceSessionHistoryPageFromCacheOptions {
  gatewaySessionKey: string;
  agentId: string;
  sessionKey: string;
  requestId: number;
  connectionGeneration?: number;
  sessionRow: { key: string; displayName?: string; label?: string; updatedAt?: number | null } | null;
  historyTitleCacheRef: RefValue<Record<string, string>>;
  loadPersistedSessionHistoryCachePage: (
    sessionKey: string,
    agentId: string,
    beforeIndex?: number | null,
    limit?: number | null,
  ) => Promise<WorkspaceChatSessionCachePage | null>;
  isCurrentHistoryLoad: (
    requestId: number,
    sessionKey: string,
    connectionGeneration?: number,
  ) => boolean;
  updateSessionHistoryCache: (sessionKey: string, messages: unknown[]) => void;
  setSessionHistoryPageStateByKey: StateSetter<SessionHistoryPageStateMap>;
  setHistoryTitleCache: StateSetter<Record<string, string>>;
  saveSessionHistoryCache: (
    sessionKey: string,
    agentId: string,
    messages: unknown[],
    updatedAt?: number | null,
    title?: string | null,
  ) => Promise<void>;
}

export function buildSessionHistoryPageStateFromCachePage(
  page: WorkspaceChatSessionCachePage,
): WorkspaceSessionHistoryPageState {
  return {
    messages: page.messages,
    oldestIndex: page.startIndex,
    newestIndex: page.endIndex,
    hasMoreBefore: page.hasMoreBefore,
    loadingOlder: false,
    loadedFromCache: true,
    total: page.total,
  };
}

export function buildSessionHistoryPageStateFromGatewayMessages(
  messages: unknown[],
  current?: WorkspaceSessionHistoryPageState,
): WorkspaceSessionHistoryPageState {
  const total = Math.max(current?.total ?? messages.length, messages.length);
  const newestIndex = total > 0 ? total - 1 : null;
  const oldestIndex = messages.length > 0 ? Math.max(total - messages.length, 0) : null;
  return {
    messages,
    oldestIndex,
    newestIndex,
    hasMoreBefore: Boolean(current?.hasMoreBefore && oldestIndex !== null && oldestIndex > 0),
    loadingOlder: false,
    loadedFromCache: Boolean(current?.loadedFromCache),
    total,
  };
}

export function mergeOlderSessionHistoryPage(
  currentMessages: unknown[],
  currentState: WorkspaceSessionHistoryPageState | undefined,
  page: WorkspaceChatSessionCachePage,
): { messages: unknown[]; state: WorkspaceSessionHistoryPageState } {
  const messages = [...page.messages, ...currentMessages];
  return {
    messages,
    state: {
      messages,
      oldestIndex: page.startIndex,
      newestIndex: currentState?.newestIndex ?? page.endIndex,
      hasMoreBefore: page.hasMoreBefore,
      loadingOlder: false,
      loadedFromCache: true,
      total: Math.max(currentState?.total ?? 0, page.total),
    },
  };
}

export function setSessionHistoryPageLoading(
  current: Record<string, WorkspaceSessionHistoryPageState>,
  sessionKey: string,
  loadingOlder: boolean,
) {
  const previous = current[sessionKey];
  if (!previous || previous.loadingOlder === loadingOlder) {
    return current;
  }
  return {
    ...current,
    [sessionKey]: {
      ...previous,
      loadingOlder,
    },
  };
}

export async function restoreWorkspaceSessionHistoryPageFromCache({
  gatewaySessionKey,
  agentId,
  sessionKey,
  requestId,
  connectionGeneration,
  sessionRow,
  historyTitleCacheRef,
  loadPersistedSessionHistoryCachePage,
  isCurrentHistoryLoad,
  updateSessionHistoryCache,
  setSessionHistoryPageStateByKey,
  setHistoryTitleCache,
  saveSessionHistoryCache,
}: RestoreWorkspaceSessionHistoryPageFromCacheOptions) {
  try {
    const cachedPage = await loadPersistedSessionHistoryCachePage(gatewaySessionKey, agentId, null, SESSION_HISTORY_INITIAL_PAGE_LIMIT);
    if (!isCurrentHistoryLoad(requestId, sessionKey, connectionGeneration)) {
      return { stale: true, hasAnyCache: false, existingCachedTitle: null };
    }
    if (!cachedPage) {
      return { stale: false, hasAnyCache: false, existingCachedTitle: null };
    }

    const cachedMessages = cachedPage.messages;
    updateSessionHistoryCache(gatewaySessionKey, cachedMessages);
    setSessionHistoryPageStateByKey((current) => ({
      ...current,
      [gatewaySessionKey]: buildSessionHistoryPageStateFromCachePage(cachedPage),
    }));

    const restoredTitle = resolveStableSessionHistoryTitleDetails(sessionRow ?? { key: gatewaySessionKey, displayName: undefined, label: undefined }, {
      currentTitle: historyTitleCacheRef.current[gatewaySessionKey],
      cachedTitle: cachedPage.title,
      persistedMessages: cachedMessages,
    });
    if (restoredTitle.title) {
      applyHistoryTitleCacheUpdate({ sessionKey: gatewaySessionKey, nextTitle: restoredTitle.title, setHistoryTitleCache });
    }
    if (restoredTitle.source !== "fallback" && cachedPage.title?.trim() !== restoredTitle.title) {
      await saveSessionHistoryCache(gatewaySessionKey, agentId, cachedMessages, cachedPage.updatedAt, restoredTitle.title).catch(() => undefined);
    }

    return { stale: false, hasAnyCache: true, existingCachedTitle: restoredTitle.title };
  } catch {
    return { stale: false, hasAnyCache: false, existingCachedTitle: null };
  }
}

export async function loadOlderWorkspaceSessionHistoryPage({
  sessionKey,
  selectedAgentId,
  historyPageLoadSeqRef,
  currentGatewaySessionKeyRef,
  currentSessionKeyRef,
  sessionHistoryPageStateRef,
  sessionHistoryCacheRef,
  resolveSessionContext,
  loadPersistedSessionHistoryCachePage,
  setSessionHistoryPageStateByKey,
  updateSessionHistoryCache,
}: LoadOlderWorkspaceSessionHistoryPageOptions) {
  const context = resolveSessionContext(sessionKey, selectedAgentId);
  const gatewaySessionKey = context.gatewaySessionKey;
  const pageState = gatewaySessionKey ? sessionHistoryPageStateRef.current[gatewaySessionKey] : null;
  if (!gatewaySessionKey || !context.agentId || !pageState?.hasMoreBefore || pageState.loadingOlder || pageState.oldestIndex === null) {
    return false;
  }

  const requestId = ++historyPageLoadSeqRef.current;
  setSessionHistoryPageStateByKey((current) => setSessionHistoryPageLoading(current, gatewaySessionKey, true));
  const page = await loadPersistedSessionHistoryCachePage(gatewaySessionKey, context.agentId, pageState.oldestIndex, SESSION_HISTORY_OLDER_PAGE_LIMIT).catch(() => null);
  if (historyPageLoadSeqRef.current !== requestId || (currentGatewaySessionKeyRef.current || currentSessionKeyRef.current) !== sessionKey) {
    return false;
  }
  if (!page || page.messages.length === 0) {
    setSessionHistoryPageStateByKey((current) => setSessionHistoryPageLoading(current, gatewaySessionKey, false));
    return false;
  }

  const currentMessages = sessionHistoryCacheRef.current[gatewaySessionKey] ?? pageState.messages;
  const merged = mergeOlderSessionHistoryPage(currentMessages, sessionHistoryPageStateRef.current[gatewaySessionKey], page);
  updateSessionHistoryCache(gatewaySessionKey, merged.messages);
  setSessionHistoryPageStateByKey((current) => ({ ...current, [gatewaySessionKey]: merged.state }));
  return true;
}
