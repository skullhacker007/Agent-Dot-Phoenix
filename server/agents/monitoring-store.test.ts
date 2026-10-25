import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { dashboardResponseSchema } from "../../lib/agent-monitoring";
import {
  getMonitoringDashboard,
  recordMonitoringEvent,
} from "./monitoring-store";

describe("in-memory agent monitoring", () => {
  it("records execution status and token usage without a database", () => {
    const agent = {
      id: randomUUID(),
      name: "Monitoring test agent",
      role: "Test",
      provider: "NVIDIA",
      model: "test-model",
    };
    const executionId = randomUUID();

    recordMonitoringEvent({
      eventId: randomUUID(),
      teamId: "JARVIS",
      agent,
      type: "run_started",
      execution: { id: executionId },
    });
    recordMonitoringEvent({
      eventId: randomUUID(),
      teamId: "JARVIS",
      agent,
      type: "run_progress",
      execution: { id: executionId, inputTokens: 12, outputTokens: 3 },
    });
    const completionEvent = {
      eventId: randomUUID(),
      teamId: "JARVIS" as const,
      agent,
      type: "run_succeeded" as const,
      execution: { id: executionId, inputTokens: 12, outputTokens: 5 },
    };
    recordMonitoringEvent(completionEvent);

    const result = getMonitoringDashboard();
    expect(dashboardResponseSchema.safeParse(result).success).toBe(true);
    const team = result.teams.find(({ id }) => id === "JARVIS");
    expect(team?.counts.idle).toBe(1);
    expect(team?.tokens).toEqual({ input: 12, output: 5 });
    expect(team?.agents[0]?.status).toBe("idle");
    expect(recordMonitoringEvent(completionEvent)).toEqual({ duplicate: true });
  });

  it("rejects execution events that cannot be applied", () => {
    expect(() =>
      recordMonitoringEvent({
        eventId: randomUUID(),
        teamId: "FRIDAY",
        agent: {
          id: randomUUID(),
          name: "Unknown agent",
          role: "Test",
        },
        type: "run_succeeded",
        execution: { id: randomUUID() },
      }),
    ).toThrow("Event does not match a running execution");
  });
});
