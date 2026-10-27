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
  fetchIndianEquities,
  formatUpstoxErrors,
  isUpstoxConfigured,
  UpstoxConfigurationError,
} from "./pipelines/indian-equities";
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
    expect(reliance?.delay).toBe("realtime");
    // Only the v2 market-quote path is used; the algo-trading token never leaks.
    expect(seen.every((u) => u.includes("/v2/market-quote/quotes"))).toBe(true);
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
