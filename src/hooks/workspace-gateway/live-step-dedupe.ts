import type { WorkspaceLiveStep } from "../../components/workspace-clone/workspaceCloneTypes";
import {
  buildLiveStepOperationKey,
  buildLiveStepSignatureKey,
  buildLiveStepStableKey,
  extractLiveStepStableId,
  isRecord,
  LIVE_STEP_DEDUPE_ENTRY_TTL_MS,
  LIVE_STEP_DEDUPE_WINDOW_MS,
  type WorkspaceGatewayAgentEventPayload,
  type WorkspaceLiveStepDedupeEntry,
  type WorkspaceLiveStepEventSource,
} from "./live-steps";

const LIVE_STEP_DEBUG_ENABLED = import.meta.env.DEV;

function logLiveStepDedupe(event: string, payload: Record<string, unknown>) {
  if (!LIVE_STEP_DEBUG_ENABLED) {
    return;
  }

  console.debug(`[workspace-live-step-dedupe] ${event}`, payload);
}

function pruneExpiredLiveStepDedupeEntries(
  cache: Map<string, WorkspaceLiveStepDedupeEntry>,
  timestampMs: number,
) {
  for (const [key, entry] of cache.entries()) {
    if (Math.abs(timestampMs - entry.timestampMs) > LIVE_STEP_DEDUPE_ENTRY_TTL_MS) {
      cache.delete(key);
    }
  }
}

export function shouldSkipMirroredWorkspaceLiveStep(params: {
  cache: Map<string, WorkspaceLiveStepDedupeEntry>;
  step: WorkspaceLiveStep;
  payload: WorkspaceGatewayAgentEventPayload;
  source: WorkspaceLiveStepEventSource;
  runId: string;
  timestampMs: number;
}) {
  if (params.step.kind === "thinking") {
    return false;
  }

  pruneExpiredLiveStepDedupeEntries(params.cache, params.timestampMs);

  const data = isRecord(params.payload.data) ? params.payload.data : {};
  const stableId = extractLiveStepStableId(data);
  const stableKey = buildLiveStepStableKey(data);
  const operationKey = buildLiveStepOperationKey(params);
  const signatureKey = buildLiveStepSignatureKey(params);
  const previous = (stableKey ? params.cache.get(stableKey) : undefined) ?? params.cache.get(operationKey);
  const withinWindow = previous
    ? Math.abs(params.timestampMs - previous.timestampMs) <= LIVE_STEP_DEDUPE_WINDOW_MS
    : false;
  const shouldReuseCanonicalStepId = Boolean(
    previous && (stableKey || withinWindow || previous.canonicalStepId === params.step.id),
  );

  if (previous && shouldReuseCanonicalStepId && previous.canonicalStepId !== params.step.id) {
    params.step.id = previous.canonicalStepId;
    logLiveStepDedupe("canonicalized-step", {
      source: params.source,
      stableId,
      operationKey,
      signatureKey,
      canonicalStepId: previous.canonicalStepId,
    });
  }

  const nextEntry: WorkspaceLiveStepDedupeEntry = {
    source: params.source,
    timestampMs: params.timestampMs,
    canonicalStepId: previous && shouldReuseCanonicalStepId ? previous.canonicalStepId : params.step.id,
    operationKey,
    signatureKey,
  };

  params.cache.set(operationKey, nextEntry);
  if (stableKey) {
    params.cache.set(stableKey, nextEntry);
  }

  if (previous && previous.signatureKey === signatureKey && withinWindow) {
    logLiveStepDedupe("suppressed-replay", {
      source: params.source,
      stableId,
      operationKey,
      signatureKey,
      previousSource: previous.source,
      canonicalStepId: nextEntry.canonicalStepId,
    });
    return true;
  }

  return false;
}
