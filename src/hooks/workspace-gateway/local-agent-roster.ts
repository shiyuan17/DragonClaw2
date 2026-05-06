import { invoke } from "@tauri-apps/api/core";
import type { WorkspaceGatewayAgentsListResult } from "../../components/workspace-clone/workspaceCloneTypes";
import type { AgentInfo } from "../../types";
import { createAgentSessionKey } from "./client";
import { sanitizeAgentsResult, toAgentCachePayload } from "./session-cache";

function buildLocalAgentsResult(
  agentEntries: AgentInfo[],
  existingResult?: WorkspaceGatewayAgentsListResult | null,
): WorkspaceGatewayAgentsListResult | null {
  if (agentEntries.length === 0) {
    return null;
  }

  const existingAgents = new Map((existingResult?.agents ?? []).map((agent) => [agent.id, agent]));
  const agents = agentEntries.map((entry) => {
    const existingAgent = existingAgents.get(entry.name);
    return {
      id: entry.name,
      name: existingAgent?.name?.trim() || entry.name,
      identity: existingAgent?.identity,
    };
  });
  const defaultAgent =
    agentEntries.find((entry) => entry.is_default) ??
    agentEntries.find((entry) => entry.name === "main") ??
    agentEntries[0];
  const defaultId = defaultAgent?.name || agents[0]?.id || "";

  return sanitizeAgentsResult({
    defaultId,
    mainKey: createAgentSessionKey(defaultId),
    scope: existingResult?.scope || "workspace",
    agents,
  });
}

export async function loadLocalAgentRoster(existingResult?: WorkspaceGatewayAgentsListResult | null) {
  const agentEntries = await invoke<AgentInfo[]>("list_agents").catch(() => []);
  const nextResult = buildLocalAgentsResult(agentEntries, existingResult);

  if (nextResult) {
    void invoke("replace_workspace_agent_cache", {
      defaultId: nextResult.defaultId,
      scope: nextResult.scope,
      agents: toAgentCachePayload(nextResult),
    }).catch(() => undefined);
  }

  return nextResult;
}
