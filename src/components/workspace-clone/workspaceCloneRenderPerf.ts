import { useEffect } from "react";

const warnedRenderPhases = new Set<string>();

export function useWorkspaceCloneRenderPerfMark(phase: string, detail?: string) {
  const canMeasure = import.meta.env.DEV && typeof performance !== "undefined";
  const startedAt = canMeasure ? performance.now() : 0;

  if (canMeasure) {
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
