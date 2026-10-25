import { AgentRuntimeStatus } from "@prisma/client";
import {
  TEAM_DEFINITIONS,
  resolveAgentStatus,
  resolveTeamStatus,
} from "@/lib/agent-monitoring";
import { getPrisma } from "@/server/database/prisma";

const reportedStatuses = {
  [AgentRuntimeStatus.IDLE]: "idle",
  [AgentRuntimeStatus.WORKING]: "working",
  [AgentRuntimeStatus.FAILED]: "failed",
} as const;

const taskStatuses = {
  QUEUED: "queued",
} as const;

export async function getMonitoringDashboard() {
  const prisma = getPrisma();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const [agents, dailyUsage, tasks] = await Promise.all([
    prisma.subAgent.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        executions: {
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
    }),
    prisma.agentExecution.groupBy({
      by: ["agentId"],
      where: { startedAt: { gte: dayStart } },
      _sum: { inputTokens: true, outputTokens: true },
    }),
    prisma.agentTask.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { agent: { select: { name: true } } },
    }),
  ]);

  const usageByAgent = new Map(
    dailyUsage.map((usage) => [
      usage.agentId,
      { input: usage._sum.inputTokens, output: usage._sum.outputTokens },
    ]),
  );
  const now = Date.now();
  const teams = TEAM_DEFINITIONS.map((team) => {
    const members = agents
      .filter((agent) => agent.teamId === team.id)
      .map((agent) => {
        const latestExecution = agent.executions[0];
        const usage = usageByAgent.get(agent.id);
        return {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          status: resolveAgentStatus(
            reportedStatuses[agent.status],
            agent.lastHeartbeatAt,
            now,
          ),
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
          dailyInputTokens: usage?.input ?? null,
          dailyOutputTokens: usage?.output ?? null,
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
    for (const member of members) {
      counts[member.status] += 1;
    }

    const measuredInput = members
      .map(({ dailyInputTokens }) => dailyInputTokens)
      .filter((value): value is number => value !== null);
    const measuredOutput = members
      .map(({ dailyOutputTokens }) => dailyOutputTokens)
      .filter((value): value is number => value !== null);
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
        input: measuredInput.length
          ? measuredInput.reduce((sum, value) => sum + value, 0)
          : null,
        output: measuredOutput.length
          ? measuredOutput.reduce((sum, value) => sum + value, 0)
          : null,
      },
      models,
      agents: members,
      tasks: tasks
        .filter((task) => task.teamId === team.id)
        .slice(0, 20)
        .map((task) => ({
          id: task.id,
          title: task.title,
          description: task.description,
          status: taskStatuses[task.status],
          agentId: task.agentId,
          agentName: task.agent?.name ?? null,
          createdAt: task.createdAt.toISOString(),
        })),
    };
  });

  return { teams, updatedAt: new Date(now).toISOString() };
}
