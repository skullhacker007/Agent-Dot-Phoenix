import { z } from "zod";
import type { TeamId } from "@/lib/agent-monitoring";
import {
  getNvidiaErrorStatus,
  getNvidiaRetryAfter,
  listNvidiaModels,
  NvidiaConfigurationError,
} from "@/lib/nvidia";

const teamIdSchema = z.enum(["JARVIS", "FRIDAY", "ULTRON", "VISION"]);

function getTeamId(value: string | null): TeamId | null {
  const parsed = teamIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function GET(request: Request) {
  const teamId = getTeamId(new URL(request.url).searchParams.get("teamId"));
  if (!teamId) {
    return Response.json({ error: "A valid teamId is required." }, { status: 400 });
  }

  try {
    const models = await listNvidiaModels(request.signal);
    return Response.json(
      { models, assignedModel: null },
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
    console.error("Unable to load available NVIDIA models.", {
      status,
      message: error instanceof Error ? error.message : "Unknown error.",
    });
    return Response.json(
      {
        error:
          status === 429
            ? "NVIDIA rate-limited model discovery. Please try again later."
            : status === 401 || status === 403
              ? "NVIDIA rejected the server credentials."
              : "Unable to load available NVIDIA models.",
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
