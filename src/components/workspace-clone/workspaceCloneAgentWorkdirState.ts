import type { WorkspaceEntityType } from "../../types";

const STORAGE_KEY = "dragonclaw.workspace.agent-workdirs.v1";

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function normalizeWorkspaceAgentWorkdirKey(agentId: string) {
  return agentId.trim().toLowerCase();
}

export function normalizeWorkspaceAgentWorkdirPath(workspacePath: string) {
  return workspacePath.trim();
}

export function normalizeWorkspaceAgentWorkdirs(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return {} as Record<string, string>;
  }

  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = normalizeWorkspaceAgentWorkdirKey(key);
    const normalizedValue = typeof value === "string" ? normalizeWorkspaceAgentWorkdirPath(value) : "";
    if (!normalizedKey || !normalizedValue) {
      continue;
    }
    next[normalizedKey] = normalizedValue;
  }

  return next;
}

export function loadWorkspaceAgentWorkdirs() {
  if (!canUseStorage()) {
    return {} as Record<string, string>;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {} as Record<string, string>;
    }
    return normalizeWorkspaceAgentWorkdirs(JSON.parse(raw));
  } catch {
    return {} as Record<string, string>;
  }
}

export function persistWorkspaceAgentWorkdirs(state: Record<string, string>) {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeWorkspaceAgentWorkdirs(state)));
  } catch {
    // Ignore storage failures to avoid blocking chat UX.
  }
}

export function resolveWorkspaceAgentWorkdir(state: Record<string, string>, agentId?: string | null) {
  const normalizedKey = normalizeWorkspaceAgentWorkdirKey(agentId ?? "");
  if (!normalizedKey) {
    return "";
  }

  return state[normalizedKey]?.trim() || "";
}

export function updateWorkspaceAgentWorkdirs(
  state: Record<string, string>,
  agentId: string,
  workspacePath?: string | null,
) {
  const normalizedKey = normalizeWorkspaceAgentWorkdirKey(agentId);
  if (!normalizedKey) {
    return state;
  }

  const normalizedPath = normalizeWorkspaceAgentWorkdirPath(workspacePath ?? "");
  if (!normalizedPath) {
    if (!(normalizedKey in state)) {
      return state;
    }

    const next = { ...state };
    delete next[normalizedKey];
    return next;
  }

  if (state[normalizedKey] === normalizedPath) {
    return state;
  }

  return {
    ...state,
    [normalizedKey]: normalizedPath,
  };
}

export function resolveWorkspaceChatAgentId(options: {
  activeType: WorkspaceEntityType;
  selectedEntityId?: string | null;
  selectedEntityRuntimeAgentId?: string | null;
  selectedAgentId?: string | null;
}) {
  if (options.activeType === "agents") {
    return (options.selectedEntityId?.trim() || options.selectedAgentId?.trim() || "");
  }

  if (options.activeType === "channels") {
    return options.selectedEntityRuntimeAgentId?.trim() || "";
  }

  return "";
}
