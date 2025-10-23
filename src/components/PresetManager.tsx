import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./PresetManager.css";

interface InstructionPreset {
  id: string;
  name: string;
  instructions: string;
}

interface PresetManagerProps {
  currentInstructions: string;
  onLoadPreset: (instructions: string) => void;
  disabled?: boolean;
}

export function PresetManager({ currentInstructions, onLoadPreset, disabled }: PresetManagerProps) {
  const [presets, setPresets] = useState<InstructionPreset[]>([]);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusIntent, setStatusIntent] = useState<"success" | "error">("success");

  const loadPresets = useCallback(async () => {
    try {
      const loadedPresets = await invoke<InstructionPreset[]>("get_instruction_presets");
      setPresets(loadedPresets);
    } catch (error) {
      console.error("Failed to load presets:", error);
    }
  }, []);

  useEffect(() => {
    void loadPresets();
  }, [loadPresets]);

  const handleSaveAsPreset = useCallback(async () => {
    const trimmedName = newPresetName.trim();
    
    if (!trimmedName) {
      setStatusIntent("error");
      setStatusMessage("Please enter a preset name");
      return;
    }

    if (!currentInstructions.trim()) {
      setStatusIntent("error");
      setStatusMessage("No instructions to save");
      return;
    }

    try {
      const newPreset: InstructionPreset = {
        id: Date.now().toString(),
        name: trimmedName,
        instructions: currentInstructions,
      };

      await invoke("save_instruction_preset", { preset: newPreset });
      await loadPresets();
      
      setNewPresetName("");
      setIsAddingNew(false);
      setStatusIntent("success");
      setStatusMessage("Preset saved successfully");
      
      setTimeout(() => setStatusMessage(null), 2000);
    } catch (error) {
      console.error("Failed to save preset:", error);
      setStatusIntent("error");
      setStatusMessage("Failed to save preset");
    }
  }, [newPresetName, currentInstructions, loadPresets]);

  const handleLoadPreset = useCallback((preset: InstructionPreset) => {
    onLoadPreset(preset.instructions);
    setStatusIntent("success");
    setStatusMessage(`Loaded "${preset.name}"`);
    setTimeout(() => setStatusMessage(null), 2000);
  }, [onLoadPreset]);

  const handleDeletePreset = useCallback(async (presetId: string, presetName: string) => {
    try {
      await invoke("delete_instruction_preset", { presetId });
      await loadPresets();
      setStatusIntent("success");
      setStatusMessage(`Deleted "${presetName}"`);
      setTimeout(() => setStatusMessage(null), 2000);
    } catch (error) {
      console.error("Failed to delete preset:", error);
      setStatusIntent("error");
      setStatusMessage("Failed to delete preset");
    }
  }, [loadPresets]);

  const handleCancelAdd = useCallback(() => {
    setIsAddingNew(false);
    setNewPresetName("");
    setStatusMessage(null);
  }, []);

  return (
    <div className="preset-manager">
      <div className="preset-header">
        <h4>Saved Presets</h4>
        {!isAddingNew && (
          <button
            type="button"
            className="add-preset-button"
            onClick={() => setIsAddingNew(true)}
            disabled={disabled || !currentInstructions.trim()}
            title={!currentInstructions.trim() ? "Enter instructions first" : "Save current instructions as preset"}
          >
            + New Preset
          </button>
        )}
      </div>

      {statusMessage && (
        <div className={`preset-status ${statusIntent}`}>
          {statusMessage}
        </div>
      )}

      {isAddingNew && (
        <div className="new-preset-form">
          <input
            type="text"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            placeholder="Preset name..."
            className="preset-name-input"
            autoFocus
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void handleSaveAsPreset();
              } else if (e.key === "Escape") {
                handleCancelAdd();
              }
            }}
          />
          <div className="new-preset-buttons">
            <button
              type="button"
              onClick={() => void handleSaveAsPreset()}
              disabled={disabled || !newPresetName.trim()}
              className="save-preset-btn"
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleCancelAdd}
              disabled={disabled}
              className="cancel-preset-btn"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="preset-list">
        {presets.length === 0 ? (
          <p className="no-presets">No saved presets yet. Create one to quickly switch between different system instructions.</p>
        ) : (
          presets.map((preset) => (
            <div key={preset.id} className="preset-item">
              <div className="preset-info">
                <span className="preset-name">{preset.name}</span>
                <span className="preset-preview">
                  {preset.instructions.length > 60
                    ? `${preset.instructions.slice(0, 60)}...`
                    : preset.instructions}
                </span>
              </div>
              <div className="preset-actions">
                <button
                  type="button"
                  onClick={() => handleLoadPreset(preset)}
                  disabled={disabled}
                  className="load-preset-btn"
                  title="Load this preset"
                >
                  Load
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeletePreset(preset.id, preset.name)}
                  disabled={disabled}
                  className="delete-preset-btn"
                  title="Delete this preset"
                >
                  ×
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
