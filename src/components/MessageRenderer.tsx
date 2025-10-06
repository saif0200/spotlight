import type { Components } from "react-markdown";
import type { HTMLAttributes, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeSanitize from "rehype-sanitize";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface MessageRendererProps {
  content: string;
}

interface CodeBlockProps extends HTMLAttributes<HTMLElement> {
  inline?: boolean;
  className?: string;
  children?: ReactNode;
}

const CodeRenderer = ({ inline, className, children, ...props }: CodeBlockProps) => {
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const code = String(children).replace(/\s+$/, "").trim();

  if (!inline && language) {
    return (
      <SyntaxHighlighter
        style={oneDark}
        language={language}
        PreTag="div"
        customStyle={{
          margin: "0 0 4px 0",
          borderRadius: "8px",
          fontSize: "0.9em",
          padding: "12px",
        }}
      >
        {code}
      </SyntaxHighlighter>
    );
  }

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
      rehypePlugins={[
        rehypeSanitize,
        [rehypeKatex, { throwOnError: false, output: "html" }],
      ]}
      components={markdownComponents}
    >
      {content}
    </ReactMarkdown>
  );
};

export default MessageRenderer;
