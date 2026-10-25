// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAgentActivity,
  setAgentActivity,
  subscribeToAgentActivity,
} from "./agent-activity";

describe("agent chat activity", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists activity and notifies same-tab subscribers", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToAgentActivity(onChange);

    const activity = {
      status: "working" as const,
      inputTokens: 12,
      outputTokens: 0,
      tokensPerSecond: 0,
      startedAt: Date.now(),
    };
    setAgentActivity("VISION", activity);

    expect(getAgentActivity("VISION")).toMatchObject(activity);
    expect(onChange).toHaveBeenCalledWith(
      "VISION",
      expect.objectContaining(activity),
    );
    setAgentActivity("VISION", { ...activity, status: "error" });
    expect(getAgentActivity("VISION")).toMatchObject({
      ...activity,
      status: "error",
    });
    expect(onChange).toHaveBeenLastCalledWith(
      "VISION",
      expect.objectContaining({ ...activity, status: "error" }),
    );
    unsubscribe();
  });

  it("does not keep stale working activity active", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    setAgentActivity("VISION", {
      status: "working",
      inputTokens: 12,
      outputTokens: 0,
      tokensPerSecond: 0,
      startedAt: Date.now(),
    });
    vi.advanceTimersByTime(90_001);

    expect(getAgentActivity("VISION")).toBeNull();
  });

  it("migrates previously stored activity without reporting an error", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const updatedAt = Date.now();
    window.localStorage.setItem(
      "agent-chat-activity:VISION",
      JSON.stringify({ status: "working", updatedAt }),
    );

    expect(getAgentActivity("VISION")).toEqual({
      status: "working",
      inputTokens: 0,
      outputTokens: 0,
      tokensPerSecond: 0,
      startedAt: updatedAt,
      updatedAt,
    });
    expect(JSON.parse(window.localStorage.getItem("agent-chat-activity:VISION") ?? "{}"))
      .toHaveProperty("inputTokens", 0);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("syncs activity changes from other tabs", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToAgentActivity(onChange);
    const activity = JSON.stringify({
      status: "working",
      inputTokens: 8,
      outputTokens: 4,
      tokensPerSecond: 2,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });
    window.localStorage.setItem("agent-chat-activity:VISION", activity);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "agent-chat-activity:VISION",
        newValue: activity,
      }),
    );

    expect(onChange).toHaveBeenCalledWith(
      "VISION",
      expect.objectContaining({ status: "working", inputTokens: 8, outputTokens: 4 }),
    );
    unsubscribe();
  });
});
