import {
  MarketDataError,
  errorKindForHttpStatus,
} from "./errors";

const DEFAULT_TIMEOUT_MS = 8_000;

export type ProviderHttpRequest = {
  url: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Optional body for POST-style provider calls. */
  method?: string;
  body?: string;
};

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

/**
 * Performs a provider request with an explicit timeout so a hanging upstream
 * cannot stall a pipeline for ever. Timeouts and aborts are surfaced as
 * distinct error kinds.
 */
export async function requestProviderJson<T>(
  provider: string,
  request: ProviderHttpRequest,
  parse: (payload: unknown) => T,
): Promise<T> {
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException("The operation timed out.", "TimeoutError")), timeoutMs);

  const onOuterAbort = () => controller.abort(new DOMException("The operation was aborted.", "AbortError"));
  request.signal?.addEventListener("abort", onOuterAbort, { once: true });

  try {
    const response = await fetch(request.url, {
      method: request.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...request.headers,
      },
      body: request.body,
      signal: controller.signal,
      cache: "no-store",
    });

    const retryAfterSeconds = parseRetryAfter(
      response.headers.get("retry-after"),
    );

    if (!response.ok) {
      const kind = errorKindForHttpStatus(response.status);
      // Read the body defensively: some providers send HTML on errors.
      const detail = await response.text().catch(() => "");
      let message: string;
      if (kind === "auth") {
        message = `${provider} rejected the credentials (HTTP ${response.status}). Check that the token is present, valid and unexpired.`;
      } else if (kind === "expired-token") {
        message = `${provider} access token has expired (HTTP ${response.status}). Re-authorise to restore this pipeline.`;
      } else if (kind === "rate-limit") {
        message = `${provider} rate limit reached (HTTP 429).`;
      } else if (kind === "timeout") {
        message = `${provider} timed out (HTTP ${response.status}).`;
      } else if (kind === "outage") {
        message = `${provider} returned a server error (HTTP ${response.status}); the provider may be down.`;
      } else {
        message = `${provider} returned HTTP ${response.status}.`;
      }
      if (detail && detail.length <= 200) message += ` ${detail}`;

      throw new MarketDataError({
        provider,
        kind,
        message,
        status: response.status,
        retryAfterSeconds,
      });
    }

    const payload: unknown = await response.json();
    return parse(payload);
  } catch (error) {
    if (error instanceof MarketDataError) throw error;
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new MarketDataError({
        provider,
        kind: "timeout",
        message: `${provider} did not respond within ${timeoutMs}ms.`,
        cause: error,
      });
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new MarketDataError({
        provider,
        kind: "aborted",
        message: `${provider} request was cancelled.`,
        cause: error,
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|network|socket/i.test(message)) {
      throw new MarketDataError({
        provider,
        kind: "outage",
        message: `${provider} is unreachable from this environment.`,
        cause: error,
      });
    }
    throw new MarketDataError({
      provider,
      kind: "invalid-data",
      message: `${provider} returned a response that could not be parsed.`,
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener("abort", onOuterAbort);
  }
}

/** Reads a provider response as text, for providers that serve CSV. */
export async function requestProviderText(
  provider: string,
  request: ProviderHttpRequest,
): Promise<string> {
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new DOMException("The operation timed out.", "TimeoutError")),
    timeoutMs,
  );

  try {
    const response = await fetch(request.url, {
      method: request.method ?? "GET",
      headers: { Accept: "*/*", ...request.headers },
      signal: controller.signal,
      cache: "no-store",
    });
    const retryAfterSeconds = parseRetryAfter(response.headers.get("retry-after"));
    if (!response.ok) {
      throw new MarketDataError({
        provider,
        kind: errorKindForHttpStatus(response.status),
        message: `${provider} returned HTTP ${response.status}.`,
        status: response.status,
        retryAfterSeconds,
      });
    }
    return await response.text();
  } catch (error) {
    if (error instanceof MarketDataError) throw error;
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new MarketDataError({
        provider,
        kind: "timeout",
        message: `${provider} did not respond within ${timeoutMs}ms.`,
        cause: error,
      });
    }
    throw new MarketDataError({
      provider,
      kind: "outage",
      message: `${provider} is unreachable from this environment.`,
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Reads a provider response as raw bytes, for providers that serve gzip files. */
export async function requestProviderBytes(
  provider: string,
  request: ProviderHttpRequest,
): Promise<Uint8Array> {
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new DOMException("The operation timed out.", "TimeoutError")),
    timeoutMs,
  );

  const onOuterAbort = () => controller.abort(new DOMException("The operation was aborted.", "AbortError"));
  request.signal?.addEventListener("abort", onOuterAbort, { once: true });

  try {
    const response = await fetch(request.url, {
      method: request.method ?? "GET",
      headers: { Accept: "*/*", ...request.headers },
      signal: controller.signal,
      cache: "no-store",
    });
    const retryAfterSeconds = parseRetryAfter(response.headers.get("retry-after"));
    if (!response.ok) {
      throw new MarketDataError({
        provider,
        kind: errorKindForHttpStatus(response.status),
        message: `${provider} returned HTTP ${response.status}.`,
        status: response.status,
        retryAfterSeconds,
      });
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    if (error instanceof MarketDataError) throw error;
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new MarketDataError({
        provider,
        kind: "timeout",
        message: `${provider} did not respond within ${timeoutMs}ms.`,
        cause: error,
      });
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new MarketDataError({
        provider,
        kind: "aborted",
        message: `${provider} request was cancelled.`,
        cause: error,
      });
    }
    throw new MarketDataError({
      provider,
      kind: "outage",
      message: `${provider} is unreachable from this environment.`,
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener("abort", onOuterAbort);
  }
}

/**
 * Minimal retry-After aware helper: keeps rate-limited pipelines from hammering
 * a provider that has already said "slow down".
 */
export function rateLimitBackoffMs(retryAfterSeconds: number | null): number {
  return retryAfterSeconds ? retryAfterSeconds * 1000 : 30_000;
}
