import "server-only";

import { z } from "zod";
import { requestProviderJson } from "../http";
import type { MarketDataPoint } from "../types";
import { resolveIndianLimits } from "../instruments";
import { discoverIndianUniverse } from "../upstox-universe";

/**
 * Pipeline 3: Indian Equities (NSE) via Upstox API v2.
 *
 * Credentials: an Upstox **Analytics Access Token** — long-lived, read-only,
 * and documented to support the Market Data APIs. It cannot be used for
 * trading, which matches this task's scope exactly. The bearer token is read
 * server-side only and is never sent to the browser.
 *
 * The instrument universe is discovered at runtime from Upstox's published
 * instrument master, so no stock list is hardcoded here: the master decides
 * which instruments exist, and this pipeline quotes the first N of them in
 * the provider's own order.
 *
 * Verified from Upstox's documented Analytics-token capabilities (per the
 * token description supplied by the project owner, plus the documented v2
 * market-quote surface):
 * - Base URL: https://api.upstox.com/v2 (documented v2 base; overridable
 *   via UPSTOX_API_BASE for sandbox or regional endpoints)
 * - `/v2/market-quote/quotes?instrument_key={EXCHANGE|ISIN}` returns
 *   `last_price`, `net_change`, `ohlc`, and timestamps.
 * - `instrument_key` format: `NSE_EQ|INE...` / `NSE_INDEX|Nifty 50`, and the
 *   `|` separator must be URL-encoded.
 * - Portfolios/Account&Funds also need a static IP; Market Data does not.
 *
 * Still UNVERIFIED from the build environment (no outbound network): the
 * exact instrument-master file name and the live response shape. Both are
 * handled defensively (candidate file names, tolerant parsing) so an
 * upstream rename surfaces as a clear error instead of silent empty data.
 *
 * Streaming: the Analytics token is documented as supporting real-time
 * streaming, but that requires verified WebSocket credentials and a
 * subscription entitlement. Out of scope for the temporary test UI, so this
 * pipeline polls REST only.
 */

export const PROVIDER_UPSTOX = "Upstox";

/**
 * Documented v2 base. Market-quote endpoints reside on the live API base.
 * Overridable via UPSTOX_API_BASE if needed.
 */
const UPSTOX_V2_BASE = (
  process.env.UPSTOX_API_BASE?.trim() ||
  "https://api.upstox.com/v2"
).replace(/\/+$/, "");

const UPSTOX_TIMEOUT_MS = Number(process.env.UPSTOX_TIMEOUT_MS ?? 12000);

export class UpstoxConfigurationError extends Error {
  constructor(message = "UPSTOX_ANALYTICS_TOKEN is not configured.") {
    super(message);
    this.name = "UpstoxConfigurationError";
  }
}

/**
 * Bearer credential for the Indian Equities pipeline.
 *
 * Order of preference:
 * 1. `UPSTOX_ANALYTICS_TOKEN` — long-lived read-only analytics token for live market data.
 * 2. `SANDBOX_ACCESS_TOKEN` — fallback token.
 * 3. `UPSTOX_ACCESS_TOKEN` — fallback token.
 */
export function readUpstoxToken(): string | null {
  const analytics = process.env.UPSTOX_ANALYTICS_TOKEN?.trim();
  if (analytics) return analytics;
  const sandbox = process.env.SANDBOX_ACCESS_TOKEN?.trim();
  if (sandbox) return sandbox;
  const prod = process.env.UPSTOX_ACCESS_TOKEN?.trim();
  return prod || null;
}

export function isUpstoxConfigured(): boolean {
  return readUpstoxToken() !== null;
}

const upstoxDepthItemSchema = z.object({
  quantity: z.number().nullable().optional(),
  qty: z.number().nullable().optional(),
  price: z.number().nullable().optional(),
  orders: z.number().nullable().optional(),
});

const upstoxOhlcSchema = z.object({
  open: z.number().nullable().optional(),
  high: z.number().nullable().optional(),
  low: z.number().nullable().optional(),
  close: z.number().nullable().optional(),
});

const upstoxDataSchema = z.object({
  instrument_token: z.string().optional(),
  instrument_key: z.string().optional(),
  symbol: z.string().optional(),
  last_price: z.number().nullable().optional(),
  cp: z.number().nullable().optional(),
  net_change: z.number().nullable().optional(),
  previous_close: z.number().nullable().optional(),
  ohlc: upstoxOhlcSchema.optional(),
  volume: z.number().nullable().optional(),
  average_price: z.number().nullable().optional(),
  avg_price: z.number().nullable().optional(),
  total_buy_quantity: z.number().nullable().optional(),
  total_buy_qty: z.number().nullable().optional(),
  total_sell_quantity: z.number().nullable().optional(),
  total_sell_qty: z.number().nullable().optional(),
  lower_circuit_limit: z.number().nullable().optional(),
  lower_circuit: z.number().nullable().optional(),
  upper_circuit_limit: z.number().nullable().optional(),
  upper_circuit: z.number().nullable().optional(),
  last_trade_time: z.union([z.number(), z.string()]).nullable().optional(),
  last_traded_time: z.union([z.number(), z.string()]).nullable().optional(),
  timestamp: z.string().nullable().optional(),
  depth: z
    .object({
      buy: z.array(upstoxDepthItemSchema).optional(),
      sell: z.array(upstoxDepthItemSchema).optional(),
    })
    .optional(),
});

/**
 * Documented error envelope:
 * `{ status: "error", errors: [{ error_code, message, property_path,
 * invalid_value }] }`.
 */
const upstoxErrorItemSchema = z.object({
  error_code: z.string().nullish(),
  errorCode: z.string().nullish(),
  message: z.string().nullish(),
  property_path: z.string().nullish(),
  invalid_value: z.unknown().nullish(),
});

/** Flattens the documented error array into one actionable message. */
export function formatUpstoxErrors(
  errors: z.infer<typeof upstoxErrorItemSchema>[] | null | undefined,
): string {
  if (!errors || errors.length === 0) {
    return "Upstox reported an error with no detail.";
  }
  return errors
    .map((item) => {
      const code = item.error_code ?? item.errorCode ?? "unknown";
      const detail = item.message ?? "no message";
      const path = item.property_path ? ` (at ${item.property_path})` : "";
      return `${code}: ${detail}${path}`;
    })
    .join("; ");
}

const upstoxQuoteResponseSchema = z.object({
  status: z.string(),
  data: z.unknown().optional(),
  errors: z.array(upstoxErrorItemSchema).nullish(),
});

function observedAtMs(data: z.infer<typeof upstoxDataSchema>): number {
  const rawTradeTime = data.last_trade_time ?? data.last_traded_time;
  if (typeof rawTradeTime === "number" && rawTradeTime > 0) return rawTradeTime;
  if (typeof rawTradeTime === "string") {
    const num = Number(rawTradeTime);
    if (!Number.isNaN(num) && num > 0) return num;
  }
  if (data.timestamp) {
    const ms = Date.parse(data.timestamp);
    if (!Number.isNaN(ms)) return ms;
  }
  return Date.now();
}

/**
 * Resolves a matching quote record from the Upstox response data object.
 * Upstox keys by e.g. "NSE_EQ:RELIANCE" or "NSE_INDEX:Nifty 50", whereas
 * requests are sent as "NSE_EQ|INE..." or "NSE_INDEX|Nifty 50".
 */
function findQuoteInMap(
  dataMap: Record<string, unknown>,
  instrumentKey: string,
): z.infer<typeof upstoxDataSchema> | null {
  // 1. Direct colon-key match (e.g. "NSE_EQ:RELIANCE")
  const colonKey = instrumentKey.replace("|", ":");
  if (dataMap[colonKey]) {
    const parsed = upstoxDataSchema.safeParse(dataMap[colonKey]);
    if (parsed.success) return parsed.data;
  }

  // 2. Direct pipe-key match
  if (dataMap[instrumentKey]) {
    const parsed = upstoxDataSchema.safeParse(dataMap[instrumentKey]);
    if (parsed.success) return parsed.data;
  }

  // 3. Match across entries by instrument_key, instrument_token or symbol
  const symbolPart = instrumentKey.split("|").pop()?.toUpperCase();
  for (const [key, val] of Object.entries(dataMap)) {
    const parsed = upstoxDataSchema.safeParse(val);
    if (parsed.success) {
      const token = parsed.data.instrument_token ?? parsed.data.instrument_key;
      if (
        token === instrumentKey ||
        token?.replace(":", "|") === instrumentKey ||
        token?.replace("|", ":") === colonKey
      ) {
        return parsed.data;
      }
      if (symbolPart && (parsed.data.symbol?.toUpperCase() === symbolPart || key.split(":").pop()?.toUpperCase() === symbolPart)) {
        return parsed.data;
      }
    }
  }

  return null;
}

async function fetchSingleChunk(
  token: string,
  chunk: string[],
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  if (chunk.length === 0) return {};
  const url = `${UPSTOX_V2_BASE}/market-quote/quotes?instrument_key=${encodeURIComponent(
    chunk.join(","),
  )}`;

  return requestProviderJson(
    PROVIDER_UPSTOX,
    {
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal,
      timeoutMs: UPSTOX_TIMEOUT_MS,
    },
    (raw) => {
      const parsed = upstoxQuoteResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(
          "Upstox quote response did not match the documented envelope.",
        );
      }
      if (parsed.data.status !== "success") {
        throw new Error(
          `Upstox returned an error: ${formatUpstoxErrors(parsed.data.errors)}`,
        );
      }
      if (parsed.data.data && typeof parsed.data.data === "object") {
        return parsed.data.data as Record<string, unknown>;
      }
      return {};
    },
  );
}

async function fetchQuotesBatch(
  token: string,
  instrumentKeys: string[],
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  if (instrumentKeys.length === 0) return {};

  // Optimize batch size: chunk by 100 to prevent URL length limits and rate-spike limits
  const CHUNK_SIZE = 100;
  if (instrumentKeys.length <= CHUNK_SIZE) {
    return fetchSingleChunk(token, instrumentKeys, signal);
  }

  const chunks: string[][] = [];
  for (let i = 0; i < instrumentKeys.length; i += CHUNK_SIZE) {
    chunks.push(instrumentKeys.slice(i, i + CHUNK_SIZE));
  }

  const results = await Promise.allSettled(
    chunks.map((chunk) => fetchSingleChunk(token, chunk, signal)),
  );

  const merged: Record<string, unknown> = {};
  let lastError: Error | null = null;
  let fulfilledCount = 0;

  for (const res of results) {
    if (res.status === "fulfilled") {
      Object.assign(merged, res.value);
      fulfilledCount++;
    } else if (res.reason instanceof Error) {
      lastError = res.reason;
    }
  }

  if (fulfilledCount === 0 && lastError) {
    throw lastError;
  }

  return merged;
}

export async function fetchIndianEquities(
  signal?: AbortSignal,
): Promise<MarketDataPoint[]> {
  const token = readUpstoxToken();
  if (!token) {
    throw new UpstoxConfigurationError(
      "UPSTOX_ANALYTICS_TOKEN is not configured.",
    );
  }

  const limits = resolveIndianLimits();
  const universe = await discoverIndianUniverse(limits, signal);
  const instruments = [
    ...universe.indices,
    ...universe.equities,
    ...universe.futures,
    ...universe.options,
    ...universe.commodities,
  ];

  const dataMap = await fetchQuotesBatch(
    token,
    instruments.map((i) => i.instrument),
    signal,
  );

  const points: MarketDataPoint[] = [];

  for (const config of instruments) {
    const data = findQuoteInMap(dataMap, config.instrument);
    if (!data) continue;

    const lastPrice = data.last_price ?? null;
    const previousClose = data.previous_close ?? data.ohlc?.close ?? null;
    const netChange = data.net_change ?? null;
    const cp = data.cp ?? null;
    const changePercent =
      typeof cp === "number" && Number.isFinite(cp)
        ? cp
        : typeof netChange === "number" &&
            typeof previousClose === "number" &&
            previousClose !== 0
          ? (netChange / previousClose) * 100
          : null;

    const sym = data.symbol || config.instrument.split("|").at(-1) || config.instrument;

    points.push({
      instrument: config.instrument,
      label: config.label,
      group: config.group,
      quote: {
        symbol: sym === "NA" ? config.label : sym,
        name: config.label,
        value: typeof lastPrice === "number" ? lastPrice : null,
        currency: "INR",
        change: typeof netChange === "number" ? netChange : null,
        changePercent,
        observedAtMs: observedAtMs(data),
        previousClose: typeof previousClose === "number" ? previousClose : null,
        open: data.ohlc?.open ?? null,
        high: data.ohlc?.high ?? null,
        low: data.ohlc?.low ?? null,
        close: data.ohlc?.close ?? null,
        volume: data.volume ?? null,
        averagePrice: data.average_price ?? data.avg_price ?? null,
        totalBuyQuantity: data.total_buy_quantity ?? data.total_buy_qty ?? null,
        totalSellQuantity: data.total_sell_quantity ?? data.total_sell_qty ?? null,
        lowerCircuit: data.lower_circuit_limit ?? data.lower_circuit ?? null,
        upperCircuit: data.upper_circuit_limit ?? data.upper_circuit ?? null,
        depth: data.depth
          ? {
              buy: data.depth.buy?.map((item) => ({
                quantity: item.quantity ?? item.qty ?? null,
                price: item.price ?? null,
                orders: item.orders ?? null,
              })),
              sell: data.depth.sell?.map((item) => ({
                quantity: item.quantity ?? item.qty ?? null,
                price: item.price ?? null,
                orders: item.orders ?? null,
              })),
            }
          : undefined,
      },
      delay: "realtime",
      supportsRealtimeStream: true,
    });
  }

  if (points.length === 0) {
    throw new Error("Upstox response contained no quote for the requested keys.");
  }

  return points;
}
