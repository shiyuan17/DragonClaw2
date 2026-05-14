import type { WorkspaceMessage } from "./workspaceCloneTypes";
import type { WorkspaceMessageRenderState } from "./workspaceChatRenderTypes";
import { buildWorkspaceMessageRenderState, getWorkspaceMessageRenderKey } from "./workspaceChatMessageRenderState";

type WorkspaceChatRenderWorkerRequest = {
  type: "render";
  messages: WorkspaceMessage[];
};

type WorkspaceChatRenderWorkerResponse = {
  type: "rendered";
  results: Array<{
    id: string;
    key: string;
    render: WorkspaceMessageRenderState;
  }>;
};

self.onmessage = (event: MessageEvent<WorkspaceChatRenderWorkerRequest>) => {
  if (event.data.type !== "render") {
    return;
  }

  const results = event.data.messages.map((message) => {
    const key = getWorkspaceMessageRenderKey(message);
    return {
      id: message.id,
      key,
      render: buildWorkspaceMessageRenderState(message),
    };
  });

  self.postMessage({
    type: "rendered",
    results,
  } satisfies WorkspaceChatRenderWorkerResponse);
};
