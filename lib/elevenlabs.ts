import "server-only";

import type { TeamId } from "./agent-monitoring";

export class ElevenLabsConfigurationError extends Error {
  constructor(message = "ELEVENLABS_API_KEY is not configured.") {
    super(message);
    this.name = "ElevenLabsConfigurationError";
  }
}

export const DEFAULT_AGENT_VOICES: Record<TeamId, string> = {
  JARVIS: "JBFqnCBsd6RMkjVDRZzb", // George - Warm, British, articulate storyteller (J.A.R.V.I.S)
  FRIDAY: "cgSgspJ2msm6clMCkdW9", // Jessica - Bright, warm, responsive assistant (F.R.I.D.A.Y)
  ULTRON: "pNInz6obpgDQGcFmaJgB", // Adam - Dominant, firm authority (Ultron) [premade]
  VISION: "onwK4e9ZLuTAKqWW03F9", // Daniel - Steady, articulate broadcaster (Vision)
};

export function getVoiceForTeam(teamId?: TeamId | string | null): string {
  if (teamId === "JARVIS") {
    return (
      process.env.ELEVENLABS_VOICE_JARVIS ||
      process.env.ELEVENLABS_VOICE_ID ||
      DEFAULT_AGENT_VOICES.JARVIS
    );
  }
  if (teamId === "FRIDAY") {
    return process.env.ELEVENLABS_VOICE_FRIDAY || DEFAULT_AGENT_VOICES.FRIDAY;
  }
  if (teamId === "ULTRON") {
    return process.env.ELEVENLABS_VOICE_ULTRON || DEFAULT_AGENT_VOICES.ULTRON;
  }
  if (teamId === "VISION") {
    return process.env.ELEVENLABS_VOICE_VISION || DEFAULT_AGENT_VOICES.VISION;
  }
  return (
    process.env.ELEVENLABS_VOICE_ID ||
    process.env.ELEVENLABS_VOICE_JARVIS ||
    DEFAULT_AGENT_VOICES.JARVIS
  );
}

export function isElevenLabsConfigured(): boolean {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  return Boolean(key && key.length > 5);
}

export type SynthesizeSpeechOptions = {
  text: string;
  teamId?: TeamId | string;
  voiceId?: string;
  modelId?: string;
  signal?: AbortSignal;
};

const audioCache = new Map<string, { buffer: Uint8Array; createdAt: number }>();
const MAX_CACHE_SIZE = 50;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function clearAudioCacheForTesting() {
  audioCache.clear();
}

export async function synthesizeSpeech({
  text,
  teamId,
  voiceId,
  modelId = "eleven_turbo_v2_5",
  signal,
}: SynthesizeSpeechOptions): Promise<{ audio: Uint8Array; contentType: string }> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    throw new ElevenLabsConfigurationError();
  }

  const trimmedText = text.trim();
  if (!trimmedText) {
    throw new Error("Text is required for speech synthesis.");
  }

  const targetVoiceId = voiceId?.trim() || getVoiceForTeam(teamId);
  const cacheKey = `${targetVoiceId}:${trimmedText.toLowerCase()}`;

  const cached = audioCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { audio: cached.buffer, contentType: "audio/mpeg" };
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
    targetVoiceId,
  )}?output_format=mp3_44100_128`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: trimmedText,
      model_id: modelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
    signal,
  });

  if (!response.ok) {
    let errorMessage = `ElevenLabs API returned HTTP ${response.status}`;
    try {
      const errorJson = (await response.json()) as {
        detail?: { message?: string } | string;
        message?: string;
      };
      const detail =
        typeof errorJson.detail === "object"
          ? errorJson.detail?.message
          : errorJson.detail;
      errorMessage = detail || errorJson.message || errorMessage;
    } catch {}

    const defaultPremade =
      (teamId && DEFAULT_AGENT_VOICES[teamId as TeamId]) ||
      DEFAULT_AGENT_VOICES.JARVIS;
    if (
      errorMessage.toLowerCase().includes("library voice") &&
      targetVoiceId !== defaultPremade
    ) {
      return synthesizeSpeech({
        text,
        teamId,
        voiceId: defaultPremade,
        modelId,
        signal,
      });
    }

    throw new Error(errorMessage);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  if (audioCache.size >= MAX_CACHE_SIZE) {
    const firstKey = audioCache.keys().next().value;
    if (firstKey) audioCache.delete(firstKey);
  }
  audioCache.set(cacheKey, { buffer, createdAt: Date.now() });

  return { audio: buffer, contentType: "audio/mpeg" };
}
