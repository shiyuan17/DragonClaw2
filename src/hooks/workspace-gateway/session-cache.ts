import { createAgentSessionKey } from "./client";
import type { WorkspaceAgentCacheRow, WorkspaceGatewayAgentRow, WorkspaceGatewayAgentsListResult, WorkspaceGatewaySessionRow } from "../../components/workspace-clone/workspaceCloneTypes";

const LEGACY_DEMO_AGENT_NAMES = new Set(["运营协作 Agent", "产品策略 Agent"]);
function isLegacyDemoAgent(agentId: string, name?: string | null) {
  const normalizedId = agentId.trim().toLowerCase();
  if (normalizedId === "ops" || normalizedId === "product") {
    return true;
  }

  return LEGACY_DEMO_AGENT_NAMES.has(name?.trim() || "");
}

export function parseCachedMessagesJson(messagesJson?: string | null) {
  if (!messagesJson?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(messagesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function serializeCachedMessages(messages: unknown[]) {
  try {
    return JSON.stringify(messages);
  } catch {
    return "[]";
  }
}

function parseAgentIdentityJson(identityJson?: string | null) {
  if (!identityJson?.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(identityJson);
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function serializeAgentIdentity(identity?: WorkspaceGatewayAgentRow["identity"]) {
  if (!identity) {
    return null;
  }

  try {
    return JSON.stringify(identity);
  } catch {
    return null;
  }
}

export function buildCachedAgentsResult(rows: WorkspaceAgentCacheRow[]): WorkspaceGatewayAgentsListResult | null {
  const agents = rows
    .filter((row) => !isLegacyDemoAgent(row.agentId, row.name))
    .map<WorkspaceGatewayAgentRow>((row) => ({
      id: row.agentId,
      name: row.name?.trim() || row.agentId,
      identity: parseAgentIdentityJson(row.identityJson) as WorkspaceGatewayAgentRow["identity"],
    }));

  if (agents.length === 0) {
    return null;
  }

  const defaultRow = rows.find((row) => row.isDefault && agents.some((agent) => agent.id === row.agentId));
  const defaultId = defaultRow?.agentId || agents[0].id;
  return {
    defaultId,
    mainKey: createAgentSessionKey(defaultId),
    scope: defaultRow?.scope || rows[0]?.scope || "workspace",
    agents,
  };
}

export function toAgentCachePayload(result: WorkspaceGatewayAgentsListResult) {
  return result.agents
    .filter((agent) => !isLegacyDemoAgent(agent.id, agent.identity?.name || agent.name))
    .map((agent) => ({
      agentId: agent.id,
      name: agent.name || agent.identity?.name || agent.id,
      identityJson: serializeAgentIdentity(agent.identity),
    }));
}

export function sanitizeAgentsResult(result: WorkspaceGatewayAgentsListResult): WorkspaceGatewayAgentsListResult {
  const agents = result.agents.filter((agent) => !isLegacyDemoAgent(agent.id, agent.identity?.name || agent.name));
  const defaultId = agents.some((agent) => agent.id === result.defaultId)
    ? result.defaultId
    : agents[0]?.id || "";

  return {
    ...result,
    defaultId,
    mainKey: defaultId ? createAgentSessionKey(defaultId) : result.mainKey,
    agents,
  };
}

export function sortSessionsByUpdatedAt(sessions: WorkspaceGatewaySessionRow[]) {
  return [...sessions].sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
}
