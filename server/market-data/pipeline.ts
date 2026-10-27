import {
  MarketDataConfigurationError,
  MarketDataError,
  toMarketDataError,
} from "./errors";
import {
  delayLevelLabels,
  marketDataErrorDetails,
} from "./types";
import type {
  DelayLevel,
  MarketDataErrorKind,
  MarketDataPoint,
  PipelineSnapshot,
  PipelineStatus,
} from "./types";

export type PipelineDefinition = {  id: string;
  /** Provider display name shown in the UI, e.g. "Frankfurter (ECB)". */
  provider: string;
  displayName: string;
  /** Baseline delay for this pipeline's instruments. */
  delay: DelayLevel;
  /** True when this provider officially supports a WebSocket stream. */
  supportsRealtimeStream: boolean;
  /** Validates environment configuration; throws when missing. */
  isConfigured: () => boolean;
  /** Performs the actual provider work. */
  fetch: (signal?: AbortSignal) => Promise<MarketDataPoint[]>;
};

export type FetchOptions = {
  signal?: AbortSignal;
  /** Ignores the TTL cache and re-hits the provider. */
  force?: boolean;
};

/**
 * Longest-lived value we will hold per pipeline. Also used to bound memory so a
 * long-running server cannot grow without limit.
 */
const MAX_CACHED_POINTS = 64;

type CacheEntry = {
  dataPoints: MarketDataPoint[];
  expiresAtMs: number;
};

/**
 * Wraps a provider into an independently tracked pipeline. Each pipeline owns
 * its own status, cache and in-flight request, so one failing pipeline never
 * influences another: they never share state or a lock.
 */
export class MarketDataPipeline {
  readonly definition: PipelineDefinition;

  private state: PipelineStatus["state"] = "idle";
  private lastSuccessAtMs: number | null = null;
  private lastAttemptAtMs: number | null = null;
  private lastUpdatedAtMs: number | null = null;
  private error: PipelineStatus["error"] = null;
  private dataPointCount = 0;
  private cache: CacheEntry | null = null;
  private inFlight: Promise<MarketDataPoint[]> | null = null;

  constructor(definition: PipelineDefinition, private readonly cacheTtlMs: number) {
    this.definition = definition;
    this.state = definition.isConfigured() ? "idle" : "not-configured";
  }

  get id(): string {
    return this.definition.id;
  }

  get configured(): boolean {
    return this.definition.isConfigured();
  }

  /** Full pipeline status without touching the network. */
  getStatus(): PipelineStatus {
    const configured = this.configured;
    if (!configured) {
      return this.buildStatus("not-configured", {
        error: {
          kind: "not-configured",
          message: `${this.definition.displayName} is not configured. Add its credentials to .env.local.`,
          retryAfterSeconds: null,
        },
      });
    }
    return this.buildStatus(this.state);
  }

  /**
   * Connection probe: a lightweight provider call that fails loudly with the
   * right error kind. Never fabricates a "connected" value.
   */
  async testConnection(signal?: AbortSignal): Promise<PipelineStatus> {
    if (!this.configured) {
      this.state = "not-configured";
      this.error = {
        kind: "not-configured",
        message: `${this.definition.displayName} is not configured.`,
        retryAfterSeconds: null,
      };
      return this.buildStatus("not-configured");
    }

    this.state = "connecting";
    this.error = null;
    this.lastAttemptAtMs = Date.now();

    try {
      const points = await this.definition.fetch(signal);
      this.recordSuccess(points);
      return this.buildStatus("ready");
    } catch (error) {
      this.recordFailure(error);
      return this.buildStatus("error");
    }
  }

  /**
   * Returns cached points when fresh, otherwise fetches and caches. Concurrent
   * callers share one in-flight request, so a duplicate click cannot cause a
   * duplicate provider call (dedupe) or a burst of rate-limit errors.
   */
  async getData(
    { signal, force = false }: FetchOptions = {},
    ttlOverrideMs?: number,
  ): Promise<MarketDataPoint[]> {
    if (!this.configured) {
      throw new MarketDataConfigurationError(
        this.definition.provider,
        `${this.definition.displayName} is not configured. Add its credentials to .env.local.`,
      );
    }

    const ttlMs = ttlOverrideMs ?? this.cacheTtlMs;
    const now = Date.now();

    if (!force && this.cache && this.cache.expiresAtMs > now) {
      return this.cache.dataPoints;
    }

    if (this.inFlight) {
      // Another caller is already fetching; share the result.
      return this.inFlight;
    }

    this.state = "fetching";
    this.lastAttemptAtMs = now;
    this.error = null;

    const request = this.definition
      .fetch(signal)
      .then((points) => {
        this.recordSuccess(points);
        this.cache = { dataPoints: points, expiresAtMs: Date.now() + ttlMs };
        return points;
      })
      .catch((error: unknown) => {
        const marketDataError = toMarketDataError(this.definition.provider, error);
        this.recordFailure(marketDataError);
        throw marketDataError;
      })
      .finally(() => {
        this.inFlight = null;
      });

    this.inFlight = request;
    return request;
  }

  /** Snapshot for the API/UI: status plus the newest cached points. */
  getSnapshot(): PipelineSnapshot {
    return {
      status: this.buildStatus(this.state),
      dataPoints: this.cache?.dataPoints ?? [],
    };
  }

  private recordSuccess(points: MarketDataPoint[]): void {
    this.state = "ready";
    this.error = null;
    this.lastSuccessAtMs = Date.now();
    this.dataPointCount = points.length;
    const newest = points.reduce<number | null>((max, point) => {
      const observedAt = point.quote.observedAtMs;
      return max === null || observedAt > max ? observedAt : max;
    }, null);
    this.lastUpdatedAtMs = newest;
  }

  private recordFailure(error: unknown): void {
    const marketDataError = toMarketDataError(this.definition.provider, error);
    this.state = "error";
    this.error = {
      kind: marketDataError.kind,
      message: marketDataError.message,
      retryAfterSeconds: marketDataError.retryAfterSeconds,
    };
  }

  private buildStatus(
    state: PipelineStatus["state"],
    overrides: Partial<PipelineStatus> = {},
  ): PipelineStatus {
    const errorState: PipelineStatus["error"] =
      overrides.error === undefined ? this.error : overrides.error;
    const connected = state === "ready" && this.lastSuccessAtMs !== null;

    return {
      id: this.definition.id,
      provider: this.definition.provider,
      displayName: this.definition.displayName,
      state,
      delay: this.definition.delay,
      delayLabel: delayLevelLabels[this.definition.delay],
      configured: this.configured,
      connected,
      lastSuccessAtMs: this.lastSuccessAtMs,
      lastAttemptAtMs: this.lastAttemptAtMs,
      lastUpdatedAtMs: this.lastUpdatedAtMs,
      error: errorState,
      dataPointCount: this.dataPointCount,
    };
  }
}

export const MARKET_DATA_MAX_CACHED_POINTS = MAX_CACHED_POINTS;

/** Shared helper so every pipeline labels its data honestly and consistently. */
export function describeErrorKind(kind: MarketDataErrorKind): string {
  return marketDataErrorDetails[kind];
}
