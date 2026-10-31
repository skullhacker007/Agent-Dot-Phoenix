"use client";

/**
 * Dynamic Market Data & Financial Analytics Panel for Vision Agent.
 *
 * All data is dynamically streamed and fetched directly from live market feeds.
 * No static, mock, or hardcoded instrument data is used.
 * Credentials remain strictly server-side.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  pipelineErrorResponseSchema,
  pipelineFetchResponseSchema,
} from "../../server/market-data/types";
import type {
  MarketDataPoint,
  PipelineSnapshot,
} from "../../server/market-data/types";
import {
  NIFTY_50_SYMBOLS,
  NIFTY_BANK_SYMBOLS,
  SENSEX_SYMBOLS,
} from "../../lib/market-baskets";
import type { IndexBasketType } from "../../lib/market-baskets";
import type { IpoItem } from "../../app/api/ipos/route";
import "./VisionMarketDataPanel.css";

const PIPELINE_ID = "indian-equities";
const AUTO_REFRESH_INTERVAL_MS = 6000;


function formatTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function formatPrice(val: number | null | undefined, currency = "INR"): string {
  if (val === null || val === undefined) return "—";
  const maximumFractionDigits = Math.abs(val) >= 1000 ? 2 : 4;
  return `${currency === "INR" ? "₹" : ""}${val.toLocaleString("en-IN", {
    maximumFractionDigits,
    minimumFractionDigits: 2,
  })}`;
}

function formatNumber(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  if (val >= 10_000_000) return `${(val / 10_000_000).toFixed(2)} Cr`;
  if (val >= 100_000) return `${(val / 100_000).toFixed(2)} L`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k`;
  return val.toLocaleString("en-IN");
}

export const INDIAN_MARKET_HOLIDAYS: Record<string, string> = {
  // 2024
  "2024-01-26": "Republic Day",
  "2024-03-08": "Mahashivratri",
  "2024-03-25": "Holi",
  "2024-03-29": "Good Friday",
  "2024-04-11": "Id-Ul-Fitr",
  "2024-04-17": "Ram Navami",
  "2024-05-01": "Maharashtra Day",
  "2024-05-20": "General Elections",
  "2024-06-17": "Bakri Id",
  "2024-07-17": "Muharram",
  "2024-08-15": "Independence Day",
  "2024-10-02": "Mahatma Gandhi Jayanti",
  "2024-11-01": "Diwali Laxmi Pujan",
  "2024-11-15": "Gurunanak Jayanti",
  "2024-12-25": "Christmas",

  // 2025
  "2025-01-26": "Republic Day",
  "2025-02-26": "Mahashivratri",
  "2025-03-14": "Holi",
  "2025-03-31": "Id-Ul-Fitr",
  "2025-04-10": "Mahavir Jayanti",
  "2025-04-14": "Dr. Ambedkar Jayanti",
  "2025-04-18": "Good Friday",
  "2025-05-01": "Maharashtra Day",
  "2025-06-07": "Bakri Id",
  "2025-08-15": "Independence Day",
  "2025-08-27": "Ganesh Chaturthi",
  "2025-10-02": "Mahatma Gandhi Jayanti",
  "2025-10-21": "Dussehra",
  "2025-11-01": "Diwali Laxmi Pujan",
  "2025-11-05": "Gurunanak Jayanti",
  "2025-12-25": "Christmas",

  // 2026
  "2026-01-26": "Republic Day",
  "2026-02-16": "Mahashivratri",
  "2026-03-04": "Holi",
  "2026-03-20": "Id-Ul-Fitr",
  "2026-04-03": "Good Friday",
  "2026-04-14": "Dr. Ambedkar Jayanti",
  "2026-04-21": "Ram Navami",
  "2026-05-01": "Maharashtra Day",
  "2026-05-27": "Bakri Id",
  "2026-06-26": "Muharram",
  "2026-08-15": "Independence Day",
  "2026-09-14": "Ganesh Chaturthi",
  "2026-10-02": "Mahatma Gandhi Jayanti",
  "2026-10-20": "Dussehra",
  "2026-11-08": "Diwali Laxmi Pujan",
  "2026-11-10": "Diwali Balipratipada",
  "2026-11-24": "Gurunanak Jayanti",
  "2026-12-25": "Christmas",

  // 2027
  "2027-01-26": "Republic Day",
  "2027-02-15": "Mahashivratri",
  "2027-03-10": "Id-Ul-Fitr",
  "2027-03-23": "Holi",
  "2027-03-26": "Good Friday",
  "2027-04-14": "Dr. Ambedkar Jayanti",
  "2027-05-01": "Maharashtra Day",
  "2027-08-15": "Independence Day",
  "2027-10-02": "Mahatma Gandhi Jayanti",
  "2027-10-10": "Dussehra",
  "2027-10-29": "Diwali Laxmi Pujan",
  "2027-12-25": "Christmas",

  // 2028
  "2028-01-26": "Republic Day",
  "2028-04-14": "Dr. Ambedkar Jayanti",
  "2028-05-01": "Maharashtra Day",
  "2028-08-15": "Independence Day",
  "2028-10-02": "Mahatma Gandhi Jayanti",
  "2028-12-25": "Christmas",
};

export function getFixedNationalHoliday(month: number, day: number): string | null {
  if (month === 1 && day === 26) return "Republic Day";
  if (month === 4 && day === 14) return "Dr. B.R. Ambedkar Jayanti";
  if (month === 5 && day === 1) return "Maharashtra Day";
  if (month === 8 && day === 15) return "Independence Day";
  if (month === 10 && day === 2) return "Mahatma Gandhi Jayanti";
  if (month === 12 && day === 25) return "Christmas";
  return null;
}

export function getMarketHoliday(isoDate: string, month: number, day: number): string | null {
  return INDIAN_MARKET_HOLIDAYS[isoDate] ?? getFixedNationalHoliday(month, day) ?? null;
}

export function getKolkataTimeParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((p) => [p.type, p.value]),
  );
  const year = parseInt(parts.year, 10);
  const month = parseInt(parts.month, 10);
  const day = parseInt(parts.day, 10);
  const hour = parseInt(parts.hour, 10);
  const minute = parseInt(parts.minute, 10);
  const second = parseInt(parts.second, 10);
  const weekday = parts.weekday;
  const isoDate = `${parts.year}-${parts.month}-${parts.day}`;
  return { year, month, day, hour, minute, second, weekday, isoDate };
}

export type MarketSessionType =
  | "regular"
  | "pre-market"
  | "before-open"
  | "post-close"
  | "weekend"
  | "holiday"
  | "closed";

export type MarketStatus = {
  isOpen: boolean;
  label: string;
  detail: string;
  session: MarketSessionType;
  tradingHours: string;
  countdown?: string;
  isHoliday?: boolean;
  holidayName?: string | null;
  isEod?: boolean;
};

export const DEFAULT_MARKET_STATUS: MarketStatus = {
  isOpen: false,
  label: "Market Closed",
  detail: "NSE/BSE Indian Market Data",
  session: "closed",
  tradingHours: "9:15 AM – 3:30 PM IST",
  isEod: true,
};

export function getIndianMarketStatus(
  referenceDate?: Date,
  assetType: "equity" | "commodity" = "equity",
): MarketStatus {
  try {
    const now = referenceDate ?? new Date();
    const kp = getKolkataTimeParts(now);
    const currentMinutes = kp.hour * 60 + kp.minute;
    const isWeekend = kp.weekday === "Sat" || kp.weekday === "Sun";
    const todayHoliday = getMarketHoliday(kp.isoDate, kp.month, kp.day);

    const isCommodity = assetType === "commodity";
    // Equities: NSE/BSE 9:15 AM (555 min) - 3:30 PM (930 min). Pre-market 9:00 AM (540 min)
    // Commodities: MCX 9:00 AM (540 min) - 11:30 PM (1410 min)
    const openMinutes = isCommodity ? 540 : 555;
    const closeMinutes = isCommodity ? 1410 : 930;
    const openHourUtc = 3;
    const openMinUtc = isCommodity ? 30 : 45;
    const closeHourUtc = isCommodity ? 18 : 10;
    const closeMinUtc = 0;

    const tradingHours = isCommodity
      ? "9:00 AM – 11:30 PM IST"
      : "9:15 AM – 3:30 PM IST";
    const exchangeName = isCommodity ? "MCX" : "NSE/BSE";

    const todayOpenMs = Date.UTC(
      kp.year,
      kp.month - 1,
      kp.day,
      openHourUtc,
      openMinUtc,
      0,
    );
    const todayCloseMs = Date.UTC(
      kp.year,
      kp.month - 1,
      kp.day,
      closeHourUtc,
      closeMinUtc,
      0,
    );

    const nowMs = now.getTime();

    let isOpen = false;
    let session: MarketSessionType = "closed";
    let label = "Market Closed";
    let detail = `${exchangeName} Regular Trading (${tradingHours})`;
    let countdownLabel = "";
    let targetMs = 0;

    if (todayHoliday) {
      session = "holiday";
      label = `Holiday · ${todayHoliday}`;
      detail = `${exchangeName} holiday (${todayHoliday}). Regular session closed. Showing EOD settlement.`;
    } else if (isWeekend) {
      session = "weekend";
      label = "Market Closed (Weekend)";
      detail = `${exchangeName} closed for weekend. Showing EOD settlement.`;
    } else if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
      isOpen = true;
      session = "regular";
      label = "Live Market";
      detail = `${exchangeName} Regular Trading (${tradingHours})`;
      countdownLabel = "Closes in";
      targetMs = todayCloseMs;
    } else if (!isCommodity && currentMinutes >= 540 && currentMinutes < 555) {
      session = "pre-market";
      label = "Pre-Market Session";
      detail = "Pre-market order matching (9:00 – 9:15 AM IST). Regular trading opens at 9:15 AM IST.";
      countdownLabel = "Trading opens in";
      targetMs = todayOpenMs;
    } else if (currentMinutes < openMinutes) {
      session = "before-open";
      label = "Pre-Market / Closed";
      detail = `Regular trading opens at ${isCommodity ? "9:00 AM" : "9:15 AM"} IST. Showing previous session EOD data.`;
      countdownLabel = "Opens in";
      targetMs = todayOpenMs;
    } else {
      session = "post-close";
      label = "Market Closed · EOD";
      detail = `Regular trading closed at ${isCommodity ? "11:30 PM" : "3:30 PM"} IST. Showing latest EOD closing data.`;
    }

    if (!targetMs || targetMs <= nowMs) {
      let offsetDays = 1;
      while (offsetDays <= 14) {
        const testMs = Date.UTC(
          kp.year,
          kp.month - 1,
          kp.day + offsetDays,
          openHourUtc,
          openMinUtc,
          0,
        );
        const testDate = new Date(testMs);
        const testKp = getKolkataTimeParts(testDate);
        const isTestWeekend = testKp.weekday === "Sat" || testKp.weekday === "Sun";
        const testHoliday = getMarketHoliday(testKp.isoDate, testKp.month, testKp.day);
        if (!isTestWeekend && !testHoliday) {
          targetMs = testMs;
          countdownLabel = `Opens ${offsetDays === 1 ? "tomorrow" : testKp.weekday} in`;
          break;
        }
        offsetDays++;
      }
    }

    let countdown: string | undefined;
    if (targetMs > nowMs) {
      const diffMs = targetMs - nowMs;
      const totalSec = Math.floor(diffMs / 1000);
      const days = Math.floor(totalSec / 86400);
      const hours = Math.floor((totalSec % 86400) / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;

      let timeStr = "";
      if (days > 0) {
        timeStr = `${days}d ${hours}h ${mins}m`;
      } else if (hours > 0) {
        timeStr = `${hours}h ${mins}m ${String(secs).padStart(2, "0")}s`;
      } else {
        timeStr = `${mins}m ${String(secs).padStart(2, "0")}s`;
      }
      countdown = `${countdownLabel} ${timeStr}`;
    }

    return {
      isOpen,
      label,
      detail,
      session,
      tradingHours,
      countdown,
      isHoliday: Boolean(todayHoliday),
      holidayName: todayHoliday,
      isEod: !isOpen,
    };
  } catch {
    return {
      isOpen: false,
      label: "EOD Data",
      detail: "Showing latest observed market quotes.",
      session: "closed",
      tradingHours: "9:15 AM – 3:30 PM IST",
      isEod: true,
    };
  }
}

export type FilterType =
  | "all"
  | "stocks"
  | "indices"
  | "ipos"
  | "futures"
  | "options"
  | "commodities"
  | "bonds"
  | "gainers"
  | "losers";

export type { IndexBasketType } from "../../lib/market-baskets";

export type SortField = "price" | "change";
export type SortDirection = "desc" | "asc";

export type SortConfig = {
  field: SortField;
  direction: SortDirection;
} | null;

function SortIndicator({ direction }: { direction?: SortDirection | null }) {
  if (direction === "desc") {
    return (
      <svg
        className="vision-sort-arrow is-active is-desc"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 5v14M19 12l-7 7-7-7" />
      </svg>
    );
  }
  if (direction === "asc") {
    return (
      <svg
        className="vision-sort-arrow is-active is-asc"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    );
  }
  return (
    <svg
      className="vision-sort-arrow is-inactive"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
    </svg>
  );
}

export type IpoSortOption =
  | "default"
  | "subscription"
  | "issue_size"
  | "price_desc"
  | "price_asc"
  | "closing_soon"
  | "name";

export type IpoViewMode = "cards" | "table";

export function getIpoLotSize(ipo: IpoItem): number | null {
  if (typeof ipo.lot_size === "number" && ipo.lot_size > 0) return ipo.lot_size;
  if (typeof ipo.minimum_quantity === "number" && ipo.minimum_quantity > 0) return ipo.minimum_quantity;
  if (typeof ipo.min_bid_quantity === "number" && ipo.min_bid_quantity > 0) return ipo.min_bid_quantity;
  if (ipo.maximum_price && ipo.maximum_price > 0) {
    if (ipo.issue_type === "regular") {
      return Math.max(1, Math.round(14500 / ipo.maximum_price));
    }
    if (ipo.issue_type === "sme") {
      return Math.max(100, Math.round(110000 / ipo.maximum_price / 100) * 100);
    }
  }
  return null;
}

export function getIpoMinInvestment(ipo: IpoItem, lotSize: number | null): number | null {
  if (!lotSize) return null;
  const price = ipo.maximum_price || ipo.minimum_price;
  if (!price) return null;
  return lotSize * price;
}

export function getIpoTimelineBadge(ipo: IpoItem): { text: string; className: string } {
  if (ipo.status === "open" && ipo.bidding_end_date) {
    const end = new Date(ipo.bidding_end_date + "T23:59:59").getTime();
    const now = Date.now();
    const diffHours = Math.ceil((end - now) / (1000 * 60 * 60));
    const diffDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    if (diffHours <= 0) return { text: "Closing Soon", className: "badge-urgent" };
    if (diffDays <= 1) return { text: "Closes Today", className: "badge-urgent" };
    if (diffDays === 2) return { text: "Closes Tomorrow", className: "badge-warning" };
    return { text: `Closes in ${diffDays}d`, className: "badge-active" };
  }
  if (ipo.status === "upcoming" && ipo.bidding_start_date) {
    const start = new Date(ipo.bidding_start_date + "T00:00:00").getTime();
    const now = Date.now();
    const diffDays = Math.ceil((start - now) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return { text: "Opens Today", className: "badge-active" };
    if (diffDays === 1) return { text: "Opens Tomorrow", className: "badge-active" };
    if (diffDays > 1) return { text: `Opens in ${diffDays}d`, className: "badge-scheduled" };
    return { text: `Starts ${ipo.bidding_start_date}`, className: "badge-scheduled" };
  }
  return { text: ipo.status.toUpperCase(), className: "badge-muted" };
}

export type VisionMarketContext = {
  activeFilter: FilterType;
  categoryCounts: {
    stocks: number;
    indices: number;
    futures: number;
    options: number;
    commodities: number;
    bonds: number;
    total: number;
  };
  analytics: {
    advanceCount: number;
    declineCount: number;
    unchangedCount: number;
    advancePercent: number;
    topGainer: MarketDataPoint | null;
    topLoser: MarketDataPoint | null;
    volumeLeader: MarketDataPoint | null;
    nifty50: MarketDataPoint | null;
  } | null;
  selectedPoint: MarketDataPoint | null;
  compactPoints: Array<{
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
  }>;
};

type VisionMarketDataPanelProps = {
  onContextUpdate?: (context: VisionMarketContext) => void;
};

export default function VisionMarketDataPanel({
  onContextUpdate,
}: VisionMarketDataPanelProps = {}) {
  const [snapshot, setSnapshot] = useState<PipelineSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [justRefreshed, setJustRefreshed] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [indexBasket, setIndexBasket] = useState<IndexBasketType>("all");
  const [search, setSearch] = useState<string>("");
  const [selectedPoint, setSelectedPoint] = useState<MarketDataPoint | null>(
    null,
  );
  const [pageSize, setPageSize] = useState<number>(15);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  // IPO State & Segregation
  const [ipos, setIpos] = useState<IpoItem[]>([]);
  const [ipoCounts, setIpoCounts] = useState<{
    total: number;
    open: number;
    upcoming: number;
    mainboard: number;
    sme: number;
  }>({ total: 0, open: 0, upcoming: 0, mainboard: 0, sme: 0 });
  const [ipoLoading, setIpoLoading] = useState<boolean>(false);
  const [ipoError, setIpoError] = useState<string | null>(null);
  const [ipoSubFilter, setIpoSubFilter] = useState<
    "all" | "open" | "upcoming" | "regular" | "sme"
  >("all");
  const [ipoSort, setIpoSort] = useState<IpoSortOption>("default");
  const [ipoViewMode, setIpoViewMode] = useState<IpoViewMode>("cards");
  const [activeCalculatorIpoId, setActiveCalculatorIpoId] = useState<string | null>(null);
  const [ipoCalcLots, setIpoCalcLots] = useState<Record<string, number>>({});
  const [copiedIsin, setCopiedIsin] = useState<string | null>(null);
  const [copiedMandateType, setCopiedMandateType] = useState<
    "formatted" | "numeric" | "summary" | "shares" | "price" | "symbol" | null
  >(null);
  const [copyFeedbackMessage, setCopyFeedbackMessage] = useState<string | null>(null);
  const [showAsbaHelper, setShowAsbaHelper] = useState<boolean>(false);
  const [lastIpoRefresh, setLastIpoRefresh] = useState<number | null>(null);

  const copyToClipboard = useCallback(
    (
      text: string,
      type: "formatted" | "numeric" | "summary" | "shares" | "price" | "symbol",
      message: string,
    ) => {
      if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
        void navigator.clipboard.writeText(text);
        setCopiedMandateType(type);
        setCopyFeedbackMessage(message);
        setTimeout(() => {
          setCopiedMandateType(null);
          setCopyFeedbackMessage(null);
        }, 2500);
      }
    },
    [],
  );

  const handleCopyIsin = (isin: string) => {
    if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
      void navigator.clipboard.writeText(isin);
      setCopiedIsin(isin);
      setTimeout(() => {
        setCopiedIsin((prev) => (prev === isin ? null : prev));
      }, 2000);
    }
  };

  const handleCopyMandateFormatted = useCallback(
    (amount: number) => {
      copyToClipboard(
        `₹${amount.toLocaleString("en-IN")}`,
        "formatted",
        `Copied formatted mandate: ₹${amount.toLocaleString("en-IN")}`,
      );
    },
    [copyToClipboard],
  );

  const handleCopyMandateNumeric = useCallback(
    (amount: number) => {
      copyToClipboard(
        String(amount),
        "numeric",
        `Copied clean number: ${amount} (Ready for Net Banking / forms)`,
      );
    },
    [copyToClipboard],
  );

  const handleCopyBidSummary = useCallback(
    (
      ipo: IpoItem,
      lots: number,
      lotSize: number,
      price: number,
      totalAmount: number,
      isRetail: boolean,
    ) => {
      const totalShares = lots * lotSize;
      const category = isRetail
        ? "Retail (RII ≤ ₹2L)"
        : "Small HNI (sHNI > ₹2L)";
      const exchange =
        ipo.listing_exchange || (ipo.issue_type === "regular" ? "NSE/BSE" : "SME");
      const summary = [
        `📌 IPO Application Mandate Details`,
        `• Company: ${ipo.name}${ipo.symbol ? ` (${ipo.symbol})` : ""}`,
        `• Category: ${category}`,
        `• Bid Tier: ${lots} Lot${lots > 1 ? "s" : ""} (${totalShares.toLocaleString("en-IN")} Shares @ ₹${price} Cut-off)`,
        `• Total Mandate Amount: ₹${totalAmount.toLocaleString("en-IN")} (Clean: ${totalAmount})`,
        `• Exchange: ${exchange}${ipo.isin ? ` | ISIN: ${ipo.isin}` : ""}`,
      ].join("\n");

      copyToClipboard(
        summary,
        "summary",
        "Copied full bid summary (ready for WhatsApp / Notes / Family accounts)!",
      );
    },
    [copyToClipboard],
  );

  const deduplicateIpoList = useCallback((list: IpoItem[]): IpoItem[] => {
    const map = new Map<string, IpoItem>();
    const names = new Set<string>();
    for (const item of list) {
      const key = item.id || item.symbol || item.name;
      const norm = item.name.trim().toLowerCase();
      if (!key || map.has(key) || (norm && names.has(norm))) continue;
      map.set(key, item);
      if (norm) names.add(norm);
    }
    return Array.from(map.values());
  }, []);

  // Lock body scroll and listen for Escape key to cleanly dismiss the IPO calculator sidebar
  useEffect(() => {
    if (!activeCalculatorIpoId) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveCalculatorIpoId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeCalculatorIpoId]);

  const fetchIpos = useCallback(async (force = false) => {
    setIpoLoading(true);
    setIpoError(null);
    const startTime = Date.now();
    try {
      const res = await fetch(`/api/ipos${force ? "?force=true" : ""}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setIpoError(json.error || "Failed to load IPO data.");
        return;
      }
      setIpos(deduplicateIpoList(json.data.all || []));
      if (json.data.counts) {
        setIpoCounts(json.data.counts);
      }
      setLastIpoRefresh(Date.now());
    } catch (err) {
      setIpoError(
        err instanceof Error ? err.message : "Error loading IPO data.",
      );
    } finally {
      if (force) {
        const elapsed = Date.now() - startTime;
        if (elapsed < 500) {
          await new Promise((res) => setTimeout(res, 500 - elapsed));
        }
      }
      setIpoLoading(false);
    }
  }, [deduplicateIpoList]);

  useEffect(() => {
    if (filter !== "ipos" || ipos.length > 0) return;
    let active = true;

    async function loadInitialIpos() {
      try {
        const res = await fetch("/api/ipos", { cache: "no-store" });
        const json = await res.json();
        if (!active) return;
        if (!res.ok || !json.success) {
          setIpoError(json.error || "Failed to load IPO data.");
          return;
        }
        setIpos(deduplicateIpoList(json.data.all || []));
        if (json.data.counts) {
          setIpoCounts(json.data.counts);
        }
        setLastIpoRefresh(Date.now());
      } catch (err) {
        if (!active) return;
        setIpoError(
          err instanceof Error ? err.message : "Error loading IPO data.",
        );
      } finally {
        if (active) {
          setIpoLoading(false);
        }
      }
    }

    void loadInitialIpos();
    return () => {
      active = false;
    };
  }, [filter, ipos.length, deduplicateIpoList]);

  const [nowSec, setNowSec] = useState<number | null>(null);

  useEffect(() => {
    setNowSec(Math.floor(Date.now() / 1000));
    const timer = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const mounted = nowSec !== null;
  const currentTime = useMemo(
    () => (nowSec !== null ? new Date(nowSec * 1000) : null),
    [nowSec],
  );

  const assetType = filter === "commodities" ? "commodity" : "equity";
  const marketStatus = useMemo(() => {
    if (!currentTime) return DEFAULT_MARKET_STATUS;
    return getIndianMarketStatus(currentTime, assetType);
  }, [currentTime, assetType]);

  const controllerRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchLiveQuotes = useCallback(async (isManual = false) => {
    setRefreshing(true);
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const startTime = Date.now();

    try {
      const response = await fetch(`/api/market-data/${PIPELINE_ID}`, {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
      });

      const payload: unknown = await response.json();

      if (!response.ok) {
        const failed = pipelineErrorResponseSchema.safeParse(payload);
        const errorMsg = failed.success
          ? failed.data.error.message.replace(/Upstox/gi, "Market Data")
          : `Market data request failed with status ${response.status}.`;
        setError(errorMsg);
        if (failed.success && failed.data.snapshot) {
          setSnapshot(failed.data.snapshot);
        }
        return;
      }

      const parsed = pipelineFetchResponseSchema.safeParse(payload);
      if (!parsed.success) {
        setError("Invalid response format received from market data service.");
        return;
      }

      setSnapshot(parsed.data.snapshot);
      setError(null);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(
        err instanceof Error
          ? err.message.replace(/Upstox/gi, "Market Data")
          : "Unable to reach market data service.",
      );
    } finally {
      if (isManual) {
        const elapsed = Date.now() - startTime;
        if (elapsed < 500) {
          await new Promise((res) => setTimeout(res, 500 - elapsed));
        }
        setJustRefreshed(true);
        setTimeout(() => setJustRefreshed(false), 2000);
      }
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load via standard React 19 data fetch pattern
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function initialLoad() {
      try {
        const response = await fetch(`/api/market-data/${PIPELINE_ID}`, {
          method: "POST",
          cache: "no-store",
          signal: controller.signal,
        });

        const payload: unknown = await response.json();
        if (!active) return;

        if (!response.ok) {
          const failed = pipelineErrorResponseSchema.safeParse(payload);
          setError(
            failed.success
              ? failed.data.error.message.replace(/Upstox/gi, "Market Data")
              : `Market data request failed with status ${response.status}.`,
          );
          if (failed.success && failed.data.snapshot) {
            setSnapshot(failed.data.snapshot);
          }
          return;
        }

        const parsed = pipelineFetchResponseSchema.safeParse(payload);
        if (!parsed.success) {
          setError(
            "Invalid response format received from market data service.",
          );
          return;
        }

        setSnapshot(parsed.data.snapshot);
        setError(null);
      } catch (err) {
        if (!active || controller.signal.aborted) return;
        setError(
          err instanceof Error
            ? err.message.replace(/Upstox/gi, "Market Data")
            : "Unable to reach market data service.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void initialLoad();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  // Dynamic Auto-Refresh interval
  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      void fetchLiveQuotes();
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchLiveQuotes]);

  // Cleanly deduplicate data points to ensure no duplicated instruments or symbols
  const dataPoints = useMemo<MarketDataPoint[]>(() => {
    const raw = snapshot?.dataPoints ?? [];
    const seen = new Set<string>();
    const unique: MarketDataPoint[] = [];
    for (const p of raw) {
      const key = `${p.group}:${p.instrument}:${p.quote.symbol}`;
      if (!seen.has(key) && !seen.has(p.instrument)) {
        seen.add(key);
        seen.add(p.instrument);
        unique.push(p);
      }
    }
    return unique;
  }, [snapshot]);

  // Derived state for the active IPO in the calculator sidebar
  const activeCalculatorIpo = useMemo(() => {
    if (!activeCalculatorIpoId) return null;
    return ipos.find((i) => i.id === activeCalculatorIpoId) ?? null;
  }, [activeCalculatorIpoId, ipos]);

  const activeLotSize = activeCalculatorIpo ? getIpoLotSize(activeCalculatorIpo) : null;
  const activeLots = activeCalculatorIpo ? (ipoCalcLots[activeCalculatorIpo.id] ?? 1) : 1;
  const activeMaxPrice = activeCalculatorIpo
    ? activeCalculatorIpo.maximum_price || activeCalculatorIpo.minimum_price || 0
    : 0;
  const activeTotalShares = activeLots * (activeLotSize || 1);
  const activeTotalBidAmount = activeTotalShares * activeMaxPrice;
  const activeIsRetailAllowed = activeTotalBidAmount <= 200000;
  const activeMaxRetailLots =
    activeLotSize && activeMaxPrice
      ? Math.max(1, Math.floor(200000 / (activeLotSize * activeMaxPrice)))
      : 13;
  const activeMinInvest =
    activeLotSize && activeMaxPrice ? activeLotSize * activeMaxPrice : 0;
  const activeTimeline = activeCalculatorIpo
    ? getIpoTimelineBadge(activeCalculatorIpo)
    : { text: "", className: "" };

  // Market Analytics calculations
  const analytics = useMemo(() => {
    if (dataPoints.length === 0) return null;

    let advanceCount = 0;
    let declineCount = 0;
    let unchangedCount = 0;

    let topGainer: MarketDataPoint | null = null;
    let topLoser: MarketDataPoint | null = null;
    let volumeLeader: MarketDataPoint | null = null;
    let nifty50: MarketDataPoint | null = null;

    for (const point of dataPoints) {
      const change = point.quote.change ?? 0;
      const changePct = point.quote.changePercent ?? 0;
      const vol = point.quote.volume ?? 0;

      if (
        point.quote.symbol.includes("Nifty 50") ||
        point.label.includes("Nifty 50")
      ) {
        nifty50 = point;
      }

      if (change > 0) advanceCount++;
      else if (change < 0) declineCount++;
      else unchangedCount++;

      // Stock leaders (exclude benchmark indices from individual stock awards)
      const isIndex = point.group.toLowerCase().includes("indices");
      if (!isIndex) {
        if (
          !topGainer ||
          changePct > (topGainer.quote.changePercent ?? -Infinity)
        ) {
          topGainer = point;
        }
        if (
          !topLoser ||
          changePct < (topLoser.quote.changePercent ?? Infinity)
        ) {
          topLoser = point;
        }
        if (!volumeLeader || vol > (volumeLeader.quote.volume ?? 0)) {
          volumeLeader = point;
        }
      }
    }

    const total = advanceCount + declineCount + unchangedCount;
    const advancePercent = total > 0 ? (advanceCount / total) * 100 : 50;

    return {
      advanceCount,
      declineCount,
      unchangedCount,
      advancePercent,
      topGainer,
      topLoser,
      volumeLeader,
      nifty50,
    };
  }, [dataPoints]);

  const categoryCounts = useMemo(() => {
    let stocks = 0;
    let indices = 0;
    let futures = 0;
    let options = 0;
    let commodities = 0;
    let bonds = 0;
    for (const p of dataPoints) {
      const g = p.group.toLowerCase();
      if (g.includes("indices")) indices++;
      else if (g.includes("futures")) futures++;
      else if (g.includes("options")) options++;
      else if (g.includes("commodities")) commodities++;
      else if (g.includes("bond")) bonds++;
      else stocks++;
    }
    return { stocks, indices, futures, options, commodities, bonds };
  }, [dataPoints]);

  useEffect(() => {
    if (!onContextUpdate) return;
    onContextUpdate({
      activeFilter: filter,
      categoryCounts: {
        ...categoryCounts,
        total: dataPoints.length,
      },
      analytics,
      selectedPoint,
      compactPoints: dataPoints.map((p) => ({
        symbol: p.quote.symbol,
        label: p.label,
        group: p.group,
        value: p.quote.value,
        change: p.quote.change,
        changePercent: p.quote.changePercent,
        volume: p.quote.volume ?? null,
        high: p.quote.high ?? null,
        low: p.quote.low ?? null,
        open: p.quote.open ?? null,
        close: p.quote.close ?? null,
        previousClose: p.quote.previousClose ?? null,
        averagePrice: p.quote.averagePrice ?? null,
        oi: p.quote.oi ?? null,
        oiDayHigh: p.quote.oiDayHigh ?? null,
        oiDayLow: p.quote.oiDayLow ?? null,
        prevOi: p.quote.prevOi ?? null,
        oiChange: p.quote.oiChange ?? null,
        oiChangePercent: p.quote.oiChangePercent ?? null,
        yearlyHigh: p.quote.yearlyHigh ?? null,
        yearlyLow: p.quote.yearlyLow ?? null,
        lastQuantity: p.quote.lastQuantity ?? null,
        totalBuyQuantity: p.quote.totalBuyQuantity ?? null,
        totalSellQuantity: p.quote.totalSellQuantity ?? null,
        lowerCircuit: p.quote.lowerCircuit ?? null,
        upperCircuit: p.quote.upperCircuit ?? null,
        expiry: p.expiry ?? null,
        lotSize: p.lotSize ?? null,
        strikePrice: p.strikePrice ?? null,
        tickSize: p.tickSize ?? null,
        isin: p.isin ?? null,
      })),
    });
  }, [
    onContextUpdate,
    filter,
    categoryCounts,
    analytics,
    selectedPoint,
    dataPoints,
  ]);

  // Filtered multi-asset list
  const filteredPoints = useMemo(() => {
    return dataPoints.filter((point) => {
      const group = point.group.toLowerCase();
      const isIndex = group.includes("indices");
      const isFutures = group.includes("futures");
      const isOptions = group.includes("options");
      const isCommodities = group.includes("commodities");
      const isBonds = group.includes("bond");
      const isStock = !isIndex && !isFutures && !isOptions && !isCommodities && !isBonds;
      const changePct = point.quote.changePercent ?? 0;

      if (filter === "stocks" && !isStock) return false;
      if (filter === "indices" && !isIndex) return false;
      if (filter === "futures" && !isFutures) return false;
      if (filter === "options" && !isOptions) return false;
      if (filter === "commodities" && !isCommodities) return false;
      if (filter === "bonds" && !isBonds) return false;
      if (filter === "gainers" && changePct <= 0) return false;
      if (filter === "losers" && changePct >= 0) return false;

      // Index Basket filtering (Nifty 50, NIFTY BANK, SENSEX) - applies to equity stocks
      if (indexBasket !== "all") {
        if (!isStock) return false;
        const sym = (point.quote.symbol || "").toUpperCase();
        if (indexBasket === "nifty50" && !NIFTY_50_SYMBOLS.has(sym)) return false;
        if (indexBasket === "niftybank" && !NIFTY_BANK_SYMBOLS.has(sym)) return false;
        if (indexBasket === "sensex" && !SENSEX_SYMBOLS.has(sym)) return false;
      }

      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchesSym = point.quote.symbol.toLowerCase().includes(q);
        const matchesName = point.quote.name.toLowerCase().includes(q);
        const matchesInst = point.instrument.toLowerCase().includes(q);
        const matchesGroup = point.group.toLowerCase().includes(q);
        if (!matchesSym && !matchesName && !matchesInst && !matchesGroup)
          return false;
      }

      return true;
    });
  }, [dataPoints, filter, indexBasket, search]);

  // Filtered segregated IPOs list
  const filteredIpos = useMemo(() => {
    const list = ipos.filter((ipo) => {
      if (ipoSubFilter === "open" && ipo.status !== "open") return false;
      if (ipoSubFilter === "upcoming" && ipo.status !== "upcoming") return false;
      if (ipoSubFilter === "regular" && ipo.issue_type !== "regular") return false;
      if (ipoSubFilter === "sme" && ipo.issue_type !== "sme") return false;

      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchesName = ipo.name.toLowerCase().includes(q);
        const matchesSym = ipo.symbol?.toLowerCase().includes(q) ?? false;
        const matchesInd = ipo.industry?.toLowerCase().includes(q) ?? false;
        const matchesExch = ipo.listing_exchange?.toLowerCase().includes(q) ?? false;
        if (!matchesName && !matchesSym && !matchesInd && !matchesExch) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (ipoSort === "subscription") {
        const subA = Number(a.total_subscription || 0);
        const subB = Number(b.total_subscription || 0);
        return subB - subA;
      }
      if (ipoSort === "issue_size") {
        return (b.issue_size || 0) - (a.issue_size || 0);
      }
      if (ipoSort === "price_desc") {
        const priceA = a.maximum_price || a.minimum_price || 0;
        const priceB = b.maximum_price || b.minimum_price || 0;
        return priceB - priceA;
      }
      if (ipoSort === "price_asc") {
        const priceA = a.minimum_price || a.maximum_price || 0;
        const priceB = b.minimum_price || b.maximum_price || 0;
        return priceA - priceB;
      }
      if (ipoSort === "closing_soon") {
        const dateA = a.bidding_end_date ? new Date(a.bidding_end_date).getTime() : Infinity;
        const dateB = b.bidding_end_date ? new Date(b.bidding_end_date).getTime() : Infinity;
        return dateA - dateB;
      }
      if (ipoSort === "name") {
        return a.name.localeCompare(b.name);
      }
      // default: open status first, then upcoming, then by end date
      if (a.status === "open" && b.status !== "open") return -1;
      if (b.status === "open" && a.status !== "open") return 1;
      return 0;
    });
  }, [ipos, ipoSubFilter, ipoSort, search]);

  const handleFilterChange = (newFilter: FilterType) => {
    setFilter(newFilter);
    setCurrentPage(1);
    if (
      newFilter !== "stocks" &&
      newFilter !== "all" &&
      newFilter !== "gainers" &&
      newFilter !== "losers"
    ) {
      setIndexBasket("all");
    }
    if (newFilter === "ipos" && ipos.length === 0 && !ipoLoading) {
      void fetchIpos();
    }
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  const handleSort = (field: SortField) => {
    setSortConfig((current) => {
      if (!current || current.field !== field) {
        return { field, direction: "desc" };
      }
      if (current.direction === "desc") {
        return { field, direction: "asc" };
      }
      return null;
    });
    setCurrentPage(1);
  };

  const sortedPoints = useMemo(() => {
    if (!sortConfig) return filteredPoints;

    const { field, direction } = sortConfig;

    return [...filteredPoints].sort((a, b) => {
      let valA: number | null = null;
      let valB: number | null = null;

      if (field === "price") {
        valA =
          typeof a.quote.value === "number" && !Number.isNaN(a.quote.value)
            ? a.quote.value
            : null;
        valB =
          typeof b.quote.value === "number" && !Number.isNaN(b.quote.value)
            ? b.quote.value
            : null;
      } else {
        valA =
          typeof a.quote.changePercent === "number" &&
          !Number.isNaN(a.quote.changePercent)
            ? a.quote.changePercent
            : null;
        valB =
          typeof b.quote.changePercent === "number" &&
          !Number.isNaN(b.quote.changePercent)
            ? b.quote.changePercent
            : null;
      }

      if (valA === null && valB === null) return 0;
      if (valA === null) return 1;
      if (valB === null) return -1;

      const diff = direction === "desc" ? valB - valA : valA - valB;
      if (diff !== 0) return diff;

      return a.quote.symbol.localeCompare(b.quote.symbol);
    });
  }, [filteredPoints, sortConfig]);

  const totalItems = sortedPoints.length;
  const isAll = pageSize <= 0;
  const effectivePageSize = isAll ? Math.max(1, totalItems) : pageSize;
  const totalPages = Math.max(1, Math.ceil(totalItems / effectivePageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedPoints = useMemo(() => {
    if (isAll) return sortedPoints;
    const start = (safePage - 1) * effectivePageSize;
    return sortedPoints.slice(start, start + effectivePageSize);
  }, [sortedPoints, safePage, effectivePageSize, isAll]);

  const startRecord =
    totalItems === 0 ? 0 : (safePage - 1) * effectivePageSize + 1;
  const endRecord = isAll
    ? totalItems
    : Math.min(safePage * effectivePageSize, totalItems);

  const activePoint = useMemo(() => {
    if (!selectedPoint) return null;
    return (
      dataPoints.find(
        (p) =>
          p.instrument === selectedPoint.instrument ||
          (p.quote.symbol === selectedPoint.quote.symbol &&
            p.group === selectedPoint.group),
      ) ?? selectedPoint
    );
  }, [selectedPoint, dataPoints]);

  const activeBids = useMemo(() => {
    if (!activePoint?.quote.depth?.buy) return [];
    return activePoint.quote.depth.buy
      .filter(
        (item) =>
          (item.price !== null && item.price !== undefined && item.price > 0) ||
          (item.quantity !== null && item.quantity !== undefined && item.quantity > 0),
      )
      .slice(0, 5);
  }, [activePoint]);

  const activeAsks = useMemo(() => {
    if (!activePoint?.quote.depth?.sell) return [];
    return activePoint.quote.depth.sell
      .filter(
        (item) =>
          (item.price !== null && item.price !== undefined && item.price > 0) ||
          (item.quantity !== null && item.quantity !== undefined && item.quantity > 0),
      )
      .slice(0, 5);
  }, [activePoint]);

  const totalBidsQty = useMemo(() => {
    if (
      activePoint?.quote.totalBuyQuantity !== null &&
      activePoint?.quote.totalBuyQuantity !== undefined &&
      activePoint.quote.totalBuyQuantity > 0
    ) {
      return activePoint.quote.totalBuyQuantity;
    }
    return activeBids.reduce((acc, it) => acc + (it.quantity ?? 0), 0);
  }, [activePoint, activeBids]);

  const totalAsksQty = useMemo(() => {
    if (
      activePoint?.quote.totalSellQuantity !== null &&
      activePoint?.quote.totalSellQuantity !== undefined &&
      activePoint.quote.totalSellQuantity > 0
    ) {
      return activePoint.quote.totalSellQuantity;
    }
    return activeAsks.reduce((acc, it) => acc + (it.quantity ?? 0), 0);
  }, [activePoint, activeAsks]);

  return (
    <section
      className="vision-market-data"
      aria-label="Dynamic Market Analysis"
    >
      {/* Header */}
      <header className="vision-market-data-header">
        <div>
          <p className="agent-team-eyebrow">
            REAL-TIME MARKET INTELLIGENCE
          </p>
          <h2>Indian Equities & Derivatives</h2>
          <div className="vision-market-data-header-meta">
            {marketStatus.isOpen ? (
              <span
                className="vision-live-indicator"
                title={marketStatus.detail}
                suppressHydrationWarning
              >
                <span className="vision-live-dot" />
                Live ({marketStatus.tradingHours})
              </span>
            ) : (
              <span
                className={`vision-status-badge ${
                  marketStatus.isHoliday
                    ? "is-holiday"
                    : marketStatus.session === "pre-market"
                      ? "is-pre-market"
                      : "is-closed"
                }`}
                title={marketStatus.detail}
                suppressHydrationWarning
              >
                ● {mounted ? marketStatus.label : DEFAULT_MARKET_STATUS.label}
              </span>
            )}

            {mounted && marketStatus.countdown && (
              <span
                className="vision-countdown-tag"
                title={`Trading session window: ${marketStatus.tradingHours}`}
                suppressHydrationWarning
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {marketStatus.countdown}
              </span>
            )}

            <span className="vision-market-data-provider-tag">
              Last Updated:{" "}
              <strong suppressHydrationWarning>
                {mounted
                  ? formatTime(
                      snapshot?.status?.lastUpdatedAtMs ??
                        snapshot?.status?.lastSuccessAtMs,
                    )
                  : "—"}
              </strong>
            </span>

            {!marketStatus.isOpen && (
              <span
                className="vision-market-data-provider-tag"
                title="Quotes reflect End-of-Day settlement prices from previous trading session"
              >
                Quotes: <strong>EOD</strong>
              </span>
            )}

            {snapshot?.status?.connected && (
              <span className="vision-market-data-provider-tag">
                Feed: <strong>Active</strong>
              </span>
            )}
          </div>
        </div>

        <div className="vision-header-controls">
          <button
            className={`vision-btn ${autoRefresh ? "active" : ""}`}
            onClick={() => setAutoRefresh((prev) => !prev)}
            type="button"
            title={
              autoRefresh
                ? "Pause live polling"
                : "Enable continuous live polling"
            }
          >
            {autoRefresh ? "● Polling (6s)" : "○ Polling Paused"}
          </button>
          <button
            className={`vision-btn vision-refresh-action-btn ${refreshing ? "is-refreshing" : ""} ${justRefreshed ? "is-refreshed" : ""}`}
            disabled={loading || refreshing}
            onClick={() => void fetchLiveQuotes(true)}
            type="button"
            title="Refresh all live quotes from market feed"
          >
            <svg
              className={`vision-refresh-svg ${refreshing ? "vision-spin" : ""}`}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <polyline points="21 3 21 8 16 8" />
            </svg>
            <span>
              {refreshing
                ? "Refreshing…"
                : justRefreshed
                  ? "Quotes Updated"
                  : "Refresh Now"}
            </span>
          </button>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="vision-market-data-message is-error" role="alert">
          <strong>Market Feed Alert:</strong> {error}
        </div>
      )}

      {/* Loading State */}
      {loading && !snapshot && (
        <p className="vision-market-data-message" role="status">
          Connecting to live market data feed…
        </p>
      )}

      {/* Analytics Summary Grid */}
      {analytics && (
        <div className="vision-analytics-grid">
          {/* Nifty 50 Card */}
          {analytics.nifty50 && (
            <article className="vision-stat-card" title="Benchmark · Nifty 50">
              <span className="vision-stat-card-title">
                Benchmark · Nifty 50
              </span>
              <div className="vision-stat-card-main">
                <span
                  className="vision-stat-card-value"
                  title={formatPrice(analytics.nifty50.quote.value, "INR")}
                >
                  {formatPrice(analytics.nifty50.quote.value, "INR")}
                </span>
                <span
                  className={`vision-stat-card-sub ${(analytics.nifty50.quote.change ?? 0) >= 0 ? "text-success" : "text-danger"}`}
                >
                  {(analytics.nifty50.quote.change ?? 0) >= 0 ? "▲" : "▼"}{" "}
                  {Math.abs(analytics.nifty50.quote.change ?? 0).toFixed(2)} (
                  {Math.abs(analytics.nifty50.quote.changePercent ?? 0).toFixed(
                    2,
                  )}
                  %)
                </span>
              </div>
              <div className="vision-range-labels">
                <span>
                  Low: {formatPrice(analytics.nifty50.quote.low, "INR")}
                </span>
                <span>
                  High: {formatPrice(analytics.nifty50.quote.high, "INR")}
                </span>
              </div>
            </article>
          )}

          {/* Market Breadth */}
          <article
            className="vision-stat-card"
            title="Market Breadth (Advancing vs Declining)"
          >
            <span className="vision-stat-card-title">
              Market Breadth (Adv / Dec)
            </span>
            <div className="vision-stat-card-main">
              <span className="vision-stat-card-value text-success">
                {analytics.advanceCount} Adv
              </span>
              <span className="vision-stat-card-sub text-danger">
                {analytics.declineCount} Dec
              </span>
            </div>
            <div className="vision-breadth-bar">
              <div
                className="vision-breadth-advance"
                style={{ width: `${analytics.advancePercent}%` }}
                title={`${analytics.advanceCount} Advancing`}
              />
              <div
                className="vision-breadth-decline"
                style={{ width: `${100 - analytics.advancePercent}%` }}
                title={`${analytics.declineCount} Declining`}
              />
            </div>
          </article>

          {/* Top Gainer */}
          {analytics.topGainer && (
            <article
              className="vision-stat-card"
              title={`Top Gainer: ${analytics.topGainer.quote.name || analytics.topGainer.quote.symbol}`}
            >
              <span className="vision-stat-card-title">Top Gainer</span>
              <div className="vision-stat-card-symbol-row">
                <span
                  className="vision-stat-card-symbol text-success"
                  title={analytics.topGainer.quote.symbol}
                >
                  {analytics.topGainer.quote.symbol}
                </span>
              </div>
              <div className="vision-stat-card-footer-row">
                <span className="vision-stat-card-price">
                  {formatPrice(analytics.topGainer.quote.value, "INR")}
                </span>
                <span className="vision-stat-card-sub text-success">
                  Profit: +{formatPrice(analytics.topGainer.quote.change, "INR")} (+
                  {(analytics.topGainer.quote.changePercent ?? 0).toFixed(2)}%)
                </span>
              </div>
            </article>
          )}

          {/* Top Loser */}
          {analytics.topLoser && (
            <article
              className="vision-stat-card"
              title={`Top Loser: ${analytics.topLoser.quote.name || analytics.topLoser.quote.symbol}`}
            >
              <span className="vision-stat-card-title">Top Loser</span>
              <div className="vision-stat-card-symbol-row">
                <span
                  className="vision-stat-card-symbol text-danger"
                  title={analytics.topLoser.quote.symbol}
                >
                  {analytics.topLoser.quote.symbol}
                </span>
              </div>
              <div className="vision-stat-card-footer-row">
                <span className="vision-stat-card-price">
                  {formatPrice(analytics.topLoser.quote.value, "INR")}
                </span>
                <span className="vision-stat-card-sub text-danger">
                  Loss: {formatPrice(analytics.topLoser.quote.change, "INR")} (
                  {(analytics.topLoser.quote.changePercent ?? 0).toFixed(2)}%)
                </span>
              </div>
            </article>
          )}

          {/* Volume Leader */}
          {analytics.volumeLeader && (
            <article
              className="vision-stat-card"
              title={`Volume Leader: ${analytics.volumeLeader.quote.name || analytics.volumeLeader.quote.symbol}`}
            >
              <span className="vision-stat-card-title">Volume Leader</span>
              <div className="vision-stat-card-symbol-row">
                <span
                  className="vision-stat-card-symbol"
                  title={analytics.volumeLeader.quote.symbol}
                >
                  {analytics.volumeLeader.quote.symbol}
                </span>
              </div>
              <div className="vision-stat-card-footer-row">
                <span className="vision-stat-card-price">
                  LTP: {formatPrice(analytics.volumeLeader.quote.value, "INR")}
                </span>
                <span className="vision-stat-card-sub">
                  {formatNumber(analytics.volumeLeader.quote.volume)} shares
                </span>
              </div>
            </article>
          )}
        </div>
      )}

      {/* Toolbar: Filters and Search */}
      <div className="vision-toolbar">
        <div className="vision-filter-tabs">
          {(
            [
              ["all", `All (${dataPoints.length})`],
              ["stocks", `Stocks (${categoryCounts.stocks})`],
              ["indices", `Indices (${categoryCounts.indices})`],
              ["ipos", `IPOs (${ipoCounts.total > 0 ? ipoCounts.total : "Live"})`],
              ["futures", `Futures (${categoryCounts.futures})`],
              ["options", `Options (${categoryCounts.options})`],
              ["commodities", `Commodities (${categoryCounts.commodities})`],
              ["bonds", `Bonds (${categoryCounts.bonds})`],
              ["gainers", "Gainers"],
              ["losers", "Losers"],
            ] as const
          ).map(([key, label]) => (
            <button
              className={`vision-filter-tab ${filter === key ? "active" : ""}`}
              key={key}
              onClick={() => handleFilterChange(key)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="vision-toolbar-actions">
          {/* Index Basket Selector Dropdown */}
          <div className="vision-basket-select-wrap">
            <label htmlFor="vision-basket-select" className="vision-basket-label">
              Basket:
            </label>
            <select
              id="vision-basket-select"
              className="vision-basket-select"
              value={indexBasket}
              onChange={(e) => {
                const val = e.target.value as IndexBasketType;
                setIndexBasket(val);
                if (filter !== "stocks" && filter !== "all" && val !== "all") {
                  setFilter("stocks");
                }
                setCurrentPage(1);
              }}
              title="Select Index Basket to filter constituent stocks"
            >
              <option value="all">All Equities</option>
              <option value="nifty50">NIFTY 50</option>
              <option value="niftybank">NIFTY BANK</option>
              <option value="sensex">SENSEX</option>
            </select>
          </div>

          <div className="vision-search-box">
            <input
              className="vision-search-input"
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search name"
              type="search"
              value={search}
            />
          </div>
        </div>
      </div>

      {filter === "ipos" ? (
        <div className="vision-ipo-section">
          {/* Segregated Summary KPI Banner */}
          <div className="vision-ipo-kpis">
            <button
              type="button"
              className={`vision-ipo-kpi-card ${ipoSubFilter === "open" ? "is-active" : ""}`}
              onClick={() => setIpoSubFilter("open")}
            >
              <div className="vision-ipo-kpi-top">
                <span className="vision-ipo-kpi-label">Open for Bidding</span>
                <span className="vision-ipo-live-dot" />
              </div>
              <span className="vision-ipo-kpi-val green">{ipoCounts.open}</span>
              <span className="vision-ipo-kpi-sub">Accepting UPI bids</span>
            </button>
            <button
              type="button"
              className={`vision-ipo-kpi-card ${ipoSubFilter === "upcoming" ? "is-active" : ""}`}
              onClick={() => setIpoSubFilter("upcoming")}
            >
              <div className="vision-ipo-kpi-top">
                <span className="vision-ipo-kpi-label">Upcoming Pipeline</span>
                <span className="vision-ipo-kpi-icon">📅</span>
              </div>
              <span className="vision-ipo-kpi-val blue">{ipoCounts.upcoming}</span>
              <span className="vision-ipo-kpi-sub">Scheduled launches</span>
            </button>
            <button
              type="button"
              className={`vision-ipo-kpi-card ${ipoSubFilter === "regular" ? "is-active" : ""}`}
              onClick={() => setIpoSubFilter("regular")}
            >
              <div className="vision-ipo-kpi-top">
                <span className="vision-ipo-kpi-label">Mainboard Issues</span>
                <span className="vision-ipo-kpi-icon">🏢</span>
              </div>
              <span className="vision-ipo-kpi-val purple">{ipoCounts.mainboard}</span>
              <span className="vision-ipo-kpi-sub">NSE / BSE Main</span>
            </button>
            <button
              type="button"
              className={`vision-ipo-kpi-card ${ipoSubFilter === "sme" ? "is-active" : ""}`}
              onClick={() => setIpoSubFilter("sme")}
            >
              <div className="vision-ipo-kpi-top">
                <span className="vision-ipo-kpi-label">SME Issues</span>
                <span className="vision-ipo-kpi-icon">⚡</span>
              </div>
              <span className="vision-ipo-kpi-val teal">{ipoCounts.sme}</span>
              <span className="vision-ipo-kpi-sub">BSE SME / NSE Emerge</span>
            </button>
          </div>

          {/* Market Context Banner */}
          <div className="vision-ipo-info-banner">
            <div className="vision-ipo-info-left">
              <span className="vision-ipo-info-pill">
                <span className="vision-pulse-circle" />
                Live Primary Market
              </span>
              <span className="vision-ipo-info-text">
                Retail UPI Limit: <strong>₹2,00,000</strong> &bull; sHNI Bidding: <strong>₹2L – ₹10L</strong> &bull; ASBA funds stay in bank until allotment
              </span>
            </div>
            {lastIpoRefresh && (
              <span className="vision-ipo-refresh-time">
                Synced {new Date(lastIpoRefresh).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>

          {/* Sub-toolbar with Segregation filters, Sort, View mode & Refresh */}
          <div className="vision-ipo-toolbar">
            <div className="vision-ipo-subtabs">
              {(
                [
                  ["all", `All (${ipoCounts.total})`],
                  ["open", `🔥 Open (${ipoCounts.open})`],
                  ["upcoming", `📅 Upcoming (${ipoCounts.upcoming})`],
                  ["regular", `Mainboard (${ipoCounts.mainboard})`],
                  ["sme", `SME (${ipoCounts.sme})`],
                ] as const
              ).map(([subKey, subLabel]) => (
                <button
                  key={subKey}
                  type="button"
                  className={`vision-ipo-subtab ${ipoSubFilter === subKey ? "active" : ""}`}
                  onClick={() => setIpoSubFilter(subKey)}
                >
                  {subLabel}
                </button>
              ))}
            </div>

            <div className="vision-ipo-toolbar-right">
              {/* Sort selector */}
              <div className="vision-ipo-sort-wrap">
                <label htmlFor="vision-ipo-sort" className="vision-ipo-sort-label">Sort:</label>
                <select
                  id="vision-ipo-sort"
                  className="vision-ipo-sort-select"
                  value={ipoSort}
                  onChange={(e) => setIpoSort(e.target.value as IpoSortOption)}
                >
                  <option value="default">Default (Open First)</option>
                  <option value="subscription">🔥 Highest Subscription</option>
                  <option value="issue_size">💰 Issue Size (High to Low)</option>
                  <option value="price_desc">📈 Price (High to Low)</option>
                  <option value="price_asc">📉 Price (Low to High)</option>
                  <option value="closing_soon">⏳ Closing Soon</option>
                  <option value="name">🔤 Name (A–Z)</option>
                </select>
              </div>

              {/* View mode toggle */}
              <div className="vision-ipo-view-toggle">
                <button
                  type="button"
                  className={`vision-ipo-view-btn ${ipoViewMode === "cards" ? "active" : ""}`}
                  onClick={() => setIpoViewMode("cards")}
                  title="Card Grid View"
                  aria-label="Card Grid View"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="14" width="7" height="7" rx="1.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" />
                  </svg>
                  <span>Cards</span>
                </button>
                <button
                  type="button"
                  className={`vision-ipo-view-btn ${ipoViewMode === "table" ? "active" : ""}`}
                  onClick={() => setIpoViewMode("table")}
                  title="Comparison Table View"
                  aria-label="Comparison Table View"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                  <span>Table</span>
                </button>
              </div>

              <button
                type="button"
                className={`vision-ipo-refresh-btn ${ipoLoading ? "is-refreshing" : ""}`}
                onClick={() => void fetchIpos(true)}
                disabled={ipoLoading}
                title="Refresh live IPO list from Upstox API"
              >
                <svg
                  className={`vision-refresh-svg ${ipoLoading ? "vision-spin" : ""}`}
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                  <polyline points="21 3 21 8 16 8" />
                </svg>
                <span>{ipoLoading ? "Refreshing…" : "Refresh IPOs"}</span>
              </button>
            </div>
          </div>

          {/* IPO Content */}
          {ipoLoading && ipos.length === 0 ? (
            <div className="vision-ipo-loading">
              <div className="vision-spinner" />
              <span>Fetching live IPOs via Upstox API…</span>
            </div>
          ) : ipoError && ipos.length === 0 ? (
            <div className="vision-ipo-error">
              <span>{ipoError}</span>
              <button
                type="button"
                className="vision-btn"
                onClick={() => void fetchIpos(true)}
              >
                Retry
              </button>
            </div>
          ) : filteredIpos.length === 0 ? (
            <div className="vision-ipo-empty">
              <span>No IPOs match the selected filter or search term.</span>
              <button
                type="button"
                className="vision-ipo-empty-btn"
                onClick={() => {
                  setIpoSubFilter("all");
                  setSearch("");
                }}
              >
                Reset Filters &amp; Search
              </button>
            </div>
          ) : ipoViewMode === "cards" ? (
            <div className="vision-ipo-grid">
              {filteredIpos.map((ipo) => {
                const isOpen = ipo.status === "open";
                const isMainboard = ipo.issue_type === "regular";
                const subValue = ipo.total_subscription
                  ? Number(ipo.total_subscription)
                  : 0;
                const lotSize = getIpoLotSize(ipo);
                const isEstLot = !ipo.lot_size && !ipo.minimum_quantity && !ipo.min_bid_quantity && Boolean(lotSize);
                const minInvestment = getIpoMinInvestment(ipo, lotSize);
                const timeline = getIpoTimelineBadge(ipo);
                const isCalcOpen = activeCalculatorIpoId === ipo.id;
                const calcLots = ipoCalcLots[ipo.id] ?? 1;
                const maxPrice = ipo.maximum_price || ipo.minimum_price || 0;
                const totalShares = calcLots * (lotSize || 1);
                const totalBidAmount = totalShares * maxPrice;

                return (
                  <article
                    key={ipo.id}
                    className={`vision-ipo-card ${isOpen ? "is-open" : ""}`}
                  >
                    <div className="vision-ipo-card-header">
                      <div className="vision-ipo-tags">
                        <span
                          className={`vision-ipo-badge ${isOpen ? "badge-open" : "badge-upcoming"}`}
                        >
                          {isOpen ? "● OPEN FOR BIDDING" : "UPCOMING"}
                        </span>
                        <span
                          className={`vision-ipo-type ${isMainboard ? "type-mainboard" : "type-sme"}`}
                        >
                          {isMainboard ? "MAINBOARD" : "SME"}
                        </span>
                        {ipo.listing_exchange && (
                          <span className="vision-ipo-exchange-pill">
                            {ipo.listing_exchange}
                          </span>
                        )}
                        <span className={`vision-ipo-timeline-badge ${timeline.className}`}>
                          {timeline.text}
                        </span>
                      </div>

                      {subValue > 0 && (
                        <div className={`vision-ipo-sub-badge ${subValue >= 1 ? "is-oversubscribed" : ""}`}>
                          <span className="vision-ipo-sub-num">
                            {subValue.toFixed(2)}x
                          </span>
                          <span className="vision-ipo-sub-txt">
                            {subValue >= 1 ? "Over-subscribed" : "Subscribed"}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="vision-ipo-title-wrap">
                      <h4 className="vision-ipo-title" title={ipo.name}>
                        {ipo.name}
                      </h4>
                      <div className="vision-ipo-subhead">
                        {ipo.symbol && (
                          <span className="vision-ipo-symbol">{ipo.symbol}</span>
                        )}
                        <span className="vision-ipo-industry-badge">
                          {ipo.industry || (isMainboard ? "General Commercial" : "Emerging Enterprise")}
                        </span>
                      </div>
                    </div>

                    {/* Enhanced 6-Tile Financial Metrics Grid */}
                    <div className="vision-ipo-meta-grid">
                      <div className="vision-ipo-meta-item">
                        <span className="vision-ipo-meta-label">
                          Price Band
                        </span>
                        <span className="vision-ipo-meta-val">
                          {ipo.minimum_price && ipo.maximum_price
                            ? `₹${ipo.minimum_price} – ₹${ipo.maximum_price}`
                            : ipo.maximum_price
                              ? `₹${ipo.maximum_price}`
                              : "Price TBD"}
                        </span>
                        <span className="vision-ipo-meta-subnote">
                          {ipo.maximum_price ? `Cut-off: ₹${ipo.maximum_price}` : "Per share"}
                        </span>
                      </div>

                      <div className="vision-ipo-meta-item highlight">
                        <span className="vision-ipo-meta-label">
                          Lot Size
                        </span>
                        <span className="vision-ipo-meta-val lot-highlight">
                          {lotSize ? `${lotSize} Shares` : "TBD"}
                        </span>
                        <span className="vision-ipo-meta-subnote">
                          {isEstLot ? "Est. retail unit" : "1 Lot minimum"}
                        </span>
                      </div>

                      <div className="vision-ipo-meta-item highlight">
                        <span className="vision-ipo-meta-label">
                          Min Investment
                        </span>
                        <div className="vision-ipo-min-inv-row">
                          <span className="vision-ipo-meta-val min-inv-highlight">
                            {minInvestment ? `₹${minInvestment.toLocaleString("en-IN")}` : "TBD"}
                          </span>
                          {minInvestment ? (
                            <button
                              type="button"
                              className="vision-mini-copy-mandate-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyMandateNumeric(minInvestment);
                              }}
                              title={`Copy 1-lot minimum mandate amount (${minInvestment})`}
                              aria-label={`Copy minimum mandate amount ${minInvestment}`}
                            >
                              {copiedMandateType === "numeric" &&
                              copyFeedbackMessage?.includes(String(minInvestment))
                                ? "✓"
                                : "📋"}
                            </button>
                          ) : null}
                        </div>
                        <span className="vision-ipo-meta-subnote">
                          1 Lot @ Cut-off (ASBA Mandate)
                        </span>
                      </div>

                      <div className="vision-ipo-meta-item">
                        <span className="vision-ipo-meta-label">
                          Issue Size
                        </span>
                        <span className="vision-ipo-meta-val">
                          {ipo.issue_size
                            ? `₹${ipo.issue_size.toFixed(2)} Cr`
                            : "TBD"}
                        </span>
                        <span className="vision-ipo-meta-subnote">
                          Total fundraise
                        </span>
                      </div>

                      <div className="vision-ipo-meta-item">
                        <span className="vision-ipo-meta-label">
                          Bidding Dates
                        </span>
                        <span className="vision-ipo-meta-val dates">
                          {ipo.bidding_start_date && ipo.bidding_end_date
                            ? `${ipo.bidding_start_date} → ${ipo.bidding_end_date}`
                            : ipo.bidding_start_date
                              ? `Starts ${ipo.bidding_start_date}`
                              : "Dates TBD"}
                        </span>
                        <span className="vision-ipo-meta-subnote">
                          {isOpen ? "UPI active 10AM–5PM" : "Upcoming window"}
                        </span>
                      </div>

                      <div className="vision-ipo-meta-item">
                        <span className="vision-ipo-meta-label">
                          Face Value &amp; Exch
                        </span>
                        <span className="vision-ipo-meta-val">
                          {ipo.face_value ? `₹${ipo.face_value} FV` : "₹10 FV"} &bull; {ipo.listing_exchange || (isMainboard ? "NSE/BSE" : "SME")}
                        </span>
                        <span className="vision-ipo-meta-subnote">
                          {isMainboard ? "Mainboard Tier" : "SME Growth"}
                        </span>
                      </div>
                    </div>

                    {/* Interactive Retail Lot Calculator Action */}
                    {lotSize && maxPrice > 0 && (
                      <div className="vision-ipo-calc-section">
                        <button
                          type="button"
                          className={`vision-ipo-calc-toggle ${isCalcOpen ? "is-open" : ""}`}
                          onClick={() =>
                            setActiveCalculatorIpoId((prev) => (prev === ipo.id ? null : ipo.id))
                          }
                          aria-expanded={isCalcOpen}
                          title="Open Retail Lot & Mandate Calculator Sidebar"
                        >
                          <span className="vision-ipo-calc-toggle-left">
                            <span className="vision-calc-icon">🧮</span>
                            <span>Retail Lot Calculator</span>
                          </span>
                          <span className="vision-ipo-calc-toggle-right">
                            <span className="vision-ipo-calc-chip">
                              {calcLots} {calcLots === 1 ? "Lot" : "Lots"} = ₹{totalBidAmount.toLocaleString("en-IN")}
                            </span>
                            <span className="vision-calc-arrow">→</span>
                          </span>
                        </button>
                      </div>
                    )}

                    <div className="vision-ipo-card-footer">
                      {ipo.isin ? (
                        <div className="vision-ipo-isin-wrap">
                          <span className="vision-ipo-isin-label">ISIN:</span>
                          <code>{ipo.isin}</code>
                          <button
                            type="button"
                            className="vision-ipo-copy-btn"
                            onClick={() => handleCopyIsin(ipo.isin!)}
                            title="Copy ISIN to clipboard"
                          >
                            {copiedIsin === ipo.isin ? "✓ Copied" : "Copy"}
                          </button>
                        </div>
                      ) : (
                        <span className="vision-ipo-isin-tbd">ISIN awaiting allocation</span>
                      )}

                      <div className="vision-ipo-actions">
                        {ipo.rhp_url && (
                          <a
                            href={ipo.rhp_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="vision-ipo-rhp-link"
                            title="View Red Herring Prospectus (SEBI Filings)"
                          >
                            📄 RHP
                          </a>
                        )}
                        {isOpen ? (
                          <span className="vision-ipo-status-pill open">
                            UPI ASBA Live
                          </span>
                        ) : (
                          <span className="vision-ipo-status-pill upcoming">
                            Upcoming
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            /* Institutional Comparison Table View */
            <div className="vision-ipo-table-card">
              <div className="vision-table-wrap">
                <table className="vision-stocks-table vision-ipo-table">
                  <thead>
                    <tr>
                      <th scope="col">Company &amp; Symbol</th>
                      <th scope="col">Type</th>
                      <th scope="col">Status</th>
                      <th scope="col">Price Band</th>
                      <th scope="col">Lot Size</th>
                      <th scope="col">Min Investment</th>
                      <th scope="col">Issue Size</th>
                      <th scope="col">Subscription</th>
                      <th scope="col">Bidding Period</th>
                      <th scope="col">Exchange</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIpos.map((ipo) => {
                      const isOpen = ipo.status === "open";
                      const isMainboard = ipo.issue_type === "regular";
                      const subValue = ipo.total_subscription ? Number(ipo.total_subscription) : 0;
                      const lotSize = getIpoLotSize(ipo);
                      const minInvestment = getIpoMinInvestment(ipo, lotSize);
                      const timeline = getIpoTimelineBadge(ipo);
                      const isCalcOpen = activeCalculatorIpoId === ipo.id;
                      const maxPrice = ipo.maximum_price || ipo.minimum_price || 0;

                      return (
                        <tr key={ipo.id} className={isOpen ? "vision-ipo-tr-open" : ""}>
                          <td>
                            <div className="vision-symbol-cell">
                              <span className="vision-company-name">{ipo.name}</span>
                              <div className="vision-symbol-meta">
                                {ipo.symbol && <span className="vision-symbol-code">{ipo.symbol}</span>}
                                <span className="vision-industry-tag">{ipo.industry || "General"}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`vision-ipo-type ${isMainboard ? "type-mainboard" : "type-sme"}`}>
                              {isMainboard ? "Mainboard" : "SME"}
                            </span>
                          </td>
                          <td>
                            <div className="vision-ipo-table-status">
                              <span className={`vision-ipo-badge ${isOpen ? "badge-open" : "badge-upcoming"}`}>
                                {isOpen ? "Live" : "Upcoming"}
                              </span>
                              <span className={`vision-ipo-timeline-badge ${timeline.className}`}>
                                {timeline.text}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className="vision-mono-val">
                              {ipo.minimum_price && ipo.maximum_price
                                ? `₹${ipo.minimum_price} – ₹${ipo.maximum_price}`
                                : ipo.maximum_price
                                  ? `₹${ipo.maximum_price}`
                                  : "TBD"}
                            </span>
                          </td>
                          <td>
                            <strong className="vision-lot-val">
                              {lotSize ? `${lotSize} Shares` : "TBD"}
                            </strong>
                          </td>
                          <td>
                            <div className="vision-mininv-table-cell">
                              <strong className="vision-mininv-val green">
                                {minInvestment ? `₹${minInvestment.toLocaleString("en-IN")}` : "TBD"}
                              </strong>
                              {minInvestment ? (
                                <button
                                  type="button"
                                  className="vision-mini-copy-mandate-btn"
                                  onClick={() => handleCopyMandateNumeric(minInvestment)}
                                  title={`Copy min mandate amount (${minInvestment})`}
                                >
                                  {copiedMandateType === "numeric" &&
                                  copyFeedbackMessage?.includes(String(minInvestment))
                                    ? "✓"
                                    : "📋"}
                                </button>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <span className="vision-mono-val">
                              {ipo.issue_size ? `₹${ipo.issue_size.toFixed(2)} Cr` : "TBD"}
                            </span>
                          </td>
                          <td>
                            {subValue > 0 ? (
                              <span className={`vision-ipo-sub-pill ${subValue >= 1 ? "oversub" : ""}`}>
                                {subValue.toFixed(2)}x
                              </span>
                            ) : (
                              <span className="vision-sub-na">—</span>
                            )}
                          </td>
                          <td>
                            <span className="vision-date-val">
                              {ipo.bidding_start_date && ipo.bidding_end_date
                                ? `${ipo.bidding_start_date} → ${ipo.bidding_end_date}`
                                : ipo.bidding_start_date || "TBD"}
                            </span>
                          </td>
                          <td>
                            <span className="vision-exchange-tag">
                              {ipo.listing_exchange || (isMainboard ? "NSE/BSE" : "SME")}
                            </span>
                          </td>
                          <td>
                            <div className="vision-ipo-table-actions">
                              {lotSize && maxPrice > 0 && (
                                <button
                                  type="button"
                                  className={`vision-ipo-btn-sm ${isCalcOpen ? "active" : ""}`}
                                  onClick={() =>
                                    setActiveCalculatorIpoId((prev) => (prev === ipo.id ? null : ipo.id))
                                  }
                                  title="Calculate retail application lot & amount in sidebar"
                                >
                                  🧮 {isCalcOpen ? "Close Calc" : "Calc"}
                                </button>
                              )}
                              {ipo.isin && (
                                <button
                                  type="button"
                                  className="vision-ipo-btn-sm"
                                  onClick={() => handleCopyIsin(ipo.isin!)}
                                  title="Copy ISIN code"
                                >
                                  {copiedIsin === ipo.isin ? "✓" : "ISIN"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Dynamic Stocks Analysis Table */
        <div className="vision-table-card">
        <div className="vision-table-wrap">
          <table className="vision-stocks-table">
            <thead>
              <tr>
                <th scope="col">Instrument</th>
                <th
                  scope="col"
                  className={`vision-sortable-th ${sortConfig?.field === "price" ? "active" : ""}`}
                  aria-sort={
                    sortConfig?.field === "price"
                      ? sortConfig.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    className="vision-th-sort-btn"
                    onClick={() => handleSort("price")}
                    title={`Sort by Last Price (${
                      sortConfig?.field === "price"
                        ? sortConfig.direction === "desc"
                          ? "Sorted descending. Click to sort ascending."
                          : "Sorted ascending. Click for default order."
                        : "Click to sort descending."
                    })`}
                  >
                    <span>Last Price</span>
                    <SortIndicator
                      direction={
                        sortConfig?.field === "price"
                          ? sortConfig.direction
                          : null
                      }
                    />
                  </button>
                </th>
                <th
                  scope="col"
                  className={`vision-sortable-th ${sortConfig?.field === "change" ? "active" : ""}`}
                  aria-sort={
                    sortConfig?.field === "change"
                      ? sortConfig.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    className="vision-th-sort-btn"
                    onClick={() => handleSort("change")}
                    title={`Sort by Change (%) (${
                      sortConfig?.field === "change"
                        ? sortConfig.direction === "desc"
                          ? "Sorted descending. Click to sort ascending."
                          : "Sorted ascending. Click for default order."
                        : "Click to sort descending."
                    })`}
                  >
                    <span>Change (%)</span>
                    <SortIndicator
                      direction={
                        sortConfig?.field === "change"
                          ? sortConfig.direction
                          : null
                      }
                    />
                  </button>
                </th>
                <th scope="col">Day Range (L - H)</th>
                <th scope="col">Open / Prev Close</th>
                <th scope="col">Volume & VWAP</th>
                <th scope="col">Order Pressure</th>
                <th scope="col">Market</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPoints.length > 0 ? (
                paginatedPoints.map((point) => {
                  const val = point.quote.value;
                  const change = point.quote.change;
                  const changePct = point.quote.changePercent;
                  const high = point.quote.high;
                  const low = point.quote.low;
                  const open = point.quote.open;
                  const prevClose = point.quote.previousClose;
                  const vol = point.quote.volume;
                  const vwap = point.quote.averagePrice;
                  const depthBuySum =
                    point.quote.depth?.buy?.reduce((acc, b) => acc + (b.quantity || 0), 0) ?? 0;
                  const depthSellSum =
                    point.quote.depth?.sell?.reduce((acc, s) => acc + (s.quantity || 0), 0) ?? 0;
                  const buyQty =
                    point.quote.totalBuyQuantity !== null &&
                    point.quote.totalBuyQuantity !== undefined &&
                    point.quote.totalBuyQuantity > 0
                      ? point.quote.totalBuyQuantity
                      : depthBuySum;
                  const sellQty =
                    point.quote.totalSellQuantity !== null &&
                    point.quote.totalSellQuantity !== undefined &&
                    point.quote.totalSellQuantity > 0
                      ? point.quote.totalSellQuantity
                      : depthSellSum;
                  const totalBook = buyQty + sellQty;
                  const buyRatio =
                    totalBook > 0 ? (buyQty / totalBook) * 100 : 50;

                  // Calculate range position (0 to 100%)
                  let rangePos = 50;
                  if (
                    val !== null &&
                    high !== null &&
                    low !== null &&
                    high !== undefined &&
                    low !== undefined &&
                    high > low
                  ) {
                    rangePos = Math.max(
                      0,
                      Math.min(100, ((val - low) / (high - low)) * 100),
                    );
                  }

                  const isPositive = (change ?? 0) > 0;
                  const isNegative = (change ?? 0) < 0;
                  const groupLower = point.group.toLowerCase();
                  const isIndexItem = groupLower.includes("indices");
                  const tagLabel = groupLower.includes("indices")
                    ? "INDEX"
                    : groupLower.includes("futures")
                      ? "FUTURES"
                      : groupLower.includes("options")
                        ? "OPTION"
                        : groupLower.includes("commodities")
                          ? "COMMODITY"
                          : groupLower.includes("bond")
                            ? "BOND"
                            : "STOCK";

                  return (
                    <tr key={point.instrument}>
                      <td>
                        <div className="vision-instrument-cell">
                          <span className="vision-instrument-symbol">
                            {point.quote.symbol}
                          </span>
                          <span className="vision-instrument-name">
                            {point.label}
                          </span>
                          <div className="vision-instrument-tags">
                            <span className="vision-instrument-tag">
                              {tagLabel}
                            </span>
                            {point.expiry && (
                              <span
                                className="vision-instrument-tag vision-tag-expiry"
                                title="Contract Expiration"
                              >
                                {point.expiry}
                              </span>
                            )}
                            {point.lotSize && (
                              <span
                                className="vision-instrument-tag vision-tag-lot"
                                title="Market Lot Size"
                              >
                                Lot: {point.lotSize}
                              </span>
                            )}
                            {point.tickSize && (
                              <span
                                className="vision-instrument-tag vision-tag-tick"
                                title="Minimum Price Tick Movement"
                              >
                                Tick: ₹{point.tickSize}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="vision-price">
                          {formatPrice(val, "INR")}
                        </span>
                      </td>
                      <td>
                        <div className="vision-change-cell">
                          <span
                            className={`vision-change-badge ${
                              isPositive
                                ? "positive"
                                : isNegative
                                  ? "negative"
                                  : "neutral"
                            }`}
                          >
                            {isPositive ? "▲ +" : isNegative ? "▼ " : "— "}
                            {change !== null && change !== undefined
                              ? Math.abs(change).toFixed(2)
                              : "0.00"}
                          </span>
                          <span
                            className={`vision-instrument-name ${
                              isPositive
                                ? "text-success"
                                : isNegative
                                  ? "text-danger"
                                  : ""
                            }`}
                          >
                            {changePct !== null && changePct !== undefined
                              ? `${isPositive ? "+" : ""}${changePct.toFixed(2)}%`
                              : "—"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="vision-range-cell">
                          <div className="vision-range-labels">
                            <span>{low ? formatPrice(low, "INR") : "—"}</span>
                            <span>{high ? formatPrice(high, "INR") : "—"}</span>
                          </div>
                          <div className="vision-range-track">
                            <div
                              className="vision-range-thumb"
                              style={{ left: `${rangePos}%` }}
                            />
                          </div>
                          {point.quote.yearlyLow !== null &&
                            point.quote.yearlyLow !== undefined &&
                            point.quote.yearlyHigh !== null &&
                            point.quote.yearlyHigh !== undefined && (
                              <span
                                className="vision-instrument-name"
                                style={{ fontSize: "0.625rem", color: "var(--muted, #94a0b2)", marginTop: "0.125rem" }}
                                title="52-Week / Yearly Price Range"
                              >
                                52W: {formatPrice(point.quote.yearlyLow, "INR")} – {formatPrice(point.quote.yearlyHigh, "INR")}
                              </span>
                            )}
                        </div>
                      </td>
                      <td>
                        <div className="vision-instrument-cell">
                          <span>
                            Open: {open ? formatPrice(open, "INR") : "—"}
                          </span>
                          <span className="vision-instrument-name">
                            Prev:{" "}
                            {prevClose ? formatPrice(prevClose, "INR") : "—"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="vision-instrument-cell">
                          <span>
                            Vol:{" "}
                            {vol
                              ? formatNumber(vol)
                              : isIndexItem
                                ? "Basket"
                                : "—"}
                          </span>
                          {point.quote.oi !== null &&
                          point.quote.oi !== undefined &&
                          point.quote.oi > 0 ? (
                            <span
                              className="vision-instrument-name"
                              style={{ color: "#38bdf8", fontWeight: 600 }}
                              title="Open Interest (Current Outstanding Contracts)"
                            >
                              OI: {formatNumber(point.quote.oi)}
                            </span>
                          ) : (
                            <span className="vision-instrument-name">
                              VWAP:{" "}
                              {vwap
                                ? formatPrice(vwap, "INR")
                                : isIndexItem
                                  ? "—"
                                  : "—"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {isIndexItem ? (
                          <span className="vision-instrument-name">
                            Weighted Benchmark
                          </span>
                        ) : (
                          <div className="vision-instrument-cell">
                            <span className="vision-instrument-name">
                              {totalBook > 0 ? (
                                `B: ${formatNumber(buyQty)} · S: ${formatNumber(sellQty)}`
                              ) : (
                                "No active orders"
                              )}
                            </span>
                            <div className="vision-depth-bar">
                              <div
                                className="vision-depth-buy"
                                style={{ width: `${buyRatio}%` }}
                                title={
                                  totalBook > 0
                                    ? `Buy Demand: ${buyRatio.toFixed(1)}%`
                                    : "No active orders"
                                }
                              />
                              <div
                                className="vision-depth-sell"
                                style={{ width: `${100 - buyRatio}%` }}
                                title={
                                  totalBook > 0
                                    ? `Sell Supply: ${(100 - buyRatio).toFixed(1)}%`
                                    : "No active orders"
                                }
                              />
                            </div>
                          </div>
                        )}
                      </td>
                      <td>
                        <button
                          className="vision-btn"
                          onClick={() => setSelectedPoint(point)}
                          type="button"
                        >
                          {isIndexItem ? "Index" : "View"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    style={{ textAlign: "center", padding: "2rem" }}
                  >
                    {loading
                      ? "Loading live market quotes…"
                      : "No matching stocks found for your search/filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Dynamic Pagination Bar */}
        {totalItems > 0 && (
          <div className="vision-pagination-bar">
            <div className="vision-pagination-info">
              Showing <strong>{startRecord}</strong>–
              <strong>{endRecord}</strong> of <strong>{totalItems}</strong>{" "}
              instruments
            </div>

            <div className="vision-pagination-controls">
              <div className="vision-page-size-selector">
                <label htmlFor="vision-page-size">Per Page:</label>
                <select
                  id="vision-page-size"
                  className="vision-page-size-select"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={500}>500</option>
                  <option value={-1}>All ({totalItems})</option>
                </select>
              </div>

              <div className="vision-page-nav-buttons">
                <button
                  type="button"
                  className="vision-page-btn"
                  onClick={() => setCurrentPage(1)}
                  disabled={safePage <= 1}
                  title="First Page"
                >
                  « First
                </button>
                <button
                  type="button"
                  className="vision-page-btn"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  title="Previous Page"
                >
                  ‹ Prev
                </button>
                <span className="vision-page-indicator">
                  Page <strong>{safePage}</strong> of{" "}
                  <strong>{totalPages}</strong>
                </span>
                <button
                  type="button"
                  className="vision-page-btn"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={safePage >= totalPages}
                  title="Next Page"
                >
                  Next ›
                </button>
                <button
                  type="button"
                  className="vision-page-btn"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={safePage >= totalPages}
                  title="Last Page"
                >
                  Last »
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Market Depth & Circuit Limits Modal */}
      {activePoint && (
        <div
          className="vision-modal-overlay"
          onClick={() => setSelectedPoint(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="vision-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="vision-modal-header">
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="agent-team-eyebrow">
                  {activePoint.group.toLowerCase().includes("indices")
                    ? "BENCHMARK INDEX"
                    : activePoint.group.toLowerCase().includes("futures")
                      ? "FUTURES MARKET DEPTH"
                      : activePoint.group.toLowerCase().includes("options")
                        ? "OPTIONS MARKET DEPTH"
                        : activePoint.group
                              .toLowerCase()
                              .includes("commodities")
                          ? "COMMODITIES MARKET DEPTH"
                          : activePoint.group.toLowerCase().includes("bond")
                            ? "BONDS ORDER BOOK"
                            : "ORDER BOOK & MARKET DEPTH"}
                </p>
                <div className="vision-modal-title-row">
                  <h3 className="vision-modal-title">
                    {activePoint.quote.symbol} · {activePoint.label}
                  </h3>
                  {(activePoint.strikePrice || activePoint.isin) && (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.625rem",
                        flexWrap: "wrap",
                      }}
                    >
                      {activePoint.strikePrice && (
                        <span
                          className="vision-modal-isin"
                          title="Option Contract Strike Price"
                        >
                          <span>Strike Price</span>:{" "}
                          <strong>{formatPrice(activePoint.strikePrice, "INR")}</strong>
                        </span>
                      )}
                      {activePoint.isin && (
                        <span
                          className="vision-modal-isin"
                          title="International Securities Identification Number"
                        >
                          <span>ISIN Identifier</span>:{" "}
                          <strong>{activePoint.isin}</strong>
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <span className="vision-price">
                  {formatPrice(activePoint.quote.value, "INR")}
                </span>{" "}
                <span
                  className={
                    (activePoint.quote.change ?? 0) >= 0
                      ? "text-success"
                      : "text-danger"
                  }
                  style={{ fontWeight: 700 }}
                >
                  {(activePoint.quote.change ?? 0) >= 0 ? "▲ +" : "▼ "}
                  {activePoint.quote.change?.toFixed(2)} (
                  {activePoint.quote.changePercent?.toFixed(2)}%)
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <button
                  className={`vision-modal-refresh-btn ${refreshing ? "is-refreshing" : ""} ${justRefreshed ? "is-refreshed" : ""}`}
                  onClick={() => void fetchLiveQuotes(true)}
                  type="button"
                  aria-label={refreshing ? "Refreshing live quote and depth" : "Refresh live quote and depth"}
                  title={
                    refreshing
                      ? "Refreshing live quote & depth…"
                      : justRefreshed
                        ? "Depth updated successfully!"
                        : "Refresh live quote and depth"
                  }
                  disabled={refreshing}
                >
                  <svg
                    className={`vision-refresh-svg ${refreshing ? "vision-spin" : ""}`}
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                    <polyline points="21 3 21 8 16 8" />
                  </svg>
                  <span>
                    {refreshing
                      ? "Refreshing…"
                      : justRefreshed
                        ? "Updated"
                        : "Refresh"}
                  </span>
                </button>
                <button
                  className="vision-modal-close"
                  onClick={() => setSelectedPoint(null)}
                  type="button"
                  aria-label="Close modal"
                  title="Close modal"
                >
                  ✕
                </button>
              </div>
            </div>

            {activePoint.group.toLowerCase().includes("indices") ? (
              <div>
                <p
                  className="vision-instrument-name"
                  style={{ marginBottom: "1rem", lineHeight: "1.5" }}
                >
                  <strong>Benchmark Index:</strong> {activePoint.label} is a
                  weighted market index computed from its constituent equities.
                  Individual order books (bids/asks), VWAP, and circuit breaker
                  limits apply to traded stocks and derivatives, not to spot
                  index levels.
                </p>

                <div className="vision-circuits-row vision-grid-4">
                  <div className="vision-circuit-item">
                    <dt title="Day Open">Day Open</dt>
                    <dd title={formatPrice(activePoint.quote.open, "INR")}>
                      {formatPrice(activePoint.quote.open, "INR")}
                    </dd>
                  </div>
                  <div className="vision-circuit-item">
                    <dt title="Day High">Day High</dt>
                    <dd className="text-success" title={formatPrice(activePoint.quote.high, "INR")}>
                      {formatPrice(activePoint.quote.high, "INR")}
                    </dd>
                  </div>
                  <div className="vision-circuit-item">
                    <dt title="Day Low">Day Low</dt>
                    <dd className="text-danger" title={formatPrice(activePoint.quote.low, "INR")}>
                      {formatPrice(activePoint.quote.low, "INR")}
                    </dd>
                  </div>
                  <div className="vision-circuit-item">
                    <dt title="Previous Close">Previous Close</dt>
                    <dd title={formatPrice(activePoint.quote.previousClose, "INR")}>
                      {formatPrice(activePoint.quote.previousClose, "INR")}
                    </dd>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {(activePoint.group.toLowerCase().includes("futures") ||
                  activePoint.group.toLowerCase().includes("options") ||
                  activePoint.group.toLowerCase().includes("commodities")) ? (
                  <>
                    {/* Row 1: Derivatives Metrics (Open Interest, Extrema, Lot & Expiry) */}
                    <div className="vision-circuits-row vision-grid-5">
                      <div className="vision-circuit-item">
                        <dt title="Open Interest (OI)">Open Interest (OI)</dt>
                        <dd style={{ color: "#38bdf8" }} title={formatNumber(activePoint.quote.oi)}>
                          {activePoint.quote.oi !== null && activePoint.quote.oi !== undefined
                            ? formatNumber(activePoint.quote.oi)
                            : "—"}
                        </dd>
                      </div>
                      <div className="vision-circuit-item">
                        <dt title="OI Day High">OI Day High</dt>
                        <dd className="text-success" title={formatNumber(activePoint.quote.oiDayHigh)}>
                          {activePoint.quote.oiDayHigh !== null && activePoint.quote.oiDayHigh !== undefined
                            ? formatNumber(activePoint.quote.oiDayHigh)
                            : "—"}
                        </dd>
                      </div>
                      <div className="vision-circuit-item">
                        <dt title="OI Day Low">OI Day Low</dt>
                        <dd className="text-danger" title={formatNumber(activePoint.quote.oiDayLow)}>
                          {activePoint.quote.oiDayLow !== null && activePoint.quote.oiDayLow !== undefined
                            ? formatNumber(activePoint.quote.oiDayLow)
                            : "—"}
                        </dd>
                      </div>
                      <div className="vision-circuit-item">
                        <dt title="Lot Size">Lot Size</dt>
                        <dd title={activePoint.lotSize ? `${activePoint.lotSize} units` : "—"}>
                          {activePoint.lotSize ? `${activePoint.lotSize} units` : "—"}
                          {/* {activePoint.tickSize && (
                            <span className="vision-inline-tick" title="Minimum Price Tick">
                              (Tick: ₹{activePoint.tickSize})
                            </span>
                          )} */}
                        </dd>
                      </div>
                      <div className="vision-circuit-item">
                        <dt title="Expiry Date">Expiry Date</dt>
                        <dd style={{ color: "#c084fc" }} title={activePoint.expiry || "—"}>
                          {activePoint.expiry || "—"}
                        </dd>
                      </div>
                    </div>

                    {/* Row 2: Circuit Limits & VWAP */}
                    <div className="vision-circuits-row vision-grid-3">
                      <div className="vision-circuit-item">
                        <dt title="Lower Circuit">Lower Circuit</dt>
                        <dd className="text-danger" title={formatPrice(activePoint.quote.lowerCircuit, "INR")}>
                          {formatPrice(activePoint.quote.lowerCircuit, "INR")}
                        </dd>
                      </div>
                      <div className="vision-circuit-item">
                        <dt title="Upper Circuit">Upper Circuit</dt>
                        <dd className="text-success" title={formatPrice(activePoint.quote.upperCircuit, "INR")}>
                          {formatPrice(activePoint.quote.upperCircuit, "INR")}
                        </dd>
                      </div>
                      <div className="vision-circuit-item">
                        <dt title="Average Price (VWAP)">Average Price (VWAP)</dt>
                        <dd title={formatPrice(activePoint.quote.averagePrice, "INR")}>
                          {formatPrice(activePoint.quote.averagePrice, "INR")}
                        </dd>
                      </div>
                    </div>

                    {/* Row 3: Extended Contract Specifications (OI Change, LTQ) */}
                    {((activePoint.quote.oiChange !== null && activePoint.quote.oiChange !== undefined) ||
                      (activePoint.quote.lastQuantity !== null && activePoint.quote.lastQuantity !== undefined && activePoint.quote.lastQuantity > 0)) && (
                      <div className="vision-circuits-row vision-grid-sub">
                        {activePoint.quote.oiChange !== null && activePoint.quote.oiChange !== undefined && (
                          <div className="vision-circuit-item">
                            <dt title="OI Change">OI Change</dt>
                            <dd
                              className={activePoint.quote.oiChange >= 0 ? "text-success" : "text-danger"}
                              title={`${activePoint.quote.oiChange >= 0 ? "+" : ""}${formatNumber(activePoint.quote.oiChange)}`}
                            >
                              {activePoint.quote.oiChange >= 0 ? "+" : ""}{formatNumber(activePoint.quote.oiChange)}
                              {activePoint.quote.oiChangePercent !== null && activePoint.quote.oiChangePercent !== undefined
                                ? ` (${activePoint.quote.oiChangePercent >= 0 ? "+" : ""}${activePoint.quote.oiChangePercent.toFixed(1)}%)`
                                : ""}
                            </dd>
                          </div>
                        )}
                        {activePoint.quote.lastQuantity !== null && activePoint.quote.lastQuantity !== undefined && activePoint.quote.lastQuantity > 0 && (
                          <div className="vision-circuit-item">
                            <dt title="Last Trade Qty (LTQ)">Last Trade Qty (LTQ)</dt>
                            <dd title={`${formatNumber(activePoint.quote.lastQuantity)} units`}>
                              {formatNumber(activePoint.quote.lastQuantity)} units
                            </dd>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Equities & Bonds: Row 1 Circuit Limits & VWAP */}
                    <div className="vision-circuits-row vision-grid-3">
                      <div className="vision-circuit-item">
                        <dt title="Lower Circuit">Lower Circuit</dt>
                        <dd className="text-danger" title={formatPrice(activePoint.quote.lowerCircuit, "INR")}>
                          {formatPrice(activePoint.quote.lowerCircuit, "INR")}
                        </dd>
                      </div>
                      <div className="vision-circuit-item">
                        <dt title="Upper Circuit">Upper Circuit</dt>
                        <dd className="text-success" title={formatPrice(activePoint.quote.upperCircuit, "INR")}>
                          {formatPrice(activePoint.quote.upperCircuit, "INR")}
                        </dd>
                      </div>
                      <div className="vision-circuit-item">
                        <dt title="Average Price (VWAP)">Average Price (VWAP)</dt>
                        <dd title={formatPrice(activePoint.quote.averagePrice, "INR")}>
                          {formatPrice(activePoint.quote.averagePrice, "INR")}
                        </dd>
                      </div>
                    </div>

                    {/* Equities & Bonds: Row 2 52-Week Range & Last Trade Metrics */}
                    {((activePoint.quote.yearlyLow !== null && activePoint.quote.yearlyLow !== undefined) ||
                      (activePoint.quote.yearlyHigh !== null && activePoint.quote.yearlyHigh !== undefined) ||
                      (activePoint.quote.lastQuantity !== null && activePoint.quote.lastQuantity !== undefined && activePoint.quote.lastQuantity > 0)) && (
                      <div className="vision-circuits-row vision-grid-sub">
                        {activePoint.quote.yearlyLow !== null && activePoint.quote.yearlyLow !== undefined && (
                          <div className="vision-circuit-item">
                            <dt title="52-Week Low">52-Week Low</dt>
                            <dd className="text-danger" title={formatPrice(activePoint.quote.yearlyLow, "INR")}>
                              {formatPrice(activePoint.quote.yearlyLow, "INR")}
                            </dd>
                          </div>
                        )}
                        {activePoint.quote.yearlyHigh !== null && activePoint.quote.yearlyHigh !== undefined && (
                          <div className="vision-circuit-item">
                            <dt title="52-Week High">52-Week High</dt>
                            <dd className="text-success" title={formatPrice(activePoint.quote.yearlyHigh, "INR")}>
                              {formatPrice(activePoint.quote.yearlyHigh, "INR")}
                            </dd>
                          </div>
                        )}
                        {activePoint.quote.lastQuantity !== null && activePoint.quote.lastQuantity !== undefined && activePoint.quote.lastQuantity > 0 && (
                          <div className="vision-circuit-item">
                            <dt title="Last Trade Qty (LTQ)">Last Trade Qty (LTQ)</dt>
                            <dd title={`${formatNumber(activePoint.quote.lastQuantity)} units`}>
                              {formatNumber(activePoint.quote.lastQuantity)} units
                            </dd>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

{/* 5-Level Bid/Ask Order Book */}
                <div className="vision-depth-grid">
                  {/* Buy Bids */}
                  <div className="vision-depth-col buy">
                    <div className="vision-depth-col-title">
                      <span>Top 5 Bids (Buyers)</span>
                      {totalBidsQty > 0 && (
                        <span className="vision-depth-total">
                          Total: {formatNumber(totalBidsQty)}
                        </span>
                      )}
                    </div>
                    <table className="vision-depth-table">
                      <thead>
                        <tr>
                          <th scope="col">Orders</th>
                          <th scope="col">Qty</th>
                          <th scope="col">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeBids.length > 0 ? (
                          activeBids.map((item, idx) => (
                            <tr key={`buy-${idx}`}>
                              <td>
                                {typeof item.orders === "number" && item.orders > 0
                                  ? item.orders
                                  : "—"}
                              </td>
                              <td>
                                {typeof item.quantity === "number" && item.quantity > 0
                                  ? formatNumber(item.quantity)
                                  : "—"}
                              </td>
                              <td style={{ fontWeight: 700 }}>
                                {typeof item.price === "number" && item.price > 0
                                  ? formatPrice(item.price, "INR")
                                  : "—"}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td
                              colSpan={3}
                              style={{
                                textAlign: "center",
                                padding: "1.25rem 0.5rem",
                                color: "var(--muted, #94a0b2)",
                              }}
                            >
                              No active bids in queue
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Sell Asks */}
                  <div className="vision-depth-col sell">
                    <div className="vision-depth-col-title">
                      <span>Top 5 Asks (Sellers)</span>
                      {totalAsksQty > 0 && (
                        <span className="vision-depth-total">
                          Total: {formatNumber(totalAsksQty)}
                        </span>
                      )}
                    </div>
                    <table className="vision-depth-table">
                      <thead>
                        <tr>
                          <th scope="col">Price</th>
                          <th scope="col">Qty</th>
                          <th scope="col">Orders</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeAsks.length > 0 ? (
                          activeAsks.map((item, idx) => (
                            <tr key={`sell-${idx}`}>
                              <td style={{ fontWeight: 700 }}>
                                {typeof item.price === "number" && item.price > 0
                                  ? formatPrice(item.price, "INR")
                                  : "—"}
                              </td>
                              <td>
                                {typeof item.quantity === "number" && item.quantity > 0
                                  ? formatNumber(item.quantity)
                                  : "—"}
                              </td>
                              <td>
                                {typeof item.orders === "number" && item.orders > 0
                                  ? item.orders
                                  : "—"}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td
                              colSpan={3}
                              style={{
                                textAlign: "center",
                                padding: "1.25rem 0.5rem",
                                color: "var(--muted, #94a0b2)",
                              }}
                            >
                              No active asks in queue
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            <div
              className="vision-modal-footer-info"
              style={{
                marginTop: "1.25rem",
                paddingTop: "0.875rem",
                borderTop: "0.0625rem solid var(--vision-border, rgba(255, 255, 255, 0.08))",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.625rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    color: "var(--muted, #94a0b2)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    fontWeight: 600,
                  }}
                >
                  Market Status:
                </span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: marketStatus.isOpen ? "#10b981" : "#eab308",
                  }}
                  title={marketStatus.detail}
                >
                  {marketStatus.label}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                {activePoint.quote.lastQuantity !== null && activePoint.quote.lastQuantity !== undefined && activePoint.quote.lastQuantity > 0 && (
                  <span
                    className="vision-instrument-name"
                    style={{ fontSize: "0.75rem" }}
                    title="Last executed trade quantity on exchange (LTQ)"
                  >
                    LTQ: <strong>{formatNumber(activePoint.quote.lastQuantity)}</strong>
                  </span>
                )}
                {activePoint.tickSize && (
                  <span
                    className="vision-instrument-name"
                    style={{ fontSize: "0.75rem", fontWeight: 500 }}
                    title="Minimum exchange price movement tick size"
                  >
                    <span>Tick Size</span>:{" "}
                    <strong style={{ fontWeight: 600 }}>₹{activePoint.tickSize}</strong>
                  </span>
                )}
                {activePoint.quote.averagePrice && (
                  <span
                    className="vision-instrument-name"
                    style={{ fontSize: "0.75rem" }}
                    title="Volume-Weighted Average Traded Price (VWAP)"
                  >
                    VWAP: <strong>{formatPrice(activePoint.quote.averagePrice, "INR")}</strong>
                  </span>
                )}
                {activePoint.quote.lastTradeTimeMs && (
                  <span
                    className="vision-instrument-name"
                    style={{ fontSize: "0.75rem" }}
                    title="Last executed trade timestamp on exchange"
                  >
                    Last Trade:{" "}
                    <strong suppressHydrationWarning>{formatTime(activePoint.quote.lastTradeTimeMs)}</strong>
                  </span>
                )}
                <span
                  className="vision-instrument-name"
                  style={{ fontSize: "0.75rem" }}
                  title={
                    marketStatus.isOpen
                      ? "Timestamp when quote was received"
                      : "Timestamp of latest quote snapshot (EOD close)"
                  }
                >
                  {marketStatus.isOpen ? "Last Updated: " : "Feed Updated: "}
                  <strong suppressHydrationWarning>{formatTime(activePoint.quote.observedAtMs)}</strong>
                  {!marketStatus.isOpen && " (EOD)"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated IPO Calculator Sidebar Drawer (Slides in from right, does not affect card grid rows) */}
      {activeCalculatorIpo && (
        <div
          className="vision-ipo-sidebar-backdrop"
          onClick={() => setActiveCalculatorIpoId(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Retail Lot Calculator Sidebar"
        >
          <aside
            className="vision-ipo-sidebar-drawer"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="vision-ipo-sidebar-header">
              <div className="vision-ipo-sidebar-title-group">
                <div className="vision-ipo-sidebar-tag-row">
                  <span
                    className={`vision-ipo-badge ${activeCalculatorIpo.status === "open" ? "badge-open" : "badge-upcoming"}`}
                  >
                    {activeCalculatorIpo.status === "open"
                      ? "● OPEN FOR BIDDING"
                      : "UPCOMING"}
                  </span>
                  <span
                    className={`vision-ipo-type ${activeCalculatorIpo.issue_type === "regular" ? "type-mainboard" : "type-sme"}`}
                  >
                    {activeCalculatorIpo.issue_type === "regular"
                      ? "MAINBOARD"
                      : "SME"}
                  </span>
                  {activeCalculatorIpo.listing_exchange && (
                    <span className="vision-ipo-exchange-pill">
                      {activeCalculatorIpo.listing_exchange}
                    </span>
                  )}
                  {activeTimeline.text && (
                    <span className={`vision-ipo-timeline-badge ${activeTimeline.className}`}>
                      {activeTimeline.text}
                    </span>
                  )}
                </div>
                <h3 className="vision-ipo-sidebar-title">
                  {activeCalculatorIpo.name}
                </h3>
                <div className="vision-ipo-sidebar-subline">
                  {activeCalculatorIpo.symbol && (
                    <span className="vision-ipo-sidebar-symbol">
                      {activeCalculatorIpo.symbol}
                    </span>
                  )}
                  <span className="vision-ipo-sidebar-industry">
                    {activeCalculatorIpo.industry ||
                      (activeCalculatorIpo.issue_type === "regular"
                        ? "General Commercial"
                        : "Emerging Enterprise")}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="vision-ipo-sidebar-close-btn"
                onClick={() => setActiveCalculatorIpoId(null)}
                aria-label="Close Calculator"
                title="Close Calculator (Esc)"
              >
                <span className="close-btn-icon" aria-hidden="true">✕</span>
              </button>
            </div>

            <div className="vision-ipo-sidebar-content">
              {/* Snapshot Stats Grid */}
              <div className="vision-ipo-sidebar-stats-grid">
                <div className="vision-ipo-sidebar-stat-card">
                  <span className="vision-sidebar-stat-label">Price Band</span>
                  <span className="vision-sidebar-stat-val">
                    {activeCalculatorIpo.minimum_price && activeCalculatorIpo.maximum_price
                      ? `₹${activeCalculatorIpo.minimum_price} – ₹${activeCalculatorIpo.maximum_price}`
                      : activeCalculatorIpo.maximum_price
                        ? `₹${activeCalculatorIpo.maximum_price}`
                        : "Price TBD"}
                  </span>
                  <span className="vision-sidebar-stat-note">Per Equity Share</span>
                </div>
                <div className="vision-ipo-sidebar-stat-card">
                  <span className="vision-sidebar-stat-label">Lot Size</span>
                  <span className="vision-sidebar-stat-val">
                    {activeLotSize ? `${activeLotSize} Shares` : "TBD"}
                  </span>
                  <span className="vision-sidebar-stat-note">Minimum 1 Lot</span>
                </div>
                <div className="vision-ipo-sidebar-stat-card">
                  <span className="vision-sidebar-stat-label">Min Investment</span>
                  <span className="vision-sidebar-stat-val green">
                    {activeMinInvest > 0 ? `₹${activeMinInvest.toLocaleString("en-IN")}` : "TBD"}
                  </span>
                  <span className="vision-sidebar-stat-note">1 Lot at Cut-off</span>
                </div>
                <div className="vision-ipo-sidebar-stat-card">
                  <span className="vision-sidebar-stat-label">Issue Size</span>
                  <span className="vision-sidebar-stat-val">
                    {activeCalculatorIpo.issue_size
                      ? `₹${formatNumber(activeCalculatorIpo.issue_size)}`
                      : "Size TBD"}
                  </span>
                  <span className="vision-sidebar-stat-note">Total Offer</span>
                </div>
              </div>

              {/* Calculator Main Section */}
              <section className="vision-sidebar-calc-card">
                <div className="vision-sidebar-calc-head">
                  <h4 className="vision-sidebar-calc-heading">
                    <span className="calc-heading-icon" aria-hidden="true">🧮</span>
                    <span>Retail Application Calculator</span>
                  </h4>
                </div>

                {/* Lots Stepper & Quick Pills */}
                <div className="vision-sidebar-controls-box">
                  <div className="vision-calc-controls">
                    <div className="vision-sidebar-stepper-row">
                      <span className="vision-calc-label">Select Lots:</span>
                      <div className="vision-calc-stepper">
                        <button
                          type="button"
                          className="vision-calc-step-btn"
                          onClick={() =>
                            setIpoCalcLots((prev) => ({
                              ...prev,
                              [activeCalculatorIpo.id]: Math.max(1, activeLots - 1),
                            }))
                          }
                          disabled={activeLots <= 1}
                          aria-label="Decrease lots"
                        >
                          &minus;
                        </button>
                        <span className="vision-calc-val">{activeLots}</span>
                        <button
                          type="button"
                          className="vision-calc-step-btn"
                          onClick={() =>
                            setIpoCalcLots((prev) => ({
                              ...prev,
                              [activeCalculatorIpo.id]: activeLots + 1,
                            }))
                          }
                          aria-label="Increase lots"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="vision-calc-quick-pills">
                      {[1, 2, 3, 5].map((l) => (
                        <button
                          key={l}
                          type="button"
                          className={`vision-calc-quick-pill ${activeLots === l ? "active" : ""}`}
                          onClick={() =>
                            setIpoCalcLots((prev) => ({
                              ...prev,
                              [activeCalculatorIpo.id]: l,
                            }))
                          }
                        >
                          {l} Lot{l > 1 ? "s" : ""}
                        </button>
                      ))}
                      {activeMaxRetailLots > 1 && (
                        <button
                          type="button"
                          className={`vision-calc-quick-pill ${activeLots === activeMaxRetailLots ? "active" : ""}`}
                          onClick={() =>
                            setIpoCalcLots((prev) => ({
                              ...prev,
                              [activeCalculatorIpo.id]: activeMaxRetailLots,
                            }))
                          }
                          title="Maximum retail application limit (up to ₹2,00,000)"
                        >
                          Max Retail ({activeMaxRetailLots} Lots)
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Calculation Summary Card */}
                <div className="vision-sidebar-results-card">
                  <div className="vision-sidebar-results-grid">
                    <div className="vision-sidebar-result-cell">
                      <span className="vision-sidebar-res-label">Total Shares</span>
                      <strong className="vision-sidebar-res-val">
                        {activeTotalShares.toLocaleString("en-IN")} Shares
                      </strong>
                    </div>
                    <div className="vision-sidebar-result-cell">
                      <span className="vision-sidebar-res-label">Bid Price</span>
                      <strong className="vision-sidebar-res-val">
                        ₹{activeMaxPrice} <span className="cutoff-note">(Cut-off)</span>
                      </strong>
                    </div>
                  </div>

                  {/* Redesigned Premier Mandate Card */}
                  <div className="vision-sidebar-mandate-card">
                    <div className="vision-mandate-card-header">
                      <div className="vision-mandate-tag-row">
                        <span className="vision-mandate-badge">UPI 2.0 ASBA LIEN</span>
                        <span
                          className={`vision-quota-chip ${activeIsRetailAllowed ? "retail" : "hni"}`}
                        >
                          {activeIsRetailAllowed
                            ? "Retail Quota (≤ ₹2L)"
                            : "sHNI Quota (> ₹2L)"}
                        </span>
                      </div>
                      <span className="vision-mandate-label">
                        Total Mandate Amount:
                      </span>
                    </div>

                    <div className="vision-mandate-amount-row">
                      <div className="vision-mandate-value-wrap">
                        <span className="vision-mandate-value">
                          ₹{activeTotalBidAmount.toLocaleString("en-IN")}
                        </span>
                        <span className="vision-mandate-tier-chip">
                          {activeLots} Lot{activeLots > 1 ? "s" : ""} &bull;{" "}
                          {activeTotalShares.toLocaleString("en-IN")} Shares @ ₹
                          {activeMaxPrice}
                        </span>
                      </div>
                    </div>

                    {/* Copy Suite Toolbar */}
                    <div className="vision-mandate-copy-toolbar">
                      <button
                        type="button"
                        className={`vision-mandate-copy-btn ${copiedMandateType === "numeric" ? "is-copied" : "is-primary"}`}
                        onClick={() => handleCopyMandateNumeric(activeTotalBidAmount)}
                        title="Copy plain number (e.g. 14880) without currency symbol or commas for bank NetBanking ASBA & broker forms"
                      >
                        <span className="btn-icon">
                          {copiedMandateType === "numeric" ? "✓" : "🔢"}
                        </span>
                        <span>
                          {copiedMandateType === "numeric"
                            ? `Copied: ${activeTotalBidAmount}`
                            : `Copy Clean (${activeTotalBidAmount})`}
                        </span>
                      </button>

                      <button
                        type="button"
                        className={`vision-mandate-copy-btn ${copiedMandateType === "formatted" ? "is-copied" : ""}`}
                        onClick={() => handleCopyMandateFormatted(activeTotalBidAmount)}
                        title="Copy formatted currency string (₹14,880)"
                      >
                        <span className="btn-icon">
                          {copiedMandateType === "formatted" ? "✓" : "₹"}
                        </span>
                        <span>
                          {copiedMandateType === "formatted"
                            ? "Copied ₹"
                            : "Copy Formatted"}
                        </span>
                      </button>

                      <button
                        type="button"
                        className={`vision-mandate-copy-btn ${copiedMandateType === "summary" ? "is-copied" : ""}`}
                        onClick={() =>
                          handleCopyBidSummary(
                            activeCalculatorIpo,
                            activeLots,
                            activeLotSize || 1,
                            activeMaxPrice,
                            activeTotalBidAmount,
                            activeIsRetailAllowed,
                          )
                        }
                        title="Copy structured application summary for WhatsApp, Notes, or multi-account bidding"
                      >
                        <span className="btn-icon">
                          {copiedMandateType === "summary" ? "✓" : "📋"}
                        </span>
                        <span>
                          {copiedMandateType === "summary"
                            ? "Copied Summary!"
                            : "Copy Summary"}
                        </span>
                      </button>

                      <button
                        type="button"
                        className={`vision-mandate-asba-btn ${showAsbaHelper ? "active" : ""}`}
                        onClick={() => setShowAsbaHelper((prev) => !prev)}
                        title="Toggle Bank NetBanking ASBA Form Helper (SBI, HDFC, ICICI, etc.)"
                      >
                        <span>🏛️ ASBA Form Helper</span>
                        <span className="helper-arrow">
                          {showAsbaHelper ? "▲" : "▼"}
                        </span>
                      </button>
                    </div>

                    {/* Feedback Toast */}
                    {copyFeedbackMessage && (
                      <div
                        className="vision-mandate-feedback-toast"
                        role="status"
                        aria-live="polite"
                      >
                        <span className="toast-icon">✓</span>
                        <span>{copyFeedbackMessage}</span>
                      </div>
                    )}

                    {/* NetBanking ASBA Form Helper Drawer/Accordion */}
                    {showAsbaHelper && (
                      <div className="vision-asba-helper-box">
                        <div className="vision-asba-helper-head">
                          <span className="helper-title">
                            Bank NetBanking ASBA Form Fields
                          </span>
                          <span className="helper-desc">
                            Click any field to copy individual values into SBI / HDFC / ICICI NetBanking
                          </span>
                        </div>
                        <div className="vision-asba-helper-grid">
                          <div className="vision-asba-field">
                            <span className="asba-field-label">Symbol / Issue:</span>
                            <div className="asba-field-val-wrap">
                              <code>
                                {activeCalculatorIpo.symbol ||
                                  activeCalculatorIpo.name.slice(0, 16)}
                              </code>
                              <button
                                type="button"
                                className="asba-copy-mini-btn"
                                onClick={() =>
                                  copyToClipboard(
                                    activeCalculatorIpo.symbol ||
                                      activeCalculatorIpo.name,
                                    "symbol",
                                    "Copied Issue Name/Symbol",
                                  )
                                }
                                title="Copy Symbol"
                              >
                                {copiedMandateType === "symbol" ? "✓" : "Copy"}
                              </button>
                            </div>
                          </div>

                          <div className="vision-asba-field">
                            <span className="asba-field-label">Quantity / Shares:</span>
                            <div className="asba-field-val-wrap">
                              <code>{activeTotalShares}</code>
                              <button
                                type="button"
                                className="asba-copy-mini-btn"
                                onClick={() =>
                                  copyToClipboard(
                                    String(activeTotalShares),
                                    "shares",
                                    `Copied Shares: ${activeTotalShares}`,
                                  )
                                }
                                title="Copy Total Shares"
                              >
                                {copiedMandateType === "shares" ? "✓" : "Copy"}
                              </button>
                            </div>
                          </div>

                          <div className="vision-asba-field">
                            <span className="asba-field-label">Bid Price:</span>
                            <div className="asba-field-val-wrap">
                              <code>₹{activeMaxPrice} (Cut-off)</code>
                              <button
                                type="button"
                                className="asba-copy-mini-btn"
                                onClick={() =>
                                  copyToClipboard(
                                    String(activeMaxPrice),
                                    "price",
                                    `Copied Bid Price: ${activeMaxPrice}`,
                                  )
                                }
                                title="Copy Bid Price"
                              >
                                {copiedMandateType === "price" ? "✓" : "Copy"}
                              </button>
                            </div>
                          </div>

                          <div className="vision-asba-field highlight">
                            <span className="asba-field-label">Total Amount:</span>
                            <div className="asba-field-val-wrap">
                              <code>{activeTotalBidAmount}</code>
                              <button
                                type="button"
                                className="asba-copy-mini-btn highlight"
                                onClick={() =>
                                  handleCopyMandateNumeric(activeTotalBidAmount)
                                }
                                title="Copy Raw Mandate Amount"
                              >
                                {copiedMandateType === "numeric" ? "✓" : "Copy"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Category Pill */}
                  <div className="vision-sidebar-category-container">
                    {activeIsRetailAllowed ? (
                      <div className="vision-calc-badge retail">
                        <span className="badge-icon">✓</span>
                        <div className="badge-copy">
                          <strong>Retail Category (RII)</strong>
                          <span>Amount &le; ₹2,00,000</span>
                        </div>
                      </div>
                    ) : (
                      <div className="vision-calc-badge hni">
                        <span className="badge-icon">⚡</span>
                        <div className="badge-copy">
                          <strong>Small HNI (sHNI / NII)</strong>
                          <span>Amount &gt; ₹2,00,000 (up to ₹10,00,000)</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Application Tier Reference Table */}
              <div className="vision-sidebar-tier-section">
                <div className="vision-sidebar-section-title">
                  <span>Application Tier Reference</span>
                  <span className="section-hint">Click row to select</span>
                </div>
                <div className="vision-sidebar-table-wrap">
                  <table className="vision-sidebar-tier-table" role="presentation">
                    <thead>
                      <tr>
                        <th>Lots</th>
                        <th>Shares</th>
                        <th>Amount</th>
                        <th>Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[1, 2, 3, 5, activeMaxRetailLots]
                        .filter((v, i, a) => a.indexOf(v) === i && v > 0)
                        .map((tierLot) => {
                          const tierShares = tierLot * (activeLotSize || 1);
                          const tierAmount = tierShares * activeMaxPrice;
                          const isRet = tierAmount <= 200000;
                          return (
                            <tr
                              key={tierLot}
                              className={activeLots === tierLot ? "is-selected-tier" : ""}
                              onClick={() =>
                                setIpoCalcLots((prev) => ({
                                  ...prev,
                                  [activeCalculatorIpo.id]: tierLot,
                                }))
                              }
                            >
                              <td>
                                <strong>
                                  {tierLot} {tierLot === 1 ? "Lot" : "Lots"}
                                </strong>
                              </td>
                              <td>{tierShares.toLocaleString("en-IN")}</td>
                              <td className="amount-col">
                                ₹{tierAmount.toLocaleString("en-IN")}
                              </td>
                              <td>
                                <span className={`vision-tier-badge ${isRet ? "ret" : "hni"}`}>
                                  {isRet ? "Retail" : "sHNI"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
