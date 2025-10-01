import { useState, useEffect, useRef } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { register } from "@tauri-apps/plugin-global-shortcut";
import "./App.css";

function App() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isTogglingRef = useRef(false);

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
              // Collapse and reset before hiding
              setIsExpanded(false);
              await appWindow.setSize(new LogicalSize(700, 100));
              await appWindow.hide();
              setSearchQuery("");
            } else {
              // Ensure collapsed state when showing
              setIsExpanded(false);
              await appWindow.setSize(new LogicalSize(700, 100));
              await appWindow.show();
              await appWindow.setFocus();
              setSearchQuery("");
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

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && searchQuery.trim() !== "") {
      e.preventDefault();
      if (!isExpanded) {
        setIsExpanded(true);
        await getCurrentWindow().setSize(new LogicalSize(700, 500));
      }
    } else if (e.key === "Escape") {
      // Collapse and reset before hiding
      setIsExpanded(false);
      await getCurrentWindow().setSize(new LogicalSize(700, 100));
      setSearchQuery("");
      await getCurrentWindow().hide();
    }
  };

  return (
    <div className="spotlight-container">
      <div className={`content-area ${isExpanded ? 'expanded' : ''}`}></div>
      <div className="liquid-glass-box">
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Spotlight Search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      </div>
    </div>
  );
}

export default App;
