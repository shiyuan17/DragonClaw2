import type { WorkspaceSessionSwitchPerfEntry } from "./thread-view-models";

export function markSessionSwitchPerf(
  entries: Map<string, WorkspaceSessionSwitchPerfEntry>,
  sessionKey: string,
  field: keyof Omit<WorkspaceSessionSwitchPerfEntry, "sessionKey">,
) {
  if (!import.meta.env.DEV || !sessionKey || typeof performance === "undefined") {
    return;
  }
  const now = performance.now();
  performance.mark(`workspace:${field}:${sessionKey}`);
  const entry = entries.get(sessionKey) ?? { sessionKey, clickAt: now };
  entries.set(sessionKey, { ...entry, [field]: now });

  if (field !== "shellCommitAt") {
    if (field === "firstPreviewPaintAt") {
      const totalElapsed = now - entry.clickAt;
      performance.mark(`workspace:session-switch-total-commit:${sessionKey}`);
      if (totalElapsed > 100) {
        console.warn(`[workspace-chat] slow session switch total commit: ${Math.round(totalElapsed)}ms`, sessionKey);
      }
    }
    return;
  }
  const elapsed = now - entry.clickAt;
  if (elapsed > 100) {
    console.warn(`[workspace-chat] slow session shell switch: ${Math.round(elapsed)}ms`, sessionKey);
  }
}
