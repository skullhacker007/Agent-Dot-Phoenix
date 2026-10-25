import {
  resolveTeamStatus,
  type AgentStatus,
  type TeamDashboard,
  type TeamStatus,
} from "./agent-monitoring";
import type { AgentActivity } from "./agent-activity";

export type AgentTeamSummary = {
  total: number | null;
  working: number | null;
  idle: number | null;
  issues: number | null;
  status: TeamStatus | "loading";
  chatAgentStatus: AgentStatus | null;
};

export function resolveAgentTeamSummary(
  dashboard: TeamDashboard | undefined,
  assignedModel: string | null,
  activity: AgentActivity | null,
  loading: boolean,
): AgentTeamSummary {
  const hasChatAgent = Boolean(assignedModel);
  const chatAgentStatus: AgentStatus | null = hasChatAgent
    ? activity?.status === "error"
      ? "failed"
      : "working"
    : null;
  const counts = dashboard?.counts;
  const total =
    counts === undefined
      ? hasChatAgent
        ? 1
        : null
      : counts.total + Number(hasChatAgent);
  const working =
    counts === undefined
      ? hasChatAgent
        ? Number(chatAgentStatus === "working")
        : null
      : counts.working + Number(chatAgentStatus === "working");
  const idle =
    counts === undefined
      ? hasChatAgent
        ? 0
        : null
      : counts.idle;
  const issues =
    counts === undefined
      ? hasChatAgent
        ? Number(chatAgentStatus === "failed")
        : null
      : counts.failed +
        counts.stalled +
        Number(chatAgentStatus === "failed");

  const statuses: AgentStatus[] = [
    ...(dashboard?.agents.map(({ status }) => status) ?? []),
    ...(chatAgentStatus ? [chatAgentStatus] : []),
  ];
  const status =
    statuses.length > 0
      ? resolveTeamStatus(statuses)
      : dashboard?.status ?? (loading ? "loading" : "offline");

  return { total, working, idle, issues, status, chatAgentStatus };
}
