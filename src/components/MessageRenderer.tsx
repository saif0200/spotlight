import type { Components } from "react-markdown";
import type { HTMLAttributes, ReactNode } from "react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeSanitize from "rehype-sanitize";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import CopyButton from "./CopyButton";
import ThinkingRenderer from "./ThinkingRenderer";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import type { PluggableList } from "unified";

SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("html", markup);
SyntaxHighlighter.registerLanguage("markup", markup);

const baseRemarkPlugins = [remarkBreaks, remarkGfm, remarkMath];
const baseRehypePlugins: PluggableList = [rehypeSanitize];

interface MessageRendererProps {
  content: string;
  thinking?: string;
}

interface CodeBlockProps extends HTMLAttributes<HTMLElement> {
  inline?: boolean;
  className?: string;
  children?: ReactNode;
  node?: any;
}

const CodeRenderer = ({ inline, className, children, node, ...props }: CodeBlockProps) => {
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const code = String(children).replace(/\s+$/, "").trim();

  // Debug: log the props to understand what react-markdown is sending
  console.log('CodeRenderer props:', { inline, className, children: String(children), props });

  // Additional detection: if there are no newlines and it's short, treat as inline
  const content = String(children);
  const isProbablyInline = !content.includes('\n') && content.length < 100 && !language;

  // Handle inline code first - this should always render inline
  if (inline || isProbablyInline) {
    console.log('Rendering as inline code', { inline, isProbablyInline, content: content.slice(0, 20) });
    return (
      <code className={className}>
        {children}
      </code>
    );
  }

  // Handle code blocks with syntax highlighting
  if (language) {
    console.log('Rendering as syntax-highlighted code block');
    return (
      <div style={{ position: "relative", margin: "0 0 4px 0" }}>
        <SyntaxHighlighter
          style={oneDark}
          language={language}
          PreTag="pre"
          customStyle={{
            margin: 0,
            borderRadius: "8px",
            fontSize: "0.9em",
            padding: "40px 12px 12px 12px",
          }}
        >
          {code}
        </SyntaxHighlighter>
        <CopyButton text={code} />
      </div>
    );
  }

  // Handle plain code blocks
  console.log('Rendering as plain code block');
  return (
    <div style={{ position: "relative", margin: "0 0 4px 0" }}>
      <pre className={className} style={{ margin: 0, paddingTop: "40px" }}>
        <code>{children}</code>
      </pre>
      <CopyButton text={String(children)} />
    </div>
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

const MessageRenderer = ({ content, thinking }: MessageRendererProps) => {
  const [mathPlugins, setMathPlugins] = useState<PluggableList | null>(null);
  const [isMathLoading, setIsMathLoading] = useState(false);
  const hasMath = /\$\$|\\\(|\\\[|\\begin\{.*?\}/.test(content);

  useEffect(() => {
    let cancelled = false;

    if (!hasMath) {
      setMathPlugins(null);
      setIsMathLoading(false);
      return;
    }

    setIsMathLoading(true);

    (async () => {
      const [{ default: rehypeKatex }] = await Promise.all([
        import("rehype-katex"),
        import("katex/dist/katex.min.css"),
      ]);

      if (!cancelled) {
        setMathPlugins([[rehypeKatex, { throwOnError: false, output: "html" }]]);
        setIsMathLoading(false);
      }
    })().catch((error) => {
      console.error("Failed to load math rendering pipeline:", error);
      if (!cancelled) {
        setMathPlugins(null);
        setIsMathLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [hasMath]);

  if (isMathLoading) {
    return <span className="message-renderer-fallback">Rendering math…</span>;
  }

  const rehypePlugins = mathPlugins ? [...baseRehypePlugins, ...mathPlugins] : baseRehypePlugins;

  return (
    <>
      {thinking && (
        <div style={{ marginBottom: "8px" }}>
          <ThinkingRenderer content={thinking} />
        </div>
      )}
      <ReactMarkdown
        remarkPlugins={baseRemarkPlugins}
        rehypePlugins={rehypePlugins}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </>
  );
};

export default MessageRenderer;
