import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { WorkspaceMessage } from "./workspaceCloneTypes";

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
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
          }}
        >
          {preview.content}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="workspace-clone__message-rich workspace-clone__message-rich--plain">
      <p>{preview.content}</p>
    </div>
  );
}
