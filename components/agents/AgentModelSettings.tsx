"use client";

import { useState } from "react";
import "./AgentModelSettings.css";

type AgentModelSettingsProps = {
  teamName: string;
  models: string[] | null;
  assignedModel: string | null;
  loading: boolean;
  saving: boolean;
  error: string;
  onSave: (modelId: string) => Promise<void>;
};

export default function AgentModelSettings({
  teamName,
  models,
  assignedModel,
  loading,
  saving,
  error,
  onSave,
}: AgentModelSettingsProps) {
  const [selectedModel, setSelectedModel] = useState(assignedModel ?? "");

  function selectModel(value: string) {
    setSelectedModel(value);
  }

  return (
    <section
      aria-labelledby="agent-model-settings-title"
      className="agent-model-settings"
    >
      <div className="agent-model-settings-header">
        <div>
          <p className="agent-model-settings-eyebrow">MODEL CONFIGURATION</p>
          <h2 id="agent-model-settings-title">Choose a model</h2>
        </div>
      </div>

      {loading ? (
        <p className="agent-model-note">
          Checking model response speeds…
        </p>
      ) : models?.length ? (
        <>
          <label className="agent-model-select-label" htmlFor="agent-model">
            {teamName} model
            <select
              id="agent-model"
              onChange={(event) => selectModel(event.target.value)}
              value={selectedModel}
            >
              <option value="">Select an available model</option>
              {models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
          <button
            className="agent-team-primary-button"
            disabled={
              saving ||
              !selectedModel ||
              selectedModel === assignedModel
            }
            onClick={() => void onSave(selectedModel)}
            type="button"
          >
            {saving ? "Saving…" : "Save model"}
          </button>
          <p className="agent-model-note">
            This model choice is saved in this browser.
          </p>
          {error && (
            <p aria-live="polite" className="agent-model-note is-error">
              {error}
            </p>
          )}
        </>
      ) : (
        <p className="agent-model-note">
          {models === null
            ? error || "Available models could not be loaded. Check the provider connection."
            : "No models passed the response-speed test."}
        </p>
      )}
    </section>
  );
}
