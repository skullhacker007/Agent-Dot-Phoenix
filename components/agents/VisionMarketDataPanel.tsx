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
  useSyncExternalStore,
} from "react";
import {
  pipelineErrorResponseSchema,
  pipelineFetchResponseSchema,
} from "../../server/market-data/types";
import type {
  MarketDataPoint,
  PipelineSnapshot,
} from "../../server/market-data/types";
import "./VisionMarketDataPanel.css";

const PIPELINE_ID = "indian-equities";
const AUTO_REFRESH_INTERVAL_MS = 6000;

function subscribeClock(callback: () => void): () => void {
  const timer = setInterval(callback, 1000);
  return () => clearInterval(timer);
}

function getClockSnapshot(): number {
  return Math.floor(Date.now() / 1000);
}

function getServerClockSnapshot(): number | null {
  return null;
}

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
  | "futures"
  | "options"
  | "commodities"
  | "bonds"
  | "gainers"
  | "losers";

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
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState<string>("");
  const [selectedPoint, setSelectedPoint] = useState<MarketDataPoint | null>(
    null,
  );
  const [pageSize, setPageSize] = useState<number>(15);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const nowSec = useSyncExternalStore(
    subscribeClock,
    getClockSnapshot,
    getServerClockSnapshot,
  );
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

  const fetchLiveQuotes = useCallback(async () => {
    setRefreshing(true);
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

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

  const dataPoints = useMemo<MarketDataPoint[]>(
    () => snapshot?.dataPoints ?? [],
    [snapshot],
  );

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
  }, [dataPoints, filter, search]);

  const handleFilterChange = (newFilter: FilterType) => {
    setFilter(newFilter);
    setCurrentPage(1);
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
      dataPoints.find((p) => p.instrument === selectedPoint.instrument) ??
      selectedPoint
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
            className="vision-btn"
            disabled={loading || refreshing}
            onClick={() => void fetchLiveQuotes()}
            type="button"
          >
            {refreshing ? "Refreshing…" : "Refresh Now"}
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

        <div className="vision-search-box">
          <input
            className="vision-search-input"
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search symbol or name…"
            type="search"
            value={search}
          />
        </div>
      </div>

      {/* Dynamic Stocks Analysis Table */}
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
                  className="vision-modal-close"
                  onClick={() => void fetchLiveQuotes()}
                  type="button"
                  aria-label="Refresh depth"
                  title="Refresh live quote and depth"
                  disabled={refreshing}
                >
                  ↻
                </button>
                <button
                  className="vision-modal-close"
                  onClick={() => setSelectedPoint(null)}
                  type="button"
                  aria-label="Close modal"
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
                        <dt title="Contract Lot Size">Contract Lot Size</dt>
                        <dd title={activePoint.lotSize ? `${activePoint.lotSize} units` : "—"}>
                          {activePoint.lotSize ? `${activePoint.lotSize} units` : "—"}
                          {activePoint.tickSize && (
                            <span className="vision-inline-tick" title="Minimum Price Tick">
                              (Tick: ₹{activePoint.tickSize})
                            </span>
                          )}
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

                    {/* Row 3: Extended Contract Specifications (OI Change, Strike Price, LTQ) */}
                    {((activePoint.quote.oiChange !== null && activePoint.quote.oiChange !== undefined) ||
                      activePoint.strikePrice ||
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
                        {activePoint.strikePrice && (
                          <div className="vision-circuit-item">
                            <dt title="Strike Price">Strike Price</dt>
                            <dd title={formatPrice(activePoint.strikePrice, "INR")}>
                              {formatPrice(activePoint.strikePrice, "INR")}
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
    </section>
  );
}
