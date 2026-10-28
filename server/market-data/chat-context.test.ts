import { describe, expect, it } from "vitest";
import { buildVisionMarketContext } from "./chat-context";
import type { PipelineSnapshot } from "./types";

describe("buildVisionMarketContext", () => {
  it("generates a rich market summary when given client context", () => {
    const context = buildVisionMarketContext({
      activeFilter: "options",
      categoryCounts: {
        stocks: 45,
        indices: 7,
        futures: 6,
        options: 6,
        commodities: 6,
        total: 70,
      },
      compactPoints: [
        {
          symbol: "NIFTY24MAY22500CE",
          label: "Nifty 22500 CE",
          group: "NSE options",
          value: 145.5,
          change: 12.3,
          changePercent: 9.23,
          volume: 1200000,
        },
        {
          symbol: "GOLD",
          label: "Gold Futures",
          group: "MCX commodities",
          value: 71500,
          change: 250,
          changePercent: 0.35,
          volume: 15000,
        },
        {
          symbol: "RELIANCE",
          label: "Reliance Industries",
          group: "NSE equities",
          value: 2980.5,
          change: 35.5,
          changePercent: 1.2,
          volume: 2500000,
          high: 2990,
          low: 2940,
        },
        {
          symbol: "Nifty 50",
          label: "Nifty 50",
          group: "NSE indices",
          value: 22450.2,
          change: -85.5,
          changePercent: -0.38,
        },
      ],
    });

    expect(context).toContain("LIVE MARKET DATA CONTEXT");
    expect(context).toContain("Total Instruments Tracked: 70");
    expect(context).toContain("Stocks: 45 | Indices: 7 | Futures: 6 | Options: 6 | Commodities: 6");
    expect(context).toContain("User Active Dashboard Tab: OPTIONS");
    expect(context).toContain("Nifty 22500 CE");
    expect(context).toContain("Gold Futures");
    expect(context).toContain("Reliance Industries");
    expect(context).toContain("Nifty 50");
    expect(context).toContain("best stock price to buy?");
    expect(context).toContain("within 5–8 lines");
    expect(context).toContain("Separate top gainers from best buy candidates");
    expect(context).toContain("Rank the top 3 stocks");
    expect(context).toContain("Always include profit data");
    expect(context).toContain("For counts, return the number directly");
    expect(context).toContain("If indicators or technical data");
    expect(context).not.toContain("not personalized financial advice");
  });

  it("handles empty or null context gracefully", () => {
    const context = buildVisionMarketContext(null, null);
    expect(context).toContain("LIVE MARKET DATA CONTEXT");
    expect(context).toContain("Total Instruments Tracked: 0");
  });

  it("incorporates server snapshot if available", () => {
    const snapshot: PipelineSnapshot = {
      status: {
        id: "indian-equities",
        provider: "Upstox",
        displayName: "Indian Equities",
        state: "ready",
        delay: "realtime",
        delayLabel: "Real-time",
        configured: true,
        connected: true,
        lastSuccessAtMs: Date.now(),
        lastAttemptAtMs: Date.now(),
        lastUpdatedAtMs: Date.now(),
        error: null,
        dataPointCount: 1,
      },
      dataPoints: [
        {
          instrument: "NSE_EQ|INE155A01022",
          label: "Tata Motors",
          group: "NSE equities",
          quote: {
            symbol: "TATAMOTORS",
            name: "Tata Motors",
            value: 985.4,
            currency: "INR",
            change: 15.2,
            changePercent: 1.57,
            observedAtMs: Date.now(),
            previousClose: 970.2,
            open: 975,
            high: 992,
            low: 972,
            close: 985.4,
            volume: 4500000,
          },
          delay: "realtime",
          supportsRealtimeStream: true,
        },
      ],
    };

    const context = buildVisionMarketContext(null, snapshot);
    expect(context).toContain("Tata Motors");
    expect(context).toContain("TATAMOTORS");
    expect(context).toContain("₹985.40");
  });

  it("correctly classifies bank equities under stocks rather than benchmark indices", () => {
    const context = buildVisionMarketContext({
      compactPoints: [
        {
          symbol: "HDFCBANK",
          label: "HDFC Bank",
          group: "NSE equities",
          value: 1520.4,
          change: 15.2,
          changePercent: 1.01,
          volume: 3500000,
        },
        {
          symbol: "ICICIBANK",
          label: "ICICI Bank",
          group: "NSE equities",
          value: 1105.0,
          change: -5.0,
          changePercent: -0.45,
          volume: 2100000,
        },
        {
          symbol: "NIFTY BANK",
          label: "Nifty Bank",
          group: "NSE indices",
          value: 48500.0,
          change: 250.0,
          changePercent: 0.52,
        },
      ],
    });

    expect(context).toContain("Stocks: 2 | Indices: 1");
    expect(context).toContain("COMPLETE STOCKS DIRECTORY (Total: 2):");
    expect(context).toContain("HDFC Bank (HDFCBANK)");
    expect(context).toContain("ICICI Bank (ICICIBANK)");
    expect(context).toContain("BENCHMARK INDICES LIST (Total: 1):");
    expect(context).toContain("Nifty Bank");
  });
});
