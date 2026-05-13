import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

import type {
  WorkspaceGatewayAgentRow,
} from "../../components/workspace-clone/workspaceCloneTypes";
import type { WorkspaceChatSessionCacheCompactRow } from "./session-history-pages";

export function useWorkspaceCachedAgentLastMessages(agents: WorkspaceGatewayAgentRow[]) {
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
          const rows = await invoke<WorkspaceChatSessionCacheCompactRow[]>("list_workspace_chat_session_cache_compact", {
            agentId: agent.id,
            limit: 7,
          }).catch(() => []);

          const sortedRows = [...rows].sort(
            (left, right) => (right.updatedAt ?? right.cachedAt ?? 0) - (left.updatedAt ?? left.cachedAt ?? 0),
          );

          for (const row of sortedRows) {
            if (row.lastMessageSummary) {
              return [agent.id, row.lastMessageSummary] as const;
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
  }, [agents]);

  return cachedAgentLastMessageById;
}
