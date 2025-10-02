import type { Components } from "react-markdown";
import type { HTMLAttributes, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

interface MessageRendererProps {
  content: string;
}

interface CodeBlockProps extends HTMLAttributes<HTMLElement> {
  inline?: boolean;
  className?: string;
  children?: ReactNode;
}

const CodeRenderer = ({ inline, className, children, ...props }: CodeBlockProps) => {
  if (!inline) {
    return (
      <pre className={className}>
        <code {...props}>{children}</code>
      </pre>
    );
  }

  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
};

const markdownComponents: Components = {
  a: ({ children, href, ...props }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  ),
  table: ({ children, ...props }) => (
    <div className="markdown-table-wrapper">
      <table {...props}>{children}</table>
    </div>
  ),
  code: CodeRenderer,
};

const MessageRenderer = ({ content }: MessageRendererProps) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkBreaks, remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={markdownComponents}
    >
      {content}
    </ReactMarkdown>
  );
};

export default MessageRenderer;
