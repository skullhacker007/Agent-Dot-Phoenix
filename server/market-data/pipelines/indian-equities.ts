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

const upstoxDepthItemSchema = z
  .object({
    quantity: z.coerce.number().nullish(),
    qty: z.coerce.number().nullish(),
    size: z.coerce.number().nullish(),
    q: z.coerce.number().nullish(),
    price: z.coerce.number().nullish(),
    p: z.coerce.number().nullish(),
    rate: z.coerce.number().nullish(),
    orders: z.coerce.number().nullish(),
    order: z.coerce.number().nullish(),
    ord: z.coerce.number().nullish(),
    count: z.coerce.number().nullish(),
    num_orders: z.coerce.number().nullish(),
    numberOfOrders: z.coerce.number().nullish(),
  })
  .passthrough();

const upstoxDepthGroupSchema = z
  .object({
    buy: z.array(upstoxDepthItemSchema).nullish(),
    bids: z.array(upstoxDepthItemSchema).nullish(),
    sell: z.array(upstoxDepthItemSchema).nullish(),
    asks: z.array(upstoxDepthItemSchema).nullish(),
  })
  .passthrough();

const upstoxOhlcSchema = z
  .object({
    open: z.coerce.number().nullish(),
    high: z.coerce.number().nullish(),
    low: z.coerce.number().nullish(),
    close: z.coerce.number().nullish(),
  })
  .passthrough();

const upstoxDataSchema = z
  .object({
    instrument_token: z.string().nullish(),
    instrument_key: z.string().nullish(),
    symbol: z.string().nullish(),
    name: z.string().nullish(),
    last_price: z.coerce.number().nullish(),
    close_price: z.coerce.number().nullish(),
    prev_close: z.coerce.number().nullish(),
    yearly_high: z.coerce.number().nullish(),
    year_high: z.coerce.number().nullish(),
    yearly_low: z.coerce.number().nullish(),
    year_low: z.coerce.number().nullish(),
    last_quantity: z.coerce.number().nullish(),
    ltq: z.coerce.number().nullish(),
    last_traded_quantity: z.coerce.number().nullish(),
    prev_oi: z.coerce.number().nullish(),
    previous_oi: z.coerce.number().nullish(),
    cp: z.coerce.number().nullish(),
    net_change: z.coerce.number().nullish(),
    previous_close: z.coerce.number().nullish(),
    ohlc: upstoxOhlcSchema.nullish(),
    volume: z.coerce.number().nullish(),
    average_price: z.coerce.number().nullish(),
    avg_price: z.coerce.number().nullish(),
    oi: z.coerce.number().nullish(),
    open_interest: z.coerce.number().nullish(),
    oi_day_high: z.coerce.number().nullish(),
    oi_day_low: z.coerce.number().nullish(),
    total_buy_quantity: z.coerce.number().nullish(),
    total_buy_qty: z.coerce.number().nullish(),
    total_sell_quantity: z.coerce.number().nullish(),
    total_sell_qty: z.coerce.number().nullish(),
    lower_circuit_limit: z.coerce.number().nullish(),
    lower_circuit: z.coerce.number().nullish(),
    upper_circuit_limit: z.coerce.number().nullish(),
    upper_circuit: z.coerce.number().nullish(),
    last_trade_time: z.union([z.number(), z.string()]).nullish(),
    last_traded_time: z.union([z.number(), z.string()]).nullish(),
    timestamp: z.string().nullish(),
    depth: upstoxDepthGroupSchema.nullish(),
    market_depth: upstoxDepthGroupSchema.nullish(),
    bids: z.array(upstoxDepthItemSchema).nullish(),
    asks: z.array(upstoxDepthItemSchema).nullish(),
  })
  .passthrough();

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

export function parseLastTradeTimeMs(
  data: z.infer<typeof upstoxDataSchema>,
): number | null {
  const rawTradeTime = data.last_trade_time ?? data.last_traded_time;
  if (typeof rawTradeTime === "number" && rawTradeTime > 0) return rawTradeTime;
  if (typeof rawTradeTime === "string") {
    const num = Number(rawTradeTime);
    if (!Number.isNaN(num) && num > 0) return num;
    const parsed = Date.parse(rawTradeTime);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function observedAtMs(
  data: z.infer<typeof upstoxDataSchema>,
  fetchTimestampMs = Date.now(),
): number {
  if (data.timestamp) {
    const num = Number(data.timestamp);
    if (!Number.isNaN(num) && num > 0) return num;
    const parsed = Date.parse(data.timestamp);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return fetchTimestampMs;
}

export interface NormalizedDepthItem {
  quantity: number | null;
  price: number | null;
  orders: number | null;
}

/**
 * Extracts and normalizes depth levels from Upstox quote response.
 * - Extracts quantity, price, and orders handling alternate property names and coercion.
 * - Filters out dummy unfilled 0-slots (Upstox pads empty/unfilled levels with price=0 & quantity=0).
 * - Sorts bids descending by price (highest buyer first).
 * - Sorts asks ascending by price (lowest seller first).
 * - Limits to top 5 levels.
 */
export function extractDepthSide(
  rawList: unknown[] | null | undefined,
  side: "buy" | "sell",
): NormalizedDepthItem[] {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];

  const items: NormalizedDepthItem[] = [];

  for (const raw of rawList) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;

    const toNum = (val: unknown): number | null => {
      if (val === null || val === undefined) return null;
      const n = typeof val === "number" ? val : Number(val);
      return Number.isFinite(n) ? n : null;
    };

    const quantity = toNum(item.quantity ?? item.qty ?? item.size ?? item.q);
    const price = toNum(item.price ?? item.p ?? item.rate);
    const orders = toNum(
      item.orders ??
        item.order ??
        item.ord ??
        item.count ??
        item.num_orders ??
        item.numberOfOrders,
    );

    // If both price and quantity are 0 or missing/negative, it is an empty dummy level
    const hasValidPrice = price !== null && price > 0;
    const hasValidQty = quantity !== null && quantity > 0;

    if (!hasValidPrice && !hasValidQty) {
      continue;
    }

    items.push({
      quantity: hasValidQty ? quantity : (quantity ?? null),
      price: hasValidPrice ? price : (price ?? null),
      orders: orders !== null && orders > 0 ? Math.floor(orders) : null,
    });
  }

  // Sort: Bids (buyers) descending by price, Asks (sellers) ascending by price
  items.sort((a, b) => {
    const pA = a.price ?? 0;
    const pB = b.price ?? 0;
    return side === "buy" ? pB - pA : pA - pB;
  });

  return items.slice(0, 5);
}

/**
 * Resolves a matching quote record from the Upstox response data object.
 * Upstox keys by e.g. "NSE_EQ:RELIANCE" or "NSE_INDEX:Nifty 50", whereas
 * requests are sent as "NSE_EQ|INE..." or "NSE_INDEX|Nifty 50".
 */
function findQuoteInMap(
  dataMap: Record<string, unknown>,
  instrumentKey: string,
  symbolHint?: string,
): { data: z.infer<typeof upstoxDataSchema>; matchedKey: string } | null {
  // 1. Direct colon-key match (e.g. "NSE_EQ:RELIANCE")
  const colonKey = instrumentKey.replace("|", ":");
  if (dataMap[colonKey]) {
    const parsed = upstoxDataSchema.safeParse(dataMap[colonKey]);
    if (parsed.success) return { data: parsed.data, matchedKey: colonKey };
  }

  // 2. Direct pipe-key match
  if (dataMap[instrumentKey]) {
    const parsed = upstoxDataSchema.safeParse(dataMap[instrumentKey]);
    if (parsed.success) return { data: parsed.data, matchedKey: instrumentKey };
  }

  // 3. Match by symbolHint with prefix awareness (e.g. "NSE_EQ:RELIANCE", "NSE_FO:NIFTY26APRFUT")
  if (symbolHint) {
    const prefix = instrumentKey.includes("|")
      ? instrumentKey.split("|")[0]
      : instrumentKey.includes(":")
        ? instrumentKey.split(":")[0]
        : "NSE_EQ";
    const symbolKeyWithPrefix = `${prefix}:${symbolHint.toUpperCase()}`;
    if (dataMap[symbolKeyWithPrefix]) {
      const parsed = upstoxDataSchema.safeParse(dataMap[symbolKeyWithPrefix]);
      if (parsed.success) return { data: parsed.data, matchedKey: symbolKeyWithPrefix };
    }
    if (prefix === "NSE_EQ" || !instrumentKey.includes("|")) {
      const defaultSymbolKey = `NSE_EQ:${symbolHint.toUpperCase()}`;
      if (dataMap[defaultSymbolKey]) {
        const parsed = upstoxDataSchema.safeParse(dataMap[defaultSymbolKey]);
        if (parsed.success) return { data: parsed.data, matchedKey: defaultSymbolKey };
      }
    }
  }

  // 4. Match across entries by instrument_key, instrument_token or symbol
  const symbolPart = symbolHint?.toUpperCase() || instrumentKey.split("|").pop()?.toUpperCase();
  for (const [key, val] of Object.entries(dataMap)) {
    const parsed = upstoxDataSchema.safeParse(val);
    if (parsed.success) {
      const token = parsed.data.instrument_token ?? parsed.data.instrument_key;
      if (
        token === instrumentKey ||
        token?.replace(":", "|") === instrumentKey ||
        token?.replace("|", ":") === colonKey
      ) {
        return { data: parsed.data, matchedKey: key };
      }
      if (symbolPart && (parsed.data.symbol?.toUpperCase() === symbolPart || key.split(":").pop()?.toUpperCase() === symbolPart)) {
        return { data: parsed.data, matchedKey: key };
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
    ...universe.bonds,
  ];

  const dataMap = await fetchQuotesBatch(
    token,
    instruments.map((i) => i.instrument),
    signal,
  );

  const points: MarketDataPoint[] = [];
  const seenInstruments = new Set<string>();

  for (const config of instruments) {
    if (seenInstruments.has(config.instrument)) continue;
    seenInstruments.add(config.instrument);
    const matched = findQuoteInMap(dataMap, config.instrument, config.symbol);
    if (!matched) continue;
    const { data, matchedKey } = matched;

    const lastPrice = data.last_price ?? null;
    const previousClose =
      data.previous_close ??
      data.ohlc?.close ??
      data.close_price ??
      data.prev_close ??
      data.cp ??
      null;

    let netChange = data.net_change ?? null;
    if (netChange === null && typeof lastPrice === "number" && typeof previousClose === "number") {
      netChange = lastPrice - previousClose;
    }

    let finalPrevClose = previousClose;
    if (finalPrevClose === null && typeof lastPrice === "number" && typeof netChange === "number") {
      finalPrevClose = lastPrice - netChange;
    }

    const changePercent =
      typeof netChange === "number" &&
      typeof finalPrevClose === "number" &&
      finalPrevClose !== 0
        ? (netChange / finalPrevClose) * 100
        : null;

    // Resolve clean trading symbol:
    // 1. data.symbol (from response)
    // 2. config.symbol (e.g. RELIANCE, TCS)
    // 3. Extracted from matchedKey (e.g. "NSE_EQ:RELIANCE" -> "RELIANCE")
    // 4. Fallback to instrument token or label, strictly avoiding raw ISIN numbers
    const keySymbol = matchedKey.includes(":") ? matchedKey.split(":").pop() : undefined;
    let sym = data.symbol?.trim() || config.symbol?.trim() || (keySymbol && !/^IN[A-Z0-9]{10}$/i.test(keySymbol) ? keySymbol : undefined);
    if (!sym || sym === "NA") {
      const part = config.instrument.split("|").at(-1)?.trim();
      if (part && !/^IN[A-Z0-9]{10}$/i.test(part)) {
        sym = part;
      } else {
        sym = config.label;
      }
    }

    // Strict defense-in-depth: if an equity instrument has a numeric debt/coupon symbol (e.g. 1020CCSP27, 686RJ52)
    // or contains SDL/NCD/paper indicators, exclude it from equities!
    if (
      config.group === "NSE equities" &&
      (/^\d/.test(sym) ||
        /^\d/.test(config.label) ||
        /\b(?:SDL|NCD|CP|DEBENTURE|SERIES|SR\s*\d+)\b/i.test(config.label))
    ) {
      continue;
    }

    const rawBuyDepth =
      data.depth?.buy ??
      data.depth?.bids ??
      data.market_depth?.buy ??
      data.market_depth?.bids ??
      data.bids;
    const rawSellDepth =
      data.depth?.sell ??
      data.depth?.asks ??
      data.market_depth?.sell ??
      data.market_depth?.asks ??
      data.asks;

    const normalizedBuy = extractDepthSide(rawBuyDepth, "buy");
    const normalizedSell = extractDepthSide(rawSellDepth, "sell");

    const sumBuyQty = normalizedBuy.reduce((acc, it) => acc + (it.quantity ?? 0), 0);
    const sumSellQty = normalizedSell.reduce((acc, it) => acc + (it.quantity ?? 0), 0);

    const totalBuyQuantity =
      typeof data.total_buy_quantity === "number" && data.total_buy_quantity > 0
        ? data.total_buy_quantity
        : typeof data.total_buy_qty === "number" && data.total_buy_qty > 0
          ? data.total_buy_qty
          : sumBuyQty > 0
            ? sumBuyQty
            : null;

    const totalSellQuantity =
      typeof data.total_sell_quantity === "number" && data.total_sell_quantity > 0
        ? data.total_sell_quantity
        : typeof data.total_sell_qty === "number" && data.total_sell_qty > 0
          ? data.total_sell_qty
          : sumSellQty > 0
            ? sumSellQty
            : null;

    const hasDepth =
      Boolean(rawBuyDepth || rawSellDepth) ||
      normalizedBuy.length > 0 ||
      normalizedSell.length > 0;

    const oi =
      typeof data.oi === "number" && Number.isFinite(data.oi)
        ? data.oi
        : typeof data.open_interest === "number" && Number.isFinite(data.open_interest)
          ? data.open_interest
          : null;

    const oiDayHigh =
      typeof data.oi_day_high === "number" && Number.isFinite(data.oi_day_high)
        ? data.oi_day_high
        : null;

    const oiDayLow =
      typeof data.oi_day_low === "number" && Number.isFinite(data.oi_day_low)
        ? data.oi_day_low
        : null;

    const prevOi =
      typeof data.prev_oi === "number" && Number.isFinite(data.prev_oi)
        ? data.prev_oi
        : typeof data.previous_oi === "number" && Number.isFinite(data.previous_oi)
          ? data.previous_oi
          : null;

    const oiChange =
      oi !== null && prevOi !== null
        ? oi - prevOi
        : null;

    const oiChangePercent =
      oi !== null && prevOi !== null && prevOi !== 0
        ? ((oi - prevOi) / prevOi) * 100
        : null;

    const yearlyHigh =
      typeof data.yearly_high === "number" && Number.isFinite(data.yearly_high)
        ? data.yearly_high
        : typeof data.year_high === "number" && Number.isFinite(data.year_high)
          ? data.year_high
          : null;

    const yearlyLow =
      typeof data.yearly_low === "number" && Number.isFinite(data.yearly_low)
        ? data.yearly_low
        : typeof data.year_low === "number" && Number.isFinite(data.year_low)
          ? data.year_low
          : null;

    const lastQuantity =
      typeof data.last_quantity === "number" && Number.isFinite(data.last_quantity)
        ? data.last_quantity
        : typeof data.ltq === "number" && Number.isFinite(data.ltq)
          ? data.ltq
          : typeof data.last_traded_quantity === "number" && Number.isFinite(data.last_traded_quantity)
            ? data.last_traded_quantity
            : null;

    const isin =
      config.isin ||
      (config.instrument.includes("|") && config.instrument.split("|")[1].startsWith("IN")
        ? config.instrument.split("|")[1]
        : null);

    points.push({
      instrument: config.instrument,
      label: config.label,
      group: config.group,
      lotSize: config.lotSize ?? null,
      expiry: config.expiry ?? null,
      strikePrice: config.strikePrice ?? null,
      tickSize: config.tickSize ?? null,
      isin,
      quote: {
        symbol: sym,
        name: config.label,
        value: typeof lastPrice === "number" ? lastPrice : null,
        currency: "INR",
        change: typeof netChange === "number" ? netChange : null,
        changePercent,
        observedAtMs: observedAtMs(data),
        lastTradeTimeMs: parseLastTradeTimeMs(data),
        lastQuantity,
        yearlyHigh,
        yearlyLow,
        previousClose: typeof finalPrevClose === "number" ? finalPrevClose : null,
        open: data.ohlc?.open ?? null,
        high: data.ohlc?.high ?? null,
        low: data.ohlc?.low ?? null,
        close: data.ohlc?.close ?? null,
        volume: data.volume ?? null,
        averagePrice: data.average_price ?? data.avg_price ?? null,
        totalBuyQuantity,
        totalSellQuantity,
        lowerCircuit: data.lower_circuit_limit ?? data.lower_circuit ?? null,
        upperCircuit: data.upper_circuit_limit ?? data.upper_circuit ?? null,
        oi,
        oiDayHigh,
        oiDayLow,
        prevOi,
        oiChange,
        oiChangePercent,
        depth: hasDepth
          ? {
              buy: normalizedBuy,
              sell: normalizedSell,
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
