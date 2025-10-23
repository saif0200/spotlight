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
  thinkingTime?: number; // Time in milliseconds
}

interface CodeBlockProps extends HTMLAttributes<HTMLElement> {
  inline?: boolean;
  className?: string;
  children?: ReactNode;
  node?: any;
}

const CodeRenderer = ({ inline, className, children }: CodeBlockProps) => {
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const code = String(children).replace(/\s+$/, "").trim();

  // Detect if this should be inline based on content characteristics
  // Short snippets without language should be inline (lowered threshold to 12 chars)
  const content = String(children);
  const isShortSingleLine = !content.includes('\n') && content.length < 12 && !language;

  // Handle inline code first - this should always render inline
  if (inline || isShortSingleLine) {
    return (
      <code className={className}>
        {children}
      </code>
    );
  }

  // Handle code blocks with syntax highlighting
  if (language) {
    return (
      <div style={{ position: "relative", margin: "0 0 4px 0", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{
          position: "absolute",
          top: "8px",
          left: "12px",
          fontSize: "0.75em",
          fontWeight: "600",
          color: "rgba(255, 255, 255, 0.6)",
          zIndex: 10,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}>
          {language}
        </div>
        <SyntaxHighlighter
          style={oneDark}
          language={language}
          PreTag="pre"
          customStyle={{
            margin: 0,
            borderRadius: "0px",
            fontSize: "0.9em",
            padding: "40px 12px 12px 12px",
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            border: "none",
          }}
        >
          {code}
        </SyntaxHighlighter>
        <CopyButton text={code} />
      </div>
    );
  }

  // Handle plain text code blocks (no language label)
  return (
    <div style={{ position: "relative", margin: "0 0 4px 0", borderRadius: "8px", overflow: "hidden" }}>
      <div style={{
        position: "absolute",
        top: "8px",
        left: "12px",
        fontSize: "0.75em",
        fontWeight: "600",
        color: "rgba(255, 255, 255, 0.6)",
        zIndex: 10,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
      }}>
        Text
      </div>
      <pre style={{
        margin: 0,
        borderRadius: "0px",
        fontSize: "0.9em",
        padding: "40px 12px 12px 12px",
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        color: "#abb2bf",
        overflowX: "auto",
        border: "none",
      }}>
        <code>{children}</code>
      </pre>
      <CopyButton text={String(children)} />
    </div>
  );
};

const markdownComponents: Components = {
  a: ({ children, href, ...props }) => (
    href ? (
      <span style={{ display: "inline" }}>
        <a 
          href={href} 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ textDecoration: "underline" }}
          {...props}
        >
          {children}
        </a>
        <span 
          style={{ 
            display: "inline",
            marginLeft: "2px",
            fontSize: "0.75em",
            verticalAlign: "super",
            textDecoration: "none"
          }}
          aria-label="external link"
        >
          ↗
        </span>
      </span>
    ) : (
      <a {...props}>{children}</a>
    )
  ),
  table: ({ children, ...props }) => (
    <div className="markdown-table-wrapper">
      <table {...props}>{children}</table>
    </div>
  ),
  code: CodeRenderer,
  // Footnotes support (GFM)
  sup: ({ children, ...props }: any) => (
    <sup style={{ fontSize: "0.8em", verticalAlign: "super" }} {...props}>
      {children}
    </sup>
  ),
  section: ({ children, ...props }: any) => {
    // Footnote section has data-footnotes="true"
    if (props["data-footnotes"]) {
      return (
        <section
          style={{
            borderTop: "1px solid rgba(255, 255, 255, 0.2)",
            marginTop: "24px",
            paddingTop: "16px",
            fontSize: "0.9em",
            color: "rgba(255, 255, 255, 0.8)",
          }}
          {...props}
        >
          {children}
        </section>
      );
    }
    return <section {...props}>{children}</section>;
  },
  // Definition list support (GFM)
  dl: ({ children, ...props }: any) => (
    <dl style={{ marginLeft: "20px", marginBottom: "12px" }} {...props}>
      {children}
    </dl>
  ),
  dt: ({ children, ...props }: any) => (
    <dt style={{ fontWeight: "600", marginTop: "8px" }} {...props}>
      {children}
    </dt>
  ),
  dd: ({ children, ...props }: any) => (
    <dd style={{ marginLeft: "20px", marginBottom: "8px", color: "rgba(255, 255, 255, 0.9)" }} {...props}>
      {children}
    </dd>
  ),
};

const MessageRenderer = ({ content, thinking, thinkingTime }: MessageRendererProps) => {
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
      {thinking && <ThinkingRenderer content={thinking} thinkingTime={thinkingTime} />}
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
