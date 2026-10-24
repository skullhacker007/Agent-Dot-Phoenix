"use client";

import "./VisionModelSettings.css";

type VisionModelSettingsProps = {
  models: string[] | null;
  assignedModel: string | null;
  loading: boolean;
};

export default function VisionModelSettings({
  models,
  assignedModel,
  loading,
}: VisionModelSettingsProps) {

  return (
    <section
      aria-labelledby="vision-model-settings-title"
      className="vision-model-settings"
    >
      <div className="vision-model-settings-header">
        <div>
          <p className="vision-model-settings-eyebrow">MODEL CONFIGURATION</p>
          <h2 id="vision-model-settings-title">Available models</h2>
        </div>
      </div>

      {loading ? (
        <p className="vision-model-note">Loading available models…</p>
      ) : models?.length ? (
        <>
          <ul className="vision-model-list">
            {models.map((model) => (
              <li
                className={model === assignedModel ? "is-assigned" : undefined}
                key={model}
              >
                <span>{model}</span>
                {model === assignedModel && (
                  <span className="vision-model-assigned">
                    Assigned to Vision
                  </span>
                )}
              </li>
            ))}
          </ul>
          {!assignedModel && (
            <p className="vision-model-note">
              Vision&apos;s assigned model is not currently available.
            </p>
          )}
        </>
      ) : (
        <p className="vision-model-note">
          {models === null
            ? "Available models could not be loaded. Check the provider connection."
            : "No models are currently available from the provider."}
          {models?.length === 0 && " Vision's assigned model is not available right now."}
        </p>
      )}
    </section>
  );
}
