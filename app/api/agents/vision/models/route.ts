import {
  DEFAULT_VISION_MODEL_ID,
  listNvidiaModels,
  NvidiaConfigurationError,
} from "@/lib/nvidia";

export async function GET(request: Request) {
  try {
    const models = await listNvidiaModels(request.signal);

    return Response.json(
      {
        models,
        assignedModel: models.includes(DEFAULT_VISION_MODEL_ID)
          ? DEFAULT_VISION_MODEL_ID
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof NvidiaConfigurationError) {
      return Response.json(
        { error: error.message },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : undefined;
    console.error("Unable to discover available NVIDIA models.", {
      status,
      message:
        error instanceof Error ? error.message : "Unknown provider error.",
    });
    return Response.json(
      {
        error:
          status === 401 || status === 403
            ? "NVIDIA rejected the server credentials."
            : "Unable to load available Vision models.",
      },
      {
        status: status === 401 || status === 403 ? 503 : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
