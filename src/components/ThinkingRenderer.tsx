import { useState, useRef, useEffect } from "react";
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
import "./ThinkingRenderer.css";

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
  thinkingTime?: number; // Time in milliseconds
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

const ThinkingRenderer = ({ content, thinkingTime }: ThinkingRendererProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [shouldRender, setShouldRender] = useState(true);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [mathPlugins, setMathPlugins] = useState<PluggableList | null>(null);
  const [isMathLoading, setIsMathLoading] = useState(false);
  const hasMath = /\$\$|\\\(|\\\[|\\begin\{.*?\}/.test(content);

  // Measure content height whenever content changes
  useEffect(() => {
    if (contentRef.current) {
      const height = contentRef.current.scrollHeight;
      setMeasuredHeight(height);
    }
  }, [content, isMathLoading, isExpanded]);

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
    if (isExpanded) {
      // Collapsing: measure current height first
      if (wrapperRef.current) {
        const currentHeight = wrapperRef.current.scrollHeight;
        setMeasuredHeight(currentHeight);
        
        // Force a reflow to ensure height is set before animating
        wrapperRef.current.style.height = `${currentHeight}px`;
        wrapperRef.current.offsetHeight; // Force reflow
        
        // Next frame: trigger collapse animation
        requestAnimationFrame(() => {
          setIsExpanded(false);
        });
      }
    } else {
      // Expanding
      setShouldRender(true);
      setIsExpanded(true);
    }
  };

  const handleTransitionEnd = () => {
    if (!isExpanded) {
      setShouldRender(false);
    }
  };

  // Format thinking time
  const formatThinkingTime = (ms?: number): string => {
    if (!ms) return "Thought";
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) {
      return `Thought for ${seconds}s`;
    }
    const minutes = Math.round(seconds / 60);
    return `Thought for ${minutes}m`;
  };

  return (
    <div style={{ marginBottom: "2px" }}>
      <button
        onClick={toggleExpanded}
        style={{
          background: "none",
          border: "none",
          color: "inherit",
          cursor: "pointer",
          padding: 0,
          font: "inherit",
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          justifyContent: "space-between",
          width: "auto",
        }}
      >
        <span>{formatThinkingTime(thinkingTime)}</span>
        <span style={{
          transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 0.2s ease",
          display: "inline-block",
        }}>
          ›
        </span>
      </button>

      <div
        ref={wrapperRef}
        className={`thinking-wrapper ${isExpanded ? 'open' : 'closed'}`}
        style={{
          height: isExpanded ? (measuredHeight || 'auto') : 0,
          overflow: 'hidden',
          pointerEvents: isExpanded ? 'auto' : 'none',
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        {shouldRender && (
          <div
            ref={contentRef}
            className={`thinking-inner ${isExpanded ? 'visible' : 'hiding'}`}
            style={{
              marginTop: "4px",
              marginLeft: "12px",
              fontSize: "0.9em",
              lineHeight: "1.5",
              color: "rgba(255, 255, 255, 0.9)",
            }}
          >
            {isMathLoading ? (
              <div style={{ color: "rgba(255, 255, 255, 0.7)" }}>
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
        )}
      </div>
    </div>
  );
};

export default ThinkingRenderer;