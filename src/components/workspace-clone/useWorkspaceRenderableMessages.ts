import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceMessage } from "./workspaceCloneTypes";
import type { WorkspaceMessageRenderState, WorkspaceRenderableMessage } from "./workspaceChatRenderTypes";
import {
  buildWorkspaceMessageRenderState,
  getWorkspaceMessageRenderKey,
} from "./workspaceChatMessageRenderState";

type RenderWorker = Worker & {
  postMessage(message: {
    type: "render";
    messages: WorkspaceMessage[];
  }): void;
};

type RenderWorkerResponse = {
  type: "rendered";
  results: Array<{
    id: string;
    key: string;
    render: WorkspaceMessageRenderState;
  }>;
};

const MAX_RENDER_CACHE_ENTRIES = 300;

function createRenderWorker(): RenderWorker | null {
  if (typeof Worker === "undefined") {
    return null;
  }

  try {
    return new Worker(new URL("./workspaceChatRender.worker.ts", import.meta.url), { type: "module" }) as RenderWorker;
  } catch {
    return null;
  }
}

function pruneRenderCache(cache: Map<string, WorkspaceMessageRenderState>) {
  if (cache.size <= MAX_RENDER_CACHE_ENTRIES) {
    return;
  }

  const deleteCount = cache.size - MAX_RENDER_CACHE_ENTRIES;
  let deleted = 0;
  for (const key of cache.keys()) {
    cache.delete(key);
    deleted += 1;
    if (deleted >= deleteCount) {
      break;
    }
  }
}

export function useWorkspaceRenderableMessages(messages: WorkspaceMessage[]): WorkspaceRenderableMessage[] {
  const cacheRef = useRef(new Map<string, WorkspaceMessageRenderState>());
  const workerRef = useRef<RenderWorker | null>(null);
  const [, setRenderVersion] = useState(0);

  useEffect(() => {
    const worker = createRenderWorker();
    workerRef.current = worker;
    if (!worker) {
      return undefined;
    }

    worker.onmessage = (event: MessageEvent<RenderWorkerResponse>) => {
      if (event.data.type !== "rendered") {
        return;
      }

      let changed = false;
      for (const result of event.data.results) {
        const previous = cacheRef.current.get(result.key);
        if (previous === result.render) {
          continue;
        }
        cacheRef.current.set(result.key, result.render);
        changed = true;
      }
      pruneRenderCache(cacheRef.current);
      if (changed) {
        setRenderVersion((version) => version + 1);
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const renderableMessages = useMemo(() => messages.map((message) => {
    const key = getWorkspaceMessageRenderKey(message);
    let render = cacheRef.current.get(key);
    if (!render) {
      render = buildWorkspaceMessageRenderState(message);
      cacheRef.current.set(key, render);
      pruneRenderCache(cacheRef.current);
    }

    return {
      ...message,
      render,
    };
  }), [messages]);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker || messages.length === 0) {
      return;
    }

    const pending = messages.slice(-80);
    if (pending.length === 0) {
      return;
    }

    if ("requestIdleCallback" in window && "cancelIdleCallback" in window) {
      const idleId = window.requestIdleCallback(() => {
        worker.postMessage({ type: "render", messages: pending });
      }, { timeout: 250 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = globalThis.setTimeout(() => {
      worker.postMessage({ type: "render", messages: pending });
    }, 16);
    return () => globalThis.clearTimeout(timeoutId);
  }, [messages]);

  return renderableMessages;
}
