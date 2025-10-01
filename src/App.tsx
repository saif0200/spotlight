import { useState, useEffect, useRef } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { register } from "@tauri-apps/plugin-global-shortcut";
import "./App.css";

interface SearchItem {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
}

const mockSearchData: SearchItem[] = [
  { id: "1", title: "Applications", subtitle: "Browse all applications", icon: "📁" },
  { id: "2", title: "Documents", subtitle: "Your documents folder", icon: "📄" },
  { id: "3", title: "Downloads", subtitle: "Downloaded files", icon: "⬇️" },
  { id: "4", title: "Settings", subtitle: "System preferences", icon: "⚙️" },
  { id: "5", title: "Calculator", subtitle: "Perform calculations", icon: "🔢" },
];

function App() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredResults, setFilteredResults] = useState<SearchItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
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
              await appWindow.hide();
              setSearchQuery("");
            } else {
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

        // Listen for Escape key to hide window
        const unlisten = await appWindow.onFocusChanged(({ payload }) => {
          if (!payload) {
            setTimeout(() => appWindow.hide(), 100);
          }
        });

        // Show window initially for testing
        setTimeout(async () => {
          await appWindow.show();
          await appWindow.setFocus();
          inputRef.current?.focus();
        }, 500);

        return () => {
          unlisten();
        };
      } catch (error) {
        console.error("Failed to setup shortcut:", error);
      }
    };

    setupShortcut();
  }, []);

  useEffect(() => {
    const updateResults = async () => {
        if (searchQuery.trim() === "") {
        setFilteredResults([]);
        // Resize window to show only search box
        await getCurrentWindow().setSize(new LogicalSize(700, 100));
      } else {
        const filtered = mockSearchData.filter(
          (item) =>
            item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
        );
        setFilteredResults(filtered);

        // Dynamically resize window based on results
        const resultHeight = Math.min(filtered.length * 64, 400);
        const totalHeight = 100 + (filtered.length > 0 ? resultHeight + 16 : 0);
        await getCurrentWindow().setSize(new LogicalSize(700, totalHeight));
      }
      setSelectedIndex(0);
    };

    updateResults();
  }, [searchQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < filteredResults.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      if (filteredResults[selectedIndex]) {
        console.log("Selected:", filteredResults[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      setSearchQuery("");
      getCurrentWindow().hide();
    }
  };

  return (
    <div className="spotlight-container">
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
