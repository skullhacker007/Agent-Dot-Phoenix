/**
 * WebSocket helpers for the temporary Vision test UI.
 *
 * Browser-only (no server-only): Binance's public spot stream is officially
 * supported and requires no API key, so the temporary UI subscribes directly
 * from the client instead of proxying through the server.
 */

export type MiniTickerUpdate = {
  symbol: string;
  price: number;
  eventTimeMs: number;
};

export type SpotStreamCallbacks = {
  onUpdate: (update: MiniTickerUpdate) => void;
  onError: (message: string) => void;
};

const BINANCE_STREAM_BASE = "wss://stream.binance.com:9443/stream";

/**
 * Opens a Binance multi-miniTicker stream for the given symbols and returns a
 * cleanup function. The UI must call cleanup on unmount or when switching
 * symbols so sockets never leak.
 */
export function openBinanceMiniTickerStream(
  symbols: string[],
  { onUpdate, onError }: SpotStreamCallbacks,
): () => void {
  if (symbols.length === 0) {
    return () => {};
  }
  const streams = symbols.map((s) => `${s.toLowerCase()}@miniTicker`).join("/");
  const socket = new WebSocket(`${BINANCE_STREAM_BASE}?streams=${streams}`);
  let closed = false;

  socket.onmessage = (event: MessageEvent) => {
    if (closed) return;
    try {
      const payload = JSON.parse(String(event.data)) as {
        data?: { s?: string; c?: string; E?: number };
      };
      const symbol = payload.data?.s;
      const price = payload.data?.c ? Number(payload.data.c) : Number.NaN;
      if (symbol && Number.isFinite(price)) {
        onUpdate({ symbol, price, eventTimeMs: payload.data?.E ?? Date.now() });
      }
    } catch {
      onError("Binance stream sent a message that could not be parsed.");
    }
  };

  socket.onerror = () => {
    if (!closed) onError("Binance stream connection failed.");
  };

  return () => {
    if (closed) return;
    closed = true;
    try {
      socket.close();
    } catch {
      // Closing is best effort; there is nothing actionable to report.
    }
  };
}
