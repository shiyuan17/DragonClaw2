import { invoke } from "@tauri-apps/api/core";
import type { Dispatch, SetStateAction } from "react";

import type {
  WorkspaceGatewaySessionsListResult,
} from "../../components/workspace-clone/workspaceCloneTypes";
import { filterAgentSessions } from "./client";
import {
  sanitizeMeaningfulSessionTitle,
  shouldReplaceSessionHistoryTitle,
} from "./message-normalizers";
import { sortSessionsByUpdatedAt } from "./session-cache";
import type { WorkspaceChatSessionCacheCompactRow } from "./session-history-pages";

export async function loadWorkspaceHistoryTitles(params: {
  agentId: string;
  connected: boolean;
  sessionsResult: WorkspaceGatewaySessionsListResult | null;
  getHistoryTitleCache: () => Record<string, string>;
  sessionKeys?: string[];
  historyTitleFetches: Set<string>;
  setHistoryTitleCache: Dispatch<SetStateAction<Record<string, string>>>;
  updateSessionSummary: (sessionKey: string, summary?: string | null) => void;
}) {
  const cachedRows = await invoke<WorkspaceChatSessionCacheCompactRow[]>("list_workspace_chat_session_cache_compact", {
    agentId: params.agentId,
    limit: 20,
  }).catch(() => []);
  const cachedTitleKeys = new Set<string>();
  const targetSessionKeys = params.sessionKeys?.length ? new Set(params.sessionKeys) : null;
  const sessions = sortSessionsByUpdatedAt(filterAgentSessions(params.sessionsResult, params.agentId));

  params.setHistoryTitleCache((current) => {
    let changed = false;
    const next = { ...current };

    cachedRows.forEach((row) => {
      const cachedTitle = sanitizeMeaningfulSessionTitle(row.title);
      if (!cachedTitle) {
        return;
      }

      cachedTitleKeys.add(row.sessionKey);
      if (
        next[row.sessionKey] === cachedTitle
        || !shouldReplaceSessionHistoryTitle(row.sessionKey, next[row.sessionKey], cachedTitle)
      ) {
        return;
      }

      next[row.sessionKey] = cachedTitle;
      changed = true;
    });

    return changed ? next : current;
  });

  cachedRows.forEach((row) => {
    params.updateSessionSummary(row.sessionKey, row.lastMessageSummary);
  });

  sessions.forEach((session) => {
    if (targetSessionKeys && !targetSessionKeys.has(session.key)) {
      return;
    }
    if (cachedTitleKeys.has(session.key) || params.historyTitleFetches.has(session.key)) {
      return;
    }
    cachedTitleKeys.add(session.key);
  });
}

export function loadWorkspaceHistoryTitleBatches(params: {
  agentIds: string[];
  connected: boolean;
  sessionsResult: WorkspaceGatewaySessionsListResult | null;
  sessionKeysByAgentId?: Record<string, string[]>;
  historyTitleFetches: Set<string>;
  historyTitleLoadBatches: Set<string>;
  getHistoryTitleCache: () => Record<string, string>;
  setHistoryTitleCache: Dispatch<SetStateAction<Record<string, string>>>;
  updateSessionSummary: (sessionKey: string, summary?: string | null) => void;
}) {
  void Promise.all(params.agentIds.map((agentId) => {
    const sessionKeys = params.sessionKeysByAgentId?.[agentId]?.filter(Boolean);
    const batchKey = `${agentId}:${sessionKeys?.length ? [...sessionKeys].sort().join("|") : "*"}`;
    if (params.historyTitleLoadBatches.has(batchKey)) {
      return Promise.resolve();
    }

    params.historyTitleLoadBatches.add(batchKey);
    return loadWorkspaceHistoryTitles({
      agentId,
      connected: params.connected,
      sessionsResult: params.sessionsResult,
      getHistoryTitleCache: params.getHistoryTitleCache,
      sessionKeys,
      historyTitleFetches: params.historyTitleFetches,
      setHistoryTitleCache: params.setHistoryTitleCache,
      updateSessionSummary: params.updateSessionSummary,
    }).finally(() => {
      params.historyTitleLoadBatches.delete(batchKey);
    });
  })).catch(() => undefined);
}
