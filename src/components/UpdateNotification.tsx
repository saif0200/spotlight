import { useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import "./UpdateNotification.css";

interface UpdateInfo {
  version: string;
  body: string;
  date: string;
}

interface UpdateNotificationProps {
  onUpdateAvailable: (update: { info: UpdateInfo; install: () => Promise<void> }) => void;
  onUpdateDismissed: () => void;
}

export function UpdateNotification({ onUpdateAvailable, onUpdateDismissed }: UpdateNotificationProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const handleCheckForUpdates = async () => {
    setIsChecking(true);
    setCheckError(null);

    try {
      console.log("🔍 UpdateNotification: Checking for updates...");
      const update = await check();

      if (update && update.available) {
        console.log("✅ UpdateNotification: Update available!", update.version);
        const updateInfo: UpdateInfo = {
          version: update.version,
          body: update.body || "",
          date: update.date || ""
        };

        onUpdateAvailable({
          info: updateInfo,
          install: async () => {
            try {
              console.log("⬇️ UpdateNotification: Installing update...");
              await update.downloadAndInstall();
              console.log("✅ UpdateNotification: Update installed successfully!");
            } catch (error) {
              console.error("❌ UpdateNotification: Failed to install update:", error);
              throw error;
            }
          }
        });
      } else {
        console.log("✅ UpdateNotification: No updates available");
        setCheckError("No updates available");
        setTimeout(() => setCheckError(null), 3000);
      }
    } catch (error) {
      console.error("❌ UpdateNotification: Failed to check for updates:", error);
      setCheckError(error instanceof Error ? error.message : "Failed to check for updates");
      setTimeout(() => setCheckError(null), 5000);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="update-notification">
      <div className="update-notification-content">
        <div className="update-notification-icon">
          🔄
        </div>
        <div className="update-notification-text">
          <h4>Check for Updates</h4>
          <p>See if a new version of Spotlight is available</p>
        </div>
        <div className="update-notification-actions">
          <button
            className="check-updates-button"
            onClick={handleCheckForUpdates}
            disabled={isChecking}
          >
            {isChecking ? "Checking..." : "Check Now"}
          </button>
        </div>
      </div>

      {checkError && (
        <div className="update-notification-error">
          {checkError}
        </div>
      )}
    </div>
  );
}

interface UpdateAvailableProps {
  updateInfo: UpdateInfo;
  onInstall: () => Promise<void>;
  onDismiss: () => void;
  isInstalling: boolean;
}

export function UpdateAvailable({ updateInfo, onInstall, onDismiss, isInstalling }: UpdateAvailableProps) {
  const [installError, setInstallError] = useState<string | null>(null);

  const handleInstall = async () => {
    setInstallError(null);
    try {
      await onInstall();
    } catch (error) {
      setInstallError(error instanceof Error ? error.message : "Failed to install update");
    }
  };

  return (
    <div className="update-available">
      <div className="update-available-content">
        <div className="update-available-icon">
          ⬆️
        </div>
        <div className="update-available-info">
          <h4>Update Available</h4>
          <p className="update-version">Version {updateInfo.version} is ready to install</p>
          {updateInfo.body && (
            <p className="update-description">{updateInfo.body}</p>
          )}
        </div>
        <div className="update-available-actions">
          <button
            className="install-update-button primary"
            onClick={handleInstall}
            disabled={isInstalling}
          >
            {isInstalling ? "Installing..." : "Install Now"}
          </button>
          <button
            className="dismiss-update-button secondary"
            onClick={onDismiss}
            disabled={isInstalling}
          >
            Later
          </button>
        </div>
      </div>

      {installError && (
        <div className="update-install-error">
          ❌ {installError}
        </div>
      )}
    </div>
  );
}

interface UpdateInProgressProps {
  progress?: number;
  status: string;
}

export function UpdateInProgress({ progress, status }: UpdateInProgressProps) {
  return (
    <div className="update-in-progress">
      <div className="update-progress-content">
        <div className="update-progress-icon">
          ⬇️
        </div>
        <div className="update-progress-info">
          <h4>Installing Update</h4>
          <p>{status}</p>
          {progress !== undefined && (
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}