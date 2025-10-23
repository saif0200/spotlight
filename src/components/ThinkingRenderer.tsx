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

  // Detect if this should be inline based on content characteristics
  // Short snippets without language should be inline (lowered threshold to 12 chars)
  const content = String(children);
  const isShortSingleLine = !content.includes('\n') && content.length < 12 && !language;

  // Handle inline code first
  if (inline || isShortSingleLine) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  if (language) {
    return (
      <div style={{ position: "relative", margin: "0 0 4px 0" }}>
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

  // Plain code blocks (no language label)
  return (
    <div style={{ position: "relative", margin: "0 0 4px 0" }}>
      <pre className={className} style={{ margin: 0, backgroundColor: "rgba(0, 0, 0, 0.2)", padding: "12px" }}>
        <code {...props}>{children}</code>
      </pre>
      <CopyButton text={String(children)} />
    </div>
  );
};

const markdownComponents: Components = {
  a: ({ children, href, ...props }: any) => (
    href ? (
      <span style={{ display: "inline" }}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#64b5f6", textDecoration: "underline" }}
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
            textDecoration: "none",
            color: "#64b5f6"
          }}
          aria-label="external link"
        >
          ↗
        </span>
      </span>
    ) : (
      <a style={{ color: "#64b5f6", textDecoration: "underline" }} {...props}>{children}</a>
    )
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

const ThinkingRenderer = ({ content, thinkingTime }: ThinkingRendererProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [mathPlugins, setMathPlugins] = useState<PluggableList | null>(null);
  const [isMathLoading, setIsMathLoading] = useState(false);
  const hasMath = /\$\$|\\\(|\\\[|\\begin\{.*?\}/.test(content);

  // Measure content height whenever content changes
  useEffect(() => {
    if (contentRef.current && isExpanded) {
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
    <div style={{ marginBottom: "8px" }}>
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
              fontSize: "0.9em",
              lineHeight: "1.5",
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