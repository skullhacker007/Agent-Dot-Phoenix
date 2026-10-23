import { describe, expect, it } from "vitest";
import {
  HEARTBEAT_OFFLINE_AFTER_MS,
  HEARTBEAT_STALE_AFTER_MS,
  resolveAgentStatus,
  resolveTeamStatus,
} from "./agent-monitoring";

describe("resolveAgentStatus", () => {
  const now = Date.now();

  it("reports an agent offline if it has never sent a heartbeat", () => {
    expect(resolveAgentStatus("idle", null, now)).toBe("offline");
  });

  it("marks active work stalled after the heartbeat threshold", () => {
    const heartbeat = new Date(now - HEARTBEAT_STALE_AFTER_MS - 1);
    expect(resolveAgentStatus("working", heartbeat, now)).toBe("stalled");
  });

  it("marks any agent offline after the offline threshold", () => {
    const heartbeat = new Date(now - HEARTBEAT_OFFLINE_AFTER_MS - 1);
    expect(resolveAgentStatus("failed", heartbeat, now)).toBe("offline");
  });

  it("preserves a recent worker-reported failure", () => {
    expect(resolveAgentStatus("failed", new Date(now), now)).toBe("failed");
  });
});

describe("resolveTeamStatus", () => {
  it("prioritizes failed and stalled agents over normal work", () => {
    expect(resolveTeamStatus(["working", "failed"])).toBe("attention");
    expect(resolveTeamStatus(["working", "stalled"])).toBe("stalled");
  });

  it("reports idle, working, offline, and mixed teams accurately", () => {
    expect(resolveTeamStatus(["idle", "idle"])).toBe("idle");
    expect(resolveTeamStatus(["working", "idle"])).toBe("working");
    expect(resolveTeamStatus(["offline", "offline"])).toBe("offline");
    expect(resolveTeamStatus(["idle", "offline"])).toBe("partial");
    expect(resolveTeamStatus([])).toBe("offline");
  });
});
