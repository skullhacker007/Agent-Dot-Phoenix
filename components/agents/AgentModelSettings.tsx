"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { MODEL_RESPONSE_TIME_LIMIT_MS } from "@/lib/agent-model-speed-test";
import "./AgentModelSettings.css";

type AgentModelSettingsProps = {
  teamName: string;
  models: string[] | null;
  assignedModel: string | null;
  loading: boolean;
  loadingMessage: string;
  saving: boolean;
  error: string;
  onSave: (modelId: string) => Promise<void>;
};

export default function AgentModelSettings({
  teamName,
  models,
  assignedModel,
  loading,
  loadingMessage,
  saving,
  error,
  onSave,
}: AgentModelSettingsProps) {
  const modelOptions = models ?? [];
  const [selectedModel, setSelectedModel] = useState(assignedModel ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const optionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      optionsRef.current
        ?.querySelector(".agent-model-option.is-active")
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, open]);

  function selectModel(value: string) {
    setSelectedModel(value);
    setOpen(false);
  }

  function handleSelectKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const nextIndex =
        event.key === "ArrowDown"
          ? Math.min(activeIndex + 1, modelOptions.length - 1)
          : Math.max(
              activeIndex < 0 ? modelOptions.length - 1 : activeIndex - 1,
              0,
            );
      setActiveIndex(nextIndex);
      setOpen(true);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      if (!open) {
        event.preventDefault();
        setOpen(true);
        return;
      }
      event.preventDefault();
      const model = modelOptions[activeIndex];
      if (model) selectModel(model);
    }
  }

  function toggleOptions() {
    setActiveIndex(Math.max(modelOptions.indexOf(selectedModel), 0));
    setOpen((current) => !current);
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
        <p className="agent-model-note">{loadingMessage}</p>
      ) : models?.length ? (
        <>
          <label className="agent-model-select-label" htmlFor="agent-model">
            {teamName} model
            <button
              aria-activedescendant={
                open && activeIndex >= 0
                  ? `agent-model-option-${activeIndex}`
                  : undefined
              }
              aria-controls="agent-model-options"
              aria-expanded={open}
              aria-haspopup="listbox"
              aria-label={`${teamName} model`}
              className="agent-model-select"
              id="agent-model"
              onClick={toggleOptions}
              onKeyDown={handleSelectKeyDown}
              role="combobox"
              type="button"
            >
              <span>{selectedModel || "Select an available model"}</span>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m7 10 5 5 5-5" />
              </svg>
            </button>
            {open && (
              <div
                className="agent-model-options"
                id="agent-model-options"
                role="listbox"
                aria-label={`${teamName} available models`}
                ref={optionsRef}
              >
                {modelOptions.map((model, index) => (
                  <button
                    aria-selected={model === selectedModel}
                    className={`agent-model-option${index === activeIndex ? " is-active" : ""}`}
                    id={`agent-model-option-${index}`}
                    key={model}
                    onClick={() => selectModel(model)}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    role="option"
                    type="button"
                  >
                    {model}
                  </button>
                ))}
              </div>
            )}
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
            : `No models responded within ${MODEL_RESPONSE_TIME_LIMIT_MS} ms.`}
        </p>
      )}
    </section>
  );
}
