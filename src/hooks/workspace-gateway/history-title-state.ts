import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type {
  WorkspaceGatewaySessionRow,
  WorkspaceGatewaySessionsListResult,
} from "../../components/workspace-clone/workspaceCloneTypes";
import {
  resolveSessionHistoryTitleDetails,
  sanitizeMeaningfulSessionTitle,
  shouldReplaceSessionHistoryTitle,
} from "./message-normalizers";

type SetHistoryTitleCache = Dispatch<SetStateAction<Record<string, string>>>;

export function applyHistoryTitleCacheUpdate(params: {
  sessionKey: string;
  nextTitle?: string | null;
  setHistoryTitleCache: SetHistoryTitleCache;
}) {
  const nextTitle = params.nextTitle?.trim() || "";
  if (!nextTitle) {
    return;
  }

  params.setHistoryTitleCache((current) => (
    current[params.sessionKey] === nextTitle
      ? current
      : shouldReplaceSessionHistoryTitle(params.sessionKey, current[params.sessionKey], nextTitle)
        ? { ...current, [params.sessionKey]: nextTitle }
        : current
  ));
}

export function writeOptimisticSessionHistoryTitle(params: {
  sessionKey: string;
  agentId: string;
  displayText: string;
  sessionsResult: WorkspaceGatewaySessionsListResult | null;
  historyTitleCacheRef: MutableRefObject<Record<string, string>>;
  sessionHistoryCacheRef: MutableRefObject<Record<string, unknown[]>>;
  setHistoryTitleCache: SetHistoryTitleCache;
  saveSessionHistoryCache: (
    sessionKey: string,
    agentId: string,
    messages: unknown[],
    updatedAt?: number | null,
    title?: string | null,
  ) => Promise<void>;
}) {
  const optimisticTitle = sanitizeMeaningfulSessionTitle(params.displayText);
  if (!params.sessionKey || !params.agentId || !optimisticTitle) {
    return;
  }

  const sessionRow = params.sessionsResult?.sessions.find((session) => session.key === params.sessionKey) ?? null;
  const titleSourceSession: Pick<WorkspaceGatewaySessionRow, "key" | "displayName" | "label"> =
    sessionRow ?? { key: params.sessionKey, displayName: undefined, label: undefined };
  const currentResolvedTitle = resolveSessionHistoryTitleDetails(titleSourceSession, {
    cachedTitle: params.historyTitleCacheRef.current[params.sessionKey],
    memoryMessages: params.sessionHistoryCacheRef.current[params.sessionKey],
  }).title;

  if (!shouldReplaceSessionHistoryTitle(params.sessionKey, currentResolvedTitle, optimisticTitle)) {
    return;
  }

  params.historyTitleCacheRef.current = {
    ...params.historyTitleCacheRef.current,
    [params.sessionKey]: optimisticTitle,
  };
  applyHistoryTitleCacheUpdate({
    sessionKey: params.sessionKey,
    nextTitle: optimisticTitle,
    setHistoryTitleCache: params.setHistoryTitleCache,
  });

  void params.saveSessionHistoryCache(
    params.sessionKey,
    params.agentId,
    params.sessionHistoryCacheRef.current[params.sessionKey] ?? [],
    sessionRow?.updatedAt ?? Date.now(),
    optimisticTitle,
  ).catch(() => undefined);
}
