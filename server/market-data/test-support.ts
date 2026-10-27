import type { MarketDataPoint } from "./types";

/** Shared tiny fixture so tests do not repeat a full quote literal. */
export function point(overrides: Partial<MarketDataPoint> = {}): MarketDataPoint {
  return {
    instrument: "TEST",
    label: "Test",
    group: "Test group",
    quote: {
      symbol: "TEST",
      name: "Test",
      value: 100,
      currency: "USD",
      change: 1,
      changePercent: 1,
      observedAtMs: Date.now(),
      previousClose: 99,
    },
    delay: "delayed",
    supportsRealtimeStream: false,
    ...overrides,
  };
}
