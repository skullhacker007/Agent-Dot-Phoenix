import {
  getNvidiaErrorStatus,
  getNvidiaRetryAfter,
  listNvidiaModels,
  NvidiaConfigurationError,
} from "@/lib/nvidia";

export async function GET(request: Request) {
  try {
    const models = await listNvidiaModels(request.signal);

    return Response.json(
      {
        models,
        assignedModel: null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (request.signal.aborted) {
      return Response.json({ error: "Model discovery was cancelled." }, { status: 499 });
    }
    if (error instanceof NvidiaConfigurationError) {
      return Response.json(
        { error: error.message },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const status = getNvidiaErrorStatus(error);
    const retryAfter = status === 429 ? (getNvidiaRetryAfter(error) ?? "60") : null;
    console.error("Unable to discover available NVIDIA models.", {
      status,
      message:
        error instanceof Error ? error.message : "Unknown provider error.",
    });
    return Response.json(
      {
        error:
          status === 429
            ? "NVIDIA rate-limited model discovery. Please try again later."
            : status === 401 || status === 403
              ? "NVIDIA rejected the server credentials."
              : "Unable to load available Vision models.",
      },
      {
        status: status === 429 ? 429 : status === 401 || status === 403 ? 503 : 502,
        headers: {
          "Cache-Control": "no-store",
          ...(retryAfter ? { "Retry-After": retryAfter } : {}),
        },
      },
    );
  }
}
