import type { MarketDataErrorKind } from "./types";

/**
 * A provider failure carrying a machine-readable cause, so callers (and the UI)
 * can distinguish auth, timeouts, rate limits, outages and bad data instead of
 * lumping every failure together.
 */
export class MarketDataError extends Error {
  readonly kind: MarketDataErrorKind;
  readonly provider: string;
  readonly status: number | null;
  readonly retryAfterSeconds: number | null;
  readonly retryable: boolean;

  constructor(options: {
    provider: string;
    kind: MarketDataErrorKind;
    message: string;
    status?: number | null;
    retryAfterSeconds?: number | null;
    cause?: unknown;
  }) {
    super(options.message, options.cause ? { cause: options.cause } : undefined);
    this.name = "MarketDataError";
    this.kind = options.kind;
    this.provider = options.provider;
    this.status = options.status ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    this.retryable =
      options.kind === "timeout" ||
      options.kind === "rate-limit" ||
      options.kind === "outage" ||
      options.kind === "network";
  }
}

export class MarketDataConfigurationError extends MarketDataError {
  constructor(provider: string, message: string) {
    super({ provider, kind: "not-configured", message });
    this.name = "MarketDataConfigurationError";
  }
}

export function toMarketDataError(
  provider: string,
  error: unknown,
): MarketDataError {
  if (error instanceof MarketDataError) return error;
  if (error instanceof MarketDataConfigurationError) return error;

  const message =
    error instanceof Error ? error.message : "Unknown provider error.";

  // Node/undici signal mapping: a timeout fires as TimeoutError, a cancel as AbortError.
  if (error instanceof Error && (error.name === "TimeoutError" || /timed? ?out/i.test(message))) {
    return new MarketDataError({
      provider,
      kind: "timeout",
      message: `Request to ${provider} timed out.`,
      cause: error,
    });
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new MarketDataError({
      provider,
      kind: "aborted",
      message: `Request to ${provider} was aborted.`,
      cause: error,
    });
  }

  return new MarketDataError({
    provider,
    kind: "network",
    message,
    cause: error,
  });
}

/** HTTP status → error kind, keeping auth vs rate limit vs outage distinct. */
export function errorKindForHttpStatus(status: number): MarketDataErrorKind {
  if (status === 401) return "auth";
  if (status === 403) return "auth";
  if (status === 419 || status === 440) return "expired-token";
  if (status === 408) return "timeout";
  if (status === 429) return "rate-limit";
  if (status >= 500) return "outage";
  return "http";
}
