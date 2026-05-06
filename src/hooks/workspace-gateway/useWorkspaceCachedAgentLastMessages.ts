import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

import type {
  WorkspaceChatSessionCacheRow,
  WorkspaceChatSessionCacheSummary,
  WorkspaceGatewayAgentRow,
} from "../../components/workspace-clone/workspaceCloneTypes";
import { extractLastMeaningfulMessageSummary } from "./message-normalizers";
import { parseCachedMessagesJson } from "./session-cache";

export function useWorkspaceCachedAgentLastMessages(
  agents: WorkspaceGatewayAgentRow[],
  loadPersistedSessionHistoryCache: (sessionKey: string, agentId: string) => Promise<WorkspaceChatSessionCacheRow | null>,
) {
  const [cachedAgentLastMessageById, setCachedAgentLastMessageById] = useState<Record<string, string>>({});

  useEffect(() => {
    if (agents.length === 0) {
      setCachedAgentLastMessageById({});
      return;
    }

    let cancelled = false;

    async function loadAgentLastMessages() {
      const entries = await Promise.all(
        agents.map(async (agent) => {
          const rows = await invoke<WorkspaceChatSessionCacheSummary[]>("list_workspace_chat_session_cache", {
            agentId: agent.id,
          }).catch(() => []);

          const sortedRows = [...rows].sort(
            (left, right) => (right.updatedAt ?? right.cachedAt ?? 0) - (left.updatedAt ?? left.cachedAt ?? 0),
          );

          for (const row of sortedRows) {
            const cachedRow = await loadPersistedSessionHistoryCache(row.sessionKey, agent.id).catch(() => null);
            const summary = cachedRow ? extractLastMeaningfulMessageSummary(parseCachedMessagesJson(cachedRow.messagesJson)) : null;
            if (summary) {
              return [agent.id, summary] as const;
            }
          }

          return [agent.id, ""] as const;
        }),
      );

      if (cancelled) {
        return;
      }

      setCachedAgentLastMessageById((current) => {
        const next = { ...current };
        for (const agent of agents) {
          delete next[agent.id];
        }
        for (const [agentId, summary] of entries) {
          if (summary) {
            next[agentId] = summary;
          }
        }
        return next;
      });
    }

    void loadAgentLastMessages();

    return () => {
      cancelled = true;
    };
  }, [agents, loadPersistedSessionHistoryCache]);

  return cachedAgentLastMessageById;
}
