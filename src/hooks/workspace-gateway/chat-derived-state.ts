import { isWorkspaceRawProcessEcho } from "../../components/workspace-clone/workspaceCloneMessageVisibility";
import type {
  WorkspaceGatewayAgentRow,
  WorkspaceGatewaySessionsListResult,
  WorkspaceHistoryItem,
  WorkspaceMessage,
} from "../../components/workspace-clone/workspaceCloneTypes";
import type { WorkspaceTaskRunSession } from "./task-run-sessions";
import { buildSessionHistoryItem, normalizeGatewayMessage, resolveSessionHistoryTitleDetails } from "./message-normalizers";
import { buildTaskRunHistoryItem } from "./task-run-sessions";
import { filterAgentSessions } from "./client";
import { sortSessionsByUpdatedAt } from "./session-cache";
import type { WorkspaceStartupPreviewState } from "./startup-preview";

export function buildWorkspaceHistoryItems(params: {
  currentSessionKey: string;
  historyTitleCache: Record<string, string>;
  selectedAgentId: string;
  sessionHistoryCache: Record<string, unknown[]>;
  sessionsResult: WorkspaceGatewaySessionsListResult | null;
  taskRunSessions: Record<string, WorkspaceTaskRunSession>;
}): WorkspaceHistoryItem[] {
  if (!params.selectedAgentId) {
    return [];
  }

  const taskRunHistoryItems = Object.values(params.taskRunSessions)
    .filter((session) => session.agentId === params.selectedAgentId)
    .map((session) => {
      const boundSessionUpdatedAt = session.boundSessionKey
        ? params.sessionsResult?.sessions.find((gatewaySession) => gatewaySession.key === session.boundSessionKey)?.updatedAt ?? null
        : null;
      return buildTaskRunHistoryItem(session, params.currentSessionKey, boundSessionUpdatedAt);
    });
  const hiddenGatewaySessionKeys = new Set(
    taskRunHistoryItems
      .map((item) => item.boundSessionKey?.trim() || "")
      .filter(Boolean),
  );
  const gatewayHistoryItems = filterAgentSessions(params.sessionsResult, params.selectedAgentId)
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
    .filter((session) => !hiddenGatewaySessionKeys.has(session.key))
    .map((session) => {
      const resolvedTitle = resolveSessionHistoryTitleDetails(session, {
        cachedTitle: params.historyTitleCache[session.key],
        memoryMessages: params.sessionHistoryCache[session.key],
      });
      const item = buildSessionHistoryItem(session, {
        cachedTitle: resolvedTitle.title,
        memoryMessages: params.sessionHistoryCache[session.key],
        currentSessionKey: params.currentSessionKey,
      });
      return import.meta.env.DEV ? { ...item, _historyTitleSource: resolvedTitle.source } : item;
    });

  return [...taskRunHistoryItems, ...gatewayHistoryItems]
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
}

export function buildWorkspaceNormalizedHistoryMessages(params: {
  displayedHistorySessionKey: string;
  resolveAssistantAuthor: (sessionKey?: string | null) => string;
  sessionHistoryCache: Record<string, unknown[]>;
  windowLimit?: number;
}): WorkspaceMessage[] {
  const rawMessages = params.displayedHistorySessionKey ? params.sessionHistoryCache[params.displayedHistorySessionKey] ?? [] : [];
  const windowedMessages = params.windowLimit && rawMessages.length > params.windowLimit
    ? rawMessages.slice(-params.windowLimit)
    : rawMessages;
  return windowedMessages
    .map((message) => normalizeGatewayMessage(message, params.resolveAssistantAuthor))
    .filter((message): message is WorkspaceMessage => Boolean(message));
}

export function buildWorkspaceStreamMessage(params: {
  activeRunId: string | null;
  currentGatewaySessionKey: string;
  currentSessionKey: string;
  resolveAssistantAuthor: (sessionKey?: string | null) => string;
  streamText: string | null;
}): WorkspaceMessage | null {
  if (!params.activeRunId) {
    return null;
  }

  const nextText = params.streamText?.trim() || "";
  if (nextText && isWorkspaceRawProcessEcho(nextText)) {
    return null;
  }

  return {
    id: `stream-${params.activeRunId}`,
    role: "assistant",
    author: params.resolveAssistantAuthor(params.currentGatewaySessionKey || params.currentSessionKey),
    text: nextText,
    time: "",
    status: "streaming",
  };
}

export function buildWorkspaceMessages(params: {
  currentGatewaySessionKey: string;
  currentTaskRunSystemMessages?: WorkspaceMessage[];
  localSessionMessagesByKey: Record<string, WorkspaceMessage[]>;
  normalizedHistoryMessages: WorkspaceMessage[];
  pendingUserMessage: WorkspaceMessage | null;
  startupPreviewActive: boolean;
  streamMessage: WorkspaceMessage | null;
}): WorkspaceMessage[] {
  const merged = params.startupPreviewActive
    ? [...params.normalizedHistoryMessages]
    : [
      ...(params.currentTaskRunSystemMessages ?? []),
      ...(params.currentGatewaySessionKey ? params.localSessionMessagesByKey[params.currentGatewaySessionKey] ?? [] : []),
      ...params.normalizedHistoryMessages,
    ];
  if (params.pendingUserMessage) {
    merged.push(params.pendingUserMessage);
  }
  if (params.streamMessage) {
    merged.push(params.streamMessage);
  }
  return merged;
}

export function buildWorkspaceAgentLastMessageById(params: {
  agents: WorkspaceGatewayAgentRow[];
  cachedAgentLastMessageById: Record<string, string>;
  sessionSummaryByKey: Record<string, string>;
  sessionsResult: WorkspaceGatewaySessionsListResult | null;
}): Record<string, string> {
  const next = { ...params.cachedAgentLastMessageById };
  const sessionSummaryByKey = new Map(Object.entries(params.sessionSummaryByKey));

  for (const agent of params.agents) {
    const sortedSessionKeys = sortSessionsByUpdatedAt(filterAgentSessions(params.sessionsResult, agent.id))
      .map((session) => session.key);
    const knownSessionKeys = Object.keys(params.sessionSummaryByKey)
      .filter((sessionKey) => sessionKey.startsWith(`agent:${agent.id}:`));
    const sessionKeys = Array.from(new Set([...sortedSessionKeys, ...knownSessionKeys]));

    for (const sessionKey of sessionKeys) {
      const summary = sessionSummaryByKey.get(sessionKey);
      if (summary) {
        next[agent.id] = summary;
        break;
      }
    }
  }

  return next;
}

export function buildWorkspaceStartupPreview(params: {
  historyTitleCache: Record<string, string>;
  sessionHistoryCache: Record<string, unknown[]>;
  sessionsResult: WorkspaceGatewaySessionsListResult | null;
  startupPreviewActive: boolean;
  startupPreviewState: WorkspaceStartupPreviewState | null;
}) {
  if (!params.startupPreviewActive || !params.startupPreviewState) {
    return null;
  }

  const sessionRow = params.sessionsResult?.sessions.find(
    (session) => session.key === params.startupPreviewState?.previewSessionKey,
  ) ?? null;
  const resolvedTitle = resolveSessionHistoryTitleDetails(
    sessionRow ?? { key: params.startupPreviewState.previewSessionKey, displayName: undefined, label: undefined },
    {
      cachedTitle: params.historyTitleCache[params.startupPreviewState.previewSessionKey],
      memoryMessages: params.sessionHistoryCache[params.startupPreviewState.previewSessionKey],
    },
  ).title;

  return {
    previewSessionKey: params.startupPreviewState.previewSessionKey,
    title: resolvedTitle || "最近会话记录",
  };
}
