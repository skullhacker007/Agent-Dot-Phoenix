import "server-only";

import { z } from "zod";
import { requestProviderJson, requestProviderText } from "./http";
import { DISCOVERY_TTL_MS, withDiscoveryCache } from "./discovery";

/**
 * Yahoo Finance helpers: session handling, instrument search and chart quotes.
 *
 * Yahoo's public endpoints may require a session cookie plus a "crumb" token
 * before they answer. We obtain both server-side and never forward them to
 * the browser.
 *
 * `scope` namespaces the cached session so two pipelines that both use Yahoo
 * never share state: each pipeline's session is independent.
 */

export const PROVIDER_YAHOO = "Yahoo Finance";

const YAHOO_BASES = [
  "https://query1.finance.yahoo.com",
  "https://query2.finance.yahoo.com",
];

/** Yahoo rejects requests without a browser-like User-Agent. */
const YAHOO_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const CRUMB_URL = "https://query1.finance.yahoo.com/v1/test/getcrumb";
const COOKIE_URLS = ["https://fc.yahoo.com", "https://finance.yahoo.com"];

export type YahooSearchQuote = {
  symbol: string;
  quoteType: string | null;
  shortName: string | null;
  longName: string | null;
  exchange: string | null;
  index: string | null;
};

const yahooSearchQuoteSchema = z.object({
  symbol: z.string(),
  quoteType: z.string().nullish(),
  shortName: z.string().nullish(),
  longName: z.string().nullish(),
  exchange: z.string().nullish(),
  index: z.string().nullish(),
});

const yahooSearchSchema = z.object({
  quotes: z.array(yahooSearchQuoteSchema).nullish(),
});

const yahooMetaSchema = z.object({
  regularMarketPrice: z.number().nullable().optional(),
  previousClose: z.number().nullable().optional(),
  regularMarketTime: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  exchangeName: z.string().nullable().optional(),
  longName: z.string().nullable().optional(),
  shortName: z.string().nullable().optional(),
});

const yahooChartResultSchema = z.object({ meta: yahooMetaSchema });

const yahooChartResponseSchema = z.object({
  chart: z.object({
    result: z.array(yahooChartResultSchema).nullable(),
    error: z.unknown().nullable(),
  }),
});

export type YahooChartMeta = z.infer<typeof yahooMetaSchema>;

type YahooSession = {
  cookie: string | null;
  crumb: string | null;
};

async function collectCookies(): Promise<string | null> {
  for (const url of COOKIE_URLS) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": YAHOO_USER_AGENT },
        redirect: "manual",
        cache: "no-store",
      });
      const setCookies =
        typeof response.headers.getSetCookie === "function"
          ? response.headers.getSetCookie()
          : [];
      const pairs = setCookies
        .map((cookie) => cookie.split(";")[0]?.trim())
        .filter((pair): pair is string => Boolean(pair));
      if (pairs.length > 0) return pairs.join("; ");
    } catch {
      // Try the next cookie host.
    }
  }
  return null;
}

async function fetchCrumb(cookie: string | null): Promise<string | null> {
  try {
    const crumb = await requestProviderText(PROVIDER_YAHOO, {
      url: CRUMB_URL,
      headers: {
        "User-Agent": YAHOO_USER_AGENT,
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    const trimmed = crumb.trim();
    // A crumb is a short opaque token; anything longer is an error page.
    return trimmed.length > 0 && trimmed.length <= 32 ? trimmed : null;
  } catch {
    return null;
  }
}

async function createSession(): Promise<YahooSession> {
  const cookie = await collectCookies();
  const crumb = await fetchCrumb(cookie);
  return { cookie, crumb };
}

async function getSession(scope: string): Promise<YahooSession> {
  return withDiscoveryCache(
    `yahoo:session:${scope}`,
    DISCOVERY_TTL_MS.session,
    createSession,
  );
}

function sessionHeaders(session: YahooSession): Record<string, string> {
  return {
    "User-Agent": YAHOO_USER_AGENT,
    ...(session.cookie ? { Cookie: session.cookie } : {}),
  };
}

function withCrumb(url: string, crumb: string | null): string {
  if (!crumb) return url;
  return `${url}${url.includes("?") ? "&" : "?"}crumb=${encodeURIComponent(crumb)}`;
}

/**
 * Searches Yahoo for instruments matching a free-text query. Used to discover
 * the live universe (indices, futures) instead of hardcoding symbols.
 */
export async function searchYahooInstruments(
  scope: string,
  query: string,
  count = 25,
  signal?: AbortSignal,
): Promise<YahooSearchQuote[]> {
  const session = await getSession(scope);
  const params = new URLSearchParams({
    q: query,
    quotesCount: String(count),
    newsCount: "0",
  });

  const url = withCrumb(
    `https://query1.finance.yahoo.com/v1/finance/search?${params.toString()}`,
    session.crumb,
  );

  const payload = await requestProviderJson(
    PROVIDER_YAHOO,
    { url, headers: sessionHeaders(session), signal },
    (raw) => yahooSearchSchema.parse(raw),
  );

  return (payload.quotes ?? []).map((quote) => ({
    symbol: quote.symbol,
    quoteType: quote.quoteType ?? null,
    shortName: quote.shortName ?? null,
    longName: quote.longName ?? null,
    exchange: quote.exchange ?? null,
    index: quote.index ?? null,
  }));
}

/**
 * Chart metadata for a single symbol. Tries the second Yahoo host before
 * failing, so a single host being down does not fail the call.
 */
export async function fetchYahooChartMeta(
  scope: string,
  symbol: string,
  signal?: AbortSignal,
): Promise<YahooChartMeta> {
  const session = await getSession(scope);
  const params = new URLSearchParams({ range: "1d", interval: "1d" });
  let lastError: unknown = null;

  for (const base of YAHOO_BASES) {
    const url = withCrumb(
      `${base}/v8/finance/chart/${encodeURIComponent(symbol)}?${params.toString()}`,
      session.crumb,
    );
    try {
      const parsed = await requestProviderJson(
        PROVIDER_YAHOO,
        { url, headers: sessionHeaders(session), signal },
        (raw) => yahooChartResponseSchema.parse(raw),
      );
      const result = parsed.chart.result?.[0];
      if (!result) {
        throw new Error(`Yahoo Finance returned no chart result for ${symbol}.`);
      }
      return result.meta;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Yahoo Finance request failed for ${symbol}.`);
}
