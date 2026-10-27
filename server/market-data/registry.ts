import "server-only";

import { MarketDataPipeline } from "./pipeline";
import type { MarketDataErrorKind } from "./types";
import {
  PROVIDER_CRYPTO,
  PROVIDER_FX,
  fetchCurrenciesAndCrypto,
  isCurrencyCryptoConfigured,
} from "./pipelines/currencies-crypto";
import {
  PROVIDER_METALS,
  PROVIDER_METALS_DISCOVERY,
  fetchMetalsAndCommodities,
  isMetalsConfigured,
} from "./pipelines/metals-commodities";
import {
  PROVIDER_UPSTOX,
  fetchIndianEquities,
  isUpstoxConfigured,
} from "./pipelines/indian-equities";
import {
  PROVIDER_GLOBAL,
  fetchGlobalEquities,
  isGlobalEquitiesConfigured,
} from "./pipelines/global-equities";

/**
 * The four pipelines, each fully independent: its own provider(s), config,
 * fetch, cache, dedupe slot and status. No shared mutable state exists between
 * them, so one failing pipeline cannot affect the others.
 */

const CACHE_TTL_MS = Number(
  process.env.MARKET_DATA_CACHE_TTL_MS ?? 30_000,
);

function buildPipelines(): Map<string, MarketDataPipeline> {
  const entries: Array<[string, MarketDataPipeline]> = [
    [
      "currencies-crypto",
      new MarketDataPipeline(
        {
          id: "currencies-crypto",
          provider: `${PROVIDER_FX} + ${PROVIDER_CRYPTO}`,
          displayName: "Currencies & Crypto",
          delay: "delayed",
          supportsRealtimeStream: true,
          isConfigured: isCurrencyCryptoConfigured,
          fetch: fetchCurrenciesAndCrypto,
        },
        CACHE_TTL_MS,
      ),
    ],
    [
      "metals-commodities",
      new MarketDataPipeline(
        {
          id: "metals-commodities",
          provider: `${PROVIDER_METALS} + ${PROVIDER_METALS_DISCOVERY}`,
          displayName: "Metals & Commodities",
          delay: "delayed",
          supportsRealtimeStream: false,
          isConfigured: isMetalsConfigured,
          fetch: fetchMetalsAndCommodities,
        },
        CACHE_TTL_MS,
      ),
    ],
    [
      "indian-equities",
      new MarketDataPipeline(
        {
          id: "indian-equities",
          provider: PROVIDER_UPSTOX,
          displayName: "Indian Equities & Indices",
          delay: "realtime",
          supportsRealtimeStream: true,
          isConfigured: isUpstoxConfigured,
          fetch: fetchIndianEquities,
        },
        CACHE_TTL_MS,
      ),
    ],
    [
      "global-equities",
      new MarketDataPipeline(
        {
          id: "global-equities",
          provider: PROVIDER_GLOBAL,
          displayName: "Global Equities & Indices",
          delay: "delayed",
          supportsRealtimeStream: false,
          isConfigured: isGlobalEquitiesConfigured,
          fetch: fetchGlobalEquities,
        },
        CACHE_TTL_MS,
      ),
    ],
  ];
  return new Map(entries);
}

const pipelines = buildPipelines();

export const PIPELINE_IDS = [...pipelines.keys()] as const;
export type PipelineId = (typeof PIPELINE_IDS)[number];

export function getPipeline(id: string): MarketDataPipeline | null {
  return pipelines.get(id) ?? null;
}

export function listPipelineStatuses() {
  return [...pipelines.values()].map((pipeline) => pipeline.getStatus());
}

export function isKnownPipelineId(id: string): id is PipelineId {
  return pipelines.has(id);
}

export type { MarketDataErrorKind };
