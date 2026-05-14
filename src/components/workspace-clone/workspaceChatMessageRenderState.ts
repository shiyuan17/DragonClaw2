import type { WorkspaceMessage } from "./workspaceCloneTypes";
import type {
  WorkspaceMessageDisplayParts,
  WorkspaceMessagePreviewKind,
  WorkspaceMessageRenderState,
  WorkspaceRenderableMessage,
} from "./workspaceChatRenderTypes";
import { extractWorkspaceChatFileTargets } from "./workspaceCloneChatFiles";
import { sanitizeWorkspaceAssistantText } from "./workspaceCloneMessageVisibility";

const COMMAND_PREFIX_RE = /^(\/[a-z0-9][a-z0-9-]*)(?:\s+([\s\S]*))?$/i;
const WINDOWS_PATH_LINE_RE = /^[A-Za-z]:\\[^\n]+$/;
const CODE_LIKE_LINE_RE =
  /^\s*(?:\/\/|\/\*|\*\/|\*|import\s|export\s|from\s|use\s|type\s|interface\s|class\s|function\s|async\s|const\s|let\s|var\s|return\b|if\s*\(|for\s*\(|while\s*\(|switch\s*\(|try\s*\{|catch\s*\(|await\s|[\]}]\);?|[});,]+)\s*.*$/;

export function hashWorkspaceMessageText(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function getWorkspaceMessageRenderKey(message: WorkspaceMessage) {
  return [
    message.id,
    message.role,
    message.status ?? "",
    message.commandTag ?? "",
    message.skillTags?.join(",") ?? "",
    hashWorkspaceMessageText(message.text),
  ].join(":");
}

export function resolveWorkspaceMessageDisplayParts(message: WorkspaceMessage): WorkspaceMessageDisplayParts {
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

function resolvePreviewKind(content: string, role: WorkspaceMessage["role"]): {
  kind: WorkspaceMessagePreviewKind;
  content: string;
} {
  if (role !== "assistant") {
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

export function buildWorkspaceMessageRenderState(message: WorkspaceMessage): WorkspaceMessageRenderState {
  const displayParts = resolveWorkspaceMessageDisplayParts(message);
  const key = getWorkspaceMessageRenderKey(message);
  const textHash = hashWorkspaceMessageText(message.text);

  if (message.role === "tool") {
    return {
      key,
      textHash,
      hidden: true,
      previewKind: "plain",
      content: "",
      commandTag: displayParts.commandTag,
      skillTags: displayParts.skillTags,
      fileTargets: [],
    };
  }

  const assistantText = message.role === "assistant"
    ? sanitizeWorkspaceAssistantText(message.text)
    : null;
  const hidden = Boolean(assistantText?.shouldHide);
  const visibleContent = message.role === "assistant"
    ? formatUnfencedTechnicalBlock(assistantText?.text ?? "")
    : displayParts.content;
  const preview = resolvePreviewKind(visibleContent, message.role);

  return {
    key,
    textHash,
    hidden,
    previewKind: preview.kind,
    content: preview.content,
    commandTag: displayParts.commandTag,
    skillTags: displayParts.skillTags,
    fileTargets: hidden ? [] : extractWorkspaceChatFileTargets(preview.content),
  };
}

export function buildWorkspaceRenderableMessage(message: WorkspaceMessage): WorkspaceRenderableMessage {
  return {
    ...message,
    render: buildWorkspaceMessageRenderState(message),
  };
}
