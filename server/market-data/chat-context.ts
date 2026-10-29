import type { MarketDataPoint, PipelineSnapshot } from "./types";

export type CompactMarketPoint = {
  symbol?: string;
  label?: string;
  group?: string;
  value?: number | null;
  change?: number | null;
  changePercent?: number | null;
  volume?: number | null;
  high?: number | null;
  low?: number | null;
  open?: number | null;
  close?: number | null;
  previousClose?: number | null;
  averagePrice?: number | null;
  oi?: number | null;
  oiDayHigh?: number | null;
  oiDayLow?: number | null;
  prevOi?: number | null;
  oiChange?: number | null;
  oiChangePercent?: number | null;
  yearlyHigh?: number | null;
  yearlyLow?: number | null;
  lastQuantity?: number | null;
  totalBuyQuantity?: number | null;
  totalSellQuantity?: number | null;
  lowerCircuit?: number | null;
  upperCircuit?: number | null;
  expiry?: string | null;
  lotSize?: number | null;
  strikePrice?: number | null;
  tickSize?: number | null;
  isin?: string | null;
};

type MarketPointSummary = {
  label?: string;
  symbol?: string;
  instrument?: string;
  value?: number | null;
  change?: number | null;
  changePercent?: number | null;
  quote?: {
    symbol?: string;
    value?: number | null;
    change?: number | null;
    changePercent?: number | null;
    volume?: number | null;
    high?: number | null;
    low?: number | null;
    averagePrice?: number | null;
  };
};

export type VisionChatMarketContext = {
  activeFilter?: string;
  categoryCounts?: {
    stocks?: number;
    indices?: number;
    futures?: number;
    options?: number;
    commodities?: number;
    bonds?: number;
    total?: number;
  };
  analytics?: {
    advanceCount?: number;
    declineCount?: number;
    unchangedCount?: number;
    advancePercent?: number;
    topGainer?: MarketPointSummary | null;
    topLoser?: MarketPointSummary | null;
    volumeLeader?: MarketPointSummary | null;
    nifty50?: MarketPointSummary | null;
  } | null;
  selectedPoint?: MarketPointSummary | null;
  compactPoints?: CompactMarketPoint[];
};

function formatPrice(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  const maximumFractionDigits = Math.abs(val) >= 1000 ? 2 : 4;
  return `₹${val.toLocaleString("en-IN", {
    maximumFractionDigits,
    minimumFractionDigits: 2,
  })}`;
}

function formatChange(
  change: number | null | undefined,
  pct: number | null | undefined,
): string {
  if (pct === null || pct === undefined) return "—";
  const sign = pct > 0 ? "+" : "";
  const changeText =
    change !== null && change !== undefined
      ? ` (${change > 0 ? "+" : ""}${change.toFixed(2)})`
      : "";
  return `${sign}${pct.toFixed(2)}%${changeText}`;
}

function formatVolume(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  if (val >= 10_000_000) return `${(val / 10_000_000).toFixed(2)} Cr`;
  if (val >= 100_000) return `${(val / 100_000).toFixed(2)} L`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k`;
  return val.toLocaleString("en-IN");
}

type NormalizedPoint = {
  symbol: string;
  label: string;
  group: string;
  value: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  close?: number | null;
  previousClose?: number | null;
  averagePrice?: number | null;
  oi?: number | null;
  oiDayHigh?: number | null;
  oiDayLow?: number | null;
  prevOi?: number | null;
  oiChange?: number | null;
  oiChangePercent?: number | null;
  yearlyHigh?: number | null;
  yearlyLow?: number | null;
  lastQuantity?: number | null;
  totalBuyQuantity?: number | null;
  totalSellQuantity?: number | null;
  lowerCircuit?: number | null;
  upperCircuit?: number | null;
  expiry?: string | null;
  lotSize?: number | null;
  strikePrice?: number | null;
  tickSize?: number | null;
  isin?: string | null;
  quote?: MarketPointSummary["quote"];
  rawPoint?: MarketDataPoint;
};

export function isDebtInstrument(symbol?: string, label?: string): boolean {
  if (symbol && /^\d/.test(symbol.trim())) return true;
  if (label && /^\d/.test(label.trim())) return true;
  const text = `${symbol || ""} ${label || ""}`;
  return /\b(?:SDL|NCD|CP|DEBENTURE|SERIES|SR\s*\d+)\b/i.test(text);
}

function normalizePoints(
  clientPoints?: CompactMarketPoint[],
  serverSnapshot?: PipelineSnapshot | null,
): NormalizedPoint[] {
  const points: NormalizedPoint[] = [];
  const keyToIndex = new Map<string, number>();

  function getKeyCandidates(sym?: string, label?: string, inst?: string): string[] {
    const keys: string[] = [];
    if (sym && sym.trim()) keys.push(sym.trim().toUpperCase());
    if (label && label.trim()) keys.push(label.trim().toUpperCase());
    if (inst && inst.trim()) keys.push(inst.trim().toUpperCase());
    return keys;
  }

  function upsert(keys: string[], entry: NormalizedPoint) {
    let targetIndex: number | undefined;
    for (const k of keys) {
      if (keyToIndex.has(k)) {
        targetIndex = keyToIndex.get(k);
        break;
      }
    }

    if (targetIndex !== undefined) {
      const existing = points[targetIndex];
      points[targetIndex] = {
        symbol: entry.symbol || existing.symbol,
        label: entry.label || existing.label,
        group: entry.group || existing.group,
        value: entry.value !== null && entry.value !== undefined ? entry.value : existing.value,
        change: entry.change !== null && entry.change !== undefined ? entry.change : existing.change,
        changePercent:
          entry.changePercent !== null && entry.changePercent !== undefined
            ? entry.changePercent
            : existing.changePercent,
        volume: entry.volume !== null && entry.volume !== undefined ? entry.volume : existing.volume,
        high: entry.high !== null && entry.high !== undefined ? entry.high : existing.high,
        low: entry.low !== null && entry.low !== undefined ? entry.low : existing.low,
        open: entry.open !== null && entry.open !== undefined ? entry.open : existing.open,
        close: entry.close !== null && entry.close !== undefined ? entry.close : existing.close,
        previousClose: entry.previousClose !== null && entry.previousClose !== undefined ? entry.previousClose : existing.previousClose,
        averagePrice: entry.averagePrice !== null && entry.averagePrice !== undefined ? entry.averagePrice : existing.averagePrice,
        oi: entry.oi !== null && entry.oi !== undefined ? entry.oi : existing.oi,
        oiDayHigh: entry.oiDayHigh !== null && entry.oiDayHigh !== undefined ? entry.oiDayHigh : existing.oiDayHigh,
        oiDayLow: entry.oiDayLow !== null && entry.oiDayLow !== undefined ? entry.oiDayLow : existing.oiDayLow,
        prevOi: entry.prevOi !== null && entry.prevOi !== undefined ? entry.prevOi : existing.prevOi,
        oiChange: entry.oiChange !== null && entry.oiChange !== undefined ? entry.oiChange : existing.oiChange,
        oiChangePercent: entry.oiChangePercent !== null && entry.oiChangePercent !== undefined ? entry.oiChangePercent : existing.oiChangePercent,
        yearlyHigh: entry.yearlyHigh !== null && entry.yearlyHigh !== undefined ? entry.yearlyHigh : existing.yearlyHigh,
        yearlyLow: entry.yearlyLow !== null && entry.yearlyLow !== undefined ? entry.yearlyLow : existing.yearlyLow,
        lastQuantity: entry.lastQuantity !== null && entry.lastQuantity !== undefined ? entry.lastQuantity : existing.lastQuantity,
        totalBuyQuantity: entry.totalBuyQuantity !== null && entry.totalBuyQuantity !== undefined ? entry.totalBuyQuantity : existing.totalBuyQuantity,
        totalSellQuantity: entry.totalSellQuantity !== null && entry.totalSellQuantity !== undefined ? entry.totalSellQuantity : existing.totalSellQuantity,
        lowerCircuit: entry.lowerCircuit !== null && entry.lowerCircuit !== undefined ? entry.lowerCircuit : existing.lowerCircuit,
        upperCircuit: entry.upperCircuit !== null && entry.upperCircuit !== undefined ? entry.upperCircuit : existing.upperCircuit,
        expiry: entry.expiry ?? existing.expiry,
        lotSize: entry.lotSize ?? existing.lotSize,
        strikePrice: entry.strikePrice ?? existing.strikePrice,
        tickSize: entry.tickSize ?? existing.tickSize,
        isin: entry.isin ?? existing.isin,
        quote: entry.quote ?? existing.quote,
        rawPoint: entry.rawPoint ?? existing.rawPoint,
      };
      for (const k of keys) {
        keyToIndex.set(k, targetIndex);
      }
    } else {
      const newIndex = points.length;
      points.push(entry);
      for (const k of keys) {
        keyToIndex.set(k, newIndex);
      }
    }
  }



  // Ingest server snapshot points first (authoritative feed)
  if (serverSnapshot?.dataPoints) {
    for (const p of serverSnapshot.dataPoints) {
      if (p.group === "NSE equities" && isDebtInstrument(p.quote?.symbol, p.label)) {
        continue;
      }
      const keys = getKeyCandidates(p.quote?.symbol, p.label, p.instrument);
      upsert(keys, {
        symbol: p.quote?.symbol || p.label || p.instrument,
        label: p.label || p.quote?.name || p.quote?.symbol || "",
        group: p.group,
        value: p.quote?.value ?? null,
        change: p.quote?.change ?? null,
        changePercent: p.quote?.changePercent ?? null,
        volume: p.quote?.volume ?? null,
        high: p.quote?.high ?? null,
        low: p.quote?.low ?? null,
        open: p.quote?.open ?? null,
        close: p.quote?.close ?? null,
        previousClose: p.quote?.previousClose ?? null,
        averagePrice: p.quote?.averagePrice ?? null,
        oi: p.quote?.oi ?? null,
        oiDayHigh: p.quote?.oiDayHigh ?? null,
        oiDayLow: p.quote?.oiDayLow ?? null,
        prevOi: p.quote?.prevOi ?? null,
        oiChange: p.quote?.oiChange ?? null,
        oiChangePercent: p.quote?.oiChangePercent ?? null,
        yearlyHigh: p.quote?.yearlyHigh ?? null,
        yearlyLow: p.quote?.yearlyLow ?? null,
        lastQuantity: p.quote?.lastQuantity ?? null,
        totalBuyQuantity: p.quote?.totalBuyQuantity ?? null,
        totalSellQuantity: p.quote?.totalSellQuantity ?? null,
        lowerCircuit: p.quote?.lowerCircuit ?? null,
        upperCircuit: p.quote?.upperCircuit ?? null,
        expiry: p.expiry ?? null,
        lotSize: p.lotSize ?? null,
        strikePrice: p.strikePrice ?? null,
        tickSize: p.tickSize ?? null,
        isin: p.isin ?? null,
        quote: p.quote,
        rawPoint: p,
      });
    }
  }

  // Overlay client points
  if (clientPoints) {
    for (const p of clientPoints) {
      if (p.group === "NSE equities" && isDebtInstrument(p.symbol, p.label)) {
        continue;
      }
      const keys = getKeyCandidates(p.symbol, p.label);
      if (keys.length === 0) continue;
      upsert(keys, {
        symbol: p.symbol || p.label || "",
        label: p.label || p.symbol || "",
        group: p.group || "NSE equities",
        value: p.value !== undefined ? p.value : null,
        change: p.change !== undefined ? p.change : null,
        changePercent: p.changePercent !== undefined ? p.changePercent : null,
        volume: p.volume !== undefined ? p.volume : null,
        high: p.high !== undefined ? p.high : null,
        low: p.low !== undefined ? p.low : null,
        open: p.open !== undefined ? p.open : null,
        close: p.close !== undefined ? p.close : null,
        previousClose: p.previousClose !== undefined ? p.previousClose : null,
        averagePrice: p.averagePrice !== undefined ? p.averagePrice : null,
        oi: p.oi !== undefined ? p.oi : null,
        oiDayHigh: p.oiDayHigh !== undefined ? p.oiDayHigh : null,
        oiDayLow: p.oiDayLow !== undefined ? p.oiDayLow : null,
        prevOi: p.prevOi !== undefined ? p.prevOi : null,
        oiChange: p.oiChange !== undefined ? p.oiChange : null,
        oiChangePercent: p.oiChangePercent !== undefined ? p.oiChangePercent : null,
        yearlyHigh: p.yearlyHigh !== undefined ? p.yearlyHigh : null,
        yearlyLow: p.yearlyLow !== undefined ? p.yearlyLow : null,
        lastQuantity: p.lastQuantity !== undefined ? p.lastQuantity : null,
        totalBuyQuantity: p.totalBuyQuantity !== undefined ? p.totalBuyQuantity : null,
        totalSellQuantity: p.totalSellQuantity !== undefined ? p.totalSellQuantity : null,
        lowerCircuit: p.lowerCircuit !== undefined ? p.lowerCircuit : null,
        upperCircuit: p.upperCircuit !== undefined ? p.upperCircuit : null,
        expiry: p.expiry ?? null,
        lotSize: p.lotSize ?? null,
        strikePrice: p.strikePrice ?? null,
        tickSize: p.tickSize ?? null,
        isin: p.isin ?? null,
      });
    }
  }

  return points;
}

export function buildVisionMarketContext(
  clientContext?: VisionChatMarketContext | null,
  serverSnapshot?: PipelineSnapshot | null,
): string {
  const points = normalizePoints(
    clientContext?.compactPoints,
    serverSnapshot,
  );

  // Group into categories
  const options: NormalizedPoint[] = [];
  const commodities: NormalizedPoint[] = [];
  const bonds: NormalizedPoint[] = [];
  const futures: NormalizedPoint[] = [];
  const indices: NormalizedPoint[] = [];
  const stocks: NormalizedPoint[] = [];

  let advanceCount = 0;
  let declineCount = 0;
  let unchangedCount = 0;

  for (const p of points) {
    const g = (p.group || "").toLowerCase();
    const l = (p.label || "").toLowerCase();
    const s = (p.symbol || "").toLowerCase();

    if (
      g.includes("option") ||
      l.includes("option") ||
      l.endsWith(" ce") ||
      l.endsWith(" pe") ||
      s.endsWith(" ce") ||
      s.endsWith(" pe") ||
      l.includes(" ce (call)") ||
      l.includes(" pe (put)")
    ) {
      options.push(p);
    } else if (
      g.includes("bond") ||
      g.includes("debt") ||
      l.includes("bond") ||
      s.includes("bond") ||
      l.includes("g-sec") ||
      l.includes("gsec") ||
      l.includes("sovereign gold") ||
      l.includes("sgb") ||
      s.startsWith("sgb") ||
      isDebtInstrument(s, l)
    ) {
      bonds.push(p);
    } else if (
      g.includes("commodit") ||
      g.includes("mcx") ||
      ["gold", "silver", "crude", "natural gas", "copper"].some(
        (comm) => l.includes(comm) || s.includes(comm),
      )
    ) {
      commodities.push(p);
    } else if (
      g.includes("future") ||
      l.includes("futures") ||
      s.endsWith("fut")
    ) {
      futures.push(p);
    } else if (
      g.includes("indic") ||
      l.startsWith("nifty ") ||
      l.startsWith("sensex") ||
      s === "nifty 50" ||
      s === "nifty bank" ||
      s === "banknifty" ||
      s === "sensex"
    ) {
      indices.push(p);
    } else {
      stocks.push(p);
    }

    const cp = p.changePercent ?? 0;
    if (cp > 0) advanceCount++;
    else if (cp < 0) declineCount++;
    else unchangedCount++;
  }

  // Counts resolution (prefer client reported if points are partial)
  const counts = {
    total: clientContext?.categoryCounts?.total ?? points.length,
    stocks: clientContext?.categoryCounts?.stocks ?? stocks.length,
    indices: clientContext?.categoryCounts?.indices ?? indices.length,
    futures: clientContext?.categoryCounts?.futures ?? futures.length,
    options: clientContext?.categoryCounts?.options ?? options.length,
    commodities:
      clientContext?.categoryCounts?.commodities ?? commodities.length,
    bonds:
      clientContext?.categoryCounts?.bonds ?? bonds.length,
  };

  const totalBreadth = advanceCount + declineCount + unchangedCount;
  const advancePercent =
    totalBreadth > 0 ? ((advanceCount / totalBreadth) * 100).toFixed(1) : "50.0";
  const breadthSentiment =
    advanceCount > declineCount * 1.3
      ? "Bullish (Advances lead)"
      : declineCount > advanceCount * 1.3
        ? "Bearish / Heavy Selling (Declines dominate)"
        : "Mixed / Rangebound";

  // Find Nifty 50 benchmark
  const nifty50 =
    indices.find((i) => i.symbol.includes("Nifty 50") || i.label.includes("Nifty 50")) ||
    clientContext?.analytics?.nifty50;

  // Stock sorting
  const sortedStocks = [...stocks].sort(
    (a, b) => (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity),
  );
  const topGainers = sortedStocks.filter((s) => (s.changePercent ?? 0) > 0).slice(0, 5);
  const topLosers = [...sortedStocks]
    .reverse()
    .filter((s) => (s.changePercent ?? 0) < 0)
    .slice(0, 5);

  const lines: string[] = [];

  lines.push("### LIVE MARKET DATA CONTEXT (ACTIVE UPSTOX FINANCIAL DASHBOARD)");
  lines.push("Status: Connected & Streaming (Upstox API v2)");
  lines.push(`Total Instruments Tracked: ${counts.total}`);
  lines.push(
    `- Category Breakdown: Stocks: ${counts.stocks} | Indices: ${counts.indices} | Futures: ${counts.futures} | Options: ${counts.options} | Commodities: ${counts.commodities} | Bonds: ${counts.bonds}`,
  );
  lines.push(
    `- Market Breadth: Advances: ${advanceCount} | Declines: ${declineCount} | Unchanged: ${unchangedCount} (${advancePercent}% advancing — ${breadthSentiment})`,
  );

  if (nifty50) {
    const val = nifty50.value ?? nifty50.quote?.value;
    const cp = nifty50.changePercent ?? nifty50.quote?.changePercent;
    const chg = nifty50.change ?? nifty50.quote?.change;
    lines.push(
      `- Benchmark (Nifty 50): ${formatPrice(val)} (${formatChange(chg, cp)})`,
    );
  }

  if (clientContext?.activeFilter) {
    lines.push(`- User Active Dashboard Tab: ${clientContext.activeFilter.toUpperCase()}`);
  }

  // Selected Instrument Detail
  const sel = clientContext?.selectedPoint;
  if (sel) {
    const sym = sel.quote?.symbol || sel.label || sel.instrument || "Selected Instrument";
    const val = sel.quote?.value;
    const cp = sel.quote?.changePercent;
    const chg = sel.quote?.change;
    const vol = sel.quote?.volume;
    const high = sel.quote?.high;
    const low = sel.quote?.low;
    const avg = sel.quote?.averagePrice;
    lines.push(
      `- Currently Inspected Instrument Deep-Dive: **${sym}** (CMP: ${formatPrice(val)}, Change: ${formatChange(chg, cp)}, Day Range: ${formatPrice(low)} - ${formatPrice(high)}, Volume: ${formatVolume(vol)}, VWAP: ${formatPrice(avg)})`,
    );
  }

  // Options Section
  lines.push("\n#### OPTIONS CONTRACTS LIST (Total: " + counts.options + "):");
  if (options.length > 0) {
    options.forEach((opt, idx) => {
      const oiChangeStr =
        opt.oiChange !== null && opt.oiChange !== undefined
          ? ` (${opt.oiChange > 0 ? "+" : ""}${formatVolume(opt.oiChange)}${opt.oiChangePercent ? ` / ${opt.oiChangePercent > 0 ? "+" : ""}${opt.oiChangePercent.toFixed(1)}%` : ""})`
          : "";
      lines.push(
        `${idx + 1}. **${opt.label}** (${opt.symbol}) — CMP: ${formatPrice(opt.value)} | Change: ${formatChange(opt.change, opt.changePercent)} | Volume: ${formatVolume(opt.volume)}${opt.oi ? ` | OI: ${formatVolume(opt.oi)}${oiChangeStr}` : ""}${opt.lotSize ? ` | Lot: ${opt.lotSize}` : ""}${opt.expiry ? ` | Expiry: ${opt.expiry}` : ""}`,
      );
    });
  } else {
    lines.push(`Currently tracking ${counts.options} active options contracts.`);
  }

  // Commodities Section
  lines.push("\n#### COMMODITIES LIST (Total: " + counts.commodities + "):");
  if (commodities.length > 0) {
    commodities.forEach((comm, idx) => {
      lines.push(
        `${idx + 1}. **${comm.label}** (${comm.symbol}) — CMP: ${formatPrice(comm.value)} | Change: ${formatChange(comm.change, comm.changePercent)} | Volume: ${formatVolume(comm.volume)}`,
      );
    });
  } else {
    lines.push(`Currently tracking ${counts.commodities} active commodities.`);
  }
  // Bonds Section
  lines.push("\n#### BONDS & DEBT SECURITIES LIST (Total: " + counts.bonds + "):");
  if (bonds.length > 0) {
    bonds.forEach((bond, idx) => {
      const isinText = bond.isin ? ` · ISIN: ${bond.isin}` : "";
      lines.push(
        `${idx + 1}. **${bond.label}** (${bond.symbol}${isinText}) — CMP: ${formatPrice(bond.value)} | Change: ${formatChange(bond.change, bond.changePercent)} | Volume: ${formatVolume(bond.volume)}`,
      );
    });
  } else {
    lines.push(`Currently tracking ${counts.bonds} active bonds.`);
  }

  // Futures Section
  lines.push("\n#### FUTURES CONTRACTS LIST (Total: " + counts.futures + "):");
  if (futures.length > 0) {
    futures.forEach((fut, idx) => {
      const oiChangeStr =
        fut.oiChange !== null && fut.oiChange !== undefined
          ? ` (${fut.oiChange > 0 ? "+" : ""}${formatVolume(fut.oiChange)}${fut.oiChangePercent ? ` / ${fut.oiChangePercent > 0 ? "+" : ""}${fut.oiChangePercent.toFixed(1)}%` : ""})`
          : "";
      lines.push(
        `${idx + 1}. **${fut.label}** (${fut.symbol}) — CMP: ${formatPrice(fut.value)} | Change: ${formatChange(fut.change, fut.changePercent)} | Volume: ${formatVolume(fut.volume)}${fut.oi ? ` | OI: ${formatVolume(fut.oi)}${oiChangeStr}` : ""}${fut.lotSize ? ` | Lot: ${fut.lotSize}` : ""}${fut.expiry ? ` | Expiry: ${fut.expiry}` : ""}`,
      );
    });
  } else {
    lines.push(`Currently tracking ${counts.futures} active futures contracts.`);
  }

  // Indices Section
  lines.push("\n#### BENCHMARK INDICES LIST (Total: " + counts.indices + "):");
  indices.forEach((ind, idx) => {
    lines.push(
      `${idx + 1}. **${ind.label}** — CMP: ${formatPrice(ind.value)} | Change: ${formatChange(ind.change, ind.changePercent)}`,
    );
  });

  // Top Stock Gainers & Losers
  if (topGainers.length > 0) {
    lines.push("\n#### TOP STOCK GAINERS (Momentum & Relative Strength):");
    topGainers.forEach((s, idx) => {
      lines.push(
        `${idx + 1}. **${s.label}** (${s.symbol}) — CMP: ${formatPrice(s.value)} | Change: ${formatChange(s.change, s.changePercent)} | Range: [${formatPrice(s.low)} - ${formatPrice(s.high)}] | Vol: ${formatVolume(s.volume)}`,
      );
    });
  }

  if (topLosers.length > 0) {
    lines.push("\n#### TOP STOCK LOSERS (Pullbacks / Declining):");
    topLosers.forEach((s, idx) => {
      lines.push(
        `${idx + 1}. **${s.label}** (${s.symbol}) — CMP: ${formatPrice(s.value)} | Change: ${formatChange(s.change, s.changePercent)} | Range: [${formatPrice(s.low)} - ${formatPrice(s.high)}] | Vol: ${formatVolume(s.volume)}`,
      );
    });
  }

  // Complete Equities Directory
  lines.push("\n#### COMPLETE STOCKS DIRECTORY (Total: " + counts.stocks + "):");
  stocks.forEach((s) => {
    const range52w = s.yearlyLow && s.yearlyHigh ? ` | 52W: [${formatPrice(s.yearlyLow)} - ${formatPrice(s.yearlyHigh)}]` : "";
    const vwapText = s.averagePrice ? ` | VWAP: ${formatPrice(s.averagePrice)}` : "";
    lines.push(
      `- ${s.label} (${s.symbol}): CMP ${formatPrice(s.value)} (${formatChange(s.change, s.changePercent)}), High: ${formatPrice(s.high)}, Low: ${formatPrice(s.low)}, Vol: ${formatVolume(s.volume)}${range52w}${vwapText}`,
    );
  });

  // Instructions for the AI Agent
  lines.push("\n### AGENT INSTRUCTIONS FOR USER QUERIES:");
  lines.push(
    "1. **Brevity & Output Length**: Keep answers short, clear, and focused on the user's exact question. Keep default answers strictly within 5–8 lines. Do not repeat the user's question. Do not provide generic disclaimers or subjective hedging (never say 'Direct best buy is subjective; review...'). Give a longer explanation only when the user explicitly asks for detailed analysis; otherwise keep it simple.",
  );
  lines.push(
    "2. **Direct Counts**: For counts, return the number directly without unnecessary preamble (e.g. if asked 'how many in commodities list now?', 'how many bonds?', or 'how many stocks in options?', return the number directly: " +
      counts.commodities +
      " commodities, " +
      counts.bonds +
      " bonds, " +
      counts.options +
      " options).",
  );
  lines.push(
    "3. **Stock & Option Best Buy Analysis (Top 3 Ranked)**: When asked 'best stock in nifty 50', 'best stock price to buy?', 'what stock to buy?', or for stock/option recommendations:\n" +
      "   - Separate top gainers from best buy candidates. Daily % gainers may be overextended, so evaluate real trade setups.\n" +
      "   - Rank the top 3 stocks using available price, volume, momentum, trend, and risk data from the live feed.\n" +
      "   - Always include profit data (projected target price & profit % potential based on Day High resistance) alongside CMP, daily change, key reason, and risk (Day Low support) in exactly one line per stock.\n" +
      "   - Format:\n" +
      "     1. **SYMBOL** (Company): CMP ₹X (+Y%) | Day Range: [₹Low - ₹High] | Target/Profit: ₹Z (+P% upside to resistance) | Reason: [Volume surge / pullback to day low / relative strength] | Risk: [Support level / stop loss]\n" +
      "   - If indicators or technical data (like RSI or moving averages) are missing from the feed, say so directly rather than inventing them. Use actual fetched market data; never invent values.",
  );
  lines.push(
    "4. **Accurate Asset Classification**: Commercial bank equities (e.g. HDFC Bank, ICICI Bank, State Bank of India, Kotak Mahindra Bank, Axis Bank) are individual STOCKS (Equities), NOT benchmark indices. Benchmark indices are Nifty 50, Nifty Bank, Nifty IT, etc.",
  );
  lines.push(
    "5. **Never Disclaim Data Availability**: DO NOT say 'I don't have access to live data' or 'I can't see the list', because the full real-time data feed is provided right here.",
  );

  return lines.join("\n");
}
