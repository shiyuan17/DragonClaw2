import type {
  WorkspaceGatewaySessionsListResult,
  WorkspaceHistoryItem,
} from "../../components/workspace-clone/workspaceCloneTypes";
import { filterAgentSessions } from "./client";
import { buildSessionHistoryItem } from "./message-normalizers";
import { sortSessionsByUpdatedAt } from "./session-cache";

const MAX_AGENT_RECENT_SESSIONS = 7;

export function buildAgentRecentSessionsById(params: {
  agents: Array<{ id: string }>;
  sessionsResult: WorkspaceGatewaySessionsListResult | null;
  historyTitleCache: Record<string, string>;
  sessionHistoryCache: Record<string, unknown[]>;
  currentSessionKey: string;
}) {
  const next: Record<string, WorkspaceHistoryItem[]> = {};

  for (const agent of params.agents) {
    const recentSessions = sortSessionsByUpdatedAt(filterAgentSessions(params.sessionsResult, agent.id))
      .slice(0, MAX_AGENT_RECENT_SESSIONS)
      .map((session) => buildSessionHistoryItem(session, {
        cachedTitle: params.historyTitleCache[session.key],
        memoryMessages: params.sessionHistoryCache[session.key],
        currentSessionKey: params.currentSessionKey,
      }));

    if (recentSessions.length > 0) {
      next[agent.id] = recentSessions;
    }
  }

  return next;
}
