import "server-only";

import { z } from "zod";
import { requestProviderText } from "../http";
import { MarketDataConfigurationError } from "../errors";
import type { MarketDataPoint } from "../types";
import { readSearchQueries, resolveUniverseLimit } from "../instruments";
import {
  PROVIDER_YAHOO,
  searchYahooInstruments,
  type YahooSearchQuote,
} from "../yahoo";

/**
 * Pipeline 2: Metals & Commodities (gold, silver, crude oil, natural gas).
 *
 * Provider: Stooq free public CSV quote endpoint. No key, no signup.
 * Stooq publishes delayed quotes for futures/spot symbols → labelled delayed.
 *
 * The universe is discovered at runtime through Yahoo's search endpoint using
 * the operator's configured search terms: `MARKET_DATA_COMMODITY_QUERIES`
 * supplies them, and each discovered symbol is converted to its Stooq
 * equivalent by rule rather than by a hardcoded lookup table:
 *   - Yahoo futures `GC=F`  → Stooq `gc.f`
 *   - Yahoo currency `XAUUSD=X` → Stooq `xauusd`
 * Both providers therefore agree on which instruments exist, and Stooq still
 * serves the quotes.
 *
 * If Stooq has no row for a discovered symbol, that instrument is simply
 * absent from the result: no value is ever fabricated.
 *
 * No WebSocket: Stooq offers no official public streaming API, so this
 * pipeline is REST polling only.
 */

export const PROVIDER_METALS = "Stooq";
/** Yahoo supplies the live commodity universe that Stooq then quotes. */
export const PROVIDER_METALS_DISCOVERY = "Yahoo Finance";

const STOOQ_BASE = "https://stooq.com/q/l/";

/** Env var that supplies the commodity search terms. Required; has no default. */
export const COMMODITY_QUERIES_ENV = "MARKET_DATA_COMMODITY_QUERIES";

/**
 * Stooq CSV columns with `f=sd2t2ohlcv`:
 * Symbol,Date,Time,Open,High,Low,Close,Volume
 */
const stooqRowSchema = z.object({
  symbol: z.string(),
  date: z.string(),
  time: z.string(),
  open: z.string(),
  high: z.string(),
  low: z.string(),
  close: z.string(),
  volume: z.string(),
});

function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(",").map((cell) => cell.trim()));
}

function toNumberOrNull(value: string): number | null {
  if (value === "" || value.toUpperCase() === "N/D") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function observedAtMs(date: string, time: string): number {
  const ms = Date.parse(`${date}T${time}Z`);
  return Number.isNaN(ms) ? Date.now() : ms;
}

/**
 * Converts a Yahoo symbol to its Stooq equivalent by rule:
 *   `GC=F` → `gc.f`, `XAUUSD=X` → `xauusd`.
 * Returns null for symbol types Stooq does not quote this way.
 */
export function toStooqSymbol(yahooSymbol: string): string | null {
  const futures = /^([A-Z0-9]+)=F$/.exec(yahooSymbol);
  if (futures?.[1]) return `${futures[1].toLowerCase()}.f`;
  const currency = /^([A-Z]{3}[A-Z0-9]*)=X$/.exec(yahooSymbol);
  if (currency?.[1]) return currency[1].toLowerCase();
  return null;
}

/**
 * The quote currency for a converted Stooq symbol: FX pairs end in the quote
 * currency, futures are quoted in USD.
 */
export function stooqCurrencyFor(stooqSymbol: string): string {
  if (stooqSymbol.endsWith(".f")) return "USD";
  if (stooqSymbol.length >= 6) return stooqSymbol.slice(-3).toUpperCase();
  return "USD";
}

export function parseStooqCsv(
  text: string,
  wantedSymbols: Map<string, { label: string; group: string; instrument: string }>,
): MarketDataPoint[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  // First row is the header; drop it when it looks like one.
  const body = rows[0]?.[0]?.toLowerCase() === "symbol" ? rows.slice(1) : rows;

  const points: MarketDataPoint[] = [];
  for (const cells of body) {
    if (cells.length < 8) continue;
    const parsed = stooqRowSchema.safeParse({
      symbol: cells[0],
      date: cells[1],
      time: cells[2],
      open: cells[3],
      high: cells[4],
      low: cells[5],
      close: cells[6],
      volume: cells[7],
    });
    if (!parsed.success) continue;
    const row = parsed.data;
    const key = [...wantedSymbols.keys()].find(
      (k) => k.toLowerCase() === row.symbol.toLowerCase(),
    );
    if (!key) continue;
    const meta = wantedSymbols.get(key);
    if (!meta) continue;
    const close = toNumberOrNull(row.close);
    const open = toNumberOrNull(row.open);
    points.push({
      instrument: meta.instrument,
      label: meta.label,
      group: meta.group,
      quote: {
        symbol: row.symbol.toUpperCase(),
        name: meta.label,
        value: close,
        currency: stooqCurrencyFor(key),
        change: close !== null && open !== null ? close - open : null,
        changePercent:
          close !== null && open !== null && open !== 0
            ? ((close - open) / open) * 100
            : null,
        observedAtMs: observedAtMs(row.date, row.time),
        previousClose: open,
      },
      delay: "delayed",
      supportsRealtimeStream: false,
    });
  }
  return points;
}

/**
 * Discovers commodity instruments through Yahoo's search endpoint, keeping
 * only futures and currency quotes that map onto a Stooq symbol.
 */
export async function discoverCommodityInstruments(
  signal?: AbortSignal,
): Promise<
  { instrument: string; stooqSymbol: string; label: string; group: string }[]
> {
  const limit = resolveUniverseLimit(12);
  const queries = readSearchQueries(COMMODITY_QUERIES_ENV);
  if (queries.length === 0) {
    // No hardcoded fallback list exists: without terms there is nothing to
    // search for, so the pipeline is explicitly unconfigured.
    throw new MarketDataConfigurationError(
      PROVIDER_METALS,
      "Commodity discovery is not configured. Set MARKET_DATA_COMMODITY_QUERIES (comma-separated search terms) in .env.local.",
    );
  }

  const discovered: {
    instrument: string;
    stooqSymbol: string;
    label: string;
    group: string;
  }[] = [];
  const seen = new Set<string>();

  const consider = (quote: YahooSearchQuote): void => {
    if (discovered.length >= limit) return;
    if (quote.quoteType !== "FUTURE" && quote.quoteType !== "CURRENCY") return;
    const stooqSymbol = toStooqSymbol(quote.symbol);
    if (!stooqSymbol) return;
    if (seen.has(stooqSymbol)) return;
    seen.add(stooqSymbol);
    discovered.push({
      instrument: quote.symbol,
      stooqSymbol,
      label: quote.longName ?? quote.shortName ?? quote.symbol,
      group: quote.quoteType === "FUTURE" ? "Futures" : "Spot",
    });
  };

  for (const query of queries) {
    if (discovered.length >= limit) break;
    let quotes: YahooSearchQuote[];
    try {
      quotes = await searchYahooInstruments(
        "metals-commodities",
        query,
        25,
        signal,
      );
    } catch {
      // One failing query must not hide the others.
      continue;
    }
    for (const quote of quotes) consider(quote);
  }

  if (discovered.length === 0) {
    throw new Error(
      `No commodity instruments were discovered via ${PROVIDER_YAHOO}.`,
    );
  }

  return discovered;
}

export async function fetchMetalsAndCommodities(
  signal?: AbortSignal,
): Promise<MarketDataPoint[]> {
  const discovered = await discoverCommodityInstruments(signal);

  const wanted = new Map(
    discovered.map((item) => [
      item.stooqSymbol,
      { label: item.label, group: item.group, instrument: item.instrument },
    ]),
  );
  const symbols = [...wanted.keys()].join(",");
  const text = await requestProviderText(PROVIDER_METALS, {
    url: `${STOOQ_BASE}?s=${encodeURIComponent(symbols)}&f=sd2t2ohlcv&h&e=csv`,
    signal,
  });
  const points = parseStooqCsv(text, wanted);
  // Empty but valid CSV (e.g. market closed) is returned as-is; the UI shows
  // an explicit empty state rather than fabricated values.
  return points;
}

/**
 * Configured only when the operator supplies commodity search terms. Nothing
 * is hardcoded, so an unset variable means "not configured".
 */
export function isMetalsConfigured(): boolean {
  return readSearchQueries(COMMODITY_QUERIES_ENV).length > 0;
}
