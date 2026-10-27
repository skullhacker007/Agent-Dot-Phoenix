import "server-only";

/**
 * Shared cache for *discovery* results (the instrument universe each provider
 * exposes at runtime).
 *
 * Discovery is deliberately separate from the per-pipeline quote cache: a
 * universe changes on the provider's schedule (daily for instrument masters,
 * continuously for market listings), while quotes change every few seconds.
 * Each entry is independent, so one provider's failed discovery cannot affect
 * another's.
 */

type CacheEntry<T> = {
  value: T;
  expiresAtMs: number;
};

const entries = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

export const DISCOVERY_TTL_MS = {
  /** Instrument master files refresh daily upstream. */
  instrumentMaster: 6 * 60 * 60 * 1000,
  /** Listing/exchange metadata changes rarely. */
  listings: 60 * 60 * 1000,
  /** FX currency list changes rarely. */
  currencies: 24 * 60 * 60 * 1000,
  /** Search results are the least stable, so they expire fastest. */
  search: 60 * 60 * 1000,
  /** Yahoo session (cookie + crumb) stays valid for a while. */
  session: 30 * 60 * 1000,
} as const;

/**
 * Returns the cached value when fresh, otherwise loads it. Concurrent callers
 * share one load, so a burst of requests cannot trigger parallel downloads of
 * the same instrument master.
 */
export async function withDiscoveryCache<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const existing = entries.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAtMs > now) return existing.value;

  const running = inFlight.get(key) as Promise<T> | undefined;
  if (running) return running;

  const pending = load()
    .then((value) => {
      entries.set(key, { value, expiresAtMs: Date.now() + ttlMs });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, pending);
  return pending;
}

/** Test helper: drops cached discovery results so each case starts clean. */
export function resetDiscoveryCache(): void {
  entries.clear();
  inFlight.clear();
}
