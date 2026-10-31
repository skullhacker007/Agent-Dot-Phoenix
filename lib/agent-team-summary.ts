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
  // Chatbot is an agent on every team page
  const hasChatAgent = true;
  const hasConnectedModel = Boolean(assignedModel && assignedModel.trim());
  const chatAgentStatus: AgentStatus = !hasConnectedModel
    ? "idle"
    : activity?.status === "error"
      ? "failed"
      : "working";

  if (loading && !dashboard) {
    return {
      total: null,
      working: null,
      idle: null,
      issues: null,
      status: "loading",
      chatAgentStatus,
    };
  }

  const counts = dashboard?.counts;
  const isChatWorking = chatAgentStatus === "working";
  const isChatIdle = chatAgentStatus === "idle";
  const isChatFailed = chatAgentStatus === "failed";

  const total =
    counts === undefined
      ? 1
      : counts.total + 1;
  const working =
    counts === undefined
      ? Number(isChatWorking)
      : counts.working + Number(isChatWorking);
  const idle =
    counts === undefined
      ? Number(isChatIdle)
      : counts.idle + Number(isChatIdle);
  const issues =
    counts === undefined
      ? Number(isChatFailed)
      : counts.failed +
        counts.stalled +
        Number(isChatFailed);

  const statuses: AgentStatus[] = [
    ...(dashboard?.agents.map(({ status }) => status) ?? []),
    chatAgentStatus,
  ];
  const status =
    statuses.length > 0
      ? resolveTeamStatus(statuses)
      : dashboard?.status ?? (loading ? "loading" : "offline");

  return { total, working, idle, issues, status, chatAgentStatus };
}
