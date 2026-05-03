import { lazy, Suspense } from "react";
import type { WorkspaceMessage } from "./workspaceCloneTypes";

type WorkspaceMessagePreviewKind = "plain" | "markdown" | "json";

interface WorkspaceCloneMessagePreviewProps {
  message: WorkspaceMessage;
}

const WorkspaceCloneMarkdownMessagePreview = lazy(() =>
  import("./WorkspaceCloneMarkdownMessagePreview").then((module) => ({
    default: module.WorkspaceCloneMarkdownMessagePreview,
  })),
);

function tryParseJsonRecord(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed || !/^[\[{]/.test(trimmed)) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function looksLikeHiddenProcessPayload(text: string) {
  const parsed = tryParseJsonRecord(text);
  if (parsed) {
    const keys = new Set(Object.keys(parsed));
    const hasExternalContent = keys.has("externalContent");
    const hasFetchShape =
      keys.has("url") &&
      keys.has("status") &&
      (keys.has("contentType") || keys.has("extractMode") || keys.has("extractor"));
    const hasSearchShape =
      keys.has("provider") &&
      keys.has("results") &&
      (keys.has("toolMs") || keys.has("count"));
    const parsedText = typeof parsed.text === "string" ? parsed.text : "";
    const parsedTitle = typeof parsed.title === "string" ? parsed.title : "";

    if (
      hasExternalContent ||
      hasFetchShape ||
      hasSearchShape ||
      /EXTERNAL_UNTRUSTED_CONTENT|SECURITY NOTICE:/i.test(parsedText) ||
      /EXTERNAL_UNTRUSTED_CONTENT/i.test(parsedTitle)
    ) {
      return true;
    }
  }

  return /EXTERNAL_UNTRUSTED_CONTENT|SECURITY NOTICE: The following content is from an EXTERNAL, UNTRUSTED source/i.test(
    text,
  );
}

export function shouldHideWorkspaceMessage(message: WorkspaceMessage) {
  if (message.status === "streaming") {
    return false;
  }

  if (message.role === "tool") {
    return true;
  }

  return message.role === "assistant" && looksLikeHiddenProcessPayload(message.text);
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
  if (message.role !== "assistant" || message.status === "streaming") {
    return { kind: "plain", content: message.text };
  }

  const formattedJson = tryFormatJsonPreview(message.text);
  if (formattedJson) {
    return { kind: "json", content: formattedJson };
  }

  if (looksLikeMarkdown(message.text)) {
    return { kind: "markdown", content: message.text };
  }

  return { kind: "plain", content: message.text };
}

export function WorkspaceCloneMessagePreview({ message }: WorkspaceCloneMessagePreviewProps) {
  if (shouldHideWorkspaceMessage(message)) {
    return null;
  }

  const preview = resolvePreview(message);

  if (preview.kind === "json") {
    return (
      <div className="workspace-clone__message-rich workspace-clone__message-rich--json">
        <pre className="workspace-clone__message-json">
          <code>{preview.content}</code>
        </pre>
      </div>
    );
  }

  if (preview.kind === "markdown") {
    return (
      <div className="workspace-clone__message-rich workspace-clone__message-rich--markdown">
        <Suspense fallback={<p>{preview.content}</p>}>
          <WorkspaceCloneMarkdownMessagePreview content={preview.content} />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="workspace-clone__message-rich workspace-clone__message-rich--plain">
      <p>{preview.content}</p>
    </div>
  );
}
