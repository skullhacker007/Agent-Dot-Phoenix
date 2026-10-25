import {
  resolveAgentStatus,
  resolveTeamStatus,
  TEAM_DEFINITIONS,
  type TeamId,
} from "../../lib/agent-monitoring";

type AgentStatus = "idle" | "working" | "failed";
type ExecutionStatus = "RUNNING" | "SUCCEEDED" | "FAILED";
type Usage = { inputTokens?: number; outputTokens?: number };

type AgentInput = {
  id: string;
  teamId: TeamId;
  name: string;
  role: string;
  instructions?: string;
  provider?: string;
  model?: string;
};

type MonitoringEvent = {
  eventId: string;
  teamId: TeamId;
  agent: Omit<AgentInput, "instructions" | "teamId" | "id"> & { id: string };
} & (
  | { type: "heartbeat"; status: AgentStatus }
  | { type: "run_started"; execution: { id: string; provider?: string; model?: string } }
  | {
      type: "run_progress" | "run_succeeded" | "run_failed";
      execution: { id: string; provider?: string; model?: string } & Usage;
    }
);

type Execution = {
  id: string;
  status: ExecutionStatus;
  provider: string | null;
  model: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

type Agent = {
  id: string;
  teamId: TeamId;
  name: string;
  role: string;
  instructions: string;
  status: AgentStatus;
  provider: string | null;
  model: string | null;
  lastHeartbeatAt: Date | null;
  lastSuccessfulExecutionAt: Date | null;
  executions: Execution[];
};

type Task = {
  id: string;
  teamId: TeamId;
  agentId: string | null;
  title: string;
  description: string;
  createdAt: Date;
};

type Store = {
  agents: Map<string, Agent>;
  tasks: Task[];
  eventIds: Set<string>;
};

const globalForMonitoring = globalThis as typeof globalThis & {
  monitoringStore?: Store;
};
const store: Store = (globalForMonitoring.monitoringStore ??= {
  agents: new Map(),
  tasks: [],
  eventIds: new Set(),
});

export class MonitoringConflictError extends Error {}

export function createMonitoredAgent(input: AgentInput) {
  if (store.agents.has(input.id)) {
    throw new MonitoringConflictError("Agent ID already exists.");
  }
  const agent: Agent = {
    ...input,
    instructions: input.instructions ?? "",
    status: "idle",
    provider: input.provider ?? null,
    model: input.model ?? null,
    lastHeartbeatAt: new Date(),
    lastSuccessfulExecutionAt: null,
    executions: [],
  };
  store.agents.set(agent.id, agent);
  return { id: agent.id, name: agent.name, role: agent.role };
}

export function queueMonitoredTask(input: Omit<Task, "createdAt">) {
  if (input.agentId) {
    const agent = store.agents.get(input.agentId);
    if (!agent || agent.teamId !== input.teamId) {
      throw new MonitoringConflictError(
        "Selected agent does not belong to this team.",
      );
    }
  }
  const task = { ...input, createdAt: new Date() };
  store.tasks.unshift(task);
  store.tasks.length = Math.min(store.tasks.length, 1_000);
  return {
    ...task,
    status: "queued" as const,
    agent: input.agentId
      ? { name: store.agents.get(input.agentId)?.name ?? null }
      : null,
  };
}

export function recordMonitoringEvent(event: MonitoringEvent) {
  if (store.eventIds.has(event.eventId)) return { duplicate: true };

  let agent = store.agents.get(event.agent.id);
  if (agent && agent.teamId !== event.teamId) {
    throw new MonitoringConflictError("Agent ID already belongs to another team.");
  }
  if (
    event.type === "run_started" &&
    [...store.agents.values()].some((candidate) =>
      candidate.executions.some(({ id }) => id === event.execution.id),
    )
  ) {
    throw new MonitoringConflictError("Execution ID already exists.");
  }
  const matchingExecution =
    event.type === "run_progress" ||
    event.type === "run_succeeded" ||
    event.type === "run_failed"
      ? agent?.executions.find(
          ({ id, status }) =>
            id === event.execution.id && status === "RUNNING",
        )
      : undefined;
  if (
    event.type !== "heartbeat" &&
    event.type !== "run_started" &&
    !matchingExecution
  ) {
    throw new MonitoringConflictError(
      "Event does not match a running execution for this agent.",
    );
  }

  if (!agent) {
    agent = {
      id: event.agent.id,
      teamId: event.teamId,
      name: event.agent.name,
      role: event.agent.role,
      instructions: "",
      status: "idle",
      provider: null,
      model: null,
      lastHeartbeatAt: null,
      lastSuccessfulExecutionAt: null,
      executions: [],
    };
    store.agents.set(agent.id, agent);
  }

  const now = new Date();
  agent.name = event.agent.name;
  agent.role = event.agent.role;
  agent.provider = event.agent.provider ?? agent.provider;
  agent.model = event.agent.model ?? agent.model;
  agent.lastHeartbeatAt = now;

  if (event.type === "heartbeat") {
    agent.status = event.status;
  } else if (event.type === "run_started") {
    agent.status = "working";
    agent.provider = event.execution.provider ?? agent.provider;
    agent.model = event.execution.model ?? agent.model;
    agent.executions.unshift({
      id: event.execution.id,
      status: "RUNNING",
      provider: agent.provider,
      model: agent.model,
      startedAt: now,
      finishedAt: null,
      inputTokens: null,
      outputTokens: null,
    });
  } else {
    const execution = matchingExecution;
    if (!execution) {
      throw new MonitoringConflictError(
        "Event does not match a running execution for this agent.",
      );
    }
    execution.inputTokens = event.execution.inputTokens ?? execution.inputTokens;
    execution.outputTokens =
      event.execution.outputTokens ?? execution.outputTokens;
    execution.provider = event.execution.provider ?? execution.provider;
    execution.model = event.execution.model ?? execution.model;
    agent.provider = execution.provider;
    agent.model = execution.model;

    if (event.type === "run_progress") {
      agent.status = "working";
    } else {
      execution.status = event.type === "run_succeeded" ? "SUCCEEDED" : "FAILED";
      execution.finishedAt = now;
      agent.status = event.type === "run_succeeded" ? "idle" : "failed";
      if (event.type === "run_succeeded") {
        agent.lastSuccessfulExecutionAt = now;
      }
    }
  }

  store.eventIds.add(event.eventId);
  if (store.eventIds.size > 10_000) {
    const oldestEventId = store.eventIds.values().next().value;
    if (oldestEventId) store.eventIds.delete(oldestEventId);
  }
  return { duplicate: false };
}

export function getMonitoringDashboard() {
  const now = Date.now();
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);

  const teams = TEAM_DEFINITIONS.map((team) => {
    const members = [...store.agents.values()]
      .filter((agent) => agent.teamId === team.id)
      .map((agent) => {
        const latestExecution = agent.executions[0];
        const dailyExecutions = agent.executions.filter(
          ({ startedAt }) => startedAt >= today,
        );
        const dailyTotal = (key: keyof Usage) => {
          const values = dailyExecutions
            .map((execution) => execution[key])
            .filter((value): value is number => value !== undefined && value !== null);
          return values.length
            ? values.reduce((sum, value) => sum + value, 0)
            : null;
        };
        return {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          status: resolveAgentStatus(agent.status, agent.lastHeartbeatAt, now),
          provider: latestExecution?.provider ?? agent.provider,
          model: latestExecution?.model ?? agent.model,
          inputTokens: latestExecution?.inputTokens ?? null,
          outputTokens: latestExecution?.outputTokens ?? null,
          lastHeartbeatAt: agent.lastHeartbeatAt?.toISOString() ?? null,
          lastSuccessfulExecutionAt:
            agent.lastSuccessfulExecutionAt?.toISOString() ?? null,
          currentExecutionStartedAt:
            latestExecution?.status === "RUNNING"
              ? latestExecution.startedAt.toISOString()
              : null,
          dailyInputTokens: dailyTotal("inputTokens"),
          dailyOutputTokens: dailyTotal("outputTokens"),
        };
      });

    const counts = {
      total: members.length,
      working: 0,
      idle: 0,
      stalled: 0,
      failed: 0,
      offline: 0,
    };
    for (const member of members) counts[member.status] += 1;

    const total = (key: "dailyInputTokens" | "dailyOutputTokens") => {
      const values = members
        .map((member) => member[key])
        .filter((value): value is number => value !== null);
      return values.length
        ? values.reduce((sum, value) => sum + value, 0)
        : null;
    };
    const models = [
      ...new Set(
        members
          .map(({ provider, model }) =>
            model ? (provider ? `${provider} · ${model}` : model) : null,
          )
          .filter((model): model is string => model !== null),
      ),
    ];

    return {
      id: team.id,
      assignedModel: null,
      status: resolveTeamStatus(members.map(({ status }) => status)),
      counts,
      tokens: {
        input: total("dailyInputTokens"),
        output: total("dailyOutputTokens"),
      },
      models,
      agents: members,
      tasks: store.tasks
        .filter((task) => task.teamId === team.id)
        .slice(0, 20)
        .map((task) => ({
          id: task.id,
          title: task.title,
          description: task.description,
          status: "queued" as const,
          agentId: task.agentId,
          agentName: task.agentId
            ? store.agents.get(task.agentId)?.name ?? null
            : null,
          createdAt: task.createdAt.toISOString(),
        })),
    };
  });

  return { teams, updatedAt: new Date(now).toISOString() };
}
