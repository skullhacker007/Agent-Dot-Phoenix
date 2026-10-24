"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import {
  TEAM_DEFINITIONS,
  dashboardResponseSchema,
} from "@/lib/agent-monitoring";
import type { TeamDashboard } from "@/lib/agent-monitoring";
import { agentModelsResponseSchema } from "@/lib/agent-models";
import { useAgentModelPreferences } from "@/lib/agent-model-preferences";
import "./RobotAvatar.css";

const Spline = dynamic(() => import("@splinetool/react-spline"), {
  ssr: false,
  loading: () => null,
});

type AgentId = (typeof TEAM_DEFINITIONS)[number]["agentId"];

type IdleCallbackWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

type WeatherResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
};

const AGENT_ICONS: Record<AgentId, ReactNode> = {
  jarvis: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5v3M12 17.5v3M3.5 12h3m11 0h3M6 6l2.1 2.1m7.8 7.8L18 18m0-12-2.1 2.1m-7.8 7.8L6 18" />
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="12" cy="12" r="1" className="agent-icon-fill" />
    </svg>
  ),
  friday: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M3.8 19v-1.2a5.2 5.2 0 0 1 10.4 0V19" />
      <path d="M15.5 7.5h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-1.8L15 17v-2.5h-.5A1.5 1.5 0 0 1 13 13V9a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="M15.5 10.5h3m-3 2h2" />
    </svg>
  ),
  ultron: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 3.5v2m4-2v2m4-2v2M8 18.5v2m4-2v2m4-2v2m2.5-10h2m-2 4h2m-2-8h2m-19 4h2m-2 4h2m-2-8h2" />
      <path d="M6.5 5.5h11v13h-11z" />
      <path d="m12 7.5 3.2 2v4.3L12 16l-3.2-2.2V9.5l3.2-2Z" />
      <path d="M10.3 11.2h.1m3.2 0h.1" />
    </svg>
  ),
  vision: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2.8 12s3.2-6 9.2-6 9.2 6 9.2 6-3.2 6-9.2 6-9.2-6-9.2-6Z" />
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="12" cy="12" r="1" className="agent-icon-fill" />
    </svg>
  ),
};

const WEATHER_DESCRIPTIONS: Record<number, string> = {
  0: "CLEAR SKY",
  1: "MAINLY CLEAR",
  2: "PARTLY CLOUDY",
  3: "OVERCAST",
  45: "FOG",
  48: "RIME FOG",
  51: "LIGHT DRIZZLE",
  53: "DRIZZLE",
  55: "HEAVY DRIZZLE",
  56: "FREEZING DRIZZLE",
  57: "FREEZING DRIZZLE",
  61: "LIGHT RAIN",
  63: "RAIN",
  65: "HEAVY RAIN",
  66: "FREEZING RAIN",
  67: "FREEZING RAIN",
  71: "LIGHT SNOW",
  73: "SNOW",
  75: "HEAVY SNOW",
  77: "SNOW GRAINS",
  80: "RAIN SHOWERS",
  81: "RAIN SHOWERS",
  82: "HEAVY SHOWERS",
  85: "SNOW SHOWERS",
  86: "HEAVY SNOW SHOWERS",
  95: "THUNDERSTORM",
  96: "THUNDERSTORM",
  99: "THUNDERSTORM",
};

export default function RobotAvatar() {
  const [selectedAgent, setSelectedAgent] = useState<AgentId>("jarvis");
  const [shouldLoadSpline, setShouldLoadSpline] = useState(false);
  const [splineLoaded, setSplineLoaded] = useState(false);
  const [visibleAgentCount, setVisibleAgentCount] = useState(0);
  const [teamDashboards, setTeamDashboards] = useState<TeamDashboard[]>([]);
  const [monitoringLoading, setMonitoringLoading] = useState(true);
  const [visionDefaultModel, setVisionDefaultModel] = useState<string | null>(
    null,
  );
  const modelPreferences = useAgentModelPreferences();

  useEffect(() => {
    const idleWindow = window as IdleCallbackWindow;
    const requestIdleCallback = idleWindow.requestIdleCallback;
    const cancelIdleCallback = idleWindow.cancelIdleCallback;

    if (requestIdleCallback && cancelIdleCallback) {
      const idleCallbackId = requestIdleCallback.call(
        idleWindow,
        () => setShouldLoadSpline(true),
        { timeout: 1200 },
      );

      return () => cancelIdleCallback.call(idleWindow, idleCallbackId);
    }

    const timeoutId = window.setTimeout(() => setShouldLoadSpline(true), 250);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    let active = true;
    const eventSource = new EventSource("/api/monitoring/teams/stream");

    eventSource.onopen = () => {
      if (active) {
        setMonitoringLoading(false);
      }
    };

    eventSource.onmessage = (event) => {
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        console.error("Monitoring stream sent invalid JSON.", error);
        return;
      }

      const parsed = dashboardResponseSchema.safeParse(payload);
      if (!parsed.success) {
        console.error("Monitoring stream sent an invalid dashboard payload.");
        return;
      }

      if (active) {
        setTeamDashboards(parsed.data.teams);
        setMonitoringLoading(false);
      }
    };

    eventSource.onerror = () => {
      if (active) {
        setMonitoringLoading(false);
      }
    };

    return () => {
      active = false;
      eventSource.close();
    };
  }, []);

  useEffect(() => {
    let active = true;

    void fetch("/api/agents/models?teamId=VISION", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Vision model discovery returned ${response.status}.`);
        }
        const parsed = agentModelsResponseSchema.safeParse(
          await response.json(),
        );
        if (!parsed.success) {
          throw new Error("Vision model discovery returned invalid data.");
        }
        if (active) setVisionDefaultModel(parsed.data.assignedModel);
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("Unable to load Vision's default model for its card.", error);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!splineLoaded || visibleAgentCount >= TEAM_DEFINITIONS.length) return;

    const delay = visibleAgentCount === 0 ? 700 : 220;
    const timeoutId = window.setTimeout(() => {
      setVisibleAgentCount((count) => count + 1);
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [splineLoaded, visibleAgentCount]);

  const selectAgent = (agentId: AgentId) => {
    setSelectedAgent(agentId);
  };

  return (
    <main className="robot-scene">
      <div className="robot-background" aria-hidden="true" />
      <div className="robot-glow" aria-hidden="true" />
      <div className="robot-particles" aria-hidden="true" />

      <div
        className={`robot-model ${splineLoaded ? "is-loaded" : ""}`}
        aria-label="NAVI master agent"
      >
        {shouldLoadSpline && (
          <Spline
            scene="/robo.spline"
            onLoad={() => {
              setSplineLoaded(true);
              if (
                window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ) {
                setVisibleAgentCount(TEAM_DEFINITIONS.length);
              }
            }}
          />
        )}
      </div>
      <div className="navi-chest-label" aria-label="NAVI Master Agent">
        N A V I
      </div>

      <div className="robot-vignette" aria-hidden="true" />

      <div className="robot-chest-reactor" aria-hidden="true">
        <span />
      </div>

      <NaviHeader />

      <section className="navi-agent-layout" aria-label="NAVI managed agents">
        <div className="navi-agent-column navi-agent-column-left">
          {TEAM_DEFINITIONS.filter(
            (team) => team.id === "JARVIS" || team.id === "ULTRON",
          ).map((agent) => (
            <AgentCard
              key={agent.agentId}
              team={agent}
              dashboard={teamDashboards.find(({ id }) => id === agent.id)}
              assignedModel={
                modelPreferences[agent.id] ??
                teamDashboards.find(({ id }) => id === agent.id)?.assignedModel ??
                null
              }
              loading={monitoringLoading}
              revealed={
                TEAM_DEFINITIONS.findIndex(({ id }) => id === agent.id) <
                visibleAgentCount
              }
              selected={selectedAgent === agent.agentId}
              onSelect={() => selectAgent(agent.agentId)}
            />
          ))}
        </div>

        <div className="navi-agent-column navi-agent-column-right">
          {TEAM_DEFINITIONS.filter(
            (team) => team.id === "FRIDAY" || team.id === "VISION",
          ).map((agent) => (
            <AgentCard
              key={agent.agentId}
              team={agent}
              dashboard={teamDashboards.find(({ id }) => id === agent.id)}
              assignedModel={
                modelPreferences[agent.id] ??
                teamDashboards.find(({ id }) => id === agent.id)?.assignedModel ??
                (agent.id === "VISION" ? visionDefaultModel : null) ??
                null
              }
              loading={monitoringLoading}
              revealed={
                TEAM_DEFINITIONS.findIndex(({ id }) => id === agent.id) <
                visibleAgentCount
              }
              selected={selectedAgent === agent.agentId}
              onSelect={() => selectAgent(agent.agentId)}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

/* Compact header: icon and information stay on the same line. */
function NaviHeader() {
  const [now, setNow] = useState<Date | null>(null);
  const location = "TIRUPATI";
  const [temperature, setTemperature] = useState("--°C");
  const [weatherDescription, setWeatherDescription] = useState("WEATHER");

  // Local time and date update automatically.
  useEffect(() => {
    const updateTime = () => setNow(new Date());

    updateTime();

    const timer = window.setInterval(updateTime, 1000);

    return () => window.clearInterval(timer);
  }, []);

  // Fetch weather for Tirupati, Andhra Pradesh.
  useEffect(() => {
    const controller = new AbortController();

    async function loadWeather() {
      try {
        const weatherUrl =
          "https://api.open-meteo.com/v1/forecast" +
          "?latitude=13.6288" +
          "&longitude=79.4192" +
          "&current=temperature_2m,weather_code" +
          "&temperature_unit=celsius";

        const weatherResponse = await fetch(weatherUrl, {
          signal: controller.signal,
        });

        if (!weatherResponse.ok) {
          throw new Error("Weather lookup failed");
        }

        const weatherData: WeatherResponse = await weatherResponse.json();

        if (controller.signal.aborted) return;

        const current = weatherData.current;

        if (typeof current?.temperature_2m === "number") {
          setTemperature(`${Math.round(current.temperature_2m)}°C`);
        }

        const code = current?.weather_code;

        setWeatherDescription(
          typeof code === "number"
            ? WEATHER_DESCRIPTIONS[code] || "CURRENT CONDITIONS"
            : "WEATHER UNAVAILABLE",
        );
      } catch {
        if (controller.signal.aborted) return;

        setTemperature("--°C");
        setWeatherDescription("WEATHER UNAVAILABLE");
      }
    }

    void loadWeather();

    return () => controller.abort();
  }, []);

  const time = now
    ? now.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "--:--";

  const date = now
    ? now
        .toLocaleDateString(undefined, {
          weekday: "short",
          day: "2-digit",
          month: "short",
        })
        .toUpperCase()
    : "LOADING DATE";

  return (
    <header className="navi-header" aria-label="Local time and weather">
      <div className="navi-header-information">
        {/* Time and date */}
        <div className="navi-header-group navi-header-clock">
          <svg
            className="navi-header-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7v5l3.5 2" />
          </svg>

          <div className="navi-header-copy">
            <time className="navi-header-primary">{time}</time>
            <span className="navi-header-secondary">{date}</span>
          </div>
        </div>

        <span className="navi-header-divider" aria-hidden="true" />

        {/* Weather and detected location */}
        <div className="navi-header-group navi-header-weather">
          <svg
            className="navi-header-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M7.2 18.2h10.2a3.6 3.6 0 0 0 .2-7.2 5.7 5.7 0 0 0-10.8-1.1 4.2 4.2 0 0 0 .4 8.3Z" />
            <path d="m8 3-.7 1.6M16 3l.7 1.6M3.5 8.2l1.7.5" />
          </svg>

          <div className="navi-header-copy">
            <span className="navi-header-primary">{temperature}</span>

            <span
              className="navi-header-secondary"
              title={`${location} · ${weatherDescription}`}
            >
              {location} · {weatherDescription}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

function AgentCard({
  team,
  dashboard,
  assignedModel,
  loading,
  revealed,
  selected,
  onSelect,
}: {
  team: (typeof TEAM_DEFINITIONS)[number];
  dashboard: TeamDashboard | undefined;
  assignedModel: string | null;
  loading: boolean;
  revealed: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const status = dashboard?.status ?? (loading ? "loading" : "idle");
  const statusLabel = dashboard?.status ?? (loading ? "Loading" : "Idle");
  const visibleMembers = dashboard?.agents.slice(0, 2) ?? [];
  const modelSummary = assignedModel
    ? assignedModel
    : dashboard?.models.length
      ? dashboard.models.join(", ")
    : "No Model assigned";
  const inputUsage = dashboard?.tokens.input ?? null;
  const outputUsage = dashboard?.tokens.output ?? null;
  const usageMax = Math.max(inputUsage ?? 0, outputUsage ?? 0);
  const tokenRate = getEstimatedTokenRate(dashboard);
  const isWorking = (dashboard?.counts.working ?? 0) > 0;

  return (
    <article
      className={`navi-agent-card ${selected ? "is-selected" : ""} ${
        revealed ? "is-revealed" : ""
      }`}
    >
      <button
        type="button"
        className="navi-agent-card-select navi-agent-card-top"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Select ${team.name}`}
      >
        <span
          className={`navi-agent-icon icon-${team.agentId}`}
          aria-hidden="true"
        >
          {AGENT_ICONS[team.agentId]}
        </span>

        <div className="navi-agent-heading">
          <span className="navi-agent-name" title={team.name}>
            {team.name}
          </span>
          <span className="navi-agent-role" title={team.role}>
            {team.role}
          </span>
        </div>

        <span className={`navi-agent-status status-${status}`}>
          <span />
          {statusLabel}
        </span>
      </button>

      <div className="navi-team-metrics">
        <div>
          <span className="navi-metric-label">TOTAL</span>
          <strong>{dashboard?.counts.total ?? "—"}</strong>
        </div>
        <div>
          <span className="navi-metric-label">WORKING</span>
          <strong>{dashboard?.counts.working ?? "—"}</strong>
        </div>
        <div>
          <span className="navi-metric-label">IDLE</span>
          <strong>{dashboard?.counts.idle ?? "—"}</strong>
        </div>
        <div>
          <span className="navi-metric-label">ISSUES</span>
          <strong>
            {dashboard
              ? dashboard.counts.failed + dashboard.counts.stalled
              : "—"}
          </strong>
        </div>
      </div>

      <div className="navi-team-model" title={modelSummary}>
        <span className="navi-metric-label">MODELS</span>
        <strong>{modelSummary}</strong>
      </div>

      <div
        className={`navi-gpu-module ${isWorking ? "is-running" : ""}`}
        role="group"
        aria-label={`Compute module ${isWorking ? "working" : "idle"}`}
      >
        <div className="navi-gpu-hardware" aria-hidden="true">
          <span className="navi-gpu-fan" />
          <span className="navi-gpu-fan" />
        </div>
        <div className="navi-gpu-telemetry">
          <div className="navi-gpu-telemetry-heading">
            <span className="navi-metric-label">
              GPU · {isWorking ? "ACTIVE" : "IDLE"}
            </span>
            <strong>
              {tokenRate === null
                ? "—"
                : `~${formatTokenCount(tokenRate)} tok/s`}
            </strong>
          </div>
          <div
            className="navi-gpu-usage"
            aria-label={`Today's token usage: ${formatTokenCount(inputUsage)} input and ${formatTokenCount(outputUsage)} output`}
          >
            <div className="navi-gpu-usage-row">
              <span>IN</span>
              <span className="navi-gpu-usage-track">
                <span
                  className="navi-gpu-usage-fill is-input"
                  style={{
                    width: `${usageMax ? ((inputUsage ?? 0) / usageMax) * 100 : 0}%`,
                  }}
                />
              </span>
              <strong>{formatTokenCount(inputUsage)}</strong>
            </div>
            <div className="navi-gpu-usage-row">
              <span>OUT</span>
              <span className="navi-gpu-usage-track">
                <span
                  className="navi-gpu-usage-fill is-output"
                  style={{
                    width: `${usageMax ? ((outputUsage ?? 0) / usageMax) * 100 : 0}%`,
                  }}
                />
              </span>
              <strong>{formatTokenCount(outputUsage)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="navi-team-members">
        {visibleMembers.length
          ? visibleMembers.map((member) => (
              <div className="navi-team-member" key={member.id}>
                <div className="navi-team-member-heading">
                  <span title={member.name}>{member.name}</span>
                  <span
                    className={`navi-member-status status-${member.status}`}
                    title={`Last heartbeat: ${member.lastHeartbeatAt ?? "not received"}`}
                  >
                    {member.status}
                  </span>
                </div>
                <div className="navi-team-member-details">
                  <span title={member.model ?? "No Model assigned"}>
                    {member.model ?? "No Model assigned"}
                  </span>
                  <span>
                    {formatTokenCount(member.inputTokens)} IN ·{" "}
                    {formatTokenCount(member.outputTokens)} OUT
                  </span>
                </div>
                <div className="navi-team-member-meta">
                  HEARTBEAT {formatAge(member.lastHeartbeatAt)} · LAST SUCCESS{" "}
                  {formatAge(member.lastSuccessfulExecutionAt)}
                </div>
              </div>
            ))
          : loading && <span className="navi-team-empty">Loading agents…</span>}
        {(dashboard?.counts.total ?? 0) > visibleMembers.length && (
          <span className="navi-team-more">
            +{(dashboard?.counts.total ?? 0) - visibleMembers.length} more
          </span>
        )}
      </div>

    </article>
  );
}

function getEstimatedTokenRate(dashboard: TeamDashboard | undefined) {
  if (!dashboard) return null;

  const tokenRate = dashboard.agents.reduce((totalRate, agent) => {
    const startedAt = agent.currentExecutionStartedAt;
    if (agent.status !== "working" || startedAt === null) return totalRate;

    const elapsedSeconds = Math.max(
      1,
      (Date.now() - Date.parse(startedAt)) / 1000,
    );
    if (!Number.isFinite(elapsedSeconds)) return totalRate;
    const runTokens = (agent.inputTokens ?? 0) + (agent.outputTokens ?? 0);
    return totalRate + runTokens / elapsedSeconds;
  }, 0);
  return tokenRate > 0 ? tokenRate : null;
}

function formatTokenCount(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

function formatAge(timestamp: string | null) {
  if (!timestamp) return "—";
  const ageSeconds = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(timestamp)) / 1000),
  );
  if (!Number.isFinite(ageSeconds)) return "—";
  if (ageSeconds < 60) return `${ageSeconds}s`;
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)}m`;
  if (ageSeconds < 86_400) return `${Math.floor(ageSeconds / 3600)}h`;
  return `${Math.floor(ageSeconds / 86_400)}d`;
}
