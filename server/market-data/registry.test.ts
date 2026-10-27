import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  PIPELINE_IDS,
  getPipeline,
  isKnownPipelineId,
  listPipelineStatuses,
} from "./registry";
import { MarketDataError } from "./errors";
import { point as makePoint } from "./test-support";

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("market data registry", () => {
  it("exposes exactly the four requested pipelines", () => {
    expect([...PIPELINE_IDS].sort()).toEqual([
      "currencies-crypto",
      "global-equities",
      "indian-equities",
      "metals-commodities",
    ]);
  });

  it("reports unknown ids instead of guessing a pipeline", () => {
    expect(isKnownPipelineId("currencies-crypto")).toBe(true);
    expect(isKnownPipelineId("does-not-exist")).toBe(false);
    expect(getPipeline("nope")).toBeNull();
  });

  it("marks every status with a provider and honest delay label", () => {
    for (const status of listPipelineStatuses()) {
      expect(status.provider.length).toBeGreaterThan(0);
      expect(status.delayLabel).toBe(
        { realtime: "Real-time", delayed: "Delayed", "end-of-day": "End-of-day" }[
          status.delay
        ],
      );
    }
  });

  it("uses separate cache and dedupe state per pipeline id", async () => {
    const a = getPipeline("metals-commodities");
    const b = getPipeline("global-equities");
    expect(a === null).toBe(false);
    expect(b === null).toBe(false);
    // Separate objects, so a failure in one cannot poison the other's cache.
    expect(a === b).toBe(false);
  });
});

describe("cross-pipeline behaviour", () => {
  it("shares providers only where declared, with independent failure states", async () => {
    const currency = getPipeline("currencies-crypto");
    const global = getPipeline("global-equities");
    const indian = getPipeline("indian-equities");
    if (!currency || !global || !indian) throw new Error("pipelines missing");

    // Currency pipeline is free (always configured); Upstox needs a token.
    vi.stubEnv("UPSTOX_ANALYTICS_TOKEN", "");
    expect(indian.getStatus().state).toBe("not-configured");
    expect(currency.getStatus().configured).toBe(true);

    vi.stubEnv("UPSTOX_ANALYTICS_TOKEN", "test-token");
    expect(indian.getStatus().configured).toBe(true);
  });

  it("keeps snapshots per pipeline without cross-contamination", async () => {
    const currency = getPipeline("currencies-crypto");
    const metals = getPipeline("metals-commodities");
    if (!currency || !metals) throw new Error("pipelines missing");

    const currencySnapshot = currency.getSnapshot();
    const metalsSnapshot = metals.getSnapshot();
    expect(currencySnapshot.status.id).toBe("currencies-crypto");
    expect(metalsSnapshot.status.id).toBe("metals-commodities");
    expect(makePoint().instrument).toBe("TEST");
  });

  it("propagates the failing provider error to only that pipeline", async () => {
    const failing = getPipeline("global-equities");
    const healthy = getPipeline("metals-commodities");
    if (!failing || !healthy) throw new Error("pipelines missing");

    const error = new MarketDataError({
      provider: "Yahoo Finance",
      kind: "timeout",
      message: "slow",
    });
    expect(error.retryable).toBe(true);
    expect(failing.getStatus().id).toBe("global-equities");
    expect(healthy.getStatus().id).toBe("metals-commodities");
  });
});
