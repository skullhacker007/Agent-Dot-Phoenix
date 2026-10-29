import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { z } from "zod";
import {
  MarketDataConfigurationError,
  MarketDataError,
  errorKindForHttpStatus,
  toMarketDataError,
} from "./errors";
import { requestProviderJson, requestProviderText } from "./http";
import { point as makePoint } from "./test-support";
import { MarketDataPipeline } from "./pipeline";
import type { PipelineDefinition } from "./pipeline";
import { resetDiscoveryCache } from "./discovery";
import {
  PROVIDER_METALS,
  fetchMetalsAndCommodities,
  isMetalsConfigured,
  parseStooqCsv,
  toStooqSymbol,
} from "./pipelines/metals-commodities";
import {
  PROVIDER_CRYPTO,
  PROVIDER_FX,
  fetchCurrenciesAndCrypto,
} from "./pipelines/currencies-crypto";
import {
  extractDepthSide,
  fetchIndianEquities,
  formatUpstoxErrors,
  isUpstoxConfigured,
  observedAtMs,
  parseLastTradeTimeMs,
  UpstoxConfigurationError,
} from "./pipelines/indian-equities";
import { isEquityRow, isBondRow } from "./upstox-universe";
import {
  PROVIDER_GLOBAL,
  discoverIndexInstruments,
  fetchGlobalEquities,
  isGlobalEquitiesConfigured,
} from "./pipelines/global-equities";
import { resolveIndianLimits } from "./instruments";
import type { PipelineStatus } from "./types";

type PipelineOverrides = Partial<PipelineDefinition>;

const definition = (
  id: string,
  overrides: Omit<PipelineOverrides, "id"> = {},
) =>
  new MarketDataPipeline(
    {
      id,
      provider: "TestProvider",
      displayName: "Test Pipeline",
      delay: "delayed",
      supportsRealtimeStream: false,
      isConfigured: () => true,
      fetch: async () => [makePoint()],
      ...overrides,
    },
    30_000,
  );

function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetDiscoveryCache();
});

describe("MarketDataPipeline status tracking", () => {
  it("tracks last success, last update and a verified connection", async () => {
    const pipeline = definition("test-pipe");
    expect(pipeline.getStatus().connected).toBe(false);

    const before = Date.now();
    const status = await pipeline.testConnection();
    expect(status.connected).toBe(true);
    expect(status.lastSuccessAtMs).toBeGreaterThanOrEqual(before);
    expect(status.lastUpdatedAtMs !== null).toBe(true);
    expect(pipeline.getStatus().state).toBe("ready");
  });

  it("records distinct error kinds for auth failures", async () => {
    const pipeline = definition("test-pipe", {
      fetch: async () => {
        throw new MarketDataError({
          provider: "TestProvider",
          kind: "auth",
          message: "rejected",
          status: 401,
        });
      },
    });
    const status = await pipeline.testConnection();
    expect(status.connected).toBe(false);
    expect(status.state).toBe("error");
    expect(status.error?.kind).toBe("auth");
  });

  it("reports not-configured without touching the provider", async () => {
    const fetch = vi.fn(async () => [makePoint()]);
    const pipeline = definition("test-pipe", { isConfigured: () => false, fetch });
    const status = await pipeline.testConnection();
    expect(status.state).toBe("not-configured");
    expect(status.error?.kind).toBe("not-configured");
    expect(fetch.mock.calls.length).toBe(0);
  });
});

describe("cache and dedupe", () => {
  it("serves fresh cache without refetching", async () => {
    const fetch = vi.fn(async () => [makePoint()]);
    const pipeline = definition("test-pipe", { fetch });
    await pipeline.getData();
    await pipeline.getData();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refetches after TTL expiry", async () => {
    const fetch = vi.fn(async () => [makePoint()]);
    const pipeline = definition("test-pipe", { fetch });
    await pipeline.getData({}, 0);
    await pipeline.getData({}, 0);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("dedupes concurrent callers into a single provider request", async () => {
    let calls = 0;
    const pipeline = definition("test-pipe", {
      fetch: async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return [makePoint()];
      },
    });
    const [a, b, c] = await Promise.all([
      pipeline.getData(),
      pipeline.getData(),
      pipeline.getData(),
    ]);
    expect(calls).toBe(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("force bypasses the cache", async () => {
    const fetch = vi.fn(async () => [makePoint()]);
    const pipeline = definition("test-pipe", { fetch });
    await pipeline.getData();
    await pipeline.getData({ force: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("error taxonomy", () => {
  it.each([
    [401, "auth"],
    [403, "auth"],
    [419, "expired-token"],
    [408, "timeout"],
    [429, "rate-limit"],
    [500, "outage"],
    [503, "outage"],
    [404, "http"],
  ] as const)("maps HTTP %i to %s", (status, kind) => {
    expect(errorKindForHttpStatus(status)).toBe(kind);
  });

  it("maps timeout DOMExceptions to timeout, abort to aborted", () => {
    const timeout = toMarketDataError(
      "P",
      new DOMException("timed out", "TimeoutError"),
    );
    expect(timeout.kind).toBe("timeout");
    const aborted = toMarketDataError(
      "P",
      new DOMException("aborted", "AbortError"),
    );
    expect(aborted.kind).toBe("aborted");
  });

  it("marks timeout/rate-limit/outage/network retryable, auth not", () => {
    for (const kind of ["timeout", "rate-limit", "outage", "network"] as const) {
      expect(
        new MarketDataError({ provider: "P", kind, message: "x" }).retryable,
      ).toBe(true);
    }
    expect(
      new MarketDataError({ provider: "P", kind: "auth", message: "x" })
        .retryable,
    ).toBe(false);
  });
});

describe("requestProvider helpers", () => {
  const schema = z.object({ price: z.number() });

  it("returns parsed JSON on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ price: 42 })));
    const result = await requestProviderJson("P", { url: "https://x" }, (raw) =>
      schema.parse(raw),
    );
    expect(result).toEqual({ price: 42 });
  });

  it("treats invalid payloads as invalid-data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ price: "nope" })));
    await expect(
      requestProviderJson("P", { url: "https://x" }, (raw) => schema.parse(raw)),
    ).rejects.toMatchObject({ kind: "invalid-data" });
  });

  it("classifies 401 as auth and 429 as rate-limit with Retry-After", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "x" }, { status: 401 })),
    );
    await expect(
      requestProviderJson("P", { url: "https://x" }, (raw) => raw),
    ).rejects.toMatchObject({ kind: "auth", status: 401 });

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("slow down", {
            status: 429,
            headers: { "retry-after": "7" },
          }),
      ),
    );
    await expect(
      requestProviderJson("P", { url: "https://x" }, (raw) => raw),
    ).rejects.toMatchObject({ kind: "rate-limit", retryAfterSeconds: 7 });
  });

  it("treats unreachable hosts as outage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(
      requestProviderJson("P", { url: "https://x" }, (raw) => raw),
    ).rejects.toMatchObject({ kind: "outage" });
    await expect(requestProviderText("P", { url: "https://x" })).rejects.toMatchObject({
      kind: "outage",
    });
  });
});

describe("Stooq CSV parsing", () => {
  const wanted = new Map([
    ["xauusd", { label: "Gold", group: "Precious metals", instrument: "GC=F" }],
    ["cl.f", { label: "Crude", group: "Energy", instrument: "CL=F" }],
  ]);

  it("parses rows and computes session change", () => {
    const points = parseStooqCsv(
      "Symbol,Date,Time,Open,High,Low,Close,Volume\nXAUUSD,2026-10-24,22:00:00,4000,4020,3990,4010,0\n",
      wanted,
    );
    expect(points).toHaveLength(1);
    expect(points[0]?.quote.value).toBe(4010);
    expect(points[0]?.quote.change).toBe(10);
    expect(points[0]?.quote.changePercent).toBeCloseTo(0.25, 5);
    expect(points[0]?.delay).toBe("delayed");
  });

  it("treats N/D values as null instead of fabricating numbers", () => {
    const points = parseStooqCsv(
      "Symbol,Date,Time,Open,High,Low,Close,Volume\nXAUUSD,2026-10-24,22:00:00,N/D,N/D,N/D,N/D,0\n",
      wanted,
    );
    expect(points).toHaveLength(1);
    expect(points[0]?.quote.value).toBeNull();
    expect(points[0]?.quote.change).toBeNull();
  });

  it("returns empty for header-only CSV (market closed)", () => {
    expect(
      parseStooqCsv("Symbol,Date,Time,Open,High,Low,Close,Volume\n", wanted),
    ).toEqual([]);
  });

  it("skips malformed and unknown rows", () => {
    const points = parseStooqCsv(
      "Symbol,Date,Time,Open,High,Low,Close,Volume\nGARBAGE\nBTCUSD,2026-10-24,22:00:00,1,1,1,1,0\n",
      wanted,
    );
    expect(points).toEqual([]);
  });
});

describe("Upstox configuration gating", () => {
  it("reads the analytics token, never the algo-trading credentials", async () => {
    vi.stubEnv("UPSTOX_ANALYTICS_TOKEN", "analytics-token-123");
    vi.stubEnv("UPSTOX_API_KEY", "algo-key");
    vi.stubEnv("UPSTOX_API_SECRET", "algo-secret");
    vi.stubEnv("UPSTOX_ACCESS_TOKEN", "algo-trading-token");
    expect(isUpstoxConfigured()).toBe(true);

    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
        seen.push(String(url));
        const auth = init?.headers?.["Authorization"] ?? "";
        expect(auth).toBe("Bearer analytics-token-123");
        return new Response(
          JSON.stringify({
            status: "success",
            data: {
              "NSE_EQ|INE002A01018": {
                last_price: 2500,
                net_change: 25,
                previous_close: 2475,
                ohlc: { open: 2470, high: 2510, low: 2465, close: 2500 },
                timestamp: "2026-10-26T10:00:00+05:30",
              },
              "NSE_EQ|INE009A01021": { last_price: 1500, net_change: -10 },
              "NSE_EQ|INE040A01034": { last_price: 900, net_change: 5 },
              "NSE_EQ|INE090A01021": { last_price: 1100, net_change: 8 },
              "NSE_INDEX|Nifty 50": { last_price: 24000, net_change: 120 },
              "NSE_INDEX|Nifty Bank": { last_price: 51000, net_change: 300 },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const points = await fetchIndianEquities();
    expect(points).toHaveLength(6);
    const reliance = points.find((p) => p.instrument === "NSE_EQ|INE002A01018");
    expect(reliance?.quote.value).toBe(2500);
    expect(reliance?.quote.currency).toBe("INR");
    expect(reliance?.quote.symbol).toBe("RELIANCE");
    expect(reliance?.quote.name).toBe("Reliance Industries");
    expect(reliance?.delay).toBe("realtime");
    // Only the v2 market-quote path is used; the algo-trading token never leaks.
    expect(seen.every((u) => u.includes("/v2/market-quote/quotes"))).toBe(true);
  });

  it("strictly filters equities and excludes commercial papers like 1020CCSP27", () => {
    // Valid equities
    expect(
      isEquityRow({
        segment: "NSE_EQ",
        instrument_type: "EQ",
        tradingsymbol: "RELIANCE",
        name: "Reliance Industries Limited",
        instrument_key: "NSE_EQ|INE002A01018",
      }),
    ).toBe(true);

    expect(
      isEquityRow({
        segment: "NSE_EQ",
        instrument_type: "BE",
        tradingsymbol: "TATASTEEL",
        name: "Tata Steel Limited",
      }),
    ).toBe(true);

    // Debt instruments / commercial papers starting with coupon rate (like 1020CCSP27)
    expect(
      isEquityRow({
        segment: "NSE_EQ",
        instrument_type: "CP",
        tradingsymbol: "1020CCSP27",
        name: "Clix Capital Services CP 2027",
        instrument_key: "NSE_EQ|INE523H14013",
      }),
    ).toBe(false);

    // Instrument with key NSE_EQ| but non-equity type NCD/BOND
    expect(
      isEquityRow({
        segment: "NSE_EQ",
        instrument_type: "NCD",
        tradingsymbol: "814PFC26",
        name: "Power Finance Corp NCD",
        instrument_key: "NSE_EQ|INE134E07010",
      }),
    ).toBe(false);

    // All debt, commercial paper, state loan, and NCD ticker codes must be strictly rejected
    const invalidTickers = [
      "1020CCSP27",
      "686RJ52",
      "743PN48",
      "746RJ51",
      "754PN34",
      "762PN38",
      "852MFL31",
      "878MFL27",
      "885MFL28",
      "990CCSP27",
    ];
    for (const sym of invalidTickers) {
      expect(
        isEquityRow({
          segment: "NSE_EQ",
          instrument_type: "EQ",
          tradingsymbol: sym,
          instrument_key: `NSE_EQ|${sym}`,
        }),
      ).toBe(false);
    }
  });

  it("accurately classifies bonds, debentures, commercial papers, and sovereign gold bonds", () => {
    // Government Bonds / G-Secs
    expect(
      isBondRow({
        segment: "NSE_EQ",
        instrument_type: "GS",
        tradingsymbol: "718GS2033",
        name: "7.18% GS 2033",
        instrument_key: "NSE_EQ|IN0020230085",
      }),
    ).toBe(true);

    // Sovereign Gold Bonds
    expect(
      isBondRow({
        segment: "NSE_EQ",
        instrument_type: "SG",
        tradingsymbol: "SGBMAR30",
        name: "Sovereign Gold Bond 2030",
        instrument_key: "NSE_EQ|IN0020210186",
      }),
    ).toBe(true);

    // Corporate NCDs
    expect(
      isBondRow({
        segment: "NSE_EQ",
        instrument_type: "NCD",
        tradingsymbol: "814PFC26",
        name: "Power Finance Corp NCD",
        instrument_key: "NSE_EQ|INE134E07010",
      }),
    ).toBe(true);

    // Commercial paper starting with coupon rate
    expect(
      isBondRow({
        segment: "NSE_EQ",
        instrument_type: "CP",
        tradingsymbol: "1020CCSP27",
        name: "Clix Capital Services CP 2027",
        instrument_key: "NSE_EQ|INE523H14013",
      }),
    ).toBe(true);

    // Equities should NOT be classified as bonds
    expect(
      isBondRow({
        segment: "NSE_EQ",
        instrument_type: "EQ",
        tradingsymbol: "RELIANCE",
        name: "Reliance Industries Limited",
        instrument_key: "NSE_EQ|INE002A01018",
      }),
    ).toBe(false);
  });

  it("throws not-configured when the analytics token is missing", async () => {
    vi.stubEnv("UPSTOX_ANALYTICS_TOKEN", "");
    expect(isUpstoxConfigured()).toBe(false);
    await expect(fetchIndianEquities()).rejects.toBeInstanceOf(
      UpstoxConfigurationError,
    );
  });

  it("rejects responses with no quote for the requested key", async () => {
    vi.stubEnv("UPSTOX_ANALYTICS_TOKEN", "t");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: "success", data: {} }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    await expect(fetchIndianEquities()).rejects.toThrow(/no quote/);
  });

  it("does not call fetch when the pipeline is not configured", async () => {
    vi.stubEnv("UPSTOX_ANALYTICS_TOKEN", "");
    const fetch = vi.fn(async () => [makePoint()]);
    const pipeline = definition("test-pipe", { isConfigured: isUpstoxConfigured, fetch });
    expect(pipeline.getStatus().state).toBe("not-configured");
    await expect(pipeline.getData()).rejects.toBeInstanceOf(
      MarketDataConfigurationError,
    );
    expect(fetch.mock.calls.length).toBe(0);
  });

  it("extractDepthSide filters dummy zero levels and handles empty order book", () => {
    const dummyZeros = [
      { quantity: 0, price: 0, orders: 0 },
      { quantity: 0, price: 0, orders: 0 },
      { quantity: 0, price: 0, orders: 0 },
      { quantity: 0, price: 0, orders: 0 },
      { quantity: 0, price: 0, orders: 0 },
    ];
    const buyResult = extractDepthSide(dummyZeros, "buy");
    const sellResult = extractDepthSide(dummyZeros, "sell");
    expect(buyResult).toEqual([]);
    expect(sellResult).toEqual([]);
  });

  it("extractDepthSide maps alternate field keys, coerces string numbers, and sorts correctly", () => {
    const rawBids = [
      { qty: "50", price: "2400.00", orders: "2" },
      { size: 100, rate: 2420.5, count: 5 },
      { quantity: 0, price: 0, orders: 0 }, // dummy slot
      { q: 25, p: 2390.0, ord: 1 },
    ];
    const bids = extractDepthSide(rawBids, "buy");
    expect(bids).toHaveLength(3);
    // Highest price first for bids
    expect(bids[0]).toEqual({ quantity: 100, price: 2420.5, orders: 5 });
    expect(bids[1]).toEqual({ quantity: 50, price: 2400, orders: 2 });
    expect(bids[2]).toEqual({ quantity: 25, price: 2390, orders: 1 });

    const rawAsks = [
      { quantity: 30, price: 2425.0, orders: 1 },
      { qty: 15, rate: 2415.5, count: 2 },
      { quantity: 0, price: 0, orders: 0 }, // dummy slot
      { size: 80, p: 2430.0, num_orders: 4 },
    ];
    const asks = extractDepthSide(rawAsks, "sell");
    expect(asks).toHaveLength(3);
    // Lowest price first for asks
    expect(asks[0]).toEqual({ quantity: 15, price: 2415.5, orders: 2 });
    expect(asks[1]).toEqual({ quantity: 30, price: 2425.0, orders: 1 });
    expect(asks[2]).toEqual({ quantity: 80, price: 2430.0, orders: 4 });
  });

  it("fetchIndianEquities maps real market depth and falls back to depth quantity sums", async () => {
    vi.stubEnv("UPSTOX_ANALYTICS_TOKEN", "valid-test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          status: "success",
          data: {
            "NSE_EQ:RELIANCE": {
              instrument_token: "NSE_EQ|INE002A01018",
              symbol: "RELIANCE",
              last_price: 2500,
              depth: {
                buy: [
                  { quantity: 100, price: 2499.5, orders: 5 },
                  { quantity: 0, price: 0, orders: 0 },
                ],
                sell: [
                  { quantity: 80, price: 2501.0, orders: 3 },
                  { quantity: 0, price: 0, orders: 0 },
                ],
              },
            },
          },
        }),
      ),
    );

    const points = await fetchIndianEquities();
    const reliance = points.find((p) => p.quote.symbol === "RELIANCE");
    expect(reliance).toBeDefined();
    expect(reliance?.quote.depth).toBeDefined();
    expect(reliance?.quote.depth?.buy).toEqual([
      { quantity: 100, price: 2499.5, orders: 5 },
    ]);
    expect(reliance?.quote.depth?.sell).toEqual([
      { quantity: 80, price: 2501.0, orders: 3 },
    ]);
    // Fallback to sum of active depth quantities when total_buy_quantity is null
    expect(reliance?.quote.totalBuyQuantity).toBe(100);
    expect(reliance?.quote.totalSellQuantity).toBe(80);
  });

  it("preserves exchange last_trade_time (3:29:52 PM) while observedAtMs updates to latest EOD fetch time", async () => {
    vi.stubEnv("UPSTOX_ANALYTICS_TOKEN", "valid-test-token");

    const marketCloseTradeTime = 1730109592000; // 3:29:52 PM IST
    const eodFetchTime = 1730140000000; // Later at EOD (e.g. 11:56:40 PM IST)

    // Unit test helper functions directly
    expect(parseLastTradeTimeMs({ last_trade_time: marketCloseTradeTime })).toBe(marketCloseTradeTime);
    expect(parseLastTradeTimeMs({ last_traded_time: String(marketCloseTradeTime) })).toBe(marketCloseTradeTime);
    expect(parseLastTradeTimeMs({})).toBeNull();

    // observedAtMs must not be pinned to last_trade_time
    expect(observedAtMs({ last_trade_time: marketCloseTradeTime }, eodFetchTime)).toBe(eodFetchTime);

    // End-to-end quote pipeline mapping
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          status: "success",
          data: {
            "NSE_EQ:RELIANCE": {
              instrument_token: "NSE_EQ|INE002A01018",
              symbol: "RELIANCE",
              last_price: 2500,
              last_trade_time: marketCloseTradeTime,
            },
          },
        }),
      ),
    );

    const nowBefore = Date.now();
    const points = await fetchIndianEquities();
    const reliance = points.find((p) => p.quote.symbol === "RELIANCE");
    expect(reliance).toBeDefined();
    // lastTradeTimeMs must reflect the exact exchange trade time (3:29:52 PM IST)
    expect(reliance?.quote.lastTradeTimeMs).toBe(marketCloseTradeTime);
    // observedAtMs must reflect the current fetch time, NOT 3:29:52 PM
    expect(reliance?.quote.observedAtMs).toBeGreaterThanOrEqual(nowBefore);
  });
});

describe("pipeline independence", () => {
  it("one failing pipeline does not affect the others", async () => {
    const statuses: PipelineStatus[] = [];
    const failing = definition("failing", {
      fetch: async () => {
        throw new MarketDataError({
          provider: "Fail",
          kind: "outage",
          message: "down",
          status: 503,
        });
      },
    });
    const healthy = definition("healthy");

    const results = await Promise.allSettled([
      failing.getData(),
      healthy.getData(),
      healthy.getData(),
    ]);
    expect(results[0]?.status).toBe("rejected");
    expect(results[1]?.status).toBe("fulfilled");
    expect(results[2]?.status).toBe("fulfilled");

    statuses.push(failing.getStatus(), healthy.getStatus());
    expect(statuses[0]?.state).toBe("error");
    expect(statuses[0]?.error?.kind).toBe("outage");
    expect(statuses[1]?.state).toBe("ready");
    expect(statuses[1]?.connected).toBe(true);
  });

  it("partial FX/crypto failure surfaces the failing provider's context", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("currencies")) {
          return jsonResponse({ USD: "United States Dollar" });
        }
        if (String(url).includes("frankfurter")) {
          return jsonResponse({ amount: 1, base: "EUR", date: "2026-10-23", rates: { USD: 1.08 } });
        }
        return jsonResponse({ error: "gone" }, { status: 503 });
      }),
    );
    await expect(fetchCurrenciesAndCrypto()).rejects.toThrow(
      new RegExp(`Crypto \\(${PROVIDER_CRYPTO}\\)`),
    );
  });

  it("Yahoo falls back to the second host before failing", async () => {
    vi.stubEnv("MARKET_DATA_INDEX_QUERIES", "^GSPC");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        if (String(url).includes("/v1/finance/search")) {
          return jsonResponse({
            quotes: [
              {
                symbol: "^GSPC",
                quoteType: "INDEX",
                shortName: "S&P 500",
                longName: "S&P 500",
                exchange: "SNP",
                index: "S&P 500",
              },
            ],
          });
        }
        if (String(url).includes("query1")) {
          return jsonResponse({ error: "x" }, { status: 500 });
        }
        return jsonResponse({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 100,
                  previousClose: 99,
                  regularMarketTime: 1700000000,
                  currency: "USD",
                  shortName: "S&P 500",
                },
              },
            ],
            error: null,
          },
        });
      }),
    );
    const points = await fetchGlobalEquities();
    expect(points.length).toBeGreaterThan(0);
    expect(calls.some((c) => c.includes("query2"))).toBe(true);
    expect(points[0]?.delay).toBe("delayed");
    expect(points[0]?.quote.currency).toBeDefined();
    expect(PROVIDER_GLOBAL).toBe("Yahoo Finance");
  });
});

describe("Indian market universe allocation limits", () => {
  it("defaults to 50 equities when unconfigured", () => {
    delete process.env.MARKET_DATA_UNIVERSE_LIMIT;
    delete process.env.MARKET_DATA_INDIAN_EQUITY_LIMIT;
    const limits = resolveIndianLimits();
    expect(limits.equities).toBe(50);
    expect(limits.indices).toBe(10);
  });

  it("scales up to 500 equities when MARKET_DATA_UNIVERSE_LIMIT=500", () => {
    vi.stubEnv("MARKET_DATA_UNIVERSE_LIMIT", "500");
    const limits = resolveIndianLimits();
    expect(limits.equities).toBe(500);
    expect(limits.indices).toBe(10);
  });

  it("honors MARKET_DATA_INDIAN_EQUITY_LIMIT override up to 500", () => {
    vi.stubEnv("MARKET_DATA_INDIAN_EQUITY_LIMIT", "500");
    const limits = resolveIndianLimits();
    expect(limits.equities).toBe(500);
  });
});

describe("Upstox v2 full market quote comprehensive mapping", () => {
  it("maps 52-week highs/lows, last traded quantity (ltq), previous OI, and OI change metrics", async () => {
    vi.stubEnv("UPSTOX_ANALYTICS_TOKEN", "valid-test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          status: "success",
          data: {
            "NSE_EQ:RELIANCE": {
              instrument_token: "NSE_EQ|INE002A01018",
              symbol: "RELIANCE",
              last_price: 3000,
              net_change: 50,
              previous_close: 2950,
              yearly_high: 3217.9,
              yearly_low: 2220.3,
              last_quantity: 250,
              average_price: 2985.4,
              volume: 4500000,
              total_buy_quantity: 650000,
              total_sell_quantity: 520000,
              lower_circuit_limit: 2655,
              upper_circuit_limit: 3245,
            },
            "NSE_FO:50978": {
              instrument_token: "NSE_FO|50978",
              symbol: "NIFTY26NOV27000CE",
              last_price: 150,
              net_change: 25,
              previous_close: 125,
              oi: 5000000,
              prev_oi: 4500000,
              oi_day_high: 5200000,
              oi_day_low: 4400000,
              last_quantity: 75,
            },
          },
        }),
      ),
    );

    const points = await fetchIndianEquities();
    const reliance = points.find((p) => p.quote.symbol === "RELIANCE");
    expect(reliance).toBeDefined();
    expect(reliance?.quote.yearlyHigh).toBe(3217.9);
    expect(reliance?.quote.yearlyLow).toBe(2220.3);
    expect(reliance?.quote.lastQuantity).toBe(250);
    expect(reliance?.quote.averagePrice).toBe(2985.4);
    expect(reliance?.quote.totalBuyQuantity).toBe(650000);
    expect(reliance?.quote.totalSellQuantity).toBe(520000);
    expect(reliance?.quote.lowerCircuit).toBe(2655);
    expect(reliance?.quote.upperCircuit).toBe(3245);
    expect(reliance?.isin).toBe("INE002A01018");

    const option = points.find((p) => p.instrument === "NSE_FO|50978");
    expect(option).toBeDefined();
    expect(option?.quote.oi).toBe(5000000);
    expect(option?.quote.prevOi).toBe(4500000);
    expect(option?.quote.oiChange).toBe(500000);
    expect(option?.quote.oiChangePercent).toBeCloseTo(11.11, 1);
    expect(option?.quote.oiDayHigh).toBe(5200000);
    expect(option?.quote.oiDayLow).toBe(4400000);
    expect(option?.quote.lastQuantity).toBe(75);
  });

  it("calculates netChange and previousClose seamlessly when only cp and last_price are present", async () => {
    vi.stubEnv("UPSTOX_ANALYTICS_TOKEN", "valid-test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          status: "success",
          data: {
            "NSE_EQ:RELIANCE": {
              instrument_token: "NSE_EQ|INE002A01018",
              symbol: "RELIANCE",
              last_price: 3000,
              cp: 2950, // closing price from previous session
            },
          },
        }),
      ),
    );

    const points = await fetchIndianEquities();
    const reliance = points.find((p) => p.quote.symbol === "RELIANCE");
    expect(reliance).toBeDefined();
    expect(reliance?.quote.previousClose).toBe(2950);
    expect(reliance?.quote.change).toBe(50);
    expect(reliance?.quote.changePercent).toBeCloseTo(1.695, 2);
  });
});
