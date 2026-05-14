import { memo } from "react";
import type { WorkspaceMessage } from "./workspaceCloneTypes";
import type { WorkspaceRenderableMessage } from "./workspaceChatRenderTypes";
import { buildWorkspaceRenderableMessage } from "./workspaceChatMessageRenderState";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import { WorkspaceCloneMessageAttachments } from "./WorkspaceCloneMessageAttachments";
import { WorkspaceCloneMarkdownMessagePreview } from "./WorkspaceCloneMarkdownMessagePreview";

export { resolveWorkspaceMessageDisplayParts } from "./workspaceChatMessageRenderState";

interface WorkspaceCloneMessagePreviewProps {
  message: WorkspaceMessage | WorkspaceRenderableMessage;
}

function WorkspaceMessageTags({ message }: { message: WorkspaceMessage }) {
  const render = "render" in message
    ? (message as WorkspaceRenderableMessage).render
    : buildWorkspaceRenderableMessage(message).render;
  const { commandTag, skillTags } = render;
  if (!commandTag && skillTags.length === 0) {
    return null;
  }

  return (
    <div className="workspace-clone__message-tags" aria-label="消息上下文">
      {commandTag ? (
        <span className="workspace-clone__message-tag is-command">
          <WorkspaceCloneIcon name="terminal" size={12} strokeWidth={2} />
          <span>{commandTag}</span>
        </span>
      ) : null}
      {skillTags.map((tag) => (
        <span key={tag} className="workspace-clone__message-tag is-skill">
          <WorkspaceCloneIcon name="sparkles" size={12} strokeWidth={2} />
          <span>{tag}</span>
        </span>
      ))}
    </div>
  );
}

export const WorkspaceCloneMessagePreview = memo(function WorkspaceCloneMessagePreview({
  message,
}: WorkspaceCloneMessagePreviewProps) {
  const renderable = "render" in message
    ? message as WorkspaceRenderableMessage
    : buildWorkspaceRenderableMessage(message);
  const preview = renderable.render;

  if (preview.hidden) {
    return null;
  }

  const hasTextContent = preview.content.trim().length > 0;
  const attachments = message.attachments ?? [];

  if (preview.previewKind === "json") {
    return (
      <div className="workspace-clone__message-rich workspace-clone__message-rich--json">
        <WorkspaceMessageTags message={message} />
        {hasTextContent ? (
          <pre className="workspace-clone__message-json">
            <code>{preview.content}</code>
          </pre>
        ) : null}
        <WorkspaceCloneMessageAttachments attachments={attachments} />
      </div>
    );
  }

  if (preview.previewKind === "markdown") {
    return (
      <div className="workspace-clone__message-rich workspace-clone__message-rich--markdown">
        <WorkspaceMessageTags message={message} />
        {hasTextContent ? <WorkspaceCloneMarkdownMessagePreview content={preview.content} /> : null}
        <WorkspaceCloneMessageAttachments attachments={attachments} />
      </div>
    );
  }

  return (
    <div className="workspace-clone__message-rich workspace-clone__message-rich--plain">
      <WorkspaceMessageTags message={message} />
      {hasTextContent ? <p>{preview.content}</p> : null}
      <WorkspaceCloneMessageAttachments attachments={attachments} />
    </div>
  );
});
