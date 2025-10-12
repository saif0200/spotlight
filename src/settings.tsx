import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./settings.css";

function SettingsApp() {
  const [apiKey, setApiKey] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusIntent, setStatusIntent] = useState<"success" | "info" | "error">("info");

  useEffect(() => {
    const loadApiKey = async () => {
      try {
        const storedKey = await invoke<string | null>("get_api_key");
        setApiKey(storedKey ?? "");
      } catch (error) {
        console.error("Failed to load API key:", error);
        setStatusIntent("error");
        setStatusMessage("Unable to load saved settings.");
      }
    };

    void loadApiKey();
  }, []);

  const handleSave = useCallback(async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setStatusIntent("error");
      setStatusMessage("Please enter an API key or use Clear.");
      return;
    }

    setIsBusy(true);
    setStatusMessage(null);
    try {
      await invoke("set_api_key", { api_key: trimmed });
      setStatusIntent("success");
      setStatusMessage("API key saved.");
    } catch (error) {
      console.error("Failed to save API key:", error);
      setStatusIntent("error");
      setStatusMessage("Could not save API key. Please try again.");
    } finally {
      setIsBusy(false);
    }
  }, [apiKey]);

  const handleClear = useCallback(async () => {
    setIsBusy(true);
    setStatusMessage(null);
    try {
      await invoke("clear_api_key");
      setApiKey("");

      setStatusIntent("info");
      setStatusMessage("API key cleared.");
    } catch (error) {
      console.error("Failed to clear API key:", error);
      setStatusIntent("error");
      setStatusMessage("Could not clear API key. Please try again.");
    } finally {
      setIsBusy(false);
    }
  }, []);

  const handleClose = useCallback(async () => {
    console.log("Close button clicked, attempting to close settings window...");
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
  }, []);

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
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

  const disableSave = isBusy || apiKey.trim().length === 0;

  return (
    <div className="settings-window">
      <form className="settings-card" onSubmit={onSubmit} onKeyDown={handleKeyDown}>
        <div className="settings-header">
          <div className="drag-handle" data-tauri-drag-region>
            <h3>API Key Settings</h3>
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
        <p>Enter your Gemini API key. It is stored securely on your device.</p>
        <input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="Enter API Key"
          autoFocus
          disabled={isBusy}
        />
        {statusMessage && (
          <div className={`status-message ${statusIntent}`}>
            {statusMessage}
          </div>
        )}
        <div className="button-group">
          <button type="submit" disabled={disableSave}>
            Save
          </button>
          <button
            type="button"
            onClick={() => void handleClear()}
            disabled={isBusy || apiKey.length === 0}
          >
            Clear
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
