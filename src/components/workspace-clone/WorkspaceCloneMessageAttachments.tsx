import { memo } from "react";
import {
  formatWorkspaceAttachmentSize,
  getWorkspaceAttachmentDisplayLabel,
  isWorkspaceImageAttachment,
} from "./workspaceCloneChatAttachments";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import type { WorkspaceMessageAttachment } from "./workspaceCloneTypes";

interface WorkspaceCloneMessageAttachmentsProps {
  attachments: WorkspaceMessageAttachment[];
}

function resolveAttachmentIconName(attachment: WorkspaceMessageAttachment) {
  switch (attachment.kind) {
    case "code":
      return "terminal";
    case "document":
    case "text":
      return "notebook";
    case "audio":
      return "voice";
    case "video":
      return "radio";
    default:
      return "paperclip";
  }
}

export const WorkspaceCloneMessageAttachments = memo(function WorkspaceCloneMessageAttachments({
  attachments,
}: WorkspaceCloneMessageAttachmentsProps) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="workspace-clone__message-attachments">
      {attachments.map((attachment) => {
        const metaParts = [
          getWorkspaceAttachmentDisplayLabel(attachment.kind),
          formatWorkspaceAttachmentSize(attachment.sizeBytes),
        ].filter(Boolean);

        if (isWorkspaceImageAttachment(attachment) && attachment.previewUrl) {
          return (
            <figure key={attachment.id} className="workspace-clone__message-attachment workspace-clone__message-attachment--image">
              <div className="workspace-clone__message-attachment-image-shell">
                <img
                  src={attachment.previewUrl}
                  alt={attachment.fileName}
                  className="workspace-clone__message-attachment-image"
                />
              </div>
              <figcaption className="workspace-clone__message-attachment-copy">
                <strong>{attachment.fileName}</strong>
                {metaParts.length > 0 ? <span>{metaParts.join(" · ")}</span> : null}
              </figcaption>
            </figure>
          );
        }

        return (
          <div key={attachment.id} className="workspace-clone__message-attachment workspace-clone__message-attachment--file">
            <span className="workspace-clone__message-attachment-icon" aria-hidden="true">
              <WorkspaceCloneIcon name={resolveAttachmentIconName(attachment)} size={16} strokeWidth={1.9} />
            </span>
            <div className="workspace-clone__message-attachment-copy">
              <strong>{attachment.fileName}</strong>
              {metaParts.length > 0 ? <span>{metaParts.join(" · ")}</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
});
