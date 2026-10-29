// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
  cleanup,
} from "@testing-library/react";
import VisionMarketDataPanel, {
  getIndianMarketStatus,
} from "./VisionMarketDataPanel";

const mockSnapshot = {
  status: {
    id: "indian-equities",
    provider: "Upstox",
    displayName: "Indian Equities",
    state: "ready",
    delay: "realtime",
    delayLabel: "Real-time",
    configured: true,
    connected: true,
    lastSuccessAtMs: Date.now(),
    lastAttemptAtMs: Date.now(),
    lastUpdatedAtMs: Date.now(),
    error: null,
    dataPointCount: 5,
  },
  dataPoints: [
    {
      instrument: "NSE_EQ|STOCK_ZERO",
      label: "Zero Stock",
      group: "NSE equities",
      quote: {
        symbol: "S_ZERO",
        name: "Zero Stock",
        value: 2000,
        currency: "INR",
        change: 0,
        changePercent: 0.0,
        observedAtMs: Date.now(),
        previousClose: 2000,
        open: 2000,
        high: 2050,
        low: 1950,
        close: 2000,
        volume: 1000000,
      },
      delay: "realtime",
      supportsRealtimeStream: true,
    },
    {
      instrument: "NSE_EQ|STOCK_POS5",
      label: "Gainer Five",
      group: "NSE equities",
      quote: {
        symbol: "S_POS5",
        name: "Gainer Five",
        value: 5000,
        currency: "INR",
        change: 250,
        changePercent: 5.0,
        observedAtMs: Date.now(),
        previousClose: 4750,
        open: 4800,
        high: 5050,
        low: 4790,
        close: 5000,
        volume: 2500000,
      },
      delay: "realtime",
      supportsRealtimeStream: true,
    },
    {
      instrument: "NSE_EQ|STOCK_NEG5",
      label: "Loser Five",
      group: "NSE equities",
      quote: {
        symbol: "S_NEG5",
        name: "Loser Five",
        value: 1000,
        currency: "INR",
        change: -50,
        changePercent: -5.0,
        observedAtMs: Date.now(),
        previousClose: 1050,
        open: 1040,
        high: 1045,
        low: 990,
        close: 1000,
        volume: 1500000,
      },
      delay: "realtime",
      supportsRealtimeStream: true,
    },
    {
      instrument: "NSE_EQ|STOCK_POS1",
      label: "Gainer One",
      group: "NSE equities",
      quote: {
        symbol: "S_POS1",
        name: "Gainer One",
        value: 3000,
        currency: "INR",
        change: 30,
        changePercent: 1.0,
        observedAtMs: Date.now(),
        previousClose: 2970,
        open: 2980,
        high: 3020,
        low: 2970,
        close: 3000,
        volume: 1800000,
      },
      delay: "realtime",
      supportsRealtimeStream: true,
    },
    {
      instrument: "NSE_EQ|STOCK_NEG1",
      label: "Loser One",
      group: "NSE equities",
      quote: {
        symbol: "S_NEG1",
        name: "Loser One",
        value: 4000,
        currency: "INR",
        change: -40,
        changePercent: -1.0,
        observedAtMs: Date.now(),
        previousClose: 4040,
        open: 4030,
        high: 4040,
        low: 3980,
        close: 4000,
        volume: 1200000,
      },
      delay: "realtime",
      supportsRealtimeStream: true,
    },
  ],
};

describe("VisionMarketDataPanel numeric sorting", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          snapshot: mockSnapshot,
          dataPoints: mockSnapshot.dataPoints,
        }),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("toggles Last Price sorting numerically: descending -> ascending -> default order", async () => {
    render(<VisionMarketDataPanel />);

    const table = await screen.findByRole("table");
    await waitFor(() => {
      expect(within(table).getByText("S_ZERO")).toBeInTheDocument();
      expect(within(table).getByText("S_POS5")).toBeInTheDocument();
      expect(within(table).getByText("S_NEG5")).toBeInTheDocument();
      expect(within(table).getByText("S_POS1")).toBeInTheDocument();
      expect(within(table).getByText("S_NEG1")).toBeInTheDocument();
    });

    const priceSortBtn = screen.getByRole("button", {
      name: /Last Price/i,
    });
    const priceTh = priceSortBtn.closest("th");

    expect(priceTh).toHaveAttribute("aria-sort", "none");

    // 1st click -> Descending (highest price to lowest: 5000, 4000, 3000, 2000, 1000)
    fireEvent.click(priceSortBtn);
    expect(priceTh).toHaveAttribute("aria-sort", "descending");

    let rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("S_POS5"); // 5000
    expect(rows[2]).toHaveTextContent("S_NEG1"); // 4000
    expect(rows[3]).toHaveTextContent("S_POS1"); // 3000
    expect(rows[4]).toHaveTextContent("S_ZERO"); // 2000
    expect(rows[5]).toHaveTextContent("S_NEG5"); // 1000

    // 2nd click -> Ascending (lowest price to highest: 1000, 2000, 3000, 4000, 5000)
    fireEvent.click(priceSortBtn);
    expect(priceTh).toHaveAttribute("aria-sort", "ascending");

    rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("S_NEG5"); // 1000
    expect(rows[2]).toHaveTextContent("S_ZERO"); // 2000
    expect(rows[3]).toHaveTextContent("S_POS1"); // 3000
    expect(rows[4]).toHaveTextContent("S_NEG1"); // 4000
    expect(rows[5]).toHaveTextContent("S_POS5"); // 5000

    // 3rd click -> Default fetched order preserved (S_ZERO, S_POS5, S_NEG5, S_POS1, S_NEG1)
    fireEvent.click(priceSortBtn);
    expect(priceTh).toHaveAttribute("aria-sort", "none");

    rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("S_ZERO");
    expect(rows[2]).toHaveTextContent("S_POS5");
    expect(rows[3]).toHaveTextContent("S_NEG5");
    expect(rows[4]).toHaveTextContent("S_POS1");
    expect(rows[5]).toHaveTextContent("S_NEG1");
  });

  it("toggles Change (%) sorting numerically: +5% to -5% (desc) -> -5% to +5% (asc) -> default order", async () => {
    render(<VisionMarketDataPanel />);

    const table = await screen.findByRole("table");
    await waitFor(() => {
      expect(within(table).getByText("S_ZERO")).toBeInTheDocument();
    });

    const changeSortBtn = screen.getByRole("button", {
      name: /Change \(%\)/i,
    });
    const changeTh = changeSortBtn.closest("th");

    expect(changeTh).toHaveAttribute("aria-sort", "none");

    // 1st click -> Change ↓: Highest to lowest: +5%, +1%, 0%, -1%, -5%
    fireEvent.click(changeSortBtn);
    expect(changeTh).toHaveAttribute("aria-sort", "descending");

    let rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("S_POS5"); // +5.0%
    expect(rows[2]).toHaveTextContent("S_POS1"); // +1.0%
    expect(rows[3]).toHaveTextContent("S_ZERO"); // 0.0%
    expect(rows[4]).toHaveTextContent("S_NEG1"); // -1.0%
    expect(rows[5]).toHaveTextContent("S_NEG5"); // -5.0%

    // 2nd click -> Change ↑: Lowest to highest: -5%, -1%, 0%, +1%, +5%
    fireEvent.click(changeSortBtn);
    expect(changeTh).toHaveAttribute("aria-sort", "ascending");

    rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("S_NEG5"); // -5.0%
    expect(rows[2]).toHaveTextContent("S_NEG1"); // -1.0%
    expect(rows[3]).toHaveTextContent("S_ZERO"); // 0.0%
    expect(rows[4]).toHaveTextContent("S_POS1"); // +1.0%
    expect(rows[5]).toHaveTextContent("S_POS5"); // +5.0%

    // 3rd click -> Default fetched order preserved
    fireEvent.click(changeSortBtn);
    expect(changeTh).toHaveAttribute("aria-sort", "none");

    rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("S_ZERO");
    expect(rows[2]).toHaveTextContent("S_POS5");
    expect(rows[3]).toHaveTextContent("S_NEG5");
    expect(rows[4]).toHaveTextContent("S_POS1");
    expect(rows[5]).toHaveTextContent("S_NEG1");
  });
});


describe("getIndianMarketStatus dynamic schedule & holidays", () => {
  it("detects live market hours on a regular weekday (9:15 AM - 3:30 PM IST)", () => {
    // Thursday 2026-10-29 at 11:30:00 AM IST
    const liveDate = new Date("2026-10-29T11:30:00+05:30");
    const status = getIndianMarketStatus(liveDate, "equity");

    expect(status.isOpen).toBe(true);
    expect(status.session).toBe("regular");
    expect(status.label).toBe("Live Market");
    expect(status.tradingHours).toBe("9:15 AM – 3:30 PM IST");
    expect(status.countdown).toContain("Closes in");
    expect(status.isEod).toBe(false);
  });

  it("detects pre-market session on a weekday morning (9:00 AM - 9:15 AM IST)", () => {
    // Thursday 2026-10-29 at 09:05:00 AM IST
    const preMarketDate = new Date("2026-10-29T09:05:00+05:30");
    const status = getIndianMarketStatus(preMarketDate, "equity");

    expect(status.isOpen).toBe(false);
    expect(status.session).toBe("pre-market");
    expect(status.label).toBe("Pre-Market Session");
    expect(status.countdown).toContain("Trading opens in");
    expect(status.isEod).toBe(true);
  });

  it("detects before-open on a weekday morning and shows countdown to 9:15 AM IST", () => {
    // Thursday 2026-10-29 at 08:27:29 AM IST
    const morningDate = new Date("2026-10-29T08:27:29+05:30");
    const status = getIndianMarketStatus(morningDate, "equity");

    expect(status.isOpen).toBe(false);
    expect(status.session).toBe("before-open");
    expect(status.label).toBe("Pre-Market / Closed");
    expect(status.countdown).toContain("Opens in");
    expect(status.isEod).toBe(true);
  });

  it("detects post-close in evening and counts down to next trading day", () => {
    // Thursday 2026-10-29 at 04:00:00 PM IST
    const eveningDate = new Date("2026-10-29T16:00:00+05:30");
    const status = getIndianMarketStatus(eveningDate, "equity");

    expect(status.isOpen).toBe(false);
    expect(status.session).toBe("post-close");
    expect(status.label).toBe("Market Closed · EOD");
    expect(status.countdown).toContain("Opens tomorrow in");
    expect(status.isEod).toBe(true);
  });

  it("detects weekend and skips to Monday open", () => {
    // Saturday 2026-10-31 at 12:00:00 PM IST
    const weekendDate = new Date("2026-10-31T12:00:00+05:30");
    const status = getIndianMarketStatus(weekendDate, "equity");

    expect(status.isOpen).toBe(false);
    expect(status.session).toBe("weekend");
    expect(status.label).toBe("Market Closed (Weekend)");
    expect(status.countdown).toContain("Opens Mon in");
    expect(status.isEod).toBe(true);
  });

  it("detects dynamic Indian exchange holidays correctly", () => {
    // Dussehra: 2026-10-20
    const holidayDate = new Date("2026-10-20T10:00:00+05:30");
    const status = getIndianMarketStatus(holidayDate, "equity");

    expect(status.isOpen).toBe(false);
    expect(status.session).toBe("holiday");
    expect(status.isHoliday).toBe(true);
    expect(status.holidayName).toBe("Dussehra");
    expect(status.label).toContain("Dussehra");
    expect(status.isEod).toBe(true);
  });

  it("adjusts hours dynamically for commodities (MCX 9:00 AM - 11:30 PM IST)", () => {
    // Thursday evening 2026-10-29 at 08:00:00 PM IST
    const eveningDate = new Date("2026-10-29T20:00:00+05:30");
    const equityStatus = getIndianMarketStatus(eveningDate, "equity");
    const commodityStatus = getIndianMarketStatus(eveningDate, "commodity");

    // Equity closed at 3:30 PM
    expect(equityStatus.isOpen).toBe(false);
    // Commodity open until 11:30 PM
    expect(commodityStatus.isOpen).toBe(true);
    expect(commodityStatus.tradingHours).toBe("9:00 AM – 11:30 PM IST");
    expect(commodityStatus.countdown).toContain("Closes in");
  });
});

describe("VisionMarketDataPanel Privacy and Professional Header", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          snapshot: mockSnapshot,
          dataPoints: mockSnapshot.dataPoints,
        }),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("does not expose provider branding or internal API names in UI", async () => {
    const { container } = render(<VisionMarketDataPanel />);

    await screen.findByRole("table");

    // Verify Upstox API v2 is not displayed
    expect(screen.queryByText(/Upstox API v2 Live/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Provider:/i)).not.toBeInTheDocument();
    expect(container.textContent).not.toContain("Upstox API v2");

    // Clean professional header elements exist
    expect(
      screen.getByText("REAL-TIME MARKET INTELLIGENCE"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Indian Equities & Derivatives"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Last Updated:/i)).toBeInTheDocument();
  });
});
