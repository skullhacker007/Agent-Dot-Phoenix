import { NextResponse } from "next/server";
import { DEFAULT_AGENT_VOICES, isElevenLabsConfigured } from "@/lib/elevenlabs";

export async function GET() {
  return NextResponse.json({
    configured: isElevenLabsConfigured(),
    defaultVoices: DEFAULT_AGENT_VOICES,
  });
}
