import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ElevenLabsConfigurationError,
  isElevenLabsConfigured,
  synthesizeSpeech,
} from "@/lib/elevenlabs";

export const requestSchema = z.object({
  text: z.string().trim().min(1).max(2500),
  teamId: z.enum(["JARVIS", "FRIDAY", "ULTRON", "VISION"]).optional(),
  voiceId: z.string().trim().max(100).optional(),
});

export async function POST(request: Request) {
  if (!isElevenLabsConfigured()) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY is not configured.", fallback: true },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const { audio, contentType } = await synthesizeSpeech({
      text: parsed.data.text,
      teamId: parsed.data.teamId,
      voiceId: parsed.data.voiceId,
      signal: request.signal,
    });

    return new Response(audio as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    if (error instanceof ElevenLabsConfigurationError) {
      return NextResponse.json(
        { error: error.message, fallback: true },
        { status: 503 },
      );
    }
    const message =
      error instanceof Error ? error.message : "TTS synthesis failed.";
    return NextResponse.json(
      { error: message, fallback: true },
      { status: 500 },
    );
  }
}
