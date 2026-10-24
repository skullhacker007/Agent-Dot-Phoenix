"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  TEAM_DEFINITIONS,
  dashboardResponseSchema,
} from "@/lib/agent-monitoring";
import type { TeamDashboard, TeamId } from "@/lib/agent-monitoring";
import { visionModelsResponseSchema } from "@/lib/vision-models";
import VisionChat from "./VisionChat";
import VisionModelSettings from "./VisionModelSettings";
import "./AgentTeamPage.css";

type AgentTeamPageProps = {
  teamId: TeamId;
  view?: "dashboard" | "settings";
};

type AgentForm = {
  name: string;
  role: string;
  instructions: string;
  provider: string;
  model: string;
};

type TaskForm = {
  title: string;
  description: string;
  agentId: string;
};

type VisionModelState = {
  teamId: TeamId;
  status: "loading" | "loaded" | "unavailable";
  models: string[];
  assignedModel: string | null;
};

const EMPTY_AGENT_FORM: AgentForm = {
  name: "",
  role: "",
  instructions: "",
  provider: "",
  model: "",
};

const EMPTY_TASK_FORM: TaskForm = {
  title: "",
  description: "",
  agentId: "",
};

export default function AgentTeamPage({
  teamId,
  view = "dashboard",
}: AgentTeamPageProps) {
  const team = TEAM_DEFINITIONS.find(({ id }) => id === teamId);
  const [dashboard, setDashboard] = useState<TeamDashboard>();
  const [loading, setLoading] = useState(true);
  const [visionModelState, setVisionModelState] =
    useState<VisionModelState | null>(null);
  const [adminAuthenticated, setAdminAuthenticated] = useState<boolean | null>(
    null,
  );
  const [adminToken, setAdminToken] = useState("");
  const [loginError, setLoginError] = useState("");
  const [agentForm, setAgentForm] = useState(EMPTY_AGENT_FORM);
  const [taskForm, setTaskForm] = useState(EMPTY_TASK_FORM);
  const [agentSubmitting, setAgentSubmitting] = useState(false);
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");

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

  const refreshDashboard = useCallback(async () => {
    const response = await fetch("/api/monitoring/teams", {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Monitoring service returned ${response.status}.`);
    }
    acceptDashboard(await response.json());
  }, [acceptDashboard]);

  const currentVisionModelState =
    visionModelState?.teamId === teamId ? visionModelState : null;
  const visionModelsLoading =
    teamId === "VISION" &&
    (currentVisionModelState === null ||
      currentVisionModelState.status === "loading");
  const availableVisionModels =
    currentVisionModelState?.status === "loaded"
      ? currentVisionModelState.models
      : null;
  const assignedVisionModel =
    currentVisionModelState?.status === "loaded"
      ? currentVisionModelState.assignedModel
      : null;

  useEffect(() => {
    let active = true;
    const eventSource = new EventSource("/api/monitoring/teams/stream");
    const sessionRequest =
      view === "settings"
        ? fetch("/api/admin/session", { cache: "no-store" })
        : null;
    const visionModelsRequest =
      teamId === "VISION"
        ? fetch("/api/agents/vision/models", { cache: "no-store" })
        : null;

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

    void sessionRequest
      ?.then(async (response) => {
        const result = (await response.json()) as {
          authenticated?: boolean;
          error?: string;
        };
        if (!response.ok)
          throw new Error(result.error ?? "Unable to check admin session.");
        if (active) setAdminAuthenticated(result.authenticated === true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setAdminAuthenticated(false);
        setLoginError(
          error instanceof Error
            ? error.message
            : "Unable to check admin session.",
        );
      });

    void visionModelsRequest
      ?.then(async (response) => {
        if (!response.ok) {
          throw new Error(`Vision model discovery returned ${response.status}.`);
        }
        const parsed = visionModelsResponseSchema.safeParse(
          await response.json(),
        );
        if (!parsed.success) {
          throw new Error("Vision model discovery returned invalid data.");
        }
        if (active) {
          setVisionModelState({
            teamId,
            status: "loaded",
            models: parsed.data.models,
            assignedModel: parsed.data.assignedModel,
          });
        }
      })
      .catch((error: unknown) => {
        console.error("Unable to load Vision's assigned model.", error);
        if (active) {
          setVisionModelState({
            teamId,
            status: "unavailable",
            models: [],
            assignedModel: null,
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

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: adminToken }),
      });
      const result = (await response.json()) as {
        authenticated?: boolean;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? "Unable to sign in.");
      }
      setAdminAuthenticated(true);
      setAdminToken("");
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : "Unable to sign in.",
      );
    }
  }

  async function signOut() {
    setActionError("");
    try {
      const response = await fetch("/api/admin/session", { method: "DELETE" });
      if (!response.ok) throw new Error("Unable to sign out.");
      setAdminAuthenticated(false);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to sign out.",
      );
    }
  }

  async function createAgent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAgentSubmitting(true);
    setActionError("");
    setActionNotice("");
    try {
      const response = await fetch(
        `/api/monitoring/teams/${teamId.toLowerCase()}/agents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...agentForm,
            provider: agentForm.provider || undefined,
            model: agentForm.model || undefined,
          }),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        agent?: { name: string };
      };
      if (!response.ok)
        throw new Error(result.error ?? "Unable to create agent.");
      setAgentForm(EMPTY_AGENT_FORM);
      setActionNotice(
        `${result.agent?.name ?? "Agent"} added to ${team?.name ?? teamId}.`,
      );
      await refreshDashboard();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to create agent.",
      );
    } finally {
      setAgentSubmitting(false);
    }
  }

  async function queueTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTaskSubmitting(true);
    setActionError("");
    setActionNotice("");
    try {
      const response = await fetch(
        `/api/monitoring/teams/${teamId.toLowerCase()}/tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...taskForm,
            agentId: taskForm.agentId || null,
          }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error ?? "Unable to queue task.");
      setTaskForm(EMPTY_TASK_FORM);
      setActionNotice(
        "Task saved as queued. It will wait until a worker is connected.",
      );
      await refreshDashboard();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to queue task.",
      );
    } finally {
      setTaskSubmitting(false);
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
                {teamId === "VISION"
                  ? visionModelsLoading
                    ? "Loading available model…"
                    : assignedVisionModel ?? "Assigned model unavailable"
                  : dashboard?.models.length
                    ? dashboard.models.join(", ")
                    : "No Model assigned"}
              </strong>
            </div>
          </section>
        )}
      </header>

      {teamId === "VISION" && view === "settings" && (
        <VisionModelSettings
          assignedModel={assignedVisionModel}
          loading={visionModelsLoading}
          models={availableVisionModels}
        />
      )}

      {teamId === "VISION" && view === "dashboard" && (
        <VisionChat
          assignedModel={assignedVisionModel}
          loading={visionModelsLoading}
          models={availableVisionModels ?? []}
        />
      )}

      {view === "settings" && <section className="agent-team-section">
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
      }

      {view === "settings" && <section className="agent-team-section">
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
      }

      {view === "settings" && <section className="agent-team-section agent-team-management">
        <div className="agent-team-section-heading">
          <div>
            <p className="agent-team-eyebrow">PROTECTED TEAM CONTROLS</p>
            <h2>Build agents & assign work</h2>
          </div>
          {adminAuthenticated && (
            <button
              className="agent-team-quiet-button"
              onClick={signOut}
              type="button"
            >
              Sign out
            </button>
          )}
        </div>

        {adminAuthenticated ? (
          <>
            <div className="agent-management-grid">
              <form className="agent-management-form" onSubmit={createAgent}>
                <h3>Create a sub-agent</h3>
                <label>
                  Name
                  <input
                    maxLength={120}
                    required
                    value={agentForm.name}
                    onChange={(event) =>
                      setAgentForm({ ...agentForm, name: event.target.value })
                    }
                  />
                </label>
                <label>
                  Role
                  <input
                    maxLength={160}
                    required
                    value={agentForm.role}
                    onChange={(event) =>
                      setAgentForm({ ...agentForm, role: event.target.value })
                    }
                  />
                </label>
                <label>
                  Instructions
                  <textarea
                    maxLength={4000}
                    rows={4}
                    value={agentForm.instructions}
                    onChange={(event) =>
                      setAgentForm({
                        ...agentForm,
                        instructions: event.target.value,
                      })
                    }
                  />
                </label>
                <div className="agent-form-inline">
                  <label>
                    Provider
                    <input
                      maxLength={80}
                      value={agentForm.provider}
                      onChange={(event) =>
                        setAgentForm({
                          ...agentForm,
                          provider: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Model
                    <input
                      maxLength={160}
                      value={agentForm.model}
                      onChange={(event) =>
                        setAgentForm({
                          ...agentForm,
                          model: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <button
                  className="agent-team-primary-button"
                  disabled={agentSubmitting}
                  type="submit"
                >
                  {agentSubmitting ? "Creating…" : "Create agent"}
                </button>
              </form>

              <form className="agent-management-form" onSubmit={queueTask}>
                <h3>Assign a task</h3>
                <label>
                  Task title
                  <input
                    maxLength={200}
                    required
                    value={taskForm.title}
                    onChange={(event) =>
                      setTaskForm({ ...taskForm, title: event.target.value })
                    }
                  />
                </label>
                <label>
                  Instructions
                  <textarea
                    maxLength={4000}
                    required
                    rows={7}
                    value={taskForm.description}
                    onChange={(event) =>
                      setTaskForm({
                        ...taskForm,
                        description: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Assign to
                  <select
                    value={taskForm.agentId}
                    onChange={(event) =>
                      setTaskForm({ ...taskForm, agentId: event.target.value })
                    }
                  >
                    <option value="">Team queue</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="agent-queue-note">
                  Tasks are saved in the queue. A worker must be connected
                  before they can run.
                </p>
                <button
                  className="agent-team-primary-button"
                  disabled={taskSubmitting}
                  type="submit"
                >
                  {taskSubmitting ? "Queuing…" : "Queue task"}
                </button>
              </form>
            </div>
            {(actionError || actionNotice) && (
              <p
                aria-live="polite"
                className={`agent-action-message ${actionError ? "is-error" : "is-success"}`}
              >
                {actionError || actionNotice}
              </p>
            )}
          </>
        ) : (
          <form className="agent-admin-signin" onSubmit={signIn}>
            <div>
              <h3>Admin access required</h3>
              <p>
                Admin sign-in is only for team changes. Vision&apos;s assigned
                model and chat do not require signing in here.
              </p>
            </div>
            <label>
              Admin token
              <input
                autoComplete="current-password"
                required
                type="password"
                value={adminToken}
                onChange={(event) => setAdminToken(event.target.value)}
              />
            </label>
            <button className="agent-team-primary-button" type="submit">
              Sign in
            </button>
            {loginError && (
              <p aria-live="polite" className="agent-action-message is-error">
                {loginError}
              </p>
            )}
          </form>
        )}
      </section>
      }
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
