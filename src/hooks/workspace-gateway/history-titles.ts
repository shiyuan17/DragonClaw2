import { invoke } from "@tauri-apps/api/core";
import type { Dispatch, SetStateAction } from "react";

import type {
  WorkspaceChatSessionCacheSummary,
  WorkspaceGatewaySessionsListResult,
} from "../../components/workspace-clone/workspaceCloneTypes";
import { filterAgentSessions } from "./client";
import { extractFirstMeaningfulSessionTitle } from "./message-normalizers";
import { sortSessionsByUpdatedAt } from "./session-cache";

export async function loadWorkspaceHistoryTitles(params: {
  agentId: string;
  connected: boolean;
  sessionsResult: WorkspaceGatewaySessionsListResult | null;
  sessionKeys?: string[];
  historyTitleFetches: Set<string>;
  setHistoryTitleCache: Dispatch<SetStateAction<Record<string, string>>>;
  loadSessionHistoryMessages: (sessionKey: string, limit?: number) => Promise<unknown[]>;
  updateSessionHistoryCache: (sessionKey: string, messages: unknown[]) => void;
  saveSessionHistoryCache: (
    sessionKey: string,
    agentId: string,
    messages: unknown[],
    updatedAt?: number | null,
    title?: string | null,
  ) => Promise<void>;
}) {
  const cachedRows = await invoke<WorkspaceChatSessionCacheSummary[]>("list_workspace_chat_session_cache", {
    agentId: params.agentId,
  }).catch(() => []);
  const cachedTitleKeys = new Set<string>();

  params.setHistoryTitleCache((current) => {
    let changed = false;
    const next = { ...current };

    cachedRows.forEach((row) => {
      const cachedTitle = row.title?.trim();
      if (!cachedTitle) {
        return;
      }

      cachedTitleKeys.add(row.sessionKey);
      if (next[row.sessionKey] === cachedTitle) {
        return;
      }

      next[row.sessionKey] = cachedTitle;
      changed = true;
    });

    return changed ? next : current;
  });

  if (!params.connected) {
    return;
  }

  const targetSessionKeys = params.sessionKeys?.length ? new Set(params.sessionKeys) : null;
  const sessions = sortSessionsByUpdatedAt(filterAgentSessions(params.sessionsResult, params.agentId));

  sessions.forEach((session) => {
    if (targetSessionKeys && !targetSessionKeys.has(session.key)) {
      return;
    }

    if (cachedTitleKeys.has(session.key) || params.historyTitleFetches.has(session.key)) {
      return;
    }

    params.historyTitleFetches.add(session.key);
    void params.loadSessionHistoryMessages(session.key, 40)
      .then((messages) => {
        const nextTitle = extractFirstMeaningfulSessionTitle(messages);
        if (nextTitle) {
          params.setHistoryTitleCache((current) => (
            current[session.key] === nextTitle
              ? current
              : { ...current, [session.key]: nextTitle }
          ));
        }

        params.updateSessionHistoryCache(session.key, messages);
        return params.saveSessionHistoryCache(
          session.key,
          params.agentId,
          messages,
          session.updatedAt ?? null,
          nextTitle ?? cachedRows.find((row) => row.sessionKey === session.key)?.title ?? null,
        ).catch(() => undefined);
      })
      .catch(() => undefined)
      .finally(() => {
        params.historyTitleFetches.delete(session.key);
      });
  });
}
