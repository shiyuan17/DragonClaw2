import { Children, isValidElement, useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";

interface WorkspaceCloneMarkdownMessagePreviewProps {
  content: string;
}

interface MarkdownCodeElementProps {
  className?: string;
  children?: ReactNode;
}

const CODE_COLLAPSE_LINE_THRESHOLD = 18;

function getCodeLanguage(className?: string) {
  const match = className?.match(/language-([^\s]+)/);
  return match?.[1]?.trim() || "";
}

function getCodeBlockLabel(language: string) {
  const normalized = language.toLowerCase();
  if (normalized === "mermaid") {
    return "Mermaid";
  }
  if (["chart", "charts", "graph", "diagram"].includes(normalized)) {
    return "Chart source";
  }
  return language || "Code";
}

function WorkspaceCloneMarkdownCodeBlock({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const source = String(children ?? "").replace(/\n$/, "");
  const language = getCodeLanguage(className);
  const label = getCodeBlockLabel(language);
  const lineCount = useMemo(() => Math.max(1, source.split(/\r?\n/).length), [source]);
  const canCollapse = lineCount > CODE_COLLAPSE_LINE_THRESHOLD;
  const [expanded, setExpanded] = useState(!canCollapse);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setExpanded(!canCollapse);
    setCopied(false);
  }, [canCollapse, source]);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setCopied(false);
    }, 1600);

    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = () => {
    if (!source.trim()) {
      return;
    }

    void navigator.clipboard?.writeText(source).then(() => {
      setCopied(true);
    }).catch(() => undefined);
  };

  return (
    <figure className={`workspace-clone__message-codeblock ${language ? `is-${language.toLowerCase()}` : ""}`.trim()}>
      <figcaption className="workspace-clone__message-codeblock-head">
        <span className="workspace-clone__message-codeblock-language">{label}</span>
        <span className="workspace-clone__message-codeblock-actions">
          {canCollapse ? (
            <button
              type="button"
              className="workspace-clone__message-codeblock-button"
              onClick={() => setExpanded((current) => !current)}
              aria-expanded={expanded}
            >
              <WorkspaceCloneIcon name="chevron" size={13} strokeWidth={2.2} aria-hidden="true" />
              <span>{expanded ? "Collapse" : `Expand ${lineCount} lines`}</span>
            </button>
          ) : null}
          <button
            type="button"
            className={`workspace-clone__message-codeblock-button ${copied ? "is-copied" : ""}`}
            onClick={handleCopy}
            aria-label={`Copy ${label} code`}
          >
            <WorkspaceCloneIcon name={copied ? "check" : "copy"} size={13} strokeWidth={2.1} aria-hidden="true" />
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </span>
      </figcaption>
      <div className={`workspace-clone__message-codeblock-body ${expanded ? "is-expanded" : "is-collapsed"}`}>
        <pre>
          <code className={className}>{source}</code>
        </pre>
      </div>
    </figure>
  );
}

function getCodeChild(children: ReactNode) {
  const child = Children.toArray(children)[0];
  if (!isValidElement(child)) {
    return null;
  }

  return child as ReactElement<MarkdownCodeElementProps>;
}

const markdownComponents: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
  code: ({ node: _node, className, children, ...props }) => (
    <code className={className} {...props}>
      {children}
    </code>
  ),
  input: ({ node: _node, type, checked, ...props }) => {
    if (type !== "checkbox") {
      return <input type={type} {...props} />;
    }

    return (
      <span
        className={`workspace-clone__message-taskbox ${checked ? "is-checked" : ""}`}
        aria-hidden="true"
      >
        {checked ? <WorkspaceCloneIcon name="check" size={11} strokeWidth={2.4} /> : null}
      </span>
    );
  },
  pre: ({ node: _node, children }) => {
    const codeChild = getCodeChild(children);
    if (!codeChild) {
      return <pre>{children}</pre>;
    }

    return (
      <WorkspaceCloneMarkdownCodeBlock className={codeChild.props.className}>
        {codeChild.props.children}
      </WorkspaceCloneMarkdownCodeBlock>
    );
  },
  table: ({ node: _node, ...props }) => (
    <div className="workspace-clone__message-table-shell">
      <table {...props} />
    </div>
  ),
};

export function WorkspaceCloneMarkdownMessagePreview({ content }: WorkspaceCloneMarkdownMessagePreviewProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={markdownComponents}
    >
      {content}
    </ReactMarkdown>
  );
}
