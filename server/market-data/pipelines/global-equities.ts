import "server-only";

import type { MarketDataPoint } from "../types";
import { MarketDataConfigurationError } from "../errors";
import { readSearchQueries, resolveUniverseLimit } from "../instruments";
import {
  PROVIDER_YAHOO,
  fetchYahooChartMeta,
  searchYahooInstruments,
} from "../yahoo";

/**
 * Pipeline 4: Global Equities & Indices.
 *
 * Provider: Yahoo Finance. Covers US, Indian, European and Asian indices via
 * caret symbols in one consistent shape. Yahoo's public quotes are delayed
 * snapshots → labelled delayed.
 *
 * The universe is discovered at runtime through Yahoo's own search endpoint
 * using the operator's configured search terms: `MARKET_DATA_INDEX_QUERIES`
 * supplies them, and this pipeline quotes what Yahoo returns in Yahoo's own
 * ordering. No index symbol or query list is hardcoded here — with nothing
 * configured the pipeline reports "not configured" instead of guessing.
 *
 * No WebSocket: Yahoo offers no official public streaming API for these
 * symbols, so this pipeline is REST polling only.
 */

/** Env var that supplies the index search terms. Required; has no default. */
export const INDEX_QUERIES_ENV = "MARKET_DATA_INDEX_QUERIES";

export const PROVIDER_GLOBAL = PROVIDER_YAHOO;

/**
 * Discovers index instruments via Yahoo search, keeping only index-type
 * quotes and the provider's own ordering.
 */
export async function discoverIndexInstruments(
  signal?: AbortSignal,
): Promise<{ instrument: string; label: string; group: string }[]> {
  const queries = readSearchQueries(INDEX_QUERIES_ENV);
  if (queries.length === 0) {
    // No hardcoded fallback list exists: without terms there is nothing to
    // search for, so the pipeline is explicitly unconfigured.
    throw new MarketDataConfigurationError(
      PROVIDER_GLOBAL,
      `${PROVIDER_GLOBAL} index discovery is not configured. Set ${INDEX_QUERIES_ENV} (comma-separated index search terms) in .env.local.`,
    );
  }

  const limit = resolveUniverseLimit(12);
  const discovered: { instrument: string; label: string; group: string }[] = [];
  const seen = new Set<string>();

  for (const query of queries) {
    if (discovered.length >= limit) break;
    let quotes;
    try {
      quotes = await searchYahooInstruments("global-equities", query, 25, signal);
    } catch {
      // One failing query must not hide the others.
      continue;
    }
    for (const quote of quotes) {
      if (discovered.length >= limit) break;
      if (quote.quoteType !== "INDEX") continue;
      if (seen.has(quote.symbol)) continue;
      seen.add(quote.symbol);
      discovered.push({
        instrument: quote.symbol,
        label: quote.longName ?? quote.shortName ?? quote.symbol,
        group: quote.index ?? "Global indices",
      });
    }
  }

  return discovered;
}

export async function fetchGlobalEquities(
  signal?: AbortSignal,
): Promise<MarketDataPoint[]> {
  const instruments = await discoverIndexInstruments(signal);
  const points: MarketDataPoint[] = [];

  for (const config of instruments) {
    const meta = await fetchYahooChartMeta("global-equities", config.instrument, signal);
    const value =
      typeof meta.regularMarketPrice === "number" &&
      Number.isFinite(meta.regularMarketPrice)
        ? meta.regularMarketPrice
        : null;
    const previousClose =
      typeof meta.previousClose === "number" &&
      Number.isFinite(meta.previousClose)
        ? meta.previousClose
        : null;
    const change =
      value !== null && previousClose !== null ? value - previousClose : null;
    points.push({
      instrument: config.instrument,
      label: config.label,
      group: config.group,
      quote: {
        symbol: config.instrument,
        name: meta.shortName ?? meta.longName ?? config.label,
        value,
        currency: meta.currency ?? "USD",
        change,
        changePercent:
          change !== null && previousClose !== null && previousClose !== 0
            ? (change / previousClose) * 100
            : null,
        observedAtMs:
          typeof meta.regularMarketTime === "number"
            ? meta.regularMarketTime * 1000
            : Date.now(),
        previousClose,
      },
      // Public Yahoo quotes are delayed snapshots, never real-time.
      delay: "delayed",
      supportsRealtimeStream: false,
    });
  }
  return points;
}

/**
 * Configured only when the operator supplies index search terms. Nothing is
 * hardcoded, so an unset variable means "not configured", the same state a
 * missing credential produces.
 */
export function isGlobalEquitiesConfigured(): boolean {
  return readSearchQueries(INDEX_QUERIES_ENV).length > 0;
}
