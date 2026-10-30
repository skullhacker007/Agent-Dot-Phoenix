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

describe("VisionMarketDataPanel Bonds tab", () => {
  const snapshotWithBonds = {
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
      dataPointCount: 2,
    },
    dataPoints: [
      {
        instrument: "NSE_EQ|STOCK_RELIANCE",
        label: "Reliance Industries",
        group: "NSE equities",
        quote: {
          symbol: "RELIANCE",
          name: "Reliance Industries",
          value: 2980,
          currency: "INR",
          change: 30,
          changePercent: 1.0,
          observedAtMs: Date.now(),
          previousClose: 2950,
          volume: 1000000,
        },
        delay: "realtime",
        supportsRealtimeStream: true,
      },
      {
        instrument: "NSE_EQ|IN0020230085",
        label: "7.18% GS 2033",
        group: "NSE bonds",
        quote: {
          symbol: "718GS2033",
          name: "7.18% GS 2033",
          value: 100.25,
          currency: "INR",
          change: 0.15,
          changePercent: 0.15,
          observedAtMs: Date.now(),
          previousClose: 100.1,
          volume: 50000,
        },
        delay: "realtime",
        supportsRealtimeStream: true,
      },
    ],
  };

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          snapshot: snapshotWithBonds,
          dataPoints: snapshotWithBonds.dataPoints,
        }),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders Bonds tab after Commodities and isolates bonds with BOND tag", async () => {
    render(<VisionMarketDataPanel />);

    const table = await screen.findByRole("table");
    const bondsTab = screen.getByRole("button", { name: /Bonds \(1\)/i });
    expect(bondsTab).toBeInTheDocument();

    // Verify initial table contains both stock and bond
    await waitFor(() => {
      expect(within(table).getByText("RELIANCE")).toBeInTheDocument();
      expect(within(table).getByText("718GS2033")).toBeInTheDocument();
    });

    // Click Bonds tab
    fireEvent.click(bondsTab);

    // Only bond instrument should be shown, with BOND tag
    await waitFor(() => {
      expect(within(table).getByText("718GS2033")).toBeInTheDocument();
      expect(within(table).getByText("BOND")).toBeInTheDocument();
      expect(within(table).queryByText("RELIANCE")).not.toBeInTheDocument();
    });
  });
});

describe("VisionMarketDataPanel Derivatives Open Interest and Metadata", () => {
  const snapshotWithDerivatives = {
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
      dataPointCount: 1,
    },
    dataPoints: [
      {
        instrument: "NSE_FO|50978",
        label: "Nifty 27000 CE",
        group: "NSE options",
        lotSize: 25,
        expiry: "2026-11-26",
        strikePrice: 27000,
        quote: {
          symbol: "NIFTY26NOV27000CE",
          name: "Nifty 27000 CE",
          value: 125.5,
          currency: "INR",
          change: 15.2,
          changePercent: 13.8,
          observedAtMs: Date.now(),
          previousClose: 110.3,
          volume: 2500000,
          averagePrice: 121.4,
          oi: 4500000,
          oiDayHigh: 4800000,
          oiDayLow: 4100000,
        },
        delay: "realtime",
        supportsRealtimeStream: true,
      },
    ],
  };

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          snapshot: snapshotWithDerivatives,
          dataPoints: snapshotWithDerivatives.dataPoints,
        }),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("displays Open Interest (OI), expiry badge, lot size badge, and details in modal", async () => {
    render(<VisionMarketDataPanel />);

    const table = await screen.findByRole("table");
    await waitFor(() => {
      expect(within(table).getByText("NIFTY26NOV27000CE")).toBeInTheDocument();
      // Badges
      expect(within(table).getByText("2026-11-26")).toBeInTheDocument();
      expect(within(table).getByText("Lot: 25")).toBeInTheDocument();
      // Open Interest in volume/OI column
      expect(within(table).getByText(/OI: 45.00 L/i)).toBeInTheDocument();
    });

    // Click View to open drawer modal
    const viewBtn = within(table).getByRole("button", { name: "View" });
    fireEvent.click(viewBtn);

    // Verify modal elements
    await screen.findByRole("dialog");
    expect(screen.getByText("OPTIONS MARKET DEPTH")).toBeInTheDocument();
    expect(screen.getByText("Open Interest (OI)")).toBeInTheDocument();
    expect(screen.getByText("45.00 L")).toBeInTheDocument();
    expect(screen.getByText("OI Day High")).toBeInTheDocument();
    expect(screen.getByText("48.00 L")).toBeInTheDocument();
    expect(screen.getByText("Lot Size")).toBeInTheDocument();
    expect(screen.getByText("25 units")).toBeInTheDocument();
    expect(screen.getByText("Strike Price")).toBeInTheDocument();
    expect(screen.getByText("₹27,000.00")).toBeInTheDocument();
  });
});

describe("VisionMarketDataPanel Upstox V2 Extended Metrics (52W Range, LTQ, ISIN, OI Change)", () => {
  const snapshotWithExtended = {
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
      dataPointCount: 2,
    },
    dataPoints: [
      {
        instrument: "NSE_EQ|INE002A01018",
        label: "Reliance Industries",
        group: "NSE equities",
        isin: "INE002A01018",
        tickSize: 0.05,
        quote: {
          symbol: "RELIANCE",
          name: "Reliance Industries",
          value: 2980,
          currency: "INR",
          change: 30,
          changePercent: 1.0,
          observedAtMs: Date.now(),
          previousClose: 2950,
          volume: 1000000,
          yearlyLow: 2220.0,
          yearlyHigh: 3217.9,
          lastQuantity: 150,
          lowerCircuit: 2655,
          upperCircuit: 3245,
          averagePrice: 2975.5,
        },
        delay: "realtime",
        supportsRealtimeStream: true,
      },
      {
        instrument: "NSE_FO|50978",
        label: "Nifty 27000 CE (Call)",
        group: "NSE options",
        lotSize: 25,
        strikePrice: 27000,
        expiry: "2026-11-26",
        quote: {
          symbol: "NIFTY26NOV27000CE",
          name: "Nifty 27000 CE",
          value: 125.5,
          currency: "INR",
          change: 15.2,
          changePercent: 13.8,
          observedAtMs: Date.now(),
          previousClose: 110.3,
          volume: 2500000,
          oi: 4500000,
          prevOi: 4000000,
          oiChange: 500000,
          oiChangePercent: 12.5,
        },
        delay: "realtime",
        supportsRealtimeStream: true,
      },
    ],
  };

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          snapshot: snapshotWithExtended,
          dataPoints: snapshotWithExtended.dataPoints,
        }),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders 52W range in table and details modal with ISIN, LTQ, and tick size", async () => {
    render(<VisionMarketDataPanel />);

    const table = await screen.findByRole("table");
    await waitFor(() => {
      expect(within(table).getByText("RELIANCE")).toBeInTheDocument();
      // 52W Range in table
      expect(within(table).getByText(/52W: ₹2,220.00 – ₹3,217.90/i)).toBeInTheDocument();
    });

    // Open Reliance modal
    const viewButtons = within(table).getAllByRole("button", { name: "View" });
    fireEvent.click(viewButtons[0]);

    await screen.findByRole("dialog");
    expect(screen.getByText("52-Week Low")).toBeInTheDocument();
    expect(screen.getByText("₹2,220.00")).toBeInTheDocument();
    expect(screen.getByText("52-Week High")).toBeInTheDocument();
    expect(screen.getByText("₹3,217.90")).toBeInTheDocument();
    expect(screen.getByText("Last Trade Qty (LTQ)")).toBeInTheDocument();
    expect(screen.getByText("150 units")).toBeInTheDocument();
    expect(screen.getByText("ISIN Identifier")).toBeInTheDocument();
    expect(screen.getByText("INE002A01018")).toBeInTheDocument();
    expect(screen.getByText("Tick Size")).toBeInTheDocument();
    expect(screen.getByText("₹0.05")).toBeInTheDocument();
  });

  it("renders OI Change and OI Change % in options modal", async () => {
    render(<VisionMarketDataPanel />);

    const table = await screen.findByRole("table");
    await waitFor(() => {
      expect(within(table).getByText("NIFTY26NOV27000CE")).toBeInTheDocument();
    });

    // Open Option modal
    const viewButtons = within(table).getAllByRole("button", { name: "View" });
    fireEvent.click(viewButtons[1]);

    await screen.findByRole("dialog");
    expect(screen.getByText("OPTIONS MARKET DEPTH")).toBeInTheDocument();
    expect(screen.getByText("OI Change")).toBeInTheDocument();
    expect(screen.getByText((c) => c.includes("+5.00 L"))).toBeInTheDocument();
  });

  it("places type, date, lot, and tick size tags in a metadata row below the instrument name", async () => {
    render(<VisionMarketDataPanel />);

    const table = await screen.findByRole("table");
    await waitFor(() => {
      expect(within(table).getByText("NIFTY26NOV27000CE")).toBeInTheDocument();
    });

    // Find the cell for the option
    const symbolEl = within(table).getByText("NIFTY26NOV27000CE");
    const cell = symbolEl.closest(".vision-instrument-cell");
    expect(cell).toBeDefined();

    // Verify ordering inside the cell: Symbol -> Name -> Tags container below name
    const children = Array.from(cell!.children);
    expect(children[0]).toHaveClass("vision-instrument-symbol");
    expect(children[0]).toHaveTextContent("NIFTY26NOV27000CE");
    expect(children[1]).toHaveClass("vision-instrument-name");
    expect(children[1]).toHaveTextContent("Nifty 27000 CE (Call)");
    expect(children[2]).toHaveClass("vision-instrument-tags");

    // Inside the tags container below the name: Type, Date, Lot
    const tags = Array.from(children[2].children);
    expect(tags[0]).toHaveTextContent("OPTION");
    expect(tags[1]).toHaveTextContent("2026-11-26");
    expect(tags[2]).toHaveTextContent("Lot: 25");
  });

  describe("VisionMarketDataPanel Index Basket Selector & IPOs", () => {
    const basketSnapshot = {
      status: {
        ...mockSnapshot.status,
        dataPointCount: 4,
      },
      dataPoints: [
        {
          instrument: "NSE_EQ|INE002A01018",
          label: "Reliance Industries",
          group: "NSE equities",
          quote: {
            symbol: "RELIANCE",
            name: "Reliance Industries",
            value: 2800,
            currency: "INR",
            change: 25,
            changePercent: 0.9,
            observedAtMs: Date.now(),
            previousClose: 2775,
            open: 2780,
            high: 2820,
            low: 2770,
            close: 2800,
            volume: 5000000,
          },
          delay: "realtime",
          supportsRealtimeStream: true,
        },
        {
          instrument: "NSE_EQ|INE040A01034",
          label: "HDFC Bank",
          group: "NSE equities",
          quote: {
            symbol: "HDFCBANK",
            name: "HDFC Bank",
            value: 1650,
            currency: "INR",
            change: -10,
            changePercent: -0.6,
            observedAtMs: Date.now(),
            previousClose: 1660,
            open: 1655,
            high: 1665,
            low: 1640,
            close: 1650,
            volume: 4000000,
          },
          delay: "realtime",
          supportsRealtimeStream: true,
        },
        {
          instrument: "NSE_EQ|INE028A01039",
          label: "Bank of Baroda",
          group: "NSE equities",
          quote: {
            symbol: "BANKBARODA",
            name: "Bank of Baroda",
            value: 240,
            currency: "INR",
            change: -2,
            changePercent: -0.8,
            observedAtMs: Date.now(),
            previousClose: 242,
            open: 241,
            high: 243,
            low: 238,
            close: 240,
            volume: 3000000,
          },
          delay: "realtime",
          supportsRealtimeStream: true,
        },
        {
          instrument: "NSE_EQ|CUSTOM1",
          label: "Unknown Stock",
          group: "NSE equities",
          quote: {
            symbol: "UNKNOWN",
            name: "Unknown Corp",
            value: 100,
            currency: "INR",
            change: 1,
            changePercent: 1.0,
            observedAtMs: Date.now(),
            previousClose: 99,
            open: 99,
            high: 101,
            low: 98,
            close: 100,
            volume: 1000,
          },
          delay: "realtime",
          supportsRealtimeStream: true,
        },
      ],
    };

    it("filters to Nifty 50, Nifty Bank, and Sensex when selected in Basket dropdown", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          snapshot: basketSnapshot,
          dataPoints: basketSnapshot.dataPoints,
        }),
      });

      render(<VisionMarketDataPanel />);
      const select = await screen.findByRole("combobox", { name: /Basket/i });
      expect(select).toBeInTheDocument();

      const table = await screen.findByRole("table");

      // Initially All Equities: wait for data to load
      await waitFor(() => {
        expect(within(table).getByText("RELIANCE")).toBeInTheDocument();
      });
      expect(within(table).getByText("HDFCBANK")).toBeInTheDocument();
      expect(within(table).getByText("BANKBARODA")).toBeInTheDocument();
      expect(within(table).getByText("UNKNOWN")).toBeInTheDocument();

      // Switch to NIFTY BANK: HDFCBANK & BANKBARODA should be present, RELIANCE & UNKNOWN should not
      fireEvent.change(select, { target: { value: "niftybank" } });
      await waitFor(() => {
        expect(within(table).getByText("BANKBARODA")).toBeInTheDocument();
      });
      expect(within(table).getByText("HDFCBANK")).toBeInTheDocument();
      expect(within(table).queryByText("RELIANCE")).not.toBeInTheDocument();
      expect(within(table).queryByText("UNKNOWN")).not.toBeInTheDocument();

      // Switch to SENSEX: RELIANCE & HDFCBANK present, BANKBARODA & UNKNOWN should not
      fireEvent.change(select, { target: { value: "sensex" } });
      await waitFor(() => {
        expect(within(table).getByText("RELIANCE")).toBeInTheDocument();
      });
      expect(within(table).getByText("HDFCBANK")).toBeInTheDocument();
      expect(within(table).queryByText("BANKBARODA")).not.toBeInTheDocument();
      expect(within(table).queryByText("UNKNOWN")).not.toBeInTheDocument();

      // Switch to Nifty 50: RELIANCE & HDFCBANK present, BANKBARODA & UNKNOWN should not
      fireEvent.change(select, { target: { value: "nifty50" } });
      await waitFor(() => {
        expect(within(table).getByText("RELIANCE")).toBeInTheDocument();
      });
      expect(within(table).getByText("HDFCBANK")).toBeInTheDocument();
      expect(within(table).queryByText("BANKBARODA")).not.toBeInTheDocument();
      expect(within(table).queryByText("UNKNOWN")).not.toBeInTheDocument();
    });

    it("renders the Segregated IPO Tab with KPI summary cards and segregated items", async () => {
      global.fetch = vi.fn((url: string | URL | Request) => {
        const urlStr = String(url);
        if (urlStr.includes("/api/ipos")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: {
                open: [
                  {
                    id: "open-ipo-1",
                    symbol: "OPENONE",
                    name: "Open Mainboard Tech IPO",
                    status: "open",
                    issue_type: "regular",
                    issue_size: 500,
                    minimum_price: 100,
                    maximum_price: 110,
                    lot_size: 135,
                    isin: "INE001A01010",
                    bidding_start_date: "2026-10-30",
                    bidding_end_date: "2026-11-03",
                    total_subscription: "3.5",
                  },
                ],
                upcoming: [
                  {
                    id: "upcoming-sme-1",
                    symbol: "UPCSME",
                    name: "Upcoming SME Solar IPO",
                    status: "upcoming",
                    issue_type: "sme",
                    issue_size: 40,
                    minimum_price: 50,
                    maximum_price: 55,
                    lot_size: 2000,
                    isin: "INE002B02020",
                    bidding_start_date: "2026-11-05",
                    bidding_end_date: "2026-11-08",
                  },
                ],
                all: [
                  {
                    id: "open-ipo-1",
                    symbol: "OPENONE",
                    name: "Open Mainboard Tech IPO",
                    status: "open",
                    issue_type: "regular",
                    issue_size: 500,
                    minimum_price: 100,
                    maximum_price: 110,
                    lot_size: 135,
                    isin: "INE001A01010",
                    bidding_start_date: "2026-10-30",
                    bidding_end_date: "2026-11-03",
                    total_subscription: "3.5",
                  },
                  {
                    id: "upcoming-sme-1",
                    symbol: "UPCSME",
                    name: "Upcoming SME Solar IPO",
                    status: "upcoming",
                    issue_type: "sme",
                    issue_size: 40,
                    minimum_price: 50,
                    maximum_price: 55,
                    lot_size: 2000,
                    isin: "INE002B02020",
                    bidding_start_date: "2026-11-05",
                    bidding_end_date: "2026-11-08",
                  },
                ],
                counts: {
                  total: 2,
                  open: 1,
                  upcoming: 1,
                  mainboard: 1,
                  sme: 1,
                },
              },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            snapshot: basketSnapshot,
            dataPoints: basketSnapshot.dataPoints,
          }),
        });
      }) as unknown as typeof fetch;

      render(<VisionMarketDataPanel />);

      // Find the IPO tab button and click it
      const ipoTabBtn = await screen.findByRole("button", { name: /IPOs/i });
      fireEvent.click(ipoTabBtn);

      // Verify KPI banner cards are displayed
      await waitFor(() => {
        expect(screen.getByText("Open for Bidding")).toBeInTheDocument();
        expect(screen.getByText("Upcoming Pipeline")).toBeInTheDocument();
        expect(screen.getByText("Mainboard Issues")).toBeInTheDocument();
        expect(screen.getByText("SME Issues")).toBeInTheDocument();
      });

      // Verify IPO cards are rendered with details
      expect(screen.getByText("Open Mainboard Tech IPO")).toBeInTheDocument();
      expect(screen.getByText("Upcoming SME Solar IPO")).toBeInTheDocument();
      expect(screen.getByText("3.50x")).toBeInTheDocument();
      expect(screen.getByText("₹100 – ₹110")).toBeInTheDocument();
      expect(screen.getByText("₹500.00 Cr")).toBeInTheDocument();

      // Verify Lot Size and Minimum Investment calculations
      expect(screen.getByText("135 Shares")).toBeInTheDocument();
      expect(screen.getByText("₹14,850")).toBeInTheDocument();
      expect(screen.getByText("2000 Shares")).toBeInTheDocument();
      expect(screen.getByText("₹1,10,000")).toBeInTheDocument();

      // Verify Retail Lot Calculator drawer toggles and computes mandate amounts in dedicated sidebar
      const calcButtons = screen.getAllByRole("button", { name: /Retail Lot Calculator/i });
      expect(calcButtons.length).toBeGreaterThan(0);
      fireEvent.click(calcButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: /Retail Lot Calculator Sidebar/i })).toBeInTheDocument();
        expect(screen.getByText("Select Lots:")).toBeInTheDocument();
        expect(screen.getByText("Total Mandate Amount:")).toBeInTheDocument();
        expect(screen.getAllByRole("button", { name: /Copy Clean/i }).length).toBeGreaterThan(0);
        expect(screen.getByRole("button", { name: /Copy Formatted/i })).toBeInTheDocument();
        expect(screen.getAllByRole("button", { name: /Copy.*Summary/i }).length).toBeGreaterThan(0);
      });

      // Test ASBA Form Helper toggle
      const asbaHelperBtn = screen.getByRole("button", { name: /ASBA Form Helper/i });
      fireEvent.click(asbaHelperBtn);
      expect(screen.getByText("Bank NetBanking ASBA Form Fields")).toBeInTheDocument();

      // Test Copy Clean action
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText: writeTextMock } });
      const copyCleanBtns = screen.getAllByRole("button", { name: /Copy Clean/i });
      fireEvent.click(copyCleanBtns[0]);
      expect(writeTextMock).toHaveBeenCalled();

      // Verify closing the sidebar drawer restores the view without affecting the card layout
      const closeSidebarBtns = screen.getAllByRole("button", { name: /Close Calculator/i });
      expect(closeSidebarBtns.length).toBeGreaterThan(0);
      fireEvent.click(closeSidebarBtns[0]);

      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: /Retail Lot Calculator Sidebar/i })).not.toBeInTheDocument();
      });

      // Verify View Mode Toggle: switch from Cards to Table view
      const tableViewBtn = screen.getByRole("button", { name: /Comparison Table View/i });
      fireEvent.click(tableViewBtn);

      await waitFor(() => {
        expect(screen.getByRole("table")).toBeInTheDocument();
        expect(screen.getByText("Company & Symbol")).toBeInTheDocument();
        expect(screen.getByText("Bidding Period")).toBeInTheDocument();
      });
    });

    it("renders interactive refresh button with animated SVG icon in modal depth view", async () => {
      render(<VisionMarketDataPanel />);

      const table = await screen.findByRole("table");
      const viewButtons = within(table).getAllByRole("button", { name: "View" });
      fireEvent.click(viewButtons[0]);

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toBeInTheDocument();

      // Refresh button should be present with proper accessible name and class
      const refreshBtn = screen.getByRole("button", { name: /Refresh live quote and depth/i });
      expect(refreshBtn).toBeInTheDocument();
      expect(refreshBtn).toHaveClass("vision-modal-refresh-btn");

      // Verify the SVG icon is present inside the refresh button
      const svgIcon = refreshBtn.querySelector("svg.vision-refresh-svg");
      expect(svgIcon).toBeInTheDocument();

      // Trigger refresh
      fireEvent.click(refreshBtn);

      // Verify fetch was called to refresh data
      expect(global.fetch).toHaveBeenCalled();
    });
  });
});
