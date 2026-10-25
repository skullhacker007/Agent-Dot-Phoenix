import { describe, expect, it } from "vitest";
import type { AgentActivity } from "./agent-activity";
import type { TeamDashboard } from "./agent-monitoring";
import { resolveAgentTeamSummary } from "./agent-team-summary";

const activity = (status: AgentActivity["status"]): AgentActivity => ({
  status,
  inputTokens: 0,
  outputTokens: 0,
  tokensPerSecond: 0,
  startedAt: 1,
  updatedAt: 1,
});

const dashboard: TeamDashboard = {
  id: "VISION",
  status: "working",
  counts: {
    total: 2,
    working: 1,
    idle: 1,
    stalled: 0,
    failed: 0,
    offline: 0,
  },
  tokens: { input: 0, output: 0 },
  assignedModel: null,
  models: [],
  agents: [
    {
      id: "vision-worker",
      name: "Vision worker",
      role: "Analytics",
      status: "working",
      provider: null,
      model: null,
      inputTokens: null,
      outputTokens: null,
      lastHeartbeatAt: null,
      lastSuccessfulExecutionAt: null,
      currentExecutionStartedAt: null,
      dailyInputTokens: null,
      dailyOutputTokens: null,
    },
    {
      id: "vision-idle",
      name: "Vision idle",
      role: "Analytics",
      status: "idle",
      provider: null,
      model: null,
      inputTokens: null,
      outputTokens: null,
      lastHeartbeatAt: null,
      lastSuccessfulExecutionAt: null,
      currentExecutionStartedAt: null,
      dailyInputTokens: null,
      dailyOutputTokens: null,
    },
  ],
  tasks: [],
};

describe("resolveAgentTeamSummary", () => {
  it("includes an assigned chat assistant as working alongside monitored agents", () => {
    expect(resolveAgentTeamSummary(dashboard, "provider/model", null, false)).toMatchObject({
      total: 3,
      working: 2,
      idle: 1,
      issues: 0,
      status: "working",
      chatAgentStatus: "working",
    });
  });

  it("surfaces a chat error consistently in counts and team status", () => {
    expect(
      resolveAgentTeamSummary(dashboard, "provider/model", activity("error"), false),
    ).toMatchObject({
      total: 3,
      working: 1,
      idle: 1,
      issues: 1,
      status: "attention",
      chatAgentStatus: "failed",
    });
  });

  it("does not count unassigned chat activity", () => {
    expect(
      resolveAgentTeamSummary(dashboard, null, activity("working"), false),
    ).toMatchObject({
      total: 2,
      working: 1,
      idle: 1,
      issues: 0,
      chatAgentStatus: null,
    });
  });

  it("shows an assigned assistant while monitoring data is unavailable", () => {
    expect(resolveAgentTeamSummary(undefined, "provider/model", null, false)).toMatchObject({
      total: 1,
      working: 1,
      idle: 0,
      issues: 0,
      status: "working",
    });
  });

  it("keeps an empty team loading until monitoring is ready", () => {
    expect(resolveAgentTeamSummary(undefined, null, null, true)).toMatchObject({
      total: null,
      working: null,
      idle: null,
      issues: null,
      status: "loading",
    });
  });
});
