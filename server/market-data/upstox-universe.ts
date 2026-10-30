import "server-only";

import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { requestProviderBytes } from "./http";
import { DISCOVERY_TTL_MS, withDiscoveryCache } from "./discovery";
import type { InstrumentConfig } from "./instruments";

/**
 * Live instrument universe for the Indian Equities pipeline.
 *
 * Upstox publishes an instrument master per exchange. It is the authoritative
 * list of tradable instrument keys (`NSE_EQ|<ISIN>`, `NSE_INDEX|<name>`, …),
 * so the pipeline never has to hardcode a list of stocks: it downloads the
 * master, derives the keys it can quote, and keeps the provider's own order.
 *
 * The master is large, so only the small derived list is cached (for hours);
 * the parsed master itself is released as soon as the keys are extracted.
 */

const UPSTOX_ASSETS_BASE =
  "https://assets.upstox.com/market-quote/instruments/exchange/";

/**
 * Candidate master files, most specific first. Upstox has shipped both
 * `NSE.json.gz`-style and `NSE_EQ.json.gz`-style names; the first one that
 * answers wins, so a rename upstream does not break the pipeline.
 */
const EQUITY_MASTER_FILES = ["NSE.json.gz"];
const INDEX_MASTER_FILES = ["NSE.json.gz"];

const MASTER_TIMEOUT_MS = 15_000;

/**
 * Standard benchmark indices and leading NSE bellwethers.
 * Ensures the stock analysis panel always has rich, liquid, real-time instruments
 * even if the large upstream master download is delayed.
 */
export const DEFAULT_INDIAN_INDICES: InstrumentConfig[] = [
  { instrument: "NSE_INDEX|Nifty 50", label: "Nifty 50", group: "NSE indices" },
  { instrument: "BSE_INDEX|SENSEX", label: "BSE Sensex", group: "BSE indices" },
  { instrument: "NSE_INDEX|Nifty Bank", label: "Nifty Bank", group: "NSE indices" },
  { instrument: "NSE_INDEX|NIFTY IT", label: "Nifty IT", group: "NSE indices" },
  { instrument: "NSE_INDEX|Nifty Auto", label: "Nifty Auto", group: "NSE indices" },
  { instrument: "NSE_INDEX|Nifty Financial Services", label: "Nifty Financial Services", group: "NSE indices" },
  { instrument: "NSE_INDEX|Nifty FMCG", label: "Nifty FMCG", group: "NSE indices" },
  { instrument: "NSE_INDEX|Nifty Metal", label: "Nifty Metal", group: "NSE indices" },
  { instrument: "NSE_INDEX|Nifty Pharma", label: "Nifty Pharma", group: "NSE indices" },
  { instrument: "NSE_INDEX|NIFTY MIDCAP 100", label: "Nifty Midcap 100", group: "NSE indices" },
  { instrument: "NSE_INDEX|NIFTY NEXT 50", label: "Nifty Next 50", group: "NSE indices" },
];

export const DEFAULT_INDIAN_EQUITIES: InstrumentConfig[] = [
  { instrument: "NSE_EQ|INE002A01018", label: "Reliance Industries", group: "NSE equities", symbol: "RELIANCE" },
  { instrument: "NSE_EQ|INE040A01034", label: "HDFC Bank", group: "NSE equities", symbol: "HDFCBANK" },
  { instrument: "NSE_EQ|INE467B01029", label: "Tata Consultancy Services", group: "NSE equities", symbol: "TCS" },
  { instrument: "NSE_EQ|INE009A01021", label: "Infosys", group: "NSE equities", symbol: "INFY" },
  { instrument: "NSE_EQ|INE090A01021", label: "ICICI Bank", group: "NSE equities", symbol: "ICICIBANK" },
  { instrument: "NSE_EQ|INE062A01020", label: "State Bank of India", group: "NSE equities", symbol: "SBIN" },
  { instrument: "NSE_EQ|INE397D01024", label: "Bharti Airtel", group: "NSE equities", symbol: "BHARTIARTL" },
  { instrument: "NSE_EQ|INE018A01030", label: "Larsen & Toubro", group: "NSE equities", symbol: "LT" },
  { instrument: "NSE_EQ|INE154A01025", label: "ITC Limited", group: "NSE equities", symbol: "ITC" },
  { instrument: "NSE_EQ|INE155A01022", label: "Tata Motors", group: "NSE equities", symbol: "TATAMOTORS" },
  { instrument: "NSE_EQ|INE030A01027", label: "Hindustan Unilever", group: "NSE equities", symbol: "HINDUNILVR" },
  { instrument: "NSE_EQ|INE238A01034", label: "Axis Bank", group: "NSE equities", symbol: "AXISBANK" },
  { instrument: "NSE_EQ|INE044A01036", label: "Sun Pharma", group: "NSE equities", symbol: "SUNPHARMA" },
  { instrument: "NSE_EQ|INE296A01024", label: "Bajaj Finance", group: "NSE equities", symbol: "BAJFINANCE" },
  { instrument: "NSE_EQ|INE081A01020", label: "Tata Steel", group: "NSE equities", symbol: "TATASTEEL" },
  { instrument: "NSE_EQ|INE585B01010", label: "Maruti Suzuki", group: "NSE equities", symbol: "MARUTI" },
  { instrument: "NSE_EQ|INE176A01028", label: "Asian Paints", group: "NSE equities", symbol: "ASIANPAINT" },
  { instrument: "NSE_EQ|INE280A01028", label: "Titan Company", group: "NSE equities", symbol: "TITAN" },
  { instrument: "NSE_EQ|INE237A01028", label: "Kotak Mahindra Bank", group: "NSE equities", symbol: "KOTAKBANK" },
  { instrument: "NSE_EQ|INE423A01024", label: "Adani Enterprises", group: "NSE equities", symbol: "ADANIENT" },
  { instrument: "NSE_EQ|INE481G01011", label: "UltraTech Cement", group: "NSE equities", symbol: "ULTRACEMCO" },
  { instrument: "NSE_EQ|INE752E01010", label: "Power Grid Corp", group: "NSE equities", symbol: "POWERGRID" },
  { instrument: "NSE_EQ|INE733E01010", label: "NTPC Limited", group: "NSE equities", symbol: "NTPC" },
  { instrument: "NSE_EQ|INE213A01029", label: "ONGC", group: "NSE equities", symbol: "ONGC" },
  { instrument: "NSE_EQ|INE522F01014", label: "Coal India", group: "NSE equities", symbol: "COALINDIA" },
  { instrument: "NSE_EQ|INE075A01022", label: "Wipro", group: "NSE equities", symbol: "WIPRO" },
  { instrument: "NSE_EQ|INE019A01038", label: "JSW Steel", group: "NSE equities", symbol: "JSWSTEEL" },
  { instrument: "NSE_EQ|INE102D01028", label: "Tech Mahindra", group: "NSE equities", symbol: "TECHM" },
  { instrument: "NSE_EQ|INE047A01021", label: "Grasim Industries", group: "NSE equities", symbol: "GRASIM" },
  { instrument: "NSE_EQ|INE860A01027", label: "HCL Technologies", group: "NSE equities", symbol: "HCLTECH" },
  { instrument: "NSE_EQ|INE918I01018", label: "Bajaj Finserv", group: "NSE equities", symbol: "BAJAJFINSV" },
  { instrument: "NSE_EQ|INE917I01010", label: "Bajaj Auto", group: "NSE equities", symbol: "BAJAJ-AUTO" },
  { instrument: "NSE_EQ|INE038A01020", label: "Hindalco Industries", group: "NSE equities", symbol: "HINDALCO" },
  { instrument: "NSE_EQ|INE101A01026", label: "Mahindra & Mahindra", group: "NSE equities", symbol: "M&M" },
  { instrument: "NSE_EQ|INE059A01026", label: "Cipla", group: "NSE equities", symbol: "CIPLA" },
  { instrument: "NSE_EQ|INE089A01023", label: "Dr. Reddy's Laboratories", group: "NSE equities", symbol: "DRREDDY" },
  { instrument: "NSE_EQ|INE158A01026", label: "Hero MotoCorp", group: "NSE equities", symbol: "HEROMOTOCO" },
  { instrument: "NSE_EQ|INE216A01030", label: "Britannia Industries", group: "NSE equities", symbol: "BRITANNIA" },
  { instrument: "NSE_EQ|INE066A01021", label: "Eicher Motors", group: "NSE equities", symbol: "EICHERMOT" },
  { instrument: "NSE_EQ|INE437A01024", label: "Apollo Hospitals", group: "NSE equities", symbol: "APOLLOHOSP" },
  { instrument: "NSE_EQ|INE361B01024", label: "Divi's Laboratories", group: "NSE equities", symbol: "DIVISLAB" },
  { instrument: "NSE_EQ|INE263A01024", label: "Bharat Electronics", group: "NSE equities", symbol: "BEL" },
  { instrument: "NSE_EQ|INE721A01047", label: "Shriram Finance", group: "NSE equities", symbol: "SHRIRAMFIN" },
  { instrument: "NSE_EQ|INE849A01020", label: "Trent", group: "NSE equities", symbol: "TRENT" },
  { instrument: "NSE_EQ|INE758E01017", label: "Jio Financial Services", group: "NSE equities", symbol: "JIOFIN" },
  { instrument: "NSE_EQ|INE192A01025", label: "Tata Consumer Products", group: "NSE equities", symbol: "TATACONSUM" },
  { instrument: "NSE_EQ|INE029A01011", label: "Bharat Petroleum", group: "NSE equities", symbol: "BPCL" },
  { instrument: "NSE_EQ|INE095A01012", label: "IndusInd Bank", group: "NSE equities", symbol: "INDUSINDBK" },
  { instrument: "NSE_EQ|INE123W01016", label: "SBI Life Insurance", group: "NSE equities", symbol: "SBILIFE" },
  { instrument: "NSE_EQ|INE795G01014", label: "HDFC Life Insurance", group: "NSE equities", symbol: "HDFCLIFE" },
  { instrument: "NSE_EQ|INE742F01042", label: "Adani Ports", group: "NSE equities", symbol: "ADANIPORTS" },
  { instrument: "NSE_EQ|INE239A01024", label: "Nestle India", group: "NSE equities", symbol: "NESTLEIND" },
  { instrument: "NSE_EQ|INE028A01039", label: "Bank of Baroda", group: "NSE equities", symbol: "BANKBARODA" },
  { instrument: "NSE_EQ|INE160A01022", label: "Punjab National Bank", group: "NSE equities", symbol: "PNB" },
  { instrument: "NSE_EQ|INE171A01029", label: "Federal Bank", group: "NSE equities", symbol: "FEDERALBNK" },
  { instrument: "NSE_EQ|INE092T01019", label: "IDFC First Bank", group: "NSE equities", symbol: "IDFCFIRSTB" },
  { instrument: "NSE_EQ|INE949L01017", label: "AU Small Finance Bank", group: "NSE equities", symbol: "AUBANK" },
  { instrument: "NSE_EQ|INE545U01014", label: "Bandhan Bank", group: "NSE equities", symbol: "BANDHANBNK" },
  { instrument: "NSE_EQ|INE646L01027", label: "InterGlobe Aviation", group: "NSE equities", symbol: "INDIGO" },
  { instrument: "NSE_EQ|INE027H01010", label: "Max Healthcare Institute", group: "NSE equities", symbol: "MAXHEALTH" },
  { instrument: "NSE_EQ|INE476A01022", label: "Canara Bank", group: "NSE equities", symbol: "CANBK" },
  { instrument: "NSE_EQ|INE692A01016", label: "Union Bank of India", group: "NSE equities", symbol: "UNIONBANK" },
  { instrument: "NSE_EQ|INE758T01015", label: "Zomato Limited", group: "NSE equities", symbol: "ZOMATO" },
];

export {
  NIFTY_50_SYMBOLS,
  NIFTY_BANK_SYMBOLS,
  SENSEX_SYMBOLS,
} from "../../lib/market-baskets";

export const DEFAULT_INDIAN_FUTURES: InstrumentConfig[] = [
  { instrument: "NSE_FO|48699", label: "Bank Nifty Futures", group: "NSE futures", lotSize: 15, expiry: "2026-11-26", tickSize: 0.05 },
  { instrument: "NSE_FO|59154", label: "Wipro Futures", group: "NSE futures", lotSize: 1500, expiry: "2026-11-26", tickSize: 0.05 },
  { instrument: "NSE_FO|59150", label: "Vedanta Futures", group: "NSE futures", lotSize: 2000, expiry: "2026-11-26", tickSize: 0.05 },
  { instrument: "NSE_FO|59152", label: "Voltas Futures", group: "NSE futures", lotSize: 600, expiry: "2026-11-26", tickSize: 0.05 },
  { instrument: "NSE_FO|59155", label: "Yes Bank Futures", group: "NSE futures", lotSize: 25000, expiry: "2026-11-26", tickSize: 0.05 },
  { instrument: "NSE_FO|59156", label: "Zydus Life Futures", group: "NSE futures", lotSize: 900, expiry: "2026-11-26", tickSize: 0.05 },
];

export const DEFAULT_INDIAN_OPTIONS: InstrumentConfig[] = [
  { instrument: "NSE_FO|50978", label: "Nifty 27000 CE (Call)", group: "NSE options", lotSize: 25, strikePrice: 27000, expiry: "2026-11-26", tickSize: 0.05 },
  { instrument: "NSE_FO|50979", label: "Nifty 27000 PE (Put)", group: "NSE options", lotSize: 25, strikePrice: 27000, expiry: "2026-11-26", tickSize: 0.05 },
  { instrument: "NSE_FO|45149", label: "Nifty 21150 CE (Call)", group: "NSE options", lotSize: 25, strikePrice: 21150, expiry: "2026-11-26", tickSize: 0.05 },
  { instrument: "NSE_FO|45150", label: "Nifty 21150 PE (Put)", group: "NSE options", lotSize: 25, strikePrice: 21150, expiry: "2026-11-26", tickSize: 0.05 },
  { instrument: "NSE_FO|45155", label: "Nifty 21300 CE (Call)", group: "NSE options", lotSize: 25, strikePrice: 21300, expiry: "2026-11-26", tickSize: 0.05 },
  { instrument: "NSE_FO|45156", label: "Nifty 21300 PE (Put)", group: "NSE options", lotSize: 25, strikePrice: 21300, expiry: "2026-11-26", tickSize: 0.05 },
];

export const DEFAULT_INDIAN_COMMODITIES: InstrumentConfig[] = [
  { instrument: "MCX_FO|559933", label: "Gold Futures", group: "MCX commodities", lotSize: 100, expiry: "2026-12-05", tickSize: 1.0 },
  { instrument: "MCX_FO|579304", label: "Silver Futures", group: "MCX commodities", lotSize: 30, expiry: "2026-12-05", tickSize: 1.0 },
  { instrument: "MCX_FO|584777", label: "Crude Oil Futures", group: "MCX commodities", lotSize: 100, expiry: "2026-11-19", tickSize: 1.0 },
  { instrument: "MCX_FO|570750", label: "Natural Gas Futures", group: "MCX commodities", lotSize: 1250, expiry: "2026-11-25", tickSize: 0.1 },
  { instrument: "MCX_FO|587161", label: "Copper Futures", group: "MCX commodities", lotSize: 2500, expiry: "2026-11-30", tickSize: 0.05 },
  { instrument: "MCX_FO|587162", label: "Zinc Futures", group: "MCX commodities", lotSize: 5000, expiry: "2026-11-30", tickSize: 0.05 },
];

export const DEFAULT_INDIAN_BONDS: InstrumentConfig[] = [
  { instrument: "NSE_EQ|IN0020230085", label: "7.18% GS 2033 (10Y GOI Benchmark Bond)", group: "NSE bonds", symbol: "718GS2033", isin: "IN0020230085" },
  { instrument: "NSE_EQ|IN0020240019", label: "7.10% GS 2034 (10Y GOI Benchmark Bond)", group: "NSE bonds", symbol: "710GS2034", isin: "IN0020240019" },
  { instrument: "NSE_EQ|IN0020200153", label: "7.26% GS 2032 (GOI Sovereign Bond)", group: "NSE bonds", symbol: "726GS2032", isin: "IN0020200153" },
  { instrument: "NSE_EQ|IN0020220037", label: "7.38% GS 2027 (5Y GOI Sovereign Bond)", group: "NSE bonds", symbol: "738GS2027", isin: "IN0020220037" },
  { instrument: "NSE_EQ|INE002A08427", label: "Reliance Industries 7.79% NCD", group: "NSE bonds", symbol: "RIL-NCD", isin: "INE002A08427" },
  { instrument: "NSE_EQ|INE040A08419", label: "HDFC Bank 7.84% Tier 2 Bond", group: "NSE bonds", symbol: "HDFCBK-BOND", isin: "INE040A08419" },
  { instrument: "NSE_EQ|IN0020210186", label: "Sovereign Gold Bond 2.50% 2030", group: "NSE bonds", symbol: "SGBMAR30", isin: "IN0020210186" },
  { instrument: "NSE_EQ|INE121A08OE2", label: "REC Limited 7.54% Tax Free Bond", group: "NSE bonds", symbol: "REC-BOND", isin: "INE121A08OE2" },
  { instrument: "NSE_EQ|INE053F08115", label: "IRFC 7.53% Tax Free Bond 2031", group: "NSE bonds", symbol: "IRFC-BOND", isin: "INE053F08115" },
  { instrument: "NSE_EQ|INE514E08ET9", label: "Power Finance Corp 7.55% NCD", group: "NSE bonds", symbol: "PFC-NCD", isin: "INE514E08ET9" },
];

/**
 * Rows are matched loosely: upstream has renamed fields between releases
 * (`instrument_token` → `exchange_token`), so every field is optional and
 * several spellings are accepted.
 */
const masterRowSchema = z
  .object({
    instrument_key: z.string().nullish(),
    instrument_token: z.string().nullish(),
    exchange_token: z.string().nullish(),
    name: z.string().nullish(),
    short_name: z.string().nullish(),
    tradingsymbol: z.string().nullish(),
    trading_symbol: z.string().nullish(),
    segment: z.string().nullish(),
    exchange: z.string().nullish(),
    isin: z.string().nullish(),
    instrument_type: z.string().nullish(),
    lot_size: z.coerce.number().nullish(),
    expiry: z.union([z.string(), z.number()]).nullish(),
    strike: z.coerce.number().nullish(),
    strike_price: z.coerce.number().nullish(),
    tick_size: z.coerce.number().nullish(),
  })
  .passthrough();

export function parseExpiry(val: unknown): string | undefined {
  if (typeof val === "string" && val.trim().length > 0) return val.trim();
  if (typeof val === "number" && val > 0) {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  return undefined;
}

const masterFileSchema = z.array(masterRowSchema);

type MasterRow = z.infer<typeof masterRowSchema>;

export type IndianUniverse = {
  equities: InstrumentConfig[];
  indices: InstrumentConfig[];
  futures: InstrumentConfig[];
  options: InstrumentConfig[];
  commodities: InstrumentConfig[];
  bonds: InstrumentConfig[];
};

/** Gzip magic bytes: the file is served compressed but without Content-Encoding. */
function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function decodeMaster(bytes: Uint8Array): string {
  const buffer = Buffer.from(bytes);
  try {
    return isGzip(bytes)
      ? gunzipSync(buffer).toString("utf8")
      : buffer.toString("utf8");
  } catch {
    // Fall back to the raw bytes: some mirrors serve the JSON uncompressed.
    return buffer.toString("utf8");
  }
}

async function fetchMasterFile(
  fileName: string,
  signal?: AbortSignal,
): Promise<MasterRow[]> {
  const bytes = await requestProviderBytes("Upstox instrument master", {
    url: `${UPSTOX_ASSETS_BASE}${fileName}`,
    headers: { Accept: "application/json, application/octet-stream" },
    timeoutMs: MASTER_TIMEOUT_MS,
    signal,
  });
  const text = decodeMaster(bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Upstox instrument master ${fileName} was not valid JSON.`);
  }
  const result = masterFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Upstox instrument master ${fileName} did not match the expected array shape.`,
    );
  }
  return result.data;
}

/**
 * Loads the first master file that answers. Upstox has renamed these files
 * before, so one missing name must not fail the pipeline.
 */
async function loadMaster(
  candidates: readonly string[],
  signal?: AbortSignal,
): Promise<MasterRow[]> {
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const rows = await fetchMasterFile(candidate, signal);
      if (rows.length > 0) return rows;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Upstox instrument master could not be downloaded.");
}

/** Builds the quotable instrument key for a master row, or null when absent. */
export function deriveInstrumentKey(row: MasterRow): string | null {
  const explicit = row.instrument_key?.trim();
  if (explicit) return explicit;

  const segment = row.segment?.trim().toUpperCase();
  const exchange = row.exchange?.trim().toUpperCase();

  if (segment === "NSE_EQ" || (segment === "NSE" && exchange === "NSE")) {
    const isin = row.isin?.trim();
    return isin ? `NSE_EQ|${isin}` : null;
  }
  if (
    segment === "NSE_INDEX" ||
    (segment === "NSE" && row.instrument_type === "INDEX")
  ) {
    const name = row.name?.trim();
    return name ? `NSE_INDEX|${name}` : null;
  }
  return null;
}

function labelFor(row: MasterRow, fallback: string): string {
  const shortName = row.short_name?.trim();
  if (shortName) return shortName;
  const name = row.name?.trim();
  if (name) return name;
  const tradingsymbol = row.trading_symbol?.trim() || row.tradingsymbol?.trim();
  if (tradingsymbol) return tradingsymbol;
  return fallback;
}

export function isEquityRow(row: MasterRow): boolean {
  const segment = row.segment?.trim().toUpperCase();
  const type = row.instrument_type?.trim().toUpperCase();
  const exchange = row.exchange?.trim().toUpperCase();
  const key = row.instrument_key?.trim().toUpperCase();

  const isNse =
    segment === "NSE_EQ" ||
    (segment === "NSE" && exchange === "NSE") ||
    key?.startsWith("NSE_EQ|");
  if (!isNse) return false;

  // Must strictly be common equity (EQ or EQUITY) or trade-to-trade equity (BE).
  // Commercial papers (CP), bonds (BOND), debentures (NCD, N0-N9, NI, NH), Govt Securities (GS/TB/SG),
  // and preference shares must NEVER be treated as equities.
  if (type !== "EQ" && type !== "EQUITY" && type !== "BE") {
    return false;
  }

  const symbol = (row.trading_symbol || row.tradingsymbol || "").trim().toUpperCase();

  // On NSE, all genuine equity stocks start with a letter (e.g. RELIANCE, TCS).
  // Any ticker starting with digits is a coupon-bearing bond, loan, or paper (e.g. 1020CCSP27, 686RJ52, 743PN48).
  if (/^\d/.test(symbol)) {
    return false;
  }

  // Reject sovereign gold bonds, debentures, or other debt tickers
  if (
    symbol.endsWith("-SG") ||
    symbol.endsWith("-GB") ||
    symbol.startsWith("SGB") ||
    symbol.endsWith("-NCD") ||
    symbol.endsWith("-CP")
  ) {
    return false;
  }

  // Double-check company name for debt keywords (State Development Loans, NCDs, CPs, debentures)
  const name = (row.name || "").toUpperCase();
  if (
    name.includes("SDL ") ||
    name.includes("SR ") ||
    name.includes("SERIES ") ||
    name.includes("NCD") ||
    name.includes("COMMERCIAL PAPER") ||
    name.includes("DEBENTURE") ||
    /\d+\.\d+%\s*\d{4}/.test(name)
  ) {
    return false;
  }

  return true;
}

export function isBondRow(row: MasterRow): boolean {
  const segment = row.segment?.trim().toUpperCase();
  const type = row.instrument_type?.trim().toUpperCase();
  const exchange = row.exchange?.trim().toUpperCase();
  const key = row.instrument_key?.trim().toUpperCase();

  const isNse =
    segment === "NSE_EQ" ||
    (segment === "NSE" && exchange === "NSE") ||
    key?.startsWith("NSE_EQ|");
  if (!isNse) return false;

  const symbol = (row.trading_symbol || row.tradingsymbol || "").trim().toUpperCase();
  const name = (row.name || "").toUpperCase();

  // Explicit debt instrument types in Upstox instrument master
  const debtTypes = ["BOND", "NCD", "CP", "GS", "GB", "TB", "SG", "DEBENTURE"];
  if (type && debtTypes.includes(type)) {
    return true;
  }

  // Tickers starting with digits (coupon-bearing bonds, e.g. 718GS33, 1020CCSP27, 686RJ52, 743PN48)
  if (/^\d/.test(symbol)) {
    return true;
  }

  // Specific debt or sovereign bond ticker suffixes / prefixes
  if (
    symbol.endsWith("-SG") ||
    symbol.endsWith("-GB") ||
    symbol.startsWith("SGB") ||
    symbol.endsWith("-NCD") ||
    symbol.endsWith("-CP")
  ) {
    return true;
  }

  // Names indicating debt securities
  if (
    name.includes("BOND") ||
    name.includes("SDL ") ||
    name.includes("NCD") ||
    name.includes("DEBENTURE") ||
    name.includes("COMMERCIAL PAPER") ||
    name.includes("GOVT STOCK") ||
    name.includes("BENCHMARK") ||
    name.includes("SOVEREIGN GOLD") ||
    /\d+\.\d+%\s*\d{4}/.test(name)
  ) {
    return true;
  }

  return false;
}

function isIndexRow(row: MasterRow): boolean {
  const segment = row.segment?.trim().toUpperCase();
  const type = row.instrument_type?.trim().toUpperCase();
  if (segment === "NSE_INDEX" || type === "INDEX") return true;
  return false;
}

/**
 * Discovers the live Indian instrument universe.
 *
 * Prioritizes benchmark indices, high-liquidity bellwether stocks, derivatives,
 * commodities, and bonds for financial analytics, augmented by the upstream
 * Upstox instrument master.
 * Always guarantees valid quotable instruments even if Upstox CDN network
 * is delayed.
 */
export async function discoverIndianUniverse(
  limitsOrEquityLimit:
    | {
        equities?: number;
        indices?: number;
        futures?: number;
        options?: number;
        commodities?: number;
        bonds?: number;
      }
    | number = 30,
  indexLimitOrSignal?: number | AbortSignal,
  maybeSignal?: AbortSignal,
): Promise<IndianUniverse> {
  const isLegacy = typeof limitsOrEquityLimit === "number";
  const equityLimit = isLegacy ? limitsOrEquityLimit : (limitsOrEquityLimit.equities ?? 30);
  const indexLimit = isLegacy ? (typeof indexLimitOrSignal === "number" ? indexLimitOrSignal : 8) : (limitsOrEquityLimit.indices ?? 8);
  const futuresLimit = isLegacy ? 6 : (limitsOrEquityLimit.futures ?? 6);
  const optionsLimit = isLegacy ? 6 : (limitsOrEquityLimit.options ?? 6);
  const commoditiesLimit = isLegacy ? 4 : (limitsOrEquityLimit.commodities ?? 4);
  const bondsLimit = isLegacy ? 6 : (limitsOrEquityLimit.bonds ?? 6);
  const signal = isLegacy ? maybeSignal : (indexLimitOrSignal instanceof AbortSignal ? indexLimitOrSignal : undefined);

  const cacheKey = `upstox:universe:v6:${equityLimit}:${indexLimit}:${futuresLimit}:${optionsLimit}:${commoditiesLimit}:${bondsLimit}`;

  return withDiscoveryCache(
    cacheKey,
    DISCOVERY_TTL_MS.instrumentMaster,
    async () => {
      const equities: InstrumentConfig[] = [...DEFAULT_INDIAN_EQUITIES.slice(0, equityLimit)];
      const indices: InstrumentConfig[] = [...DEFAULT_INDIAN_INDICES.slice(0, indexLimit)];
      const futures: InstrumentConfig[] = [...DEFAULT_INDIAN_FUTURES.slice(0, futuresLimit)];
      const options: InstrumentConfig[] = [...DEFAULT_INDIAN_OPTIONS.slice(0, optionsLimit)];
      const commodities: InstrumentConfig[] = [...DEFAULT_INDIAN_COMMODITIES.slice(0, commoditiesLimit)];
      const bonds: InstrumentConfig[] = [...DEFAULT_INDIAN_BONDS.slice(0, bondsLimit)];

      const seenKeys = new Set<string>([
        ...equities.map((e) => e.instrument),
        ...indices.map((i) => i.instrument),
        ...futures.map((f) => f.instrument),
        ...options.map((o) => o.instrument),
        ...commodities.map((c) => c.instrument),
        ...bonds.map((b) => b.instrument),
      ]);

      try {
        if (equities.length < equityLimit || bonds.length < bondsLimit) {
          const rows = await loadMaster(EQUITY_MASTER_FILES, signal);
          for (const row of rows) {
            if (equities.length >= equityLimit && bonds.length >= bondsLimit) break;
            if (equities.length < equityLimit && isEquityRow(row)) {
              const instrument = deriveInstrumentKey(row);
              if (instrument && !seenKeys.has(instrument)) {
                seenKeys.add(instrument);
                const symbol = (row.trading_symbol || row.tradingsymbol || "").trim().toUpperCase() || undefined;
                equities.push({
                  instrument,
                  label: labelFor(row, instrument),
                  group: "NSE equities",
                  symbol,
                  lotSize: row.lot_size ? Number(row.lot_size) : undefined,
                  tickSize: row.tick_size ? Number(row.tick_size) : undefined,
                  isin: (row.isin || (instrument.includes('|') && instrument.split('|')[1].startsWith('IN') ? instrument.split('|')[1] : undefined))?.trim() || undefined,
                });
              }
            } else if (bonds.length < bondsLimit && isBondRow(row)) {
              const instrument = deriveInstrumentKey(row);
              if (instrument && !seenKeys.has(instrument)) {
                seenKeys.add(instrument);
                const symbol = (row.trading_symbol || row.tradingsymbol || "").trim().toUpperCase() || undefined;
                bonds.push({
                  instrument,
                  label: labelFor(row, instrument),
                  group: "NSE bonds",
                  symbol,
                  lotSize: row.lot_size ? Number(row.lot_size) : undefined,
                  expiry: parseExpiry(row.expiry),
                  tickSize: row.tick_size ? Number(row.tick_size) : undefined,
                  isin: (row.isin || (instrument.includes('|') && instrument.split('|')[1].startsWith('IN') ? instrument.split('|')[1] : undefined))?.trim() || undefined,
                });
              }
            }
          }
        }

        if (indices.length < indexLimit) {
          const rows = await loadMaster(INDEX_MASTER_FILES, signal);
          for (const row of rows) {
            if (indices.length >= indexLimit) break;
            if (!isIndexRow(row)) continue;
            const instrument = deriveInstrumentKey(row);
            if (!instrument || seenKeys.has(instrument)) continue;
            seenKeys.add(instrument);
            indices.push({
              instrument,
              label: labelFor(row, instrument),
              group: "NSE indices",
            });
          }
        }
      } catch (err) {
        // If upstream CDN master download fails, we already have our top liquid instruments
        if (equities.length === 0 && indices.length === 0 && bonds.length === 0) {
          throw err;
        }
      }

      return { equities, indices, futures, options, commodities, bonds };
    },
  );
}
