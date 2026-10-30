import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { POST, requestSchema } from "../../app/api/voice/speak/route";
import * as elevenlabsModule from "../../lib/elevenlabs";

describe("app/api/voice/speak/route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("requestSchema", () => {
    it("validates valid payload", () => {
      const valid = {
        text: "Hello, Sir.",
        teamId: "JARVIS",
      };
      const result = requestSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("rejects empty text", () => {
      const invalid = { text: "   " };
      const result = requestSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects invalid teamId", () => {
      const invalid = { text: "Hello", teamId: "UNKNOWN" };
      const result = requestSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("POST handler", () => {
    it("returns 503 when ElevenLabs is not configured", async () => {
      vi.spyOn(elevenlabsModule, "isElevenLabsConfigured").mockReturnValue(false);

      const request = new Request("http://localhost/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Test speech" }),
      });

      const response = await POST(request);
      expect(response.status).toBe(503);

      const json = await response.json();
      expect(json.fallback).toBe(true);
    });

    it("returns 400 on invalid JSON body", async () => {
      vi.spyOn(elevenlabsModule, "isElevenLabsConfigured").mockReturnValue(true);

      const request = new Request("http://localhost/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid-json",
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it("returns 400 on validation failure", async () => {
      vi.spyOn(elevenlabsModule, "isElevenLabsConfigured").mockReturnValue(true);

      const request = new Request("http://localhost/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "" }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it("returns 200 with audio/mpeg on successful synthesis", async () => {
      vi.spyOn(elevenlabsModule, "isElevenLabsConfigured").mockReturnValue(true);
      const mockAudio = new Uint8Array([1, 2, 3, 4]);
      vi.spyOn(elevenlabsModule, "synthesizeSpeech").mockResolvedValueOnce({
        audio: mockAudio,
        contentType: "audio/mpeg",
      });

      const request = new Request("http://localhost/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hello, Sir.", teamId: "JARVIS" }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("audio/mpeg");

      const buffer = await response.arrayBuffer();
      expect(new Uint8Array(buffer)).toEqual(mockAudio);
    });
  });
});
