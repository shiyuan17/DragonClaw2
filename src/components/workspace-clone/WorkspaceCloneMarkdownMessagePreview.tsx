import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface WorkspaceCloneMarkdownMessagePreviewProps {
  content: string;
}

export function WorkspaceCloneMarkdownMessagePreview({ content }: WorkspaceCloneMarkdownMessagePreviewProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
