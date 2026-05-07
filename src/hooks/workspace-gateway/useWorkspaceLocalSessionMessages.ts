import { useCallback, useRef, useState } from "react";

import type { WorkspaceMessage } from "../../components/workspace-clone/workspaceCloneTypes";
import { formatClockTime } from "./time-formatters";

function buildWorkspaceLocalSystemMessage(text: string, createdAt = Date.now()): WorkspaceMessage {
  return {
    id: `workspace-local-system:${createdAt}:${crypto.randomUUID()}`,
    role: "system",
    author: "\u7cfb\u7edf",
    text,
    time: formatClockTime(createdAt),
  };
}

export function useWorkspaceLocalSessionMessages() {
  const [localSessionMessagesByKey, setLocalSessionMessagesByKey] = useState<Record<string, WorkspaceMessage[]>>({});
  const localSessionMessagesByKeyRef = useRef<Record<string, WorkspaceMessage[]>>({});

  const syncLocalSessionMessages = useCallback((next: Record<string, WorkspaceMessage[]>) => {
    localSessionMessagesByKeyRef.current = next;
    setLocalSessionMessagesByKey(next);
  }, []);

  const appendLocalSessionSystemMessage = useCallback((sessionKey: string, text: string) => {
    const normalizedSessionKey = sessionKey.trim();
    if (!normalizedSessionKey || !text.trim()) {
      return;
    }

    const next = {
      ...localSessionMessagesByKeyRef.current,
      [normalizedSessionKey]: [
        ...(localSessionMessagesByKeyRef.current[normalizedSessionKey] ?? []),
        buildWorkspaceLocalSystemMessage(text),
      ],
    };
    syncLocalSessionMessages(next);
  }, [syncLocalSessionMessages]);

  const clearLocalSessionMessages = useCallback((sessionKey: string) => {
    const normalizedSessionKey = sessionKey.trim();
    if (!normalizedSessionKey || !(normalizedSessionKey in localSessionMessagesByKeyRef.current)) {
      return;
    }

    const next = { ...localSessionMessagesByKeyRef.current };
    delete next[normalizedSessionKey];
    syncLocalSessionMessages(next);
  }, [syncLocalSessionMessages]);

  return {
    localSessionMessagesByKey,
    appendLocalSessionSystemMessage,
    clearLocalSessionMessages,
  };
}
