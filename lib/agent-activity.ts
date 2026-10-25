import { TEAM_DEFINITIONS, type TeamId } from "./agent-monitoring";

export type AgentActivityStatus = "idle" | "working" | "error";

export type AgentActivity = {
  status: AgentActivityStatus;
  inputTokens: number;
  outputTokens: number;
  tokensPerSecond: number;
  startedAt: number;
  updatedAt: number;
};

type AgentActivityChange = { teamId: TeamId } & AgentActivity;

const STORAGE_KEY_PREFIX = "agent-chat-activity:";
const ACTIVITY_EVENT = "agent-chat-activity";
const STALE_WORKING_AFTER_MS = 90_000;

function isTeamId(value: string): value is TeamId {
  return TEAM_DEFINITIONS.some(({ id }) => id === value);
}

function isAgentActivityStatus(value: unknown): value is AgentActivityStatus {
  return value === "idle" || value === "working" || value === "error";
}

function isAgentActivity(value: unknown): value is AgentActivity {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    isAgentActivityStatus(value.status) &&
    "inputTokens" in value &&
    typeof value.inputTokens === "number" &&
    Number.isFinite(value.inputTokens) &&
    "outputTokens" in value &&
    typeof value.outputTokens === "number" &&
    Number.isFinite(value.outputTokens) &&
    "tokensPerSecond" in value &&
    typeof value.tokensPerSecond === "number" &&
    Number.isFinite(value.tokensPerSecond) &&
    "startedAt" in value &&
    typeof value.startedAt === "number" &&
    Number.isFinite(value.startedAt) &&
    "updatedAt" in value &&
    typeof value.updatedAt === "number" &&
    Number.isFinite(value.updatedAt)
  );
}

function normalizeAgentActivity(value: unknown): AgentActivity | null {
  if (isAgentActivity(value)) return value;
  if (
    typeof value !== "object" ||
    value === null ||
    !("status" in value) ||
    !isAgentActivityStatus(value.status) ||
    !("updatedAt" in value) ||
    typeof value.updatedAt !== "number" ||
    !Number.isFinite(value.updatedAt)
  ) {
    return null;
  }

  return {
    status: value.status,
    inputTokens: 0,
    outputTokens: 0,
    tokensPerSecond: 0,
    startedAt: value.updatedAt,
    updatedAt: value.updatedAt,
  };
}

function getStorageKey(teamId: TeamId) {
  return `${STORAGE_KEY_PREFIX}${teamId}`;
}

export function getAgentActivity(teamId: TeamId): AgentActivity | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(getStorageKey(teamId));
  } catch (error) {
    console.error(`Unable to read ${teamId} activity status.`, error);
    return null;
  }
  if (!raw) return null;

  let activity: unknown;
  try {
    activity = JSON.parse(raw);
  } catch (error) {
    console.error(`Stored ${teamId} activity is invalid JSON.`, error);
    return null;
  }

  const normalizedActivity = normalizeAgentActivity(activity);
  if (!normalizedActivity) {
    try {
      window.localStorage.removeItem(getStorageKey(teamId));
    } catch (error) {
      console.error(`Unable to clear invalid ${teamId} activity status.`, error);
    }
    return null;
  }

  if (
    normalizedActivity.status === "working" &&
    Date.now() - normalizedActivity.updatedAt > STALE_WORKING_AFTER_MS
  ) {
    return null;
  }

  if (!isAgentActivity(activity)) {
    try {
      window.localStorage.setItem(
        getStorageKey(teamId),
        JSON.stringify(normalizedActivity),
      );
    } catch (error) {
      console.error(`Unable to migrate ${teamId} activity status.`, error);
    }
  }

  return normalizedActivity;
}

export function setAgentActivity(
  teamId: TeamId,
  activity: Omit<AgentActivity, "updatedAt">,
) {
  const nextActivity: AgentActivity = {
    ...activity,
    updatedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(
      getStorageKey(teamId),
      JSON.stringify(nextActivity),
    );
  } catch (error) {
    console.error(`Unable to persist ${teamId} activity status.`, error);
  }

  window.dispatchEvent(
    new CustomEvent<AgentActivityChange>(ACTIVITY_EVENT, {
      detail: { teamId, ...nextActivity },
    }),
  );
}

export function subscribeToAgentActivity(
  onChange: (teamId: TeamId, activity: AgentActivity | null) => void,
) {
  const handleActivity = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (
      typeof detail !== "object" ||
      detail === null ||
      !("teamId" in detail) ||
      typeof detail.teamId !== "string" ||
      !isTeamId(detail.teamId) ||
      !isAgentActivity(detail)
    ) return;
    onChange(detail.teamId, detail);
  };

  const handleStorage = (event: StorageEvent) => {
    if (!event.key?.startsWith(STORAGE_KEY_PREFIX)) return;
    const teamId = event.key.slice(STORAGE_KEY_PREFIX.length);
    if (!isTeamId(teamId)) return;
    onChange(teamId, getAgentActivity(teamId));
  };

  window.addEventListener(ACTIVITY_EVENT, handleActivity);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(ACTIVITY_EVENT, handleActivity);
    window.removeEventListener("storage", handleStorage);
  };
}
