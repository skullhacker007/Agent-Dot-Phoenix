"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  TEAM_DEFINITIONS,
  dashboardResponseSchema,
} from "@/lib/agent-monitoring";
import type { TeamDashboard, TeamId } from "@/lib/agent-monitoring";
import { agentModelsResponseSchema } from "@/lib/agent-models";
import {
  saveAgentModelPreference,
  useAgentModelPreferences,
} from "@/lib/agent-model-preferences";
import AgentChat from "./AgentChat";
import AgentModelSettings from "./AgentModelSettings";
import "./AgentTeamPage.css";

type AgentTeamPageProps = {
  teamId: TeamId;
  view?: "dashboard" | "settings";
};

type AgentModelState = {
  teamId: TeamId;
  status: "loading" | "loaded" | "unavailable";
  models: string[];
  assignedModel: string | null;
  error: string;
  saving: boolean;
};

export default function AgentTeamPage({
  teamId,
  view = "dashboard",
}: AgentTeamPageProps) {
  const team = TEAM_DEFINITIONS.find(({ id }) => id === teamId);
  const [dashboard, setDashboard] = useState<TeamDashboard>();
  const [loading, setLoading] = useState(true);
  const [agentModelState, setAgentModelState] =
    useState<AgentModelState | null>(null);
  const modelPreferences = useAgentModelPreferences();

  const acceptDashboard = useCallback(
    (payload: unknown) => {
      const parsed = dashboardResponseSchema.safeParse(payload);
      if (!parsed.success) {
        console.error("Monitoring returned an invalid team dashboard.");
        return;
      }
      const nextDashboard = parsed.data.teams.find(({ id }) => id === teamId);
      setDashboard(nextDashboard);
      setLoading(false);
    },
    [teamId],
  );

  const currentModelState =
    agentModelState?.teamId === teamId ? agentModelState : null;
  const modelsLoading =
    currentModelState === null || currentModelState.status === "loading";
  const availableModels =
    currentModelState?.status === "loaded" ? currentModelState.models : null;
  const assignedModel =
    modelPreferences[teamId] ??
    (currentModelState?.status === "loaded"
      ? currentModelState.assignedModel
      : null);

  useEffect(() => {
    let active = true;
    const eventSource = new EventSource("/api/monitoring/teams/stream");
    const modelsRequest = fetch(
      `/api/agents/models?teamId=${encodeURIComponent(teamId)}`,
      { cache: "no-store" },
    );
    setAgentModelState({
      teamId,
      status: "loading",
      models: [],
      assignedModel: null,
      error: "",
      saving: false,
    });

    eventSource.onmessage = (event) => {
      if (!active) return;
      try {
        acceptDashboard(JSON.parse(event.data));
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        console.error("Monitoring stream sent invalid JSON.", error);
      }
    };

    eventSource.onerror = () => {
      if (active) setLoading(false);
    };

    void modelsRequest
      .then(async (response) => {
        if (!response.ok) {
          const result = (await response.json()) as { error?: string };
          throw new Error(
            result.error ?? `Model discovery returned ${response.status}.`,
          );
        }
        const parsed = agentModelsResponseSchema.safeParse(
          await response.json(),
        );
        if (!parsed.success) {
          throw new Error("Model discovery returned invalid data.");
        }
        if (active) {
          setAgentModelState({
            teamId,
            status: "loaded",
            models: parsed.data.models,
            assignedModel: parsed.data.assignedModel,
            error: "",
            saving: false,
          });
        }
      })
      .catch((error: unknown) => {
        console.error(`Unable to load ${teamId}'s model settings.`, error);
        if (active) {
          setAgentModelState({
            teamId,
            status: "unavailable",
            models: [],
            assignedModel: null,
            error:
              error instanceof Error
                ? error.message
                : "Unable to load available models.",
            saving: false,
          });
        }
      });

    return () => {
      active = false;
      eventSource.close();
    };
  }, [acceptDashboard, teamId, view]);

  if (!team) return null;

  const agents = dashboard?.agents ?? [];
  const queuedTasks = dashboard?.tasks ?? [];

  async function saveModel(modelId: string) {
    setAgentModelState((current) =>
      current?.teamId === teamId
        ? { ...current, saving: true, error: "" }
        : current,
    );
    try {
      if (!availableModels?.includes(modelId)) {
        throw new Error("Select a model currently available from NVIDIA.");
      }
      saveAgentModelPreference(teamId, modelId);
      setAgentModelState((current) =>
        current?.teamId === teamId
          ? { ...current, assignedModel: modelId, saving: false, error: "" }
          : current,
      );
      setDashboard((current) =>
        current ? { ...current, assignedModel: modelId } : current,
      );
    } catch (error) {
      setAgentModelState((current) =>
        current?.teamId === teamId
          ? {
              ...current,
              saving: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Unable to save the model assignment.",
            }
          : current,
      );
    }
  }

  return (
    <main className="agent-team-page">
      {view === "settings" && (
        <Link className="agent-team-back" href={`/agents/${team.agentId}`}>
          ← Back to {team.name}
        </Link>
      )}
      <header
        className={`agent-team-header ${
          view === "dashboard" ? "is-dashboard-header" : ""
        }`}
      >
        <div className="agent-team-title-row">
          <div>
            {view === "settings" && (
              <p className="agent-team-eyebrow">AGENT SETTINGS</p>
            )}
            <h1>{view === "settings" ? `${team.name} Settings` : team.name}</h1>
            {view === "settings" && (
              <p className="agent-team-description">{team.role}</p>
            )}
          </div>
          <div className="agent-team-header-actions">
            <span
              className={`agent-team-status status-${dashboard?.status ?? "offline"}`}
            >
              {dashboard?.status ?? (loading ? "Loading" : "Offline")}
            </span>
            {view === "dashboard" && (
              <Link
                aria-label={`${team.name} settings`}
                className="agent-team-settings-link"
                href={`/agents/${team.agentId}/settings`}
                title="Settings"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  />
                  <path
                    d="m19.4 15 .1.1a1.8 1.8 0 1 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .9v.2a1.8 1.8 0 1 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.9l-.1.1a1.8 1.8 0 1 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.9-3h-.2a1.8 1.8 0 1 1 0-3.6h.2a1.8 1.8 0 0 0 .9-3l-.1-.1a1.8 1.8 0 1 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.9v-.2a1.8 1.8 0 1 1 3.6 0v.2a1.8 1.8 0 0 0 3 .9l.1-.1a1.8 1.8 0 1 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .9 3h.2a1.8 1.8 0 1 1 0 3.6h-.2a1.8 1.8 0 0 0-.9 3Z"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            )}
          </div>
        </div>
        {view === "dashboard" && (
          <section className="agent-team-stats" aria-label="Team overview">
            {[
              ["Sub-agents", dashboard?.counts.total],
              ["Working", dashboard?.counts.working],
              ["Idle", dashboard?.counts.idle],
              [
                "Issues",
                dashboard
                  ? dashboard.counts.failed + dashboard.counts.stalled
                  : undefined,
              ],
            ].map(([label, value]) => (
              <div className="agent-team-stat" key={label}>
                <span>{label}</span>
                <strong>{value ?? "—"}</strong>
              </div>
            ))}
            <div className="agent-team-stat agent-team-stat-models">
              <span>Models</span>
              <strong>
                {assignedModel ??
                  dashboard?.assignedModel ??
                  (dashboard?.models.length
                    ? dashboard.models.join(", ")
                    : "No Model assigned")}
              </strong>
            </div>
          </section>
        )}
      </header>

      {view === "settings" && (
        <AgentModelSettings
          key={`${teamId}-${assignedModel ?? "unassigned"}`}
          assignedModel={assignedModel}
          error={currentModelState?.error ?? ""}
          loading={modelsLoading}
          models={availableModels}
          onSave={saveModel}
          saving={currentModelState?.saving ?? false}
          teamName={team.name}
        />
      )}

      {view === "dashboard" && (
        <AgentChat
          assignedModel={assignedModel}
          loading={modelsLoading}
          models={availableModels ?? []}
          teamId={teamId}
          teamName={team.name}
          teamRole={team.role}
        />
      )}

      {view === "settings" && (
        <section className="agent-team-section">
          <div className="agent-team-section-heading">
            <div>
              <p className="agent-team-eyebrow">TEAM ROSTER</p>
              <h2>Sub-agents</h2>
            </div>
            <span>{agents.length} registered</span>
          </div>
          {agents.length ? (
            <div className="agent-team-roster">
              {agents.map((agent) => (
                <article className="agent-roster-card" key={agent.id}>
                  <div className="agent-roster-heading">
                    <div>
                      <h3>{agent.name}</h3>
                      <p>{agent.role}</p>
                    </div>
                    <span className={`agent-team-status status-${agent.status}`}>
                      {agent.status}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>Model</dt>
                      <dd>{agent.model ?? "No Model assigned"}</dd>
                    </div>
                    <div>
                      <dt>Provider</dt>
                      <dd>{agent.provider ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Run tokens</dt>
                      <dd>
                        {formatTokens(agent.inputTokens)} IN ·{" "}
                        {formatTokens(agent.outputTokens)} OUT
                      </dd>
                    </div>
                    <div>
                      <dt>Last heartbeat</dt>
                      <dd>{formatDate(agent.lastHeartbeatAt)}</dd>
                    </div>
                    <div>
                      <dt>Last success</dt>
                      <dd>{formatDate(agent.lastSuccessfulExecutionAt)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <p className="agent-team-empty">
              {loading
                ? "Loading registered agents…"
                : "No agents in this team yet."}
            </p>
          )}
        </section>
      )}

      {view === "settings" && (
        <section className="agent-team-section">
          <div className="agent-team-section-heading">
            <div>
              <p className="agent-team-eyebrow">TASK QUEUE</p>
              <h2>Assigned tasks</h2>
            </div>
            <span>Queued tasks wait for a worker</span>
          </div>
          {queuedTasks.length ? (
            <div className="agent-task-list">
              {queuedTasks.map((task) => (
                <article className="agent-task-card" key={task.id}>
                  <div>
                    <h3>{task.title}</h3>
                    <p>{task.description}</p>
                    <span>
                      {task.agentName ?? "Team queue"} ·{" "}
                      {new Date(task.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <span className="agent-task-queued">QUEUED</span>
                </article>
              ))}
            </div>
          ) : (
            <p className="agent-team-empty">No tasks queued for this team.</p>
          )}
        </section>
      )}

    </main>
  );
}

function formatTokens(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}
