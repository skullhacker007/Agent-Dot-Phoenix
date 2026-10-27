/**
 * Instrument universe helpers.
 *
 * No hardcoded instrument identifiers live here (or anywhere else in the
 * market-data code): each pipeline discovers its own universe at fetch time
 * from its provider and keeps the provider's own ordering.
 *
 * This module carries only the shared shape and the limit plumbing.
 */

export type InstrumentConfig = {
  /** Provider-native identifier (e.g. Binance symbol, Upstox instrument_key). */
  instrument: string;
  label: string;
  group: string;
};

/**
 * How many instruments a pipeline shows. One env var overrides every
 * pipeline uniformly; otherwise each pipeline uses its own default so the
 * panel sizes stay predictable.
 */
export function resolveUniverseLimit(fallback: number): number {
  const raw = process.env.MARKET_DATA_UNIVERSE_LIMIT?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) return Math.min(parsed, 500);
  }
  return fallback;
}

export type IndianLimits = {
  equities: number;
  indices: number;
  futures: number;
  options: number;
  commodities: number;
};

/**
 * Allocates the Indian market data universe across asset classes:
 * Stocks (equities), Indices, Futures, Options, and Commodities.
 * Scales dynamically up to Upstox's max batch limit of 500.
 */
export function resolveIndianLimits(): IndianLimits {
  const limit = resolveUniverseLimit(50);
  const rawEquityLimit = process.env.MARKET_DATA_INDIAN_EQUITY_LIMIT?.trim();
  const parsedEquityLimit = rawEquityLimit ? Number(rawEquityLimit) : null;
  const equities =
    parsedEquityLimit && Number.isInteger(parsedEquityLimit) && parsedEquityLimit > 0
      ? Math.min(parsedEquityLimit, 500)
      : Math.min(500, Math.max(15, limit));
  const indices = 10;
  const futures = 8;
  const options = 8;
  const commodities = 6;
  return { equities, indices, futures, options, commodities };
}

/**
 * Reads discovery search terms from an environment variable.
 *
 * There is deliberately no fallback list anywhere: no query term is hardcoded
 * in this module or in any pipeline. Yahoo's search endpoint needs a term, so
 * a pipeline with nothing configured reports "not configured" (the same state
 * a missing credential produces) instead of guessing an instrument universe.
 *
 * Overridable per pipeline via MARKET_DATA_INDEX_QUERIES and
 * MARKET_DATA_COMMODITY_QUERIES (comma-separated).
 */
export function readSearchQueries(envName: string): string[] {
  const raw = process.env[envName]?.trim();
  if (!raw) return [];
  const parsed = raw
    .split(",")
    .map((query) => query.trim())
    .filter((query) => query.length > 0);
  return parsed;
}
