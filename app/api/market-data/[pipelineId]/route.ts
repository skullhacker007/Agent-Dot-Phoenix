import {
  isKnownPipelineId,
  getPipeline,
  listPipelineStatuses,
} from "@/server/market-data/registry";
import { MarketDataError } from "@/server/market-data/errors";
import { connection } from "next/server";

type RouteContext = {
  params: Promise<{ pipelineId: string }>;
};

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * TEMPORARY: market-data pipeline diagnostics for the Vision page only.
 * Authenticated provider calls stay server-side; the browser never receives
 * provider credentials.
 */
export async function GET(_request: Request, context: RouteContext) {
  await connection();
  const { pipelineId } = await context.params;

  if (pipelineId === "all") {
    return Response.json({ statuses: listPipelineStatuses() }, { headers: NO_STORE });
  }

  const pipeline = isKnownPipelineId(pipelineId) ? getPipeline(pipelineId) : null;
  if (!pipeline) {
    return Response.json(
      { error: "Unknown market data pipeline." },
      { status: 404, headers: NO_STORE },
    );
  }

  const url = new URL(_request.url);
  if (url.searchParams.get("force") === "true") {
    try {
      await pipeline.getData({ signal: _request.signal, force: true });
    } catch {
      // Return whatever snapshot is available on error
    }
  }

  return Response.json(
    { snapshot: pipeline.getSnapshot() },
    { headers: NO_STORE },
  );
}

/** POST runs a live provider fetch for one pipeline. */
export async function POST(request: Request, context: RouteContext) {
  await connection();
  const { pipelineId } = await context.params;

  const pipeline = isKnownPipelineId(pipelineId) ? getPipeline(pipelineId) : null;
  if (!pipeline) {
    return Response.json(
      { error: "Unknown market data pipeline." },
      { status: 404, headers: NO_STORE },
    );
  }

  try {
    await pipeline.getData({ signal: request.signal, force: true });
    // getData caches on success; re-read so status + points stay consistent.
    const snapshot = pipeline.getSnapshot();
    return Response.json(
      { snapshot, dataPoints: snapshot.dataPoints },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof MarketDataError) {
      const status =
        error.kind === "not-configured"
          ? 503
          : error.kind === "rate-limit"
            ? 429
            : error.kind === "auth" || error.kind === "expired-token"
              ? 503
              : 502;
      return Response.json(
        {
          snapshot: pipeline.getSnapshot(),
          error: {
            kind: error.kind,
            message: error.message,
            retryAfterSeconds: error.retryAfterSeconds,
          },
        },
        {
          status,
          headers: {
            ...NO_STORE,
            ...(error.kind === "rate-limit" && error.retryAfterSeconds
              ? { "Retry-After": String(error.retryAfterSeconds) }
              : {}),
          },
        },
      );
    }
    return Response.json(
      {
        snapshot: pipeline.getSnapshot(),
        error: { kind: "network", message: "Unexpected pipeline failure." },
      },
      { status: 502, headers: NO_STORE },
    );
  }
}
