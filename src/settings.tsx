import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./settings.css";

function SettingsApp() {
  const [apiKey, setApiKey] = useState("");
  const [systemInstructions, setSystemInstructions] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusIntent, setStatusIntent] = useState<"success" | "info" | "error">("info");
  const [characterCount, setCharacterCount] = useState(0);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = useCallback(async () => {
    console.log("Close button clicked, attempting to close settings window...");
    setIsClosing(true);

    // Wait for closing animation to play
    setTimeout(async () => {
      try {
        await invoke("close_api_settings_window");
        console.log("Settings window closed successfully");
      } catch (error) {
        console.error("Failed to close settings window:", error);
        // Fallback: try direct window close
        try {
          const window = getCurrentWindow();
          await window.close();
        } catch (fallbackError) {
          console.error("Fallback close also failed:", fallbackError);
        }
      }
    }, 300); // Match animation duration
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [storedKey, storedInstructions] = await Promise.all([
          invoke<string | null>("get_api_key"),
          invoke<string | null>("get_system_instructions")
        ]);
        setApiKey(storedKey ?? "");
        setSystemInstructions(storedInstructions ?? "");
      } catch (error) {
        console.error("Failed to load settings:", error);
        setStatusIntent("error");
        setStatusMessage("Unable to load saved settings.");
      }
    };

    void loadSettings();
  }, []);

  // Update character count
  useEffect(() => {
    setCharacterCount(systemInstructions.length);
  }, [systemInstructions]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void handleClose();
      }
    };

    // Listen for reset animation state event
    const handleResetState = () => {
      setIsClosing(false);
    };

    document.addEventListener("keydown", handleGlobalKeyDown);

    // Listen for the reset event from the backend
    const listenForReset = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const unlisten = await listen("reset-animation-state", handleResetState);
        return unlisten;
      } catch (error) {
        console.error("Failed to listen for reset event:", error);
      }
    };

    const unlistenPromise = listenForReset();

    return () => {
      document.removeEventListener("keydown", handleGlobalKeyDown);
      unlistenPromise.then(unlisten => unlisten?.());
    };
  }, [handleClose]);

  const handleSave = useCallback(async () => {
    console.log("DEBUG: handleSave called");
    const trimmedApiKey = apiKey.trim();
    const trimmedInstructions = systemInstructions.trim();

    // Enhanced validation: both fields being empty is still an error
    if (!trimmedApiKey && !trimmedInstructions) {
      console.log("DEBUG: Both fields are empty, showing error");
      setStatusIntent("error");
      setStatusMessage("Please enter an API key or system instructions.");
      return;
    }

    // Optional: Validate system instructions length to prevent API abuse
    if (trimmedInstructions.length > 8000) {
      setStatusIntent("error");
      setStatusMessage("System instructions are too long. Please keep them under 8000 characters.");
      return;
    }

    console.log("DEBUG: About to save settings...");
    setIsBusy(true);
    setStatusMessage(null);
    try {
      const savePromises = [];

      if (trimmedApiKey) {
        console.log("DEBUG: Saving API key");
        savePromises.push(invoke("set_api_key", { apiKey: trimmedApiKey }));
      }

      if (trimmedInstructions) {
        console.log("DEBUG: Saving system instructions");
        savePromises.push(invoke("set_system_instructions", { instructions: trimmedInstructions }));
      }

      await Promise.all(savePromises);
      console.log("DEBUG: Settings saved successfully");

      const messages = [];
      if (trimmedApiKey) messages.push("API key");
      if (trimmedInstructions) messages.push("system instructions");

      setStatusIntent("success");
      setStatusMessage(`${messages.join(" and ")} saved.`);
    } catch (error) {
      console.error("Failed to save settings:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      setStatusIntent("error");
      setStatusMessage(`Could not save settings: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsBusy(false);
    }
  }, [apiKey, systemInstructions]);

  const handleClear = useCallback(async () => {
    setIsBusy(true);
    setStatusMessage(null);
    try {
      await Promise.all([
        invoke("clear_api_key"),
        invoke("clear_system_instructions")
      ]);
      setApiKey("");
      setSystemInstructions("");

      setStatusIntent("info");
      setStatusMessage("All settings cleared.");
    } catch (error) {
      console.error("Failed to clear settings:", error);
      setStatusIntent("error");
      setStatusMessage("Could not clear settings. Please try again.");
    } finally {
      setIsBusy(false);
    }
  }, []);

  const handleCheckForUpdates = useCallback(async () => {
    try {
      // Import the check function dynamically
      const { check } = await import("@tauri-apps/plugin-updater");

      console.log("🔍 Settings: Starting manual update check...");
      setStatusIntent("info");
      setStatusMessage("Checking for updates...");

      const update = await check();
      console.log("🔍 Settings: Update check result:", update);

      if (update) {
        console.log("🔍 Settings: Update object properties:", {
          available: update.available,
          version: update.version,
          body: update.body,
          date: update.date
        });

        if (update.available) {
          console.log("✅ Settings: Update available! Version:", update.version);
          console.log("🤖 Settings: Auto-accepting update for testing...");

          try {
            console.log("⬇️ Settings: Downloading update...");
            setStatusIntent("info");
            setStatusMessage("Downloading update...");
            await update.downloadAndInstall();
            console.log("✅ Settings: Update installed!");
            setStatusIntent("success");
            setStatusMessage("Update installed! Please restart the app manually.");
          } catch (installError) {
            console.error("❌ Settings: Failed to install update:", installError);
            setStatusIntent("error");
            setStatusMessage(`Failed to install update: ${installError instanceof Error ? installError.message : String(installError)}`);
            throw installError;
          }
        } else {
          console.log("✅ Settings: No update available");
          setStatusIntent("success");
          setStatusMessage("App is up to date!");
        }
      } else {
        console.log("⚠️ Settings: Update check returned null");
        setStatusIntent("info");
        setStatusMessage("Unable to check for updates.");
      }
    } catch (error) {
      console.error("❌ Settings: Failed to check for updates:", error);
      console.error("🔍 Settings: Error type:", typeof error);
      console.error("Error message:", error instanceof Error ? error.message : String(error));

      // Handle specific update server errors gracefully
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Could not fetch a valid release JSON") ||
          errorMessage.includes("release JSON") ||
          errorMessage.includes("404") ||
          errorMessage.includes("Not Found")) {
        setStatusIntent("info");
        setStatusMessage("Update server not configured. Create a GitHub release to enable updates.");
      } else {
        setStatusIntent("error");
        setStatusMessage(`Failed to check for updates: ${errorMessage}`);
      }
    }
  }, []);

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      console.log("DEBUG: Form submitted");
      event.preventDefault();
      void handleSave();
    },
    [handleSave],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void handleClose();
      }
    },
    [handleClose],
  );

  const disableSave = isBusy || (apiKey.trim().length === 0 && systemInstructions.trim().length === 0);

  return (
    <div className={`settings-window ${isClosing ? "closing" : ""}`} onKeyDown={handleKeyDown}>
      <form className={`settings-card ${isClosing ? "closing" : ""}`} onSubmit={onSubmit}>
        <div className="settings-header">
          <div className="drag-handle" data-tauri-drag-region>
            <h3>Settings</h3>
          </div>
          <button
            type="button"
            className="close-button"
            onClick={handleClose}
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        {/* API Configuration Section */}
        <div className="settings-section">
          <h4>API Configuration</h4>
          <p>Enter your Gemini API key. It is stored securely on your device.</p>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Enter API Key"
            autoFocus
            disabled={isBusy}
          />
        </div>

        {/* Update Status Section */}
        <div className="settings-section">
          <h4>App Updates</h4>
          <p style={{marginBottom: '8px'}}>Version: <span className="current-version">0.1.1</span></p>
          <div className="update-status-container">
            {statusMessage && statusMessage.includes("Update installed") ? (
              <div className="update-status-success">
                ✅ {statusMessage}
              </div>
            ) : statusMessage && statusMessage.includes("downloading") ? (
              <div className="update-status-progress">
                ⬇️ {statusMessage}
              </div>
            ) : null}
          </div>
        </div>

        {/* System Instructions Section */}
        <div className="settings-section">
          <h4>System Instructions</h4>
          <p>Customize how Gemini responds by setting system instructions. These instructions will guide the AI's behavior and responses.</p>
          <textarea
            value={systemInstructions}
            onChange={(event) => setSystemInstructions(event.target.value)}
            placeholder="e.g., You are a helpful assistant that provides concise and accurate information. Always be friendly and professional."
            rows={5}
            disabled={isBusy}
            className="settings-textarea"
          />
          <div className="character-count">
            <span className={characterCount > 8000 ? "over-limit" : ""}>
              {characterCount.toLocaleString()} / 8,000 characters
            </span>
          </div>
        </div>
        {statusMessage && (
          <div className={`status-message ${statusIntent}`}>
            {statusMessage}
          </div>
        )}
        <div className="button-group">
          <button
            type="submit"
            disabled={disableSave}
            title={disableSave ? "Please enter an API key or system instructions" : "Save settings"}
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => void handleClear()}
            disabled={isBusy || (apiKey.length === 0 && systemInstructions.length === 0)}
            title={(apiKey.length === 0 && systemInstructions.length === 0) ? "No settings to clear" : "Clear all settings"}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => void handleCheckForUpdates()}
            disabled={isBusy}
            title="Check for app updates"
            className="update-button"
          >
            Check Updates
          </button>
        </div>
      </form>
    </div>
  );
}

const container = document.getElementById("settings-root");

if (!container) {
  throw new Error("Settings root element not found");
}

createRoot(container).render(<SettingsApp />);
