"use client";

/**
 * Dynamic Upstox Market Data & Financial Analytics Panel for Vision Agent.
 *
 * All data is dynamically streamed and fetched directly from Upstox API v2.
 * No static, mock, or hardcoded instrument data is used.
 * Credentials remain strictly server-side.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function formatTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString();
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

export type MarketStatus = {
  isOpen: boolean;
  label: string;
  detail: string;
};

export const DEFAULT_MARKET_STATUS: MarketStatus = {
  isOpen: false,
  label: "Market Closed · EOD",
  detail: "NSE/BSE Indian Market Data",
};

export function getIndianMarketStatus(referenceDate?: Date): MarketStatus {
  try {
    const now = referenceDate ?? new Date();
    const kolkataStr = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const kolkataDate = new Date(kolkataStr);
    const day = kolkataDate.getDay(); // 0 is Sunday, 6 is Saturday
    const hours = kolkataDate.getHours();
    const minutes = kolkataDate.getMinutes();
    const currentMinutes = hours * 60 + minutes;

    const isWeekday = day >= 1 && day <= 5;
    // NSE/BSE regular trading: 9:15 AM (555 min) to 3:30 PM (930 min) IST
    const isMarketHours = currentMinutes >= 555 && currentMinutes < 930;

    if (isWeekday && isMarketHours) {
      return {
        isOpen: true,
        label: "Live Market",
        detail: "NSE/BSE Regular Trading (9:15 AM – 3:30 PM IST)",
      };
    }

    if (!isWeekday) {
      return {
        isOpen: false,
        label: "Market Closed (Weekend)",
        detail: "Exchange closed. Showing EOD final settlement quotes.",
      };
    }

    if (currentMinutes < 555) {
      return {
        isOpen: false,
        label: "Pre-Market / Closed",
        detail: "Regular trading opens at 9:15 AM IST. Showing previous session EOD data.",
      };
    }

    return {
      isOpen: false,
      label: "Market Closed · EOD Final",
      detail: "Regular market closed at 3:30 PM IST. Showing latest EOD closing data.",
    };
  } catch {
    return {
      isOpen: false,
      label: "EOD Data",
      detail: "Showing latest observed market quotes.",
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

  const [marketStatus, setMarketStatus] =
    useState<MarketStatus>(DEFAULT_MARKET_STATUS);

  useEffect(() => {
    setMarketStatus(getIndianMarketStatus());
  }, [snapshot]);

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
          ? failed.data.error.message
          : `Upstox request failed with status ${response.status}.`;
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
          ? err.message
          : "Unable to reach Upstox market data service.",
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
              ? failed.data.error.message
              : `Upstox request failed with status ${response.status}.`,
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
            ? err.message
            : "Unable to reach Upstox market data service.",
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
    for (const p of dataPoints) {
      const g = p.group.toLowerCase();
      if (g.includes("indices")) indices++;
      else if (g.includes("futures")) futures++;
      else if (g.includes("options")) options++;
      else if (g.includes("commodities")) commodities++;
      else stocks++;
    }
    return { stocks, indices, futures, options, commodities };
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
      const isStock = !isIndex && !isFutures && !isOptions && !isCommodities;
      const changePct = point.quote.changePercent ?? 0;

      if (filter === "stocks" && !isStock) return false;
      if (filter === "indices" && !isIndex) return false;
      if (filter === "futures" && !isFutures) return false;
      if (filter === "options" && !isOptions) return false;
      if (filter === "commodities" && !isCommodities) return false;
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
      aria-label="Upstox Dynamic Stocks Analysis"
    >
      {/* Header */}
      <header className="vision-market-data-header">
        <div>
          <p className="agent-team-eyebrow">
            UPSTOX REAL-TIME MARKET DATA · MULTI-ASSET VISION ANALYTICS
          </p>
          <h2>Indian Stocks, Derivatives & Commodities Dynamic Analysis</h2>
          <div className="vision-market-data-header-meta">
            <span className="vision-market-data-provider-tag">
              Provider: <strong>Upstox API v2 Live</strong>
            </span>
            <span className="vision-market-data-provider-tag">
              Updated (EOD):{" "}
              <strong>
                {formatTime(
                  snapshot?.status?.lastUpdatedAtMs ??
                    snapshot?.status?.lastSuccessAtMs,
                )}
              </strong>
            </span>
            {snapshot?.status?.connected && (
              marketStatus.isOpen ? (
                <span className="vision-live-indicator">
                  <span className="vision-live-dot" />
                  Live Feed
                </span>
              ) : (
                <span
                  className="vision-market-data-provider-tag"
                  style={{
                    borderColor: "rgba(234, 179, 8, 0.4)",
                    color: "#eab308",
                  }}
                  title={marketStatus.detail}
                >
                  ● {marketStatus.label}
                </span>
              )
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
          <strong>Upstox Live Feed Alert:</strong> {error}
        </div>
      )}

      {/* Loading State */}
      {loading && !snapshot && (
        <p className="vision-market-data-message" role="status">
          Connecting to Upstox API v2 and loading live quotes…
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
                          : "STOCK";

                  return (
                    <tr key={point.instrument}>
                      <td>
                        <div className="vision-instrument-cell">
                          <span className="vision-instrument-symbol">
                            {point.quote.symbol}
                            <span className="vision-instrument-tag">
                              {tagLabel}
                            </span>
                          </span>
                          <span className="vision-instrument-name">
                            {point.label}
                          </span>
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
                          <span className="vision-instrument-name">
                            VWAP:{" "}
                            {vwap
                              ? formatPrice(vwap, "INR")
                              : isIndexItem
                                ? "—"
                                : "—"}
                          </span>
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
                    style={{ textAlign: "center", padding: "32px" }}
                  >
                    {loading
                      ? "Loading live Upstox quotes…"
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

      {/* Upstox Market Depth & Circuit Limits Modal */}
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
              <div>
                <p className="agent-team-eyebrow">
                  {activePoint.group.toLowerCase().includes("indices")
                    ? "UPSTOX BENCHMARK INDEX"
                    : activePoint.group.toLowerCase().includes("futures")
                      ? "UPSTOX FUTURES MARKET DEPTH"
                      : activePoint.group.toLowerCase().includes("options")
                        ? "UPSTOX OPTIONS MARKET DEPTH"
                        : activePoint.group
                              .toLowerCase()
                              .includes("commodities")
                          ? "UPSTOX COMMODITIES MARKET DEPTH"
                          : "UPSTOX LIVE STOCK DEPTH"}
                </p>
                <h3 style={{ margin: "4px 0" }}>
                  {activePoint.quote.symbol} · {activePoint.label}
                </h3>
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
                  style={{ marginBottom: "16px", lineHeight: "1.5" }}
                >
                  <strong>Benchmark Index:</strong> {activePoint.label} is a
                  weighted market index computed from its constituent equities.
                  Individual order books (bids/asks), VWAP, and circuit breaker
                  limits apply to traded stocks and derivatives, not to spot
                  index levels.
                </p>

                <div className="vision-circuits-row">
                  <div className="vision-circuit-item">
                    <dt>Day Open</dt>
                    <dd>{formatPrice(activePoint.quote.open, "INR")}</dd>
                  </div>
                  <div className="vision-circuit-item">
                    <dt>Day High</dt>
                    <dd className="text-success">
                      {formatPrice(activePoint.quote.high, "INR")}
                    </dd>
                  </div>
                  <div className="vision-circuit-item">
                    <dt>Day Low</dt>
                    <dd className="text-danger">
                      {formatPrice(activePoint.quote.low, "INR")}
                    </dd>
                  </div>
                  <div className="vision-circuit-item">
                    <dt>Previous Close</dt>
                    <dd>
                      {formatPrice(activePoint.quote.previousClose, "INR")}
                    </dd>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Circuit Limits & Profit Data for Equities */}
                <div className="vision-circuits-row">
                  <div className="vision-circuit-item">
                    <dt>Day Profit / Loss</dt>
                    <dd
                      className={
                        (activePoint.quote.change ?? 0) >= 0
                          ? "text-success"
                          : "text-danger"
                      }
                    >
                      {(activePoint.quote.change ?? 0) >= 0 ? "▲ +" : "▼ "}
                      {formatPrice(activePoint.quote.change, "INR")} (
                      {(activePoint.quote.changePercent ?? 0) >= 0 ? "+" : ""}
                      {(activePoint.quote.changePercent ?? 0).toFixed(2)}%)
                    </dd>
                  </div>
                  <div className="vision-circuit-item">
                    <dt>Lower Circuit</dt>
                    <dd className="text-danger">
                      {formatPrice(activePoint.quote.lowerCircuit, "INR")}
                    </dd>
                  </div>
                  <div className="vision-circuit-item">
                    <dt>Upper Circuit</dt>
                    <dd className="text-success">
                      {formatPrice(activePoint.quote.upperCircuit, "INR")}
                    </dd>
                  </div>
                  <div className="vision-circuit-item">
                    <dt>Average Price (VWAP)</dt>
                    <dd>
                      {formatPrice(activePoint.quote.averagePrice, "INR")}
                    </dd>
                  </div>
                </div>

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
                marginTop: "20px",
                paddingTop: "14px",
                borderTop: "1px solid var(--vision-border, rgba(255, 255, 255, 0.08))",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    fontSize: "0.75rem",
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
                    fontSize: "0.8rem",
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
                  gap: "16px",
                  flexWrap: "wrap",
                }}
              >
                {activePoint.quote.lastTradeTimeMs && (
                  <span
                    className="vision-instrument-name"
                    style={{ fontSize: "0.8rem" }}
                    title="Last executed trade on NSE/BSE before regular market close (3:30 PM IST)"
                  >
                    Last Trade (LTT):{" "}
                    <strong>{formatTime(activePoint.quote.lastTradeTimeMs)}</strong>
                  </span>
                )}
                <span
                  className="vision-instrument-name"
                  style={{ fontSize: "0.8rem" }}
                  title="Timestamp when this EOD quote snapshot was fetched from Upstox"
                >
                  Latest Updated (EOD):{" "}
                  <strong>{formatTime(activePoint.quote.observedAtMs)}</strong>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
