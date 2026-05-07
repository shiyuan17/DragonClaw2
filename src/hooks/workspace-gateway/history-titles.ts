import { invoke } from "@tauri-apps/api/core";
import type { Dispatch, SetStateAction } from "react";

import type {
  WorkspaceChatSessionCacheRow,
  WorkspaceChatSessionCacheSummary,
  WorkspaceGatewaySessionsListResult,
} from "../../components/workspace-clone/workspaceCloneTypes";
import { filterAgentSessions } from "./client";
import {
  resolveSessionHistoryTitleDetails,
  sanitizeMeaningfulSessionTitle,
} from "./message-normalizers";
import { parseCachedMessagesJson, sortSessionsByUpdatedAt } from "./session-cache";

export async function loadWorkspaceHistoryTitles(params: {
  agentId: string;
  connected: boolean;
  sessionsResult: WorkspaceGatewaySessionsListResult | null;
  sessionKeys?: string[];
  historyTitleFetches: Set<string>;
  setHistoryTitleCache: Dispatch<SetStateAction<Record<string, string>>>;
  loadSessionHistoryMessages: (sessionKey: string, limit?: number) => Promise<unknown[]>;
  loadPersistedSessionHistoryCache: (
    sessionKey: string,
    agentId: string,
  ) => Promise<WorkspaceChatSessionCacheRow | null>;
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
  const cachedRowsBySessionKey = new Map(cachedRows.map((row) => [row.sessionKey, row]));
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
      if (next[row.sessionKey] === cachedTitle) {
        return;
      }

      next[row.sessionKey] = cachedTitle;
      changed = true;
    });

    return changed ? next : current;
  });

  await Promise.all(sessions.map(async (session) => {
    if (targetSessionKeys && !targetSessionKeys.has(session.key)) {
      return;
    }

    if (cachedTitleKeys.has(session.key)) {
      return;
    }

    const persistedRow = await params.loadPersistedSessionHistoryCache(session.key, params.agentId).catch(() => null);
    if (!persistedRow) {
      return;
    }

    const persistedMessages = parseCachedMessagesJson(persistedRow.messagesJson);
    if (persistedMessages.length > 0) {
      params.updateSessionHistoryCache(session.key, persistedMessages);
    }

    const persistedTitle = resolveSessionHistoryTitleDetails(session, {
      cachedTitle: persistedRow.title,
      persistedMessages,
    });

    params.setHistoryTitleCache((current) => (
      current[session.key] === persistedTitle.title
        ? current
        : { ...current, [session.key]: persistedTitle.title }
    ));

    if (persistedTitle.source === "fallback") {
      return;
    }

    cachedTitleKeys.add(session.key);

    if (persistedRow.title?.trim() === persistedTitle.title) {
      return;
    }

    await params.saveSessionHistoryCache(
      session.key,
      params.agentId,
      persistedMessages,
      persistedRow.updatedAt ?? session.updatedAt ?? null,
      persistedTitle.title,
    ).catch(() => undefined);
  }));

  if (!params.connected) {
    return;
  }

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
        const nextTitle = resolveSessionHistoryTitleDetails(session, {
          cachedTitle: cachedRowsBySessionKey.get(session.key)?.title,
          memoryMessages: messages,
        }).title;

        params.setHistoryTitleCache((current) => (
          current[session.key] === nextTitle
            ? current
            : { ...current, [session.key]: nextTitle }
        ));

        params.updateSessionHistoryCache(session.key, messages);
        return params.saveSessionHistoryCache(
          session.key,
          params.agentId,
          messages,
          session.updatedAt ?? null,
          nextTitle ?? cachedRowsBySessionKey.get(session.key)?.title ?? null,
        ).catch(() => undefined);
      })
      .catch(() => undefined)
      .finally(() => {
        params.historyTitleFetches.delete(session.key);
      });
  });
}
