import { createAgentSessionKey } from "./client";
import type { WorkspaceGatewayClient } from "./client";
import type { WorkspaceGatewaySessionsListResult } from "../../components/workspace-clone/workspaceCloneTypes";

interface WorkspaceCreateSessionResult {
  key?: string | null;
}

function isAvailableAgentSessionKey(params: {
  agentId: string;
  sessionKey?: string | null;
  sessionsResult: WorkspaceGatewaySessionsListResult | null;
}) {
  const sessionKey = params.sessionKey?.trim() || "";
  return sessionKey.startsWith(`agent:${params.agentId}:`) && Boolean(
    params.sessionsResult?.sessions.some((session) => session.key === sessionKey),
  );
}

export function resolveWorkspaceSessionCreationParentKey(params: {
  agentId: string;
  preferredParentSessionKey?: string | null;
  currentSessionKey?: string | null;
  sessionsResult: WorkspaceGatewaySessionsListResult | null;
}) {
  const candidates = [
    params.preferredParentSessionKey,
    params.currentSessionKey,
    createAgentSessionKey(params.agentId),
  ];

  return candidates.find((sessionKey) => isAvailableAgentSessionKey({
    agentId: params.agentId,
    sessionKey,
    sessionsResult: params.sessionsResult,
  })) || null;
}

export async function createWorkspaceSession(params: {
  client: WorkspaceGatewayClient;
  agentId: string;
  preferredParentSessionKey?: string | null;
  currentSessionKey?: string | null;
  sessionsResult: WorkspaceGatewaySessionsListResult | null;
  loadSessions: () => Promise<WorkspaceGatewaySessionsListResult | null>;
}) {
  const parentSessionKey = resolveWorkspaceSessionCreationParentKey(params);
  const result = await params.client.request<WorkspaceCreateSessionResult>("sessions.create", {
    agentId: params.agentId,
    ...(parentSessionKey ? { parentSessionKey } : {}),
  });
  const createdKey = typeof result?.key === "string" ? result.key.trim() : "";
  if (!createdKey) {
    throw new Error("sessions.create returned no key");
  }
  await params.loadSessions().catch(() => null);
  return createdKey;
}
