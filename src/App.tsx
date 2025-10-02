import { useState, useEffect, useRef } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { register } from "@tauri-apps/plugin-global-shortcut";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import "katex/dist/katex.min.css";
import MessageRenderer from "./components/MessageRenderer";

interface SourceInfo {
  title: string;
  uri: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: SourceInfo[];
}

function App() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [screenCaptureEnabled, setScreenCaptureEnabled] = useState(false);
  const [groundingEnabled, setGroundingEnabled] = useState(false);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKey, setApiKey] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isTogglingRef = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatHistoryRef = useRef<Message[]>([]);

  // Load API key from localStorage only
  useEffect(() => {
    const storedKey = localStorage.getItem('GEMINI_API_KEY') || "";
    setApiKey(storedKey);
    setApiKeyInput(storedKey);
  }, []);

  useEffect(() => {
    const setupShortcut = async () => {
      try {
        const appWindow = getCurrentWindow();

        console.log("Setting up global shortcut...");

        // Register Cmd+K (macOS) / Ctrl+K (others)
        await register("CommandOrControl+K", async () => {
          // Prevent multiple rapid triggers
          if (isTogglingRef.current) {
            console.log("Already toggling, ignoring...");
            return;
          }

          isTogglingRef.current = true;
          console.log("Shortcut triggered!");

          try {
            const isVisible = await appWindow.isVisible();
            console.log("Window visible:", isVisible);

            if (isVisible) {
              // Hide window without resetting state
              await appWindow.hide();
            } else {
              // Show in expanded state if there's chat history
              const hasHistory = chatHistoryRef.current.length > 0;
              if (hasHistory) {
                setIsExpanded(true);
                await appWindow.setSize(new LogicalSize(700, 550));
              } else {
                setIsExpanded(false);
                await appWindow.setSize(new LogicalSize(700, 130));
              }
              await appWindow.show();
              await appWindow.setFocus();
              setTimeout(() => inputRef.current?.focus(), 100);
            }
          } finally {
            // Reset the flag after a short delay
            setTimeout(() => {
              isTogglingRef.current = false;
            }, 300);
          }
        });

        console.log("Global shortcut registered successfully!");
      } catch (error) {
        console.error("Failed to setup shortcut:", error);
      }
    };

    setupShortcut();
  }, []);

  useEffect(() => {
    // Scroll to bottom when chat history updates
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
    // Keep ref in sync
    chatHistoryRef.current = chatHistory;
  }, [chatHistory]);

  const saveApiKey = () => {
    if (apiKeyInput.trim()) {
      localStorage.setItem('GEMINI_API_KEY', apiKeyInput.trim());
      setApiKey(apiKeyInput.trim());
      setShowSettings(false);
    }
  };

  const clearApiKey = () => {
    localStorage.removeItem('GEMINI_API_KEY');
    setApiKey("");
    setApiKeyInput("");
    setShowSettings(false);
  };

  const sendMessage = async () => {
    if (!searchQuery.trim() || isLoading) return;

    // Check if API key is set
    if (!apiKey.trim()) {
      setChatHistory((prev) => [
        ...prev,
        { role: "user", content: searchQuery },
        {
          role: "assistant",
          content: "Please set your API key first. Click the ⚙️ settings button to add your Gemini API key.",
        },
      ]);
      setSearchQuery("");

      // Expand window to show the error message
      if (!isExpanded) {
        setIsExpanded(true);
        await getCurrentWindow().setSize(new LogicalSize(700, 550));
      }

      return;
    }

    setIsLoading(true);
    const userMessage = searchQuery;
    setSearchQuery("");

    // Add user message to chat
    setChatHistory((prev) => [...prev, { role: "user", content: userMessage }]);

    // Expand if not already
    if (!isExpanded) {
      setIsExpanded(true);
      await getCurrentWindow().setSize(new LogicalSize(700, 550));
    }

    try {
      let imageData: string | null = null;

      // Capture screen if enabled
      if (screenCaptureEnabled) {
        imageData = await invoke<string>("capture_screen");
      }

      // Send to Gemini
      const response = await invoke<string>("send_to_gemini", {
        message: userMessage,
        imageData,
        apiKey,
        groundingEnabled,
        thinkingEnabled,
      });

      // Parse response (it now contains both text and sources)
      const result = JSON.parse(response);

      // Add assistant response to chat
      setChatHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.text,
          sources: result.sources,
        },
      ]);
    } catch (error) {
      console.error("Error sending message:", error);
      setChatHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${error}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && searchQuery.trim() !== "") {
      e.preventDefault();
      await sendMessage();
    } else if (e.key === "Escape") {
      // Close settings if open
      if (showSettings) {
        setShowSettings(false);
        return;
      }
      // Collapse and reset before hiding
      setIsExpanded(false);
      await getCurrentWindow().setSize(new LogicalSize(700, 130));
      setSearchQuery("");
      setChatHistory([]);
      await getCurrentWindow().hide();
    }
  };

  return (
    <div className="spotlight-container">
      <div className={`content-area ${isExpanded ? "expanded" : ""}`}>
        <div className="chat-container" ref={chatContainerRef}>
          {chatHistory.map((msg, idx) => (
            <div key={idx} className={`chat-message ${msg.role}`}>
              <div className="message-content">
                <MessageRenderer content={msg.content} />
              </div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="message-sources">
                  {msg.sources.map((source, sidx) => (
                    <a
                      key={sidx}
                      href={source.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="source-pill"
                    >
                      {source.title}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="chat-message assistant">
              <div className="message-content loading">
                <span className="loading-text" data-text="Thinking...">Thinking...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="controls-row">
        <div style={{ display: 'flex', gap: '12px' }}>
          <label className="screen-capture-toggle">
            <input
              type="checkbox"
              checked={screenCaptureEnabled}
              onChange={(e) => setScreenCaptureEnabled(e.target.checked)}
            />
            <span>Screen Visibility</span>
          </label>
          <label className="screen-capture-toggle">
            <input
              type="checkbox"
              checked={groundingEnabled}
              onChange={(e) => setGroundingEnabled(e.target.checked)}
            />
            <span>Web Grounding</span>
          </label>
          <label className="screen-capture-toggle">
            <input
              type="checkbox"
              checked={thinkingEnabled}
              onChange={(e) => setThinkingEnabled(e.target.checked)}
            />
            <span>Extended Thinking</span>
          </label>
        </div>
        {isExpanded && (
          <button
            className="settings-btn"
            onClick={() => setShowSettings(true)}
            title="API Key Settings"
          >
            ⚙️
          </button>
        )}
      </div>

      <div className="liquid-glass-box">
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Ask Gemini..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          disabled={isLoading}
        />
      </div>

      {showSettings && (
        <div className="settings-modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="api-key-setup">
              <h3>API Key Settings</h3>
              <p>
                Enter your Gemini API key. It will be stored in your browser's localStorage.
              </p>
              <input
                type="password"
                placeholder="Enter API Key"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveApiKey();
                  if (e.key === 'Escape') setShowSettings(false);
                }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button onClick={saveApiKey}>Save</button>
                <button onClick={clearApiKey}>Clear</button>
                <button onClick={() => setShowSettings(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
