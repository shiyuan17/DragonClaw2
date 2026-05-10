import { formatWorkspaceAttachmentSize, getWorkspaceAttachmentDisplayLabel, isWorkspaceImageAttachment } from "./workspaceCloneChatAttachments";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import type { WorkspaceComposerAttachment } from "./workspaceCloneTypes";

function resolveComposerAttachmentIconName(attachment: WorkspaceComposerAttachment) {
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

export function WorkspaceCloneComposerDropzone({
  attachmentCount,
}: {
  attachmentCount: number;
}) {
  const hasAttachments = attachmentCount > 0;
  const title = hasAttachments
    ? "\u62d6\u52a8\u6587\u4ef6\u5230\u6b64\u5904\u7ee7\u7eed\u6dfb\u52a0"
    : "\u62d6\u52a8\u6587\u4ef6\u5230\u6b64\u5904\u4ee5\u4e0a\u4f20";
  const description = hasAttachments
    ? `\u5f53\u524d\u5df2\u9009 ${attachmentCount} \u4e2a\u9644\u4ef6\uff0c\u677e\u624b\u540e\u4f1a\u7ee7\u7eed\u52a0\u5165\u961f\u5217`
    : "\u652f\u6301\u56fe\u7247\u3001\u6587\u6863\u548c\u4ee3\u7801\u6587\u4ef6\uff0c\u53ef\u4e00\u6b21\u9009\u62e9\u591a\u4e2a";

  return (
    <div className="workspace-clone__composer-dropzone">
      <div className="workspace-clone__composer-dropzone-panel">
        <div className="workspace-clone__composer-dropzone-sample" aria-hidden="true">
          <span className="workspace-clone__composer-dropzone-sample-thumb">
            <WorkspaceCloneIcon name="folder" size={18} strokeWidth={1.8} />
          </span>
          <div className="workspace-clone__composer-dropzone-sample-copy">
            <strong>Image / PDF / TS</strong>
            <span>{"\u56fe\u7247\u3001\u6587\u6863\u3001\u4ee3\u7801"}</span>
          </div>
        </div>

        <div className="workspace-clone__composer-dropzone-copy">
          <span className="workspace-clone__composer-dropzone-icon" aria-hidden="true">
            <WorkspaceCloneIcon name="paperclip" size={18} strokeWidth={1.9} />
          </span>
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
      </div>
    </div>
  );
}

export function WorkspaceCloneComposerAttachmentList({
  attachments,
  onRemoveAttachment,
}: {
  attachments: WorkspaceComposerAttachment[];
  onRemoveAttachment: (attachmentId: string) => void;
}) {
  return (
    <div className="workspace-clone__composer-attachments">
      {attachments.map((attachment) => {
        const metaParts = [
          getWorkspaceAttachmentDisplayLabel(attachment.kind),
          formatWorkspaceAttachmentSize(attachment.sizeBytes),
        ].filter(Boolean);

        return (
          <div
            key={attachment.id}
            className={`workspace-clone__composer-attachment-card ${isWorkspaceImageAttachment(attachment) ? "is-image" : "is-file"}`}
          >
            {isWorkspaceImageAttachment(attachment) && attachment.previewUrl ? (
              <div className="workspace-clone__composer-attachment-thumb-shell">
                <img
                  src={attachment.previewUrl}
                  alt={attachment.fileName}
                  className="workspace-clone__composer-attachment-thumb"
                />
              </div>
            ) : (
              <span className="workspace-clone__composer-attachment-file-icon" aria-hidden="true">
                <WorkspaceCloneIcon
                  name={resolveComposerAttachmentIconName(attachment)}
                  size={16}
                  strokeWidth={1.9}
                />
              </span>
            )}

            <div className="workspace-clone__composer-attachment-copy">
              <strong>{attachment.fileName}</strong>
              {metaParts.length > 0 ? <span>{metaParts.join(" / ")}</span> : null}
            </div>

            <button
              type="button"
              className="workspace-clone__composer-attachment-remove"
              onClick={() => onRemoveAttachment(attachment.id)}
              aria-label={`\u79fb\u9664\u9644\u4ef6 ${attachment.fileName}`}
            >
              <WorkspaceCloneIcon name="x" size={12} strokeWidth={2.1} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
