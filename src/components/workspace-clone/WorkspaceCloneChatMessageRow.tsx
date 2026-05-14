import { memo, type MouseEvent as ReactMouseEvent } from "react";
import type { WorkspaceLiveTranscriptItem } from "../../hooks/workspace-gateway/live-transcript";
import type { WorkspaceEntity, WorkspaceLiveStep, WorkspaceMessage } from "./workspaceCloneTypes";
import type { WorkspaceRenderableMessage } from "./workspaceChatRenderTypes";
import { buildWorkspaceRenderableMessage } from "./workspaceChatMessageRenderState";
import { WorkspaceCloneLiveTimeline } from "./WorkspaceCloneLiveTimeline";
import { WorkspaceCloneMessagePreview } from "./WorkspaceCloneMessagePreview";
import { WorkspaceCloneRunTranscript } from "./WorkspaceCloneRunTranscript";

interface WorkspaceCloneChatMessageRowProps {
  message: WorkspaceMessage | WorkspaceRenderableMessage;
  selectedEntity: WorkspaceEntity | null;
  liveSteps: WorkspaceLiveStep[];
  liveTranscriptItems: WorkspaceLiveTranscriptItem[];
  onBlankAreaClick: (event: ReactMouseEvent<HTMLElement>) => void;
}

function renderAvatarMarker(entity: WorkspaceEntity | null, fallbackLabel: string) {
  if (entity?.avatarUrl) {
    return <img src={entity.avatarUrl} alt="" className="workspace-clone__message-marker-image" />;
  }

  return fallbackLabel;
}

export const WorkspaceCloneChatMessageRow = memo(function WorkspaceCloneChatMessageRow({
  message,
  selectedEntity,
  liveSteps,
  liveTranscriptItems,
  onBlankAreaClick,
}: WorkspaceCloneChatMessageRowProps) {
  const renderableMessage = "render" in message ? message : buildWorkspaceRenderableMessage(message);
  const isStreaming = message.status === "streaming";
  const hasStreamText = message.text.trim().length > 0;
  const hasTranscript = isStreaming && liveTranscriptItems.length > 0;
  const showPreview = !hasTranscript && (!isStreaming || hasStreamText);
  const showMeta = !isStreaming && Boolean(message.time);

  return (
    <article
      className={[
        "workspace-clone__message",
        "workspace-clone__message--chat",
        `is-${message.role}`,
        message.status ? `is-${message.status}` : "",
      ].join(" ").trim()}
      onClick={onBlankAreaClick}
    >
      <div className="workspace-clone__message-marker">
        {message.role === "assistant"
          ? renderAvatarMarker(selectedEntity, message.author)
          : message.author}
      </div>
      <div className="workspace-clone__message-body">
        <div className="workspace-clone__message-content">
          {hasTranscript ? (
            <WorkspaceCloneRunTranscript assistantAuthor={message.author} items={liveTranscriptItems} />
          ) : isStreaming ? (
            <WorkspaceCloneLiveTimeline steps={liveSteps} />
          ) : null}
          {showPreview ? <WorkspaceCloneMessagePreview message={renderableMessage} /> : null}
        </div>
        {showMeta ? <span className="workspace-clone__message-meta">{message.time}</span> : null}
      </div>
    </article>
  );
}, (previousProps, nextProps) => {
  if (previousProps.message !== nextProps.message) {
    return false;
  }
  if (previousProps.onBlankAreaClick !== nextProps.onBlankAreaClick) {
    return false;
  }
  if ((previousProps.selectedEntity?.avatarUrl ?? "") !== (nextProps.selectedEntity?.avatarUrl ?? "")) {
    return false;
  }
  if (previousProps.message.status === "streaming" || nextProps.message.status === "streaming") {
    return previousProps.liveSteps === nextProps.liveSteps
      && previousProps.liveTranscriptItems === nextProps.liveTranscriptItems;
  }
  return true;
});
