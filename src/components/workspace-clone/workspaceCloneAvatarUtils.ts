import type { WorkspaceGatewayAgentIdentity } from "./workspaceCloneTypes";

export const WORKSPACE_CLONE_AVATAR_OVERRIDE_STORAGE_KEY =
  "dragonclaw.workspace.avatar-overrides.v1";

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function normalizeAvatarOverrideKey(agentId: string) {
  return agentId.trim().toLowerCase();
}

export function normalizeWorkspaceAvatarOverrides(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return {} as Record<string, string>;
  }

  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = normalizeAvatarOverrideKey(key);
    const normalizedValue = typeof value === "string" ? value.trim() : "";
    if (!normalizedKey || !normalizedValue) {
      continue;
    }
    next[normalizedKey] = normalizedValue;
  }
  return next;
}

export function loadWorkspaceAvatarOverrides() {
  if (!canUseStorage()) {
    return {} as Record<string, string>;
  }

  try {
    const raw = window.localStorage.getItem(WORKSPACE_CLONE_AVATAR_OVERRIDE_STORAGE_KEY);
    if (!raw) {
      return {} as Record<string, string>;
    }
    return normalizeWorkspaceAvatarOverrides(JSON.parse(raw));
  } catch {
    return {} as Record<string, string>;
  }
}

export function persistWorkspaceAvatarOverrides(state: Record<string, string>) {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(
      WORKSPACE_CLONE_AVATAR_OVERRIDE_STORAGE_KEY,
      JSON.stringify(normalizeWorkspaceAvatarOverrides(state)),
    );
  } catch {
    // Ignore storage failures to avoid blocking chat UX.
  }
}

export function isImageAvatarValue(value?: string | null) {
  const normalized = value?.trim() || "";
  if (!normalized) {
    return false;
  }

  const lower = normalized.toLowerCase();
  return (
    lower.startsWith("data:image/") ||
    lower.startsWith("blob:") ||
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("/") ||
    lower.startsWith("./") ||
    lower.startsWith("../")
  );
}

export function resolveWorkspaceGatewayAvatarUrl(identity?: WorkspaceGatewayAgentIdentity) {
  const explicitUrl = identity?.avatarUrl?.trim() || "";
  if (isImageAvatarValue(explicitUrl)) {
    return explicitUrl;
  }

  const legacyAvatar = identity?.avatar?.trim() || "";
  if (isImageAvatarValue(legacyAvatar)) {
    return legacyAvatar;
  }

  return "";
}

export function resolveWorkspaceAvatarOverride(
  overrides: Record<string, string>,
  agentId?: string | null,
) {
  const normalizedKey = normalizeAvatarOverrideKey(agentId ?? "");
  if (!normalizedKey) {
    return "";
  }

  return overrides[normalizedKey]?.trim() || "";
}

