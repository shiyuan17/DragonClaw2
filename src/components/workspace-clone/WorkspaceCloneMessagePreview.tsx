import { memo } from "react";
import type { WorkspaceMessage } from "./workspaceCloneTypes";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import { sanitizeWorkspaceAssistantText, shouldHideWorkspaceMessage } from "./workspaceCloneMessageVisibility";
import { WorkspaceCloneMessageAttachments } from "./WorkspaceCloneMessageAttachments";
import { WorkspaceCloneMarkdownMessagePreview } from "./WorkspaceCloneMarkdownMessagePreview";

type WorkspaceMessagePreviewKind = "plain" | "markdown" | "json";

interface WorkspaceCloneMessagePreviewProps {
  message: WorkspaceMessage;
}

const COMMAND_PREFIX_RE = /^(\/[a-z0-9][a-z0-9-]*)(?:\s+([\s\S]*))?$/i;
const WINDOWS_PATH_LINE_RE = /^[A-Za-z]:\\[^\n]+$/;
const CODE_LIKE_LINE_RE =
  /^\s*(?:\/\/|\/\*|\*\/|\*|import\s|export\s|from\s|use\s|type\s|interface\s|class\s|function\s|async\s|const\s|let\s|var\s|return\b|if\s*\(|for\s*\(|while\s*\(|switch\s*\(|try\s*\{|catch\s*\(|await\s|[\]}]\);?|[});,]+)\s*.*$/;

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
    /(^|\n)```[\w-]*[\s\S]*$/m,
    /\[[^\]]+\]\([^)]+\)/,
    /(^|\n)\|.+\|\s*\n\|[-:| ]+\|/m,
    /(^|\n)\|[^|\n]+(?:\|[^|\n]*)+\|?\s*$/m,
    /(^|\n)\s*[-*_]{3,}\s*$/m,
  ].some((pattern) => pattern.test(trimmed));
}

function guessTechnicalBlockLanguage(text: string) {
  if (text.split(/\r?\n/).filter((line) => WINDOWS_PATH_LINE_RE.test(line.trim())).length >= 2) {
    return "text";
  }
  if (/\bfrom\s+["'][^"']+["']|import\s+type\s+\{|\buse[A-Z][A-Za-z0-9]*\(/.test(text)) {
    return "ts";
  }
  if (/\bfn\s+\w+|\buse\s+[a-zA-Z0-9_:]+::|^\s*#\[.+\]/m.test(text)) {
    return "rust";
  }
  return "text";
}

function looksLikeUnfencedTechnicalBlock(text: string) {
  if (/```/.test(text)) {
    return false;
  }

  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return false;
  }

  const technicalLineCount = lines.filter((line) => {
    const trimmed = line.trim();
    return WINDOWS_PATH_LINE_RE.test(trimmed) || CODE_LIKE_LINE_RE.test(trimmed);
  }).length;

  return technicalLineCount >= 2 && technicalLineCount / lines.length >= 0.55;
}

function formatUnfencedTechnicalBlock(text: string) {
  if (!looksLikeUnfencedTechnicalBlock(text)) {
    return text;
  }

  return `\`\`\`${guessTechnicalBlockLanguage(text)}\n${text.trim()}\n\`\`\``;
}

export function resolveWorkspaceMessageDisplayParts(message: WorkspaceMessage): {
  commandTag: string | null;
  skillTags: string[];
  content: string;
} {
  const skillTags = message.skillTags?.map((tag) => tag.trim()).filter(Boolean) ?? [];
  if (message.role !== "user") {
    return {
      commandTag: null,
      skillTags,
      content: message.text,
    };
  }

  const declaredCommandTag = message.commandTag?.trim() || "";
  const match = message.text.trim().match(COMMAND_PREFIX_RE);
  const parsedCommandTag = match?.[1]?.trim() || "";
  const commandTag = declaredCommandTag || parsedCommandTag || null;
  const content = commandTag && parsedCommandTag.toLowerCase() === commandTag.toLowerCase()
    ? match?.[2]?.trim() ?? ""
    : message.text;

  return {
    commandTag,
    skillTags,
    content,
  };
}

function resolvePreview(message: WorkspaceMessage): {
  kind: WorkspaceMessagePreviewKind;
  content: string;
} {
  const displayParts = resolveWorkspaceMessageDisplayParts(message);
  const content =
    message.role === "assistant"
      ? formatUnfencedTechnicalBlock(sanitizeWorkspaceAssistantText(message.text).text)
      : displayParts.content;

  if (message.role !== "assistant") {
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

function WorkspaceMessageTags({ message }: { message: WorkspaceMessage }) {
  const { commandTag, skillTags } = resolveWorkspaceMessageDisplayParts(message);
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
  if (shouldHideWorkspaceMessage(message)) {
    return null;
  }

  const preview = resolvePreview(message);
  const hasTextContent = preview.content.trim().length > 0;
  const attachments = message.attachments ?? [];

  if (preview.kind === "json") {
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

  if (preview.kind === "markdown") {
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
