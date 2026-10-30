import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  clearAudioCacheForTesting,
  DEFAULT_AGENT_VOICES,
  ElevenLabsConfigurationError,
  getVoiceForTeam,
  isElevenLabsConfigured,
  synthesizeSpeech,
} from "./elevenlabs";

describe("lib/elevenlabs", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    clearAudioCacheForTesting();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("isElevenLabsConfigured", () => {
    it("returns true when ELEVENLABS_API_KEY is configured", () => {
      process.env.ELEVENLABS_API_KEY = "sk_test_123456789";
      expect(isElevenLabsConfigured()).toBe(true);
    });

    it("returns false when ELEVENLABS_API_KEY is missing or empty", () => {
      delete process.env.ELEVENLABS_API_KEY;
      expect(isElevenLabsConfigured()).toBe(false);

      process.env.ELEVENLABS_API_KEY = "   ";
      expect(isElevenLabsConfigured()).toBe(false);
    });
  });

  describe("getVoiceForTeam", () => {
    it("returns default agent voices for each team", () => {
      delete process.env.ELEVENLABS_VOICE_JARVIS;
      delete process.env.ELEVENLABS_VOICE_FRIDAY;
      delete process.env.ELEVENLABS_VOICE_ULTRON;
      delete process.env.ELEVENLABS_VOICE_VISION;
      delete process.env.ELEVENLABS_VOICE_ID;

      expect(getVoiceForTeam("JARVIS")).toBe(DEFAULT_AGENT_VOICES.JARVIS);
      expect(getVoiceForTeam("FRIDAY")).toBe(DEFAULT_AGENT_VOICES.FRIDAY);
      expect(getVoiceForTeam("ULTRON")).toBe(DEFAULT_AGENT_VOICES.ULTRON);
      expect(getVoiceForTeam("VISION")).toBe(DEFAULT_AGENT_VOICES.VISION);
      expect(getVoiceForTeam()).toBe(DEFAULT_AGENT_VOICES.JARVIS);
    });

    it("respects environment variable overrides", () => {
      process.env.ELEVENLABS_VOICE_JARVIS = "custom-jarvis-voice";
      process.env.ELEVENLABS_VOICE_FRIDAY = "custom-friday-voice";

      expect(getVoiceForTeam("JARVIS")).toBe("custom-jarvis-voice");
      expect(getVoiceForTeam("FRIDAY")).toBe("custom-friday-voice");
    });

    it("uses ELEVENLABS_VOICE_ID as default voice override when set", () => {
      process.env.ELEVENLABS_VOICE_ID = "ncEWZCGHgIBruUURcL4M";

      expect(getVoiceForTeam()).toBe("ncEWZCGHgIBruUURcL4M");
      expect(getVoiceForTeam("JARVIS")).toBe("ncEWZCGHgIBruUURcL4M");
    });
  });

  describe("synthesizeSpeech", () => {
    it("throws ElevenLabsConfigurationError when ELEVENLABS_API_KEY is not configured", async () => {
      delete process.env.ELEVENLABS_API_KEY;

      await expect(
        synthesizeSpeech({ text: "Hello world", teamId: "JARVIS" }),
      ).rejects.toThrow(ElevenLabsConfigurationError);
    });

    it("throws error when text is empty", async () => {
      process.env.ELEVENLABS_API_KEY = "sk_test_123456789";

      await expect(
        synthesizeSpeech({ text: "   ", teamId: "JARVIS" }),
      ).rejects.toThrow("Text is required for speech synthesis.");
    });

    it("calls ElevenLabs API with correct parameters and returns audio", async () => {
      process.env.ELEVENLABS_API_KEY = "sk_mock_api_key";

      const mockAudioData = new Uint8Array([1, 2, 3, 4, 5]);
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockAudioData.buffer,
      } as unknown as Response);

      const result = await synthesizeSpeech({
        text: "System initialized, Sir.",
        teamId: "JARVIS",
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toContain(DEFAULT_AGENT_VOICES.JARVIS);
      expect((options?.headers as Record<string, string>)["xi-api-key"]).toBe(
        "sk_mock_api_key",
      );
      expect(result.contentType).toBe("audio/mpeg");
      expect(result.audio).toEqual(mockAudioData);
    });

    it("caches audio and returns cached audio on repeated identical requests", async () => {
      process.env.ELEVENLABS_API_KEY = "sk_mock_api_key";

      const mockAudioData = new Uint8Array([10, 20, 30]);
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        arrayBuffer: async () => mockAudioData.buffer,
      } as unknown as Response);

      const first = await synthesizeSpeech({
        text: "Voice assistant activated sir.",
        teamId: "JARVIS",
      });
      const second = await synthesizeSpeech({
        text: "Voice assistant activated sir.",
        teamId: "JARVIS",
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1); // Cached! Not called again
      expect(second.audio).toEqual(first.audio);
    });

    it("handles API error responses with descriptive error messages", async () => {
      process.env.ELEVENLABS_API_KEY = "sk_mock_api_key";

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          detail: { message: "Invalid API key provided." },
        }),
      } as unknown as Response);

      await expect(
        synthesizeSpeech({ text: "Hello", teamId: "JARVIS" }),
      ).rejects.toThrow("Invalid API key provided.");
    });
  });
});
