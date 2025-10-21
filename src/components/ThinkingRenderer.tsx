import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeSanitize from "rehype-sanitize";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import CopyButton from "./CopyButton";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import type { PluggableList } from "unified";
import type { HTMLAttributes, ReactNode } from "react";

// Register languages
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

interface ThinkingRendererProps {
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
      <div style={{ position: "relative", margin: "0 0 4px 0" }}>
        <SyntaxHighlighter
          style={oneDark}
          language={language}
          PreTag="pre"
          customStyle={{
            margin: 0,
            borderRadius: "6px",
            fontSize: "0.85em",
            padding: "10px",
            backgroundColor: "rgba(0, 0, 0, 0.3)",
          }}
        >
          {code}
        </SyntaxHighlighter>
        <CopyButton text={code} />
      </div>
    );
  }

  if (!inline) {
    return (
      <div style={{ position: "relative", margin: "0 0 4px 0" }}>
        <pre className={className} style={{ margin: 0, backgroundColor: "rgba(0, 0, 0, 0.2)" }}>
          <code {...props}>{children}</code>
        </pre>
        <CopyButton text={String(children)} />
      </div>
    );
  }

  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
};

const markdownComponents: Components = {
  a: ({ children, href, ...props }: any) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: "#64b5f6", textDecoration: "underline" }}
      {...props}
    >
      {children}
    </a>
  ),
  table: ({ children, ...props }: any) => (
    <div style={{ overflowX: "auto", margin: "8px 0" }}>
      <table style={{
        borderCollapse: "collapse",
        width: "100%",
        fontSize: "0.9em",
        backgroundColor: "rgba(0, 0, 0, 0.1)"
      }} {...props}>
        {children}
      </table>
    </div>
  ),
  code: CodeRenderer,
};

const ThinkingRenderer = ({ content }: ThinkingRendererProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [mathPlugins, setMathPlugins] = useState<PluggableList | null>(null);
  const [isMathLoading, setIsMathLoading] = useState(false);
  const hasMath = /\$\$|\\\(|\\\[|\\begin\{.*?\}/.test(content);

  // Load math plugins if needed
  if (hasMath && !mathPlugins && !isMathLoading) {
    setIsMathLoading(true);
    import("rehype-katex")
      .then(({ default: rehypeKatex }) => {
        import("katex/dist/katex.min.css");
        setMathPlugins([[rehypeKatex, { throwOnError: false, output: "html" }]]);
        setIsMathLoading(false);
      })
      .catch((error) => {
        console.error("Failed to load math rendering pipeline:", error);
        setMathPlugins(null);
        setIsMathLoading(false);
      });
  }

  const rehypePlugins = mathPlugins ? [...baseRehypePlugins, ...mathPlugins] : baseRehypePlugins;

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="thinking-container" style={{
      marginBottom: "12px",
      border: "1px solid rgba(255, 255, 255, 0.1)",
      borderRadius: "12px",
      overflow: "hidden",
      background: "rgba(255, 255, 255, 0.05)",
      backdropFilter: "blur(10px)",
    }}>
      <button
        className="thinking-header"
        onClick={toggleExpanded}
        style={{
          width: "100%",
          padding: "10px 14px",
          backgroundColor: "rgba(255, 255, 255, 0.1)",
          border: "none",
          color: "#fff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "0.85em",
          fontWeight: "500",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.15)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          🧠 Extended Thinking
        </span>
        <span style={{
          transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.2s ease",
          fontSize: "0.8em",
        }}>
          ▼
        </span>
      </button>

      <div
        className="thinking-content"
        style={{
          maxHeight: isExpanded ? "1000px" : "0",
          overflow: "hidden",
          transition: "max-height 0.3s ease-out, opacity 0.3s ease-out",
          opacity: isExpanded ? 1 : 0,
          backgroundColor: "rgba(0, 0, 0, 0.05)",
        }}
      >
        <div style={{
          padding: "14px",
          fontSize: "0.9em",
          lineHeight: "1.5",
          color: "rgba(255, 255, 255, 0.9)",
          border: "none",
        }}>
          {isMathLoading ? (
            <div style={{ textAlign: "center", padding: "20px", color: "rgba(255, 255, 255, 0.7)" }}>
              Loading math rendering...
            </div>
          ) : (
            <ReactMarkdown
              remarkPlugins={baseRemarkPlugins}
              rehypePlugins={rehypePlugins}
              components={markdownComponents}
            >
              {content}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  );
};

export default ThinkingRenderer;