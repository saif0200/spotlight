import { useState, useEffect, useRef, memo } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { register } from "@tauri-apps/plugin-global-shortcut";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
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

// Tauri command parameter interfaces
interface SendToGeminiParams extends Record<string, unknown> {
  message: string;
  imageData: string | null;
  apiKey: string;
  groundingEnabled: boolean;
  thinkingEnabled: boolean;
  chatHistory: Message[];
}

interface GeminiResult {
  text: string;
  sources?: SourceInfo[];
}

const WINDOW_SIZES = {
  EXPANDED: { width: 700, height: 600 },
  COLLAPSED: { width: 700, height: 130 },
} as const;

const TIMEOUTS = {
  INPUT_FOCUS: 100,
  TOGGLE_DEBOUNCE: 300,
} as const;

// Memoized chat message component for performance
const ChatMessage = memo(({ msg, idx }: { msg: Message; idx: number }) => (
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
));

ChatMessage.displayName = 'ChatMessage';

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

  // Load API key from secure store
  useEffect(() => {
    const loadApiKey = async () => {
      try {
        const store = await Store.load("settings.json");
        const storedKey = await store.get<string>('GEMINI_API_KEY') || "";
        setApiKey(storedKey);
        setApiKeyInput(storedKey);
        console.log("API key loaded successfully");
      } catch (error) {
        console.error("Failed to load API key from store:", error);
        // Continue without API key - user can set it later
      }
    };
    loadApiKey();
  }, []);

  useEffect(() => {
    const setupShortcut = async () => {
      try {
        const appWindow = getCurrentWindow();

        console.log("🔧 Setting up global shortcut...");

        // Register Cmd+K (macOS) / Ctrl+K (others)
        await register("CommandOrControl+K", async () => {
          console.log("⌨️ Global shortcut triggered!");
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
                await appWindow.setSize(new LogicalSize(WINDOW_SIZES.EXPANDED.width, WINDOW_SIZES.EXPANDED.height));
              } else {
                setIsExpanded(false);
                await appWindow.setSize(new LogicalSize(WINDOW_SIZES.COLLAPSED.width, WINDOW_SIZES.COLLAPSED.height));
              }
              await appWindow.show();
              await appWindow.setFocus();
              setTimeout(() => inputRef.current?.focus(), TIMEOUTS.INPUT_FOCUS);
            }
          } finally {
            // Reset the flag after a short delay
            setTimeout(() => {
              isTogglingRef.current = false;
            }, TIMEOUTS.TOGGLE_DEBOUNCE);
          }
        });

        console.log("✅ Global shortcut (Cmd+K / Ctrl+K) registered successfully!");
      } catch (error) {
        console.error("❌ Failed to setup shortcut:", error);
        console.error("This could be due to:");
        console.error("1. Missing accessibility permissions on macOS");
        console.error("2. Another app using the same shortcut");
        console.error("3. Missing permissions in capabilities file");
      }
    };

    setupShortcut();

    // Note: No cleanup function - global shortcuts should persist for app lifetime
    // React.StrictMode causes mount/unmount cycles in dev that would break the shortcut
  }, []);

  useEffect(() => {
    // Scroll to bottom when chat history updates
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
    // Keep ref in sync
    chatHistoryRef.current = chatHistory;
  }, [chatHistory]);

  const saveApiKey = async () => {
    if (apiKeyInput.trim()) {
      const store = await Store.load("settings.json");
      await store.set('GEMINI_API_KEY', apiKeyInput.trim());
      await store.save();
      setApiKey(apiKeyInput.trim());
      setShowSettings(false);
    }
  };

  const clearApiKey = async () => {
    const store = await Store.load("settings.json");
    await store.delete('GEMINI_API_KEY');
    await store.save();
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
        await getCurrentWindow().setSize(new LogicalSize(WINDOW_SIZES.EXPANDED.width, WINDOW_SIZES.EXPANDED.height));
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
      await getCurrentWindow().setSize(new LogicalSize(WINDOW_SIZES.EXPANDED.width, WINDOW_SIZES.EXPANDED.height));
    }

    try {
      let imageData: string | null = null;

      // Capture screen if enabled
      if (screenCaptureEnabled) {
        imageData = await invoke<string>("capture_screen");
      }

      // Send to Gemini with full chat history
      const params: SendToGeminiParams = {
        message: userMessage,
        imageData,
        apiKey,
        groundingEnabled,
        thinkingEnabled,
        chatHistory,
      };

      const response = await invoke<string>("send_to_gemini", params);

      // Parse response (it now contains both text and sources)
      const result: GeminiResult = JSON.parse(response);

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

      let errorMessage = "Sorry, something went wrong. Please try again.";

      if (error instanceof Error) {
        if (error.message.includes("API error")) {
          errorMessage = "Unable to connect to Gemini API. Please check your API key and try again.";
        } else if (error.message.includes("Failed to parse")) {
          errorMessage = "Received an unexpected response from Gemini. Please try again.";
        } else if (error.message.includes("Network") || error.message.includes("fetch")) {
          errorMessage = "Network error. Please check your internet connection and try again.";
        }
      }

      setChatHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: errorMessage,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && searchQuery.trim() !== "" && e.target === inputRef.current) {
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
      await getCurrentWindow().setSize(new LogicalSize(WINDOW_SIZES.COLLAPSED.width, WINDOW_SIZES.COLLAPSED.height));
      setSearchQuery("");
      setChatHistory([]);
      await getCurrentWindow().hide();
    }
  };

  return (
    <div className="spotlight-container" onKeyDown={handleKeyDown} tabIndex={-1}>
      <div className={`content-area ${isExpanded ? "expanded" : ""}`}>
        <div className="chat-container" ref={chatContainerRef} role="log" aria-live="polite" aria-label="Chat conversation">
          {chatHistory.map((msg, idx) => (
            <ChatMessage key={idx} msg={msg} idx={idx} />
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
        <div className="controls-container">
          <label className="screen-capture-toggle">
            <input
              type="checkbox"
              checked={screenCaptureEnabled}
              onChange={(e) => setScreenCaptureEnabled(e.target.checked)}
              aria-label="Toggle screen visibility capture"
            />
            <span>Screen Visibility</span>
          </label>
          <label className="screen-capture-toggle">
            <input
              type="checkbox"
              checked={groundingEnabled}
              onChange={(e) => setGroundingEnabled(e.target.checked)}
              aria-label="Toggle web grounding"
            />
            <span>Web Grounding</span>
          </label>
          <label className="screen-capture-toggle">
            <input
              type="checkbox"
              checked={thinkingEnabled}
              onChange={(e) => setThinkingEnabled(e.target.checked)}
              aria-label="Toggle extended thinking mode"
            />
            <span>Extended Thinking</span>
          </label>
        </div>
        {isExpanded && (
          <button
            className="settings-btn"
            onClick={() => setShowSettings(true)}
            title="API Key Settings"
            aria-label="Open API key settings"
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
          autoFocus
          disabled={isLoading}
          aria-label="Search query input"
          aria-describedby="search-description"
        />
      </div>

      {showSettings && (
        <div className="settings-modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="api-key-setup">
              <h3>API Key Settings</h3>
              <p>
                Enter your Gemini API key. It will be stored securely on your device.
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
                aria-label="API key input"
              />
              <div className="button-group">
                <button onClick={saveApiKey} aria-label="Save API key">Save</button>
                <button onClick={clearApiKey} aria-label="Clear API key">Clear</button>
                <button onClick={() => setShowSettings(false)} aria-label="Cancel and close settings">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
