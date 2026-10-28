import { z } from "zod";

/**
 * Delay classification for a market data point.
 * Every provider is honest about this instead of pretending all data is live.
 */
export const delayLevelSchema = z.enum(["realtime", "delayed", "end-of-day"]);
export type DelayLevel = z.infer<typeof delayLevelSchema>;

export const delayLevelLabels: Record<DelayLevel, string> = {
  realtime: "Real-time",
  delayed: "Delayed",
  "end-of-day": "End-of-day",
};

/** Where an error came from, so the UI can react differently per cause. */
export const marketDataErrorKindSchema = z.enum([
  "auth",
  "expired-token",
  "timeout",
  "rate-limit",
  "invalid-data",
  "outage",
  "http",
  "network",
  "not-configured",
  "aborted",
]);
export type MarketDataErrorKind = z.infer<typeof marketDataErrorKindSchema>;

export const pipelineStateSchema = z.enum([
  "idle",
  "connecting",
  "ready",
  "fetching",
  "error",
  "not-configured",
]);
export type PipelineState = z.infer<typeof pipelineStateSchema>;

export const marketDepthItemSchema = z.object({
  quantity: z.number().nullable().optional(),
  price: z.number().nullable().optional(),
  orders: z.number().nullable().optional(),
});
export type MarketDepthItem = z.infer<typeof marketDepthItemSchema>;

export const quoteSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().min(1),
  /** Numeric price/level, or null when the provider reports it as unavailable. */
  value: z.number().finite().nullable(),
  currency: z.string().min(1),
  /** 24h or session change where the provider reports one. */
  change: z.number().finite().nullable(),
  changePercent: z.number().finite().nullable(),
  /** Provider timestamp of the quote, as epoch milliseconds. */
  observedAtMs: z.number().int().nonnegative(),
  /** Provider-reported change since previous session, when available. */
  previousClose: z.number().finite().nullable(),
  open: z.number().finite().nullable().optional(),
  high: z.number().finite().nullable().optional(),
  low: z.number().finite().nullable().optional(),
  close: z.number().finite().nullable().optional(),
  volume: z.number().finite().nullable().optional(),
  averagePrice: z.number().finite().nullable().optional(),
  totalBuyQuantity: z.number().finite().nullable().optional(),
  totalSellQuantity: z.number().finite().nullable().optional(),
  lowerCircuit: z.number().finite().nullable().optional(),
  upperCircuit: z.number().finite().nullable().optional(),
  /** Provider-reported last trade execution timestamp on exchange, in epoch ms. */
  lastTradeTimeMs: z.number().int().nonnegative().nullable().optional(),
  depth: z
    .object({
      buy: z.array(marketDepthItemSchema).nullish(),
      sell: z.array(marketDepthItemSchema).nullish(),
    })
    .nullish(),
});
export type MarketQuote = z.infer<typeof quoteSchema>;

export const dataPointSchema = z.object({
  /** Instrument identifier as configured for this pipeline. */
  instrument: z.string().min(1),
  /** Human readable label for the UI. */
  label: z.string().min(1),
  /** Grouping inside the pipeline (e.g. "FX", "Crypto"). */
  group: z.string().min(1),
  quote: quoteSchema,
  /** How stale this specific data point is. */
  delay: delayLevelSchema,
  /** True when the provider supports an official WebSocket stream. */
  supportsRealtimeStream: z.boolean(),
});
export type MarketDataPoint = z.infer<typeof dataPointSchema>;

export const pipelineStatusSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  displayName: z.string().min(1),
  state: pipelineStateSchema,
  delay: delayLevelSchema,
  delayLabel: z.string().min(1),
  configured: z.boolean(),
  /** True once a verified provider response has been received. */
  connected: z.boolean(),
  lastSuccessAtMs: z.number().int().nonnegative().nullable(),
  lastAttemptAtMs: z.number().int().nonnegative().nullable(),
  /** Newest quote timestamp across the last successful fetch. */
  lastUpdatedAtMs: z.number().int().nonnegative().nullable(),
  error: z
    .object({
      kind: marketDataErrorKindSchema,
      message: z.string().min(1),
      /** Retry-After seconds, when the provider sent one. */
      retryAfterSeconds: z.number().int().nonnegative().nullable(),
    })
    .nullable(),
  /** Number of quote points returned by the last successful fetch. */
  dataPointCount: z.number().int().nonnegative(),
});
export type PipelineStatus = z.infer<typeof pipelineStatusSchema>;

export const pipelineSnapshotSchema = z.object({
  status: pipelineStatusSchema,
  dataPoints: z.array(dataPointSchema),
});
export type PipelineSnapshot = z.infer<typeof pipelineSnapshotSchema>;

/** GET /api/market-data/[pipelineId] response shape. */
export const pipelineStatusResponseSchema = z.object({
  snapshot: pipelineSnapshotSchema,
});
export type PipelineStatusResponse = z.infer<typeof pipelineStatusResponseSchema>;

/** POST /api/market-data/[pipelineId] response shape. */
export const pipelineFetchResponseSchema = z.object({
  snapshot: pipelineSnapshotSchema,
  dataPoints: z.array(dataPointSchema),
});
export type PipelineFetchResponse = z.infer<typeof pipelineFetchResponseSchema>;

/** POST error shape: same snapshot plus a typed error. */
export const pipelineErrorResponseSchema = z.object({
  snapshot: pipelineSnapshotSchema,
  error: z.object({
    kind: marketDataErrorKindSchema,
    message: z.string(),
    retryAfterSeconds: z.number().int().nonnegative().nullable(),
  }),
});
export type PipelineErrorResponse = z.infer<typeof pipelineErrorResponseSchema>;

/** GET /api/market-data/all response shape. */
export const pipelineStatusListResponseSchema = z.object({
  statuses: z.array(pipelineStatusSchema),
});

export const marketDataErrorDetails = {
  auth: "The provider rejected the API credentials.",
  "expired-token": "The provider access token has expired.",
  timeout: "The provider did not respond before the request timeout.",
  "rate-limit": "The provider rate limit was reached.",
  "invalid-data": "The provider returned data that failed validation.",
  outage: "The provider appears to be down or unreachable.",
  http: "The provider returned an unexpected HTTP response.",
  network: "A network error occurred while contacting the provider.",
  "not-configured": "This pipeline is not configured yet.",
  aborted: "The request was cancelled.",
} as const satisfies Record<MarketDataErrorKind, string>;
