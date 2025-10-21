import { useState, useEffect, useRef, memo, useCallback, Suspense, lazy } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { register } from "@tauri-apps/plugin-global-shortcut";
import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { UpdateAvailable, UpdateInProgress } from "./components/UpdateNotification";
import "./App.css";

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
  systemInstructions?: string;
}

interface GeminiResult {
  text: string;
  sources?: SourceInfo[];
}

interface UpdateInfo {
  version: string;
  body: string;
  date: string;
}

type UpdateState = 'idle' | 'checking' | 'available' | 'installing' | 'installed' | 'error';

const WINDOW_SIZES = {
  EXPANDED: { width: 700, height: 600 },
  COLLAPSED: { width: 700, height: 130 },
} as const;

const WINDOWS_HEIGHT_ADJUSTMENT = 50;

const TIMEOUTS = {
  INPUT_FOCUS: 100,
  TOGGLE_DEBOUNCE: 300,
} as const;

type AppWindow = ReturnType<typeof getCurrentWindow>;

const GLOBAL_SHORTCUT = "CommandOrControl+K";

const MessageRenderer = lazy(() => import("./components/MessageRenderer"));
const API_KEY_UPDATED_EVENT = "api-key-updated";
const SYSTEM_INSTRUCTIONS_UPDATED_EVENT = "system-instructions-updated";

// Memoized chat message component for performance
const ChatMessage = memo(({ msg, idx }: { msg: Message; idx: number }) => (
  <div key={idx} className={`chat-message ${msg.role}`}>
    <div className="message-content">
      <Suspense fallback={<span className="message-renderer-fallback">Loading message…</span>}>
        <MessageRenderer content={msg.content} />
      </Suspense>
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
  const [apiKey, setApiKey] = useState("");
  const [systemInstructions, setSystemInstructions] = useState("");
  const [isWindows, setIsWindows] = useState(false);
  const [shouldAnimate, setShouldAnimate] = useState(false);

  // Update state management
  const [updateState, setUpdateState] = useState<UpdateState>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isTogglingRef = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatHistoryRef = useRef<Message[]>([]);
  const isWindowsRef = useRef(false);
  const isExpandedRef = useRef(isExpanded);

  const adjustWindowSize = useCallback(
    async (expanded: boolean) => {
      const baseSize = expanded ? WINDOW_SIZES.EXPANDED : WINDOW_SIZES.COLLAPSED;
      const heightAdjustment = isWindowsRef.current ? WINDOWS_HEIGHT_ADJUSTMENT : 0;

      try {
        const appWindow = getCurrentWindow();
        await appWindow.setSize(
          new LogicalSize(baseSize.width, baseSize.height + heightAdjustment),
        );
      } catch (error) {
        console.error("Failed to adjust window size:", error);
      }
    },
    [],
  );

  // Detect platform (simple approach)
  useEffect(() => {
    const detectPlatform = () => {
      // Simple platform detection without plugin
      const userAgent = navigator.userAgent.toLowerCase();
      const isWin = userAgent.includes('win');
      setIsWindows(isWin);
      isWindowsRef.current = isWin;

      console.log(`Detected platform: ${isWin ? 'Windows' : 'macOS/Linux'}`);
    };

    detectPlatform();
  }, []);

  useEffect(() => {
    isWindowsRef.current = isWindows;
  }, [isWindows]);

  useEffect(() => {
    isExpandedRef.current = isExpanded;
  }, [isExpanded]);

  
  // Load settings from secure store
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [storedKey, storedInstructions] = await Promise.all([
          invoke<string | null>("get_api_key"),
          invoke<string | null>("get_system_instructions")
        ]);
        setApiKey(storedKey ?? "");
        setSystemInstructions(storedInstructions ?? "");
        console.log("Settings loaded successfully");
      } catch (error) {
        console.error("Failed to load settings from command:", error);
        // Continue without settings - user can set them later
      }
    };
    void loadSettings();
  }, []);

  // Update state handlers

  const handleUpdateDismissed = useCallback(() => {
    console.log("👤 User dismissed update notification");
    setShowUpdateNotification(false);
    setUpdateState('idle');
    setUpdateInfo(null);
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    if (!updateInfo) return;

    setUpdateState('installing');
    setUpdateError(null);

    try {
      console.log("⬇️ Installing update...");

      // Find the update object and install it
      const update = await check();
      if (update) {
        await update.downloadAndInstall();
        console.log("✅ Update installed successfully!");
        setUpdateState('installed');

        // Show success message for a few seconds, then reset
        setTimeout(() => {
          setShowUpdateNotification(false);
          setUpdateState('idle');
          setUpdateInfo(null);
        }, 5000);
      }
    } catch (error) {
      console.error("❌ Failed to install update:", error);
      setUpdateError(error instanceof Error ? error.message : "Failed to install update");
      setUpdateState('error');
    }
  }, [updateInfo]);

  // Check for updates on app startup
  useEffect(() => {
    const checkForUpdates = async () => {
      setUpdateState('checking');
      try {
        console.log("🔄 Starting update check...");
        console.log("📡 Fetching from:", "http://localhost:3003/latest.json");

        const update = await check();
        console.log("📦 Update check result:", update);

        if (update) {
          console.log("🔍 Update object properties:", {
            available: update.available,
            version: update.version,
            body: update.body,
            date: update.date
          });

          if (update.available) {
            console.log(`✅ Update available: ${update.version}`);
            console.log("📋 Update notes:", update.body);

            // Show update notification instead of auto-installing
            const updateInfo: UpdateInfo = {
              version: update.version,
              body: update.body || "",
              date: update.date || ""
            };

            setUpdateInfo(updateInfo);
            setUpdateState('available');
            setShowUpdateNotification(true);
          } else {
            console.log("✅ App is up to date (no new version available)");
            setUpdateState('idle');
          }
        } else {
          console.log("⚠️ Update check returned null/undefined");
          setUpdateState('idle');
        }
      } catch (error) {
        console.error("❌ Failed to check for updates:", error);
        console.error("🔍 Error details:", {
          name: error instanceof Error ? error.name : 'Unknown',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : 'No stack trace'
        });

        setUpdateError(error instanceof Error ? error.message : "Failed to check for updates");
        setUpdateState('error');

        // Handle gracefully - don't show error to user on startup
        if (error instanceof Error && error.message.includes("Could not fetch a valid release JSON")) {
          console.log("ℹ️ Update server not configured or no releases available yet");
          setUpdateState('idle');
        } else if (error instanceof Error && error.message.includes("Failed to fetch")) {
          console.log("ℹ️ Network error - will retry later");
          setUpdateState('idle');
        } else {
          console.log("ℹ️ Unexpected update error - continuing without update");
          setUpdateState('idle');
        }
      }
    };

    console.log("🚀 Setting up automatic update check on app startup");
    checkForUpdates();
  }, []);

  const runWithToggleGuard = useCallback(async (operation: (appWindow: AppWindow) => Promise<void>) => {
    if (isTogglingRef.current) {
      console.log("Already toggling, ignoring...");
      return;
    }

    isTogglingRef.current = true;
    const appWindow = getCurrentWindow();
    try {
      await operation(appWindow);
    } finally {
      setTimeout(() => {
        isTogglingRef.current = false;
      }, TIMEOUTS.TOGGLE_DEBOUNCE);
    }
  }, []);

  const ensureWindowShown = useCallback(
    async (appWindow: AppWindow) => {
      const isVisible = await appWindow.isVisible();
      if (isVisible) {
        await appWindow.setFocus();
        return;
      }

      const hasHistory = chatHistoryRef.current.length > 0;
      if (hasHistory) {
        setIsExpanded(true);
        await adjustWindowSize(true);
      } else {
        setIsExpanded(false);
        await adjustWindowSize(false);
      }

      await appWindow.show();
      await appWindow.setFocus();

      setShouldAnimate(false);
      setTimeout(() => {
        setShouldAnimate(true);
        setTimeout(() => inputRef.current?.focus(), TIMEOUTS.INPUT_FOCUS);
      }, 10);

      try {
        await invoke("sync_tray_visibility", { visible: true });
      } catch (error) {
        console.error("Failed to sync tray visibility (show)", error);
      }
    },
    [adjustWindowSize],
  );

  const ensureWindowHidden = useCallback(async (appWindow: AppWindow) => {
    const isVisible = await appWindow.isVisible();
    if (!isVisible) {
      return;
    }

    setShouldAnimate(false);
    await appWindow.hide();
    try {
      await invoke("sync_tray_visibility", { visible: false });
    } catch (error) {
      console.error("Failed to sync tray visibility (hide)", error);
    }
  }, []);

  const showWindow = useCallback(() => runWithToggleGuard(ensureWindowShown), [ensureWindowShown, runWithToggleGuard]);

  const hideWindow = useCallback(() => runWithToggleGuard(ensureWindowHidden), [ensureWindowHidden, runWithToggleGuard]);

  const toggleWindow = useCallback(async () => {
    await runWithToggleGuard(async (appWindow) => {
      if (await appWindow.isVisible()) {
        await ensureWindowHidden(appWindow);
      } else {
        await ensureWindowShown(appWindow);
      }
    });
  }, [ensureWindowHidden, ensureWindowShown, runWithToggleGuard]);

  
  useEffect(() => {
    const setupShortcut = async () => {
      try {
        console.log("🔧 Setting up global shortcut...");

        await register(GLOBAL_SHORTCUT, () => {
          console.log("⌨️ Global shortcut triggered!");
          void toggleWindow();
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

    void setupShortcut();
  }, [toggleWindow]);

  useEffect(() => {
    let unlistenShow: UnlistenFn | undefined;
    let unlistenHide: UnlistenFn | undefined;
    let unlistenApiKey: UnlistenFn | undefined;
    let unlistenSystemInstructions: UnlistenFn | undefined;

    const registerListeners = async () => {
      unlistenShow = await listen("spotlight-show", () => {
        void showWindow();
      });
      unlistenHide = await listen("spotlight-hide", () => {
        void hideWindow();
      });
      unlistenApiKey = await listen<{ apiKey?: string }>(API_KEY_UPDATED_EVENT, (event) => {
        const nextKey = event.payload?.apiKey ?? "";
        setApiKey(nextKey);
      });
      unlistenSystemInstructions = await listen<{ systemInstructions?: string }>(SYSTEM_INSTRUCTIONS_UPDATED_EVENT, (event) => {
        const nextInstructions = event.payload?.systemInstructions ?? "";
        setSystemInstructions(nextInstructions);
      });
    };

    void registerListeners();

    return () => {
      unlistenShow?.();
      unlistenHide?.();
      unlistenApiKey?.();
      unlistenSystemInstructions?.();
    };
  }, [hideWindow, showWindow]);

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

    // Check if API key is set
    if (!apiKey.trim()) {
      setChatHistory((prev) => [
        ...prev,
        { role: "user", content: searchQuery },
        {
          role: "assistant",
          content:
            "Please set your API key first. Use Spotlight > Settings in the menu bar to add your Gemini API key.",
        },
      ]);
      setSearchQuery("");

      // Expand window to show the error message
      if (!isExpanded) {
        setIsExpanded(true);
        await adjustWindowSize(true);
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
      await adjustWindowSize(true);
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
        systemInstructions,
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
      // Use the same toggle logic as Cmd+K for consistency
      void toggleWindow();
    }
  };

  return (
    <div className={`spotlight-container ${isWindows ? 'windows' : ''}`} onKeyDown={handleKeyDown} tabIndex={-1}>
      <div className={`content-area ${isExpanded ? "expanded" : ""} ${shouldAnimate ? 'animate-in' : ''}`}>
        {/* Update Notifications */}
        {showUpdateNotification && updateState === 'available' && updateInfo && (
          <UpdateAvailable
            updateInfo={updateInfo}
            onInstall={handleInstallUpdate}
            onDismiss={handleUpdateDismissed}
            isInstalling={false}
          />
        )}

        {updateState === 'installing' && (
          <UpdateInProgress
            status="Downloading and installing update..."
          />
        )}

        {updateState === 'installed' && (
          <div className="update-success-message">
            ✅ Update installed successfully! Please restart the app.
          </div>
        )}

        {updateState === 'error' && updateError && (
          <div className="update-error-message">
            ❌ Update failed: {updateError}
          </div>
        )}

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

      <div className={`controls-row ${shouldAnimate ? 'animate-in' : ''}`}>
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
      </div>

      <div className={`liquid-glass-box ${shouldAnimate ? 'animate-in' : ''}`}>
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Ask Spotlight..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
          disabled={isLoading}
          aria-label="Search query input"
          aria-describedby="search-description"
        />
      </div>
    </div>
  );
}

export default App;
