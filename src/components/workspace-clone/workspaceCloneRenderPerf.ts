import { useEffect } from "react";

const warnedRenderPhases = new Set<string>();
let hasRegisteredLongTaskObserver = false;

function registerWorkspaceLongTaskObserver() {
  if (
    hasRegisteredLongTaskObserver
    || !import.meta.env.DEV
    || typeof PerformanceObserver === "undefined"
  ) {
    return;
  }

  try {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.duration > 100) {
          console.warn(`[workspace-clone] long task: ${Math.round(entry.duration)}ms`, entry.name);
        }
      });
    });
    observer.observe({ entryTypes: ["longtask"] });
    hasRegisteredLongTaskObserver = true;
  } catch {
    hasRegisteredLongTaskObserver = true;
  }
}

export function useWorkspaceCloneRenderPerfMark(phase: string, detail?: string) {
  const canMeasure = import.meta.env.DEV && typeof performance !== "undefined";
  const startedAt = canMeasure ? performance.now() : 0;

  if (canMeasure) {
    registerWorkspaceLongTaskObserver();
    performance.mark(`workspace:${phase}-render-start`);
  }

  useEffect(() => {
    if (!canMeasure) {
      return;
    }

    performance.mark(`workspace:${phase}-render-end`);
    const elapsed = performance.now() - startedAt;
    if (elapsed <= 100 || warnedRenderPhases.has(phase)) {
      return;
    }

    warnedRenderPhases.add(phase);
    console.warn(
      `[workspace-clone] slow ${phase} render commit: ${Math.round(elapsed)}ms`,
      detail,
    );
  });
}
