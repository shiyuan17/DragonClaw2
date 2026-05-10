import { memo } from "react";
import type { WorkspaceMessage } from "./workspaceCloneTypes";
import { sanitizeWorkspaceAssistantText, shouldHideWorkspaceMessage } from "./workspaceCloneMessageVisibility";
import { WorkspaceCloneMessageAttachments } from "./WorkspaceCloneMessageAttachments";
import { WorkspaceCloneMarkdownMessagePreview } from "./WorkspaceCloneMarkdownMessagePreview";

type WorkspaceMessagePreviewKind = "plain" | "markdown" | "json";

interface WorkspaceCloneMessagePreviewProps {
  message: WorkspaceMessage;
}

function tryFormatJsonPreview(text: string) {
  const trimmed = text.trim();
  if (!trimmed || !/^[\[{]/.test(trimmed)) {
    return null;
  }

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
}

function looksLikeMarkdown(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  return [
    /^#{1,6}\s+\S/m,
    /(^|\n)\s*[-*+]\s+\S/m,
    /(^|\n)\s*\d+\.\s+\S/m,
    /\*\*[^*]+\*\*/,
    /(^|\n)>\s+\S/m,
    /`[^`\n]+`/,
    /```[\s\S]*```/,
    /\[[^\]]+\]\([^)]+\)/,
    /(^|\n)\|.+\|\s*\n\|[-:| ]+\|/m,
    /(^|\n)\s*[-*_]{3,}\s*$/m,
  ].some((pattern) => pattern.test(trimmed));
}

function resolvePreview(message: WorkspaceMessage): {
  kind: WorkspaceMessagePreviewKind;
  content: string;
} {
  const content =
    message.role === "assistant"
      ? sanitizeWorkspaceAssistantText(message.text).text
      : message.text;

  if (message.role !== "assistant" || message.status === "streaming") {
    return { kind: "plain", content };
  }

  const formattedJson = tryFormatJsonPreview(content);
  if (formattedJson) {
    return { kind: "json", content: formattedJson };
  }

  if (looksLikeMarkdown(content)) {
    return { kind: "markdown", content };
  }

  return { kind: "plain", content };
}

export const WorkspaceCloneMessagePreview = memo(function WorkspaceCloneMessagePreview({
  message,
}: WorkspaceCloneMessagePreviewProps) {
  if (shouldHideWorkspaceMessage(message)) {
    return null;
  }

  const preview = resolvePreview(message);
  const hasTextContent = preview.content.trim().length > 0;
  const attachments = message.attachments ?? [];

  if (preview.kind === "json") {
    return (
      <div className="workspace-clone__message-rich workspace-clone__message-rich--json">
        {hasTextContent ? (
          <pre className="workspace-clone__message-json">
            <code>{preview.content}</code>
          </pre>
        ) : null}
        <WorkspaceCloneMessageAttachments attachments={attachments} />
      </div>
    );
  }

  if (preview.kind === "markdown") {
    return (
      <div className="workspace-clone__message-rich workspace-clone__message-rich--markdown">
        {hasTextContent ? <WorkspaceCloneMarkdownMessagePreview content={preview.content} /> : null}
        <WorkspaceCloneMessageAttachments attachments={attachments} />
      </div>
    );
  }

  return (
    <div className="workspace-clone__message-rich workspace-clone__message-rich--plain">
      {hasTextContent ? <p>{preview.content}</p> : null}
      <WorkspaceCloneMessageAttachments attachments={attachments} />
    </div>
  );
});
