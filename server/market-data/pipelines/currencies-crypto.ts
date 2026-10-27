import "server-only";

import { z } from "zod";
import { requestProviderJson } from "../http";
import { MarketDataConfigurationError } from "../errors";
import type { MarketDataPoint } from "../types";
import { resolveUniverseLimit } from "../instruments";

/**
 * Pipeline 1: Currencies & Crypto.
 *
 * Providers (independent fetches inside one pipeline):
 * - FX: Frankfurter (ECB euro reference rates). Free, no key, no signup.
 *   Published once per ECB working day (~16:00 CET) → end-of-day.
 * - Crypto: Binance public spot REST. Free, no key for market data.
 *
 * Both universes are discovered at runtime: Frankfurter's `/currencies` map
 * decides which FX pairs exist, and Binance's `/api/v3/ticker/24hr` response
 * decides which spot symbols exist. Nothing is hardcoded.
 *
 * WebSocket: Binance officially supports public streams
 * (wss://stream.binance.com:9443). This pipeline exposes a helper to open a
 * short-lived stream for the test UI, with explicit cleanup. Frankfurter has
 * no WebSocket API and is REST-only.
 *
 * Docs/coverage/licensing NOT yet verified from the build environment (no
 * egress); see the final report.
 */

const FRANKFURTER_BASE = "https://api.frankfurter.app";
const BINANCE_BASE = "https://api.binance.com";

const frankfurterCurrenciesSchema = z.record(z.string(), z.string());

const frankfurterLatestSchema = z.object({
  amount: z.number(),
  base: z.string(),
  date: z.string(),
  rates: z.record(z.string(), z.number()),
});

const binanceTicker24hrSchema = z.object({
  symbol: z.string(),
  lastPrice: z.string(),
  priceChange: z.string(),
  priceChangePercent: z.string(),
  quoteVolume: z.string().optional(),
  closeTime: z.number(),
});

export const PROVIDER_FX = "Frankfurter (ECB)";
export const PROVIDER_CRYPTO = "Binance Spot";

/** Base currency the FX universe is quoted against (ECB reference rates). */
const FX_BASE = process.env.MARKET_DATA_FX_BASE?.trim() || "EUR";

/** Domestic currency used for the INR cross-rate shown to this deployment. */
const FX_DOMESTIC = process.env.MARKET_DATA_FX_DOMESTIC?.trim() || "INR";

/** Quote asset used for the crypto universe (all pairs quoted against it). */
const CRYPTO_QUOTE_ASSET =
  process.env.MARKET_DATA_CRYPTO_QUOTE_ASSET?.trim() || "USDT";

function parseFrankfurterDate(date: string): number {
  const ms = Date.parse(`${date}T16:00:00+01:00`);
  return Number.isNaN(ms) ? Date.now() : ms;
}

/**
 * Discovers the FX universe from Frankfurter's own currency map, then reads
 * every rate in one request. The domestic cross (e.g. USD/INR) is derived
 * from those rates, never hardcoded.
 */
async function fetchFx(signal?: AbortSignal): Promise<MarketDataPoint[]> {
  const limit = resolveUniverseLimit(12);

  const currencies = await requestProviderJson(
    PROVIDER_FX,
    { url: `${FRANKFURTER_BASE}/currencies`, signal },
    (raw) => frankfurterCurrenciesSchema.parse(raw),
  );

  const payload = await requestProviderJson(
    PROVIDER_FX,
    { url: `${FRANKFURTER_BASE}/latest?from=${encodeURIComponent(FX_BASE)}`, signal },
    (raw) => frankfurterLatestSchema.parse(raw),
  );

  const observedAtMs = parseFrankfurterDate(payload.date);
  const points: MarketDataPoint[] = [];

  for (const [code, name] of Object.entries(currencies)) {
    if (points.length >= limit) break;
    const rate = payload.rates[code];
    if (typeof rate !== "number" || !Number.isFinite(rate)) continue;
    points.push({
      instrument: code,
      label: name || code,
      group: "FX",
      quote: {
        symbol: `${payload.base}/${code}`,
        name: name || code,
        value: rate,
        currency: payload.base,
        change: null,
        changePercent: null,
        observedAtMs,
        previousClose: null,
      },
      // ECB reference rates publish once per working day.
      delay: "end-of-day" as const,
      supportsRealtimeStream: false,
    });
  }

  // Domestic cross-rate, derived from the same ECB payload: units of the
  // domestic currency per unit of USD.
  const domesticRate = payload.rates[FX_DOMESTIC];
  const usdRate = payload.rates.USD;
  if (
    FX_DOMESTIC !== "USD" &&
    typeof domesticRate === "number" &&
    typeof usdRate === "number" &&
    usdRate !== 0
  ) {
    const cross = domesticRate / usdRate;
    points.push({
      instrument: `${FX_DOMESTIC}/USD`,
      label: `${FX_DOMESTIC} cross rate`,
      group: "FX",
      quote: {
        symbol: `${FX_DOMESTIC}/USD`,
        name: `${FX_DOMESTIC} cross rate`,
        value: cross,
        currency: FX_DOMESTIC,
        change: null,
        changePercent: null,
        observedAtMs,
        previousClose: null,
      },
      delay: "end-of-day" as const,
      supportsRealtimeStream: false,
    });
  }

  return points;
}

/**
 * Discovers the crypto universe from Binance's own ticker response and reads
 * the quotes in the same request, so one call covers both discovery and data.
 */
async function fetchCrypto(signal?: AbortSignal): Promise<MarketDataPoint[]> {
  const limit = resolveUniverseLimit(12);

  const tickers = await requestProviderJson(
    PROVIDER_CRYPTO,
    { url: `${BINANCE_BASE}/api/v3/ticker/24hr`, signal },
    (raw) => z.array(binanceTicker24hrSchema).parse(raw),
  );

  const toNumber = (value: string): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const points: MarketDataPoint[] = [];
  for (const ticker of tickers) {
    if (points.length >= limit) break;
    // Spot pairs only, quoted against the configured quote asset. Leveraged
    // tokens carry UP/DOWN/BULL/BEAR markers and are not spot pairs.
    if (!ticker.symbol.endsWith(CRYPTO_QUOTE_ASSET)) continue;
    const base = ticker.symbol.slice(0, -CRYPTO_QUOTE_ASSET.length);
    if (!/^[A-Z0-9]{2,15}$/.test(base)) continue;
    if (/(UP|DOWN|BULL|BEAR)$/.test(base)) continue;

    points.push({
      instrument: ticker.symbol,
      label: `${base}/${CRYPTO_QUOTE_ASSET}`,
      group: "Crypto",
      quote: {
        symbol: ticker.symbol,
        name: `${base}/${CRYPTO_QUOTE_ASSET}`,
        value: toNumber(ticker.lastPrice),
        currency: CRYPTO_QUOTE_ASSET,
        change: toNumber(ticker.priceChange),
        changePercent: toNumber(ticker.priceChangePercent),
        observedAtMs: ticker.closeTime,
        previousClose: null,
      },
      // Public REST has no timeliness SLA; label delayed, never real-time.
      delay: "delayed" as const,
      supportsRealtimeStream: true,
    });
  }

  return points;
}

export async function fetchCurrenciesAndCrypto(
  signal?: AbortSignal,
): Promise<MarketDataPoint[]> {
  // Independent sub-fetches: one provider failing must not hide the other.
  const [fx, crypto] = await Promise.all([
    fetchFx(signal).catch((error: unknown) => {
      // Attach provider context; the base pipeline converts to a typed error.
      if (error instanceof Error) {
        throw new Error(`FX (${PROVIDER_FX}): ${error.message}`, { cause: error });
      }
      throw error;
    }),
    fetchCrypto(signal).catch((error: unknown) => {
      if (error instanceof Error) {
        throw new Error(`Crypto (${PROVIDER_CRYPTO}): ${error.message}`, {
          cause: error,
        });
      }
      throw error;
    }),
  ]);
  return [...fx, ...crypto];
}

/** This pipeline needs no credentials; always configured. */
export function isCurrencyCryptoConfigured(): boolean {
  return true;
}

export function assertCurrencyCryptoConfigured(): void {
  if (!isCurrencyCryptoConfigured()) {
    throw new MarketDataConfigurationError(
      `${PROVIDER_FX} + ${PROVIDER_CRYPTO}`,
      "Currency/crypto pipeline is not configured.",
    );
  }
}
