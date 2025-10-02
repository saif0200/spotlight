import { useState, useEffect, useRef } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { register } from "@tauri-apps/plugin-global-shortcut";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

interface Message {
  role: "user" | "assistant";
  content: string;
}

function App() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [screenCaptureEnabled, setScreenCaptureEnabled] = useState(false);
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isTogglingRef = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatHistoryRef = useRef<Message[]>([]);

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";

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

        // Show window initially for testing
        setTimeout(async () => {
          await appWindow.show();
          await appWindow.setFocus();
          inputRef.current?.focus();
        }, 500);
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

  const sendMessage = async () => {
    if (!searchQuery.trim() || isLoading) return;

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
      });

      // Add assistant response to chat
      setChatHistory((prev) => [...prev, { role: "assistant", content: response }]);
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
              <div className="message-content">{msg.content}</div>
            </div>
          ))}
          {isLoading && (
            <div className="chat-message assistant">
              <div className="message-content loading">Thinking...</div>
            </div>
          )}
        </div>
      </div>

      <div className="controls-row">
        <label className="screen-capture-toggle">
          <input
            type="checkbox"
            checked={screenCaptureEnabled}
            onChange={(e) => setScreenCaptureEnabled(e.target.checked)}
          />
          <span>Screen Visibility</span>
        </label>
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
    </div>
  );
}

export default App;
