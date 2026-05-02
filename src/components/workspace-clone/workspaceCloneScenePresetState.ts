const STORAGE_KEY = "dragonclaw.workspace.scene-preset-open-state.v1";

export interface WorkspaceCloneScenePresetStateKeyOptions {
  enabled: boolean;
  entityType?: string | null;
  entityId?: string | null;
  sessionId?: string | null;
}

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function normalizeScenePresetOpenState(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const next: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = key.trim();
    if (!normalizedKey || typeof value !== "boolean") {
      continue;
    }
    next[normalizedKey] = value;
  }
  return next;
}

export function buildWorkspaceScenePresetStateKey(options: WorkspaceCloneScenePresetStateKeyOptions) {
  if (!options.enabled) {
    return "";
  }

  return [
    options.entityType ?? "",
    options.entityId ?? "",
    options.sessionId || "__default__",
  ].join(":");
}

export function resolveWorkspaceScenePresetOpenState(state: Record<string, boolean>, key: string) {
  if (!key) {
    return true;
  }

  return state[key] ?? true;
}

export function loadWorkspaceScenePresetOpenState() {
  if (!canUseStorage()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    return normalizeScenePresetOpenState(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function persistWorkspaceScenePresetOpenState(state: Record<string, boolean>) {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeScenePresetOpenState(state)));
  } catch {
    // Ignore storage failures to avoid blocking chat UX.
  }
}

export function updateWorkspaceScenePresetOpenState(
  state: Record<string, boolean>,
  key: string,
  open: boolean,
) {
  if (!key) {
    return state;
  }

  return {
    ...state,
    [key]: open,
  };
}
