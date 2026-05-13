import { invoke } from "@tauri-apps/api/core";

import type { WorkspaceChatSessionCachePage } from "./session-history-pages";
import type { WorkspaceChatSessionRenderPage } from "./thread-view-models";

type FetchMap<T> = Map<string, Promise<T | null>>;

export function loadWorkspaceSessionCachePageWithDedupe(
  fetches: FetchMap<WorkspaceChatSessionCachePage>,
  sessionKey: string,
  agentId: string,
  beforeIndex: number | null | undefined,
  limit: number,
) {
  if (!sessionKey || !agentId) return Promise.resolve(null);
  const key = `${sessionKey}:${beforeIndex ?? "latest"}:${limit}`;
  const existing = fetches.get(key);
  if (existing) return existing;
  const request = invoke<WorkspaceChatSessionCachePage | null>("load_workspace_chat_session_cache_page", { sessionKey, agentId, beforeIndex: beforeIndex ?? null, limit })
    .finally(() => { fetches.delete(key); });
  fetches.set(key, request);
  return request;
}

export function loadWorkspaceSessionRenderPageWithDedupe(
  fetches: FetchMap<WorkspaceChatSessionRenderPage>,
  sessionKey: string,
  agentId: string,
  beforeIndex: number | null | undefined,
  limit: number,
) {
  if (!sessionKey || !agentId) return Promise.resolve(null);
  const key = `${sessionKey}:${beforeIndex ?? "latest"}:${limit}`;
  const existing = fetches.get(key);
  if (existing) return existing;
  const request = invoke<WorkspaceChatSessionRenderPage | null>("load_workspace_chat_session_render_page", { sessionKey, agentId, beforeIndex: beforeIndex ?? null, limit })
    .finally(() => { fetches.delete(key); });
  fetches.set(key, request);
  return request;
}
