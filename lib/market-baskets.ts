/**
 * Shared constituent symbol definitions for Indian market index baskets.
 * Client and server safe (no server-only).
 */

export type IndexBasketType = "all" | "nifty50" | "niftybank" | "sensex";

export const NIFTY_50_SYMBOLS: ReadonlySet<string> = new Set([
  "ADANIENT", "ADANIPORTS", "APOLLOHOSP", "ASIANPAINT", "AXISBANK",
  "BAJAJ-AUTO", "BAJFINANCE", "BAJAJFINSV", "BEL", "BPCL",
  "BHARTIARTL", "BRITANNIA", "CIPLA", "COALINDIA", "DRREDDY",
  "EICHERMOT", "GRASIM", "HCLTECH", "HDFCBANK", "HDFCLIFE",
  "HEROMOTOCO", "HINDALCO", "HINDUNILVR", "ICICIBANK", "INDUSINDBK",
  "INFY", "ITC", "JSWSTEEL", "KOTAKBANK", "LT",
  "M&M", "MARUTI", "NESTLEIND", "NTPC", "ONGC",
  "POWERGRID", "RELIANCE", "SBILIFE", "SBIN", "SHRIRAMFIN",
  "SUNPHARMA", "TATACONSUM", "TATAMOTORS", "TATASTEEL", "TCS",
  "TECHM", "TITAN", "TRENT", "ULTRACEMCO", "WIPRO",
]);

export const NIFTY_BANK_SYMBOLS: ReadonlySet<string> = new Set([
  "HDFCBANK", "ICICIBANK", "SBIN", "KOTAKBANK", "AXISBANK",
  "INDUSINDBK", "BANKBARODA", "PNB", "FEDERALBNK", "IDFCFIRSTB",
  "AUBANK", "BANDHANBNK", "CANBK", "UNIONBANK",
]);

export const SENSEX_SYMBOLS: ReadonlySet<string> = new Set([
  "ADANIPORTS", "ASIANPAINT", "AXISBANK", "BAJFINANCE", "BAJAJFINSV",
  "BEL", "BHARTIARTL", "HCLTECH", "HDFCBANK", "HINDUNILVR",
  "ICICIBANK", "INFY", "ITC", "JSWSTEEL", "KOTAKBANK",
  "LT", "M&M", "MARUTI", "NTPC", "POWERGRID",
  "RELIANCE", "SBIN", "SUNPHARMA", "TATAMOTORS", "TATASTEEL",
  "TCS", "TECHM", "TITAN", "TRENT", "ULTRACEMCO",
]);
