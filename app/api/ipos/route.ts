import { connection } from "next/server";
import { readUpstoxToken } from "@/server/market-data/pipelines/indian-equities";

const UPSTOX_V2_BASE = (
  process.env.UPSTOX_API_BASE?.trim() || "https://api.upstox.com/v2"
).replace(/\/+$/, "");

const NO_STORE = { "Cache-Control": "no-store" } as const;

export type IpoItem = {
  id: string;
  symbol: string | null;
  name: string;
  status: "open" | "upcoming" | "closed" | "listed" | string;
  isin?: string | null;
  issue_type: "regular" | "sme" | string;
  issue_size?: number | null;
  industry?: string | null;
  minimum_price?: number | null;
  maximum_price?: number | null;
  bidding_start_date?: string | null;
  bidding_end_date?: string | null;
  total_subscription?: string | number | null;
  min_bid_quantity?: number | null;
  minimum_quantity?: number | null;
  lot_size?: number | null;
  listing_exchange?: string | null;
  face_value?: number | null;
  cut_off_price?: number | null;
  listing_price?: number | null;
  rhp_url?: string | null;
  daily_start_time?: string | null;
  daily_end_time?: string | null;
};

let cachedData: {
  timestamp: number;
  open: IpoItem[];
  upcoming: IpoItem[];
  all: IpoItem[];
  counts: {
    total: number;
    open: number;
    upcoming: number;
    mainboard: number;
    sme: number;
  };
} | null = null;
const CACHE_TTL_MS = 60 * 1000;

export async function GET(request: Request) {
  await connection();
  const token = readUpstoxToken();

  if (!token) {
    return Response.json(
      {
        error: "UPSTOX_ANALYTICS_TOKEN is not configured.",
        configured: false,
      },
      { status: 503, headers: NO_STORE },
    );
  }

  const now = Date.now();
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "true";

  if (!force && cachedData && now - cachedData.timestamp < CACHE_TTL_MS) {
    return Response.json(
      {
        success: true,
        data: cachedData,
        source: "cache",
      },
      { headers: NO_STORE },
    );
  }

  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };

    const [openRes, upcomingRes] = await Promise.allSettled([
      fetch(`${UPSTOX_V2_BASE}/ipos?status=open`, {
        headers,
        signal: request.signal,
      }),
      fetch(`${UPSTOX_V2_BASE}/ipos?status=upcoming`, {
        headers,
        signal: request.signal,
      }),
    ]);

    const normalizeItem = (raw: Record<string, unknown>): IpoItem => {
      const lotSize =
        typeof raw.lot_size === "number" && !isNaN(raw.lot_size)
          ? raw.lot_size
          : typeof raw.minimum_quantity === "number" && !isNaN(raw.minimum_quantity)
            ? raw.minimum_quantity
            : typeof raw.min_bid_quantity === "number" && !isNaN(raw.min_bid_quantity)
              ? raw.min_bid_quantity
              : null;

      const minQty =
        typeof raw.minimum_quantity === "number" && !isNaN(raw.minimum_quantity)
          ? raw.minimum_quantity
          : typeof raw.min_bid_quantity === "number" && !isNaN(raw.min_bid_quantity)
            ? raw.min_bid_quantity
            : lotSize;

      return {
        id: String(raw.id || ""),
        symbol: raw.symbol ? String(raw.symbol) : null,
        name: String(raw.name || ""),
        status: (raw.status as string) || "upcoming",
        isin: raw.isin ? String(raw.isin) : null,
        issue_type: (raw.issue_type as string) || "regular",
        issue_size:
          typeof raw.issue_size === "number"
            ? raw.issue_size
            : raw.issue_size
              ? parseFloat(String(raw.issue_size))
              : null,
        industry: raw.industry ? String(raw.industry) : null,
        minimum_price:
          typeof raw.minimum_price === "number"
            ? raw.minimum_price
            : raw.minimum_price
              ? parseFloat(String(raw.minimum_price))
              : null,
        maximum_price:
          typeof raw.maximum_price === "number"
            ? raw.maximum_price
            : raw.maximum_price
              ? parseFloat(String(raw.maximum_price))
              : null,
        bidding_start_date: raw.bidding_start_date
          ? String(raw.bidding_start_date)
          : null,
        bidding_end_date: raw.bidding_end_date
          ? String(raw.bidding_end_date)
          : null,
        total_subscription:
          typeof raw.total_subscription === "number" ||
          typeof raw.total_subscription === "string"
            ? raw.total_subscription
            : null,
        min_bid_quantity: minQty,
        minimum_quantity: minQty,
        lot_size: lotSize,
        listing_exchange: raw.listing_exchange
          ? String(raw.listing_exchange)
          : null,
        face_value:
          typeof raw.face_value === "number"
            ? raw.face_value
            : raw.face_value
              ? parseFloat(String(raw.face_value))
              : null,
        cut_off_price:
          typeof raw.cut_off_price === "number"
            ? raw.cut_off_price
            : raw.cut_off_price
              ? parseFloat(String(raw.cut_off_price))
              : null,
        listing_price:
          typeof raw.listing_price === "number"
            ? raw.listing_price
            : raw.listing_price
              ? parseFloat(String(raw.listing_price))
              : null,
        rhp_url: raw.rhp_url ? String(raw.rhp_url) : null,
        daily_start_time: raw.daily_start_time
          ? String(raw.daily_start_time)
          : null,
        daily_end_time: raw.daily_end_time
          ? String(raw.daily_end_time)
          : null,
      };
    };

    let openIpos: IpoItem[] = [];
    if (openRes.status === "fulfilled" && openRes.value.ok) {
      const json = await openRes.value.json();
      if (Array.isArray(json?.data)) {
        openIpos = json.data.map((item: Record<string, unknown>) => normalizeItem(item));
      }
    }

    let upcomingIpos: IpoItem[] = [];
    if (upcomingRes.status === "fulfilled" && upcomingRes.value.ok) {
      const json = await upcomingRes.value.json();
      if (Array.isArray(json?.data)) {
        upcomingIpos = json.data.map((item: Record<string, unknown>) => normalizeItem(item));
      }
    }

    // Deduplicate lists by unique ID, symbol, or company name
    const deduplicateIpos = (items: IpoItem[]): IpoItem[] => {
      const itemMap = new Map<string, IpoItem>();
      const seenNames = new Set<string>();
      for (const item of items) {
        const key = item.id || item.symbol || item.name;
        const normalizedName = item.name.trim().toLowerCase();
        if (!key || itemMap.has(key) || (normalizedName && seenNames.has(normalizedName))) {
          continue;
        }
        itemMap.set(key, item);
        if (normalizedName) seenNames.add(normalizedName);
      }
      return Array.from(itemMap.values());
    };

    openIpos = deduplicateIpos(openIpos);
    upcomingIpos = deduplicateIpos(upcomingIpos);

    // Merge and deduplicate across all IPOs
    const allIpos = deduplicateIpos([...openIpos, ...upcomingIpos]);

    const result = {
      timestamp: now,
      open: openIpos,
      upcoming: upcomingIpos,
      all: allIpos,
      counts: {
        total: allIpos.length,
        open: openIpos.length,
        upcoming: upcomingIpos.length,
        mainboard: allIpos.filter((i) => i.issue_type === "regular").length,
        sme: allIpos.filter((i) => i.issue_type === "sme").length,
      },
    };

    cachedData = result;

    return Response.json(
      {
        success: true,
        data: result,
        source: "live",
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch IPO data",
      },
      { status: 502, headers: NO_STORE },
    );
  }
}
