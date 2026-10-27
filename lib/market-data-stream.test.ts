import { describe, expect, it, vi } from "vitest";
import { openBinanceMiniTickerStream } from "./market-data-stream";

type SocketStub = {
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  close: () => void;
  closed: boolean;
};

let lastSocket: SocketStub | null = null;

class MockWebSocket {
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    expect(url.startsWith("wss://stream.binance.com")).toBe(true);
    expect(url.toLowerCase()).toContain("btcusdt@miniticker");
    lastSocket = this;
  }

  close() {
    this.closed = true;
  }
}

vi.stubGlobal("WebSocket", MockWebSocket);

describe("openBinanceMiniTickerStream", () => {
  it("delivers parsed miniTicker updates", () => {
    const updates: Array<{ symbol: string; price: number }> = [];
    const cleanup = openBinanceMiniTickerStream(["BTCUSDT"], {
      onUpdate: (update) => updates.push(update),
      onError: () => {
        throw new Error("should not error");
      },
    });
    lastSocket?.onmessage?.({
      data: JSON.stringify({ data: { s: "BTCUSDT", c: "68000.5", E: 1700000000000 } }),
    });
    expect(updates).toEqual([
      { symbol: "BTCUSDT", price: 68000.5, eventTimeMs: 1700000000000 },
    ]);
    cleanup();
  });

  it("cleanup closes the socket and ignores later messages", () => {
    const updates: unknown[] = [];
    const errors: string[] = [];
    const cleanup = openBinanceMiniTickerStream(["BTCUSDT"], {
      onUpdate: (update) => updates.push(update),
      onError: (message) => errors.push(message),
    });
    cleanup();
    expect(lastSocket?.closed).toBe(true);
    lastSocket?.onmessage?.({
      data: JSON.stringify({ data: { s: "BTCUSDT", c: "1", E: 1 } }),
    });
    lastSocket?.onerror?.();
    expect(updates).toEqual([]);
    expect(errors).toEqual([]);
    cleanup();
  });

  it("reports invalid messages without throwing", () => {
    const errors: string[] = [];
    const cleanup = openBinanceMiniTickerStream(["BTCUSDT"], {
      onUpdate: () => {},
      onError: (message) => errors.push(message),
    });
    lastSocket?.onmessage?.({ data: "not json" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/could not be parsed/);
    cleanup();
  });

  it("is a no-op for an empty symbol list", () => {
    const cleanup = openBinanceMiniTickerStream([], {
      onUpdate: () => {
        throw new Error("should not fire");
      },
      onError: () => {
        throw new Error("should not fire");
      },
    });
    cleanup();
  });
});
