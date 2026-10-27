"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  getAgentActivity,
  subscribeToAgentActivity,
} from "@/lib/agent-activity";
import type { AgentActivity } from "@/lib/agent-activity";
import {
  TEAM_DEFINITIONS,
  dashboardResponseSchema,
} from "@/lib/agent-monitoring";
import type { TeamDashboard, TeamId } from "@/lib/agent-monitoring";
import { agentModelsResponseSchema } from "@/lib/agent-models";
import type { AgentModelsResponse } from "@/lib/agent-models";
import {
  MODEL_RESPONSE_TIME_LIMIT_MS,
  testModel,
} from "@/lib/agent-model-speed-test";
import { resolveAgentTeamSummary } from "@/lib/agent-team-summary";
import {
  saveAgentModelPreference,
  useAgentModelPreferences,
} from "@/lib/agent-model-preferences";
import AgentChat from "./AgentChat";
import AgentModelSettings from "./AgentModelSettings";
import VisionMarketDataPanel from "./VisionMarketDataPanel";
import "./AgentTeamPage.css";

const modelRequests = new Map<TeamId, Promise<AgentModelsResponse>>();

function loadModels(teamId: TeamId) {
  const existingRequest = modelRequests.get(teamId);
  if (existingRequest) return existingRequest;

  const request = fetch(`/api/agents/models?teamId=${encodeURIComponent(teamId)}`, {
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(
          result.error ?? `Model discovery returned ${response.status}.`,
        );
      }
      const parsed = agentModelsResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new Error("Model discovery returned invalid data.");
      }
      return parsed.data;
    })
    .catch((error: unknown) => {
      modelRequests.delete(teamId);
      throw error;
    });

  modelRequests.set(teamId, request);
  return request;
}

type AgentTeamPageProps = {
  teamId: TeamId;
  view?: "dashboard" | "settings";
};

type AgentModelState = {
  teamId: TeamId;
  status: "loading" | "testing" | "loaded" | "unavailable";
  models: string[];
  testedModels: number;
  totalModels: number;
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
  const [chatActivity, setChatActivity] = useState<AgentActivity | null>(null);
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
    view === "settings" &&
    (currentModelState === null ||
      currentModelState.status === "loading" ||
      currentModelState.status === "testing");
  const availableModels =
    currentModelState?.status === "loaded" ? currentModelState.models : null;
  const assignedModel =
    modelPreferences[teamId] ??
    (currentModelState?.status === "loaded"
      ? currentModelState.assignedModel
      : null) ??
    dashboard?.assignedModel ??
    null;

  useEffect(() => {
    const refresh = (activity: AgentActivity | null) => {
      setChatActivity(activity);
    };
    refresh(getAgentActivity(teamId));
    const unsubscribe = subscribeToAgentActivity((changedTeamId, activity) => {
      if (changedTeamId === teamId) refresh(activity);
    });
    return unsubscribe;
  }, [teamId]);

  useEffect(() => {
    let active = true;
    const eventSource = new EventSource("/api/monitoring/teams/stream");
    const modelTestController = new AbortController();

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

    if (view === "settings") {
      setAgentModelState({
        teamId,
        status: "loading",
        models: [],
        testedModels: 0,
        totalModels: 0,
        assignedModel: null,
        error: "",
        saving: false,
      });
    }

    if (view === "settings") {
      void loadModels(teamId)
        .then(async (result) => {
          if (!active) return;
          setAgentModelState({
            teamId,
            status: "testing",
            models: [],
            testedModels: 0,
            totalModels: result.models.length,
            assignedModel: result.assignedModel,
            error: "",
            saving: false,
          });

          let nextIndex = 0;
          let testedModels = 0;
          const workingModels: string[] = [];
          const testNextModel = async () => {
            while (active && !modelTestController.signal.aborted) {
              const model = result.models[nextIndex++];
              if (!model) return;

              const testResult = await testModel(
                model,
                modelTestController.signal,
              );
              if (testResult.status === "WORKING") {
                workingModels.push(model);
              }
              testedModels += 1;
              if (active) {
                setAgentModelState((current) =>
                  current?.teamId === teamId
                    ? { ...current, testedModels }
                    : current,
                );
              }
            }
          };
          const workerCount = Math.min(5, result.models.length);
          await Promise.all(
            Array.from({ length: workerCount }, () => testNextModel()),
          );
          if (!active) return;

          const availableModels = result.models.filter((model) =>
            workingModels.includes(model),
          );
          setAgentModelState({
            teamId,
            status: "loaded",
            models: availableModels,
            testedModels,
            totalModels: result.models.length,
            assignedModel: result.assignedModel,
            error: "",
            saving: false,
          });
        })
        .catch((error: unknown) => {
          if (!active || modelTestController.signal.aborted) return;
          console.error(`Unable to load ${teamId}'s model settings.`, error);
          setAgentModelState({
            teamId,
            status: "unavailable",
            models: [],
            testedModels: 0,
            totalModels: 0,
            assignedModel: null,
            error:
              error instanceof Error
                ? error.message
                : "Unable to load available models.",
            saving: false,
          });
        });
    }

    return () => {
      active = false;
      modelTestController.abort();
      eventSource.close();
    };
  }, [acceptDashboard, teamId, view]);

  if (!team) return null;

  const agents = dashboard?.agents ?? [];
  const queuedTasks = dashboard?.tasks ?? [];
  const teamSummary = resolveAgentTeamSummary(
    dashboard,
    assignedModel,
    chatActivity,
    loading,
  );
  const hasChatAgent = teamSummary.chatAgentStatus !== null;
  const chatAgentStatus = teamSummary.chatAgentStatus;
  const showAgentMetrics = teamSummary.total !== null;
  const modelSettingsAssignedModel =
    availableModels !== null &&
    assignedModel !== null &&
    !availableModels.includes(assignedModel)
      ? null
      : assignedModel;

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
              ["Agents", showAgentMetrics ? teamSummary.total : undefined],
              ["Working", showAgentMetrics ? teamSummary.working : undefined],
              ["Idle", showAgentMetrics ? teamSummary.idle : undefined],
              [
                "Issues",
                showAgentMetrics ? teamSummary.issues : undefined,
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
          key={`${teamId}-${modelSettingsAssignedModel ?? "unassigned"}`}
          assignedModel={modelSettingsAssignedModel}
          error={currentModelState?.error ?? ""}
          loading={modelsLoading}
          loadingMessage={
            currentModelState?.status === "testing"
              ? `Testing response speed: ${currentModelState.testedModels}/${currentModelState.totalModels} models. Showing models responding within ${MODEL_RESPONSE_TIME_LIMIT_MS} ms.`
              : "Loading available models…"
          }
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
              <h2>Agents</h2>
            </div>
            <span>
              {agents.length + Number(hasChatAgent)} registered
            </span>
          </div>
          {agents.length || hasChatAgent ? (
            <div className="agent-team-roster">
              {hasChatAgent && (
                <article className="agent-roster-card">
                  <div className="agent-roster-heading">
                    <div>
                      <h3>{team.name} Assistant</h3>
                      <p>Chat assistant</p>
                    </div>
                    <span
                      aria-label={`${team.name} Assistant status: ${chatAgentStatus}`}
                      className={`agent-team-status status-${chatAgentStatus}`}
                      role="img"
                      title={chatAgentStatus ?? "idle"}
                    />
                  </div>
                  <dl>
                    <div>
                      <dt>Model</dt>
                      <dd>{assignedModel}</dd>
                    </div>
                    <div>
                      <dt>Estimated session tokens</dt>
                      <dd>
                        {chatActivity
                          ? `${formatTokens(chatActivity.inputTokens)} IN · ${formatTokens(chatActivity.outputTokens)} OUT`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Last activity</dt>
                      <dd>
                        {chatActivity
                          ? formatDate(
                              new Date(chatActivity.updatedAt).toISOString(),
                            )
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                </article>
              )}
              {agents.map((agent) => (
                <article className="agent-roster-card" key={agent.id}>
                  <div className="agent-roster-heading">
                    <div>
                      <h3>{agent.name}</h3>
                      <p>{agent.role}</p>
                    </div>
                    <span
                      aria-label={`${agent.name} status: ${agent.status}`}
                      className={`agent-team-status status-${agent.status}`}
                      role="img"
                      title={agent.status}
                    />
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

      {teamId === "VISION" && view === "dashboard" && <VisionMarketDataPanel />}

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
