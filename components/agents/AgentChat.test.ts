import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildConversationPayload,
  cleanTextForSpeech,
  type ChatMessage,
} from "./AgentChat";
import { requestSchema, teamInstructions } from "../../app/api/agents/chat/route";

describe("AgentChat payload building and validation", () => {
  it("builds clean, alternating conversation payload with genuine messages only", () => {
    const existingMessages: ChatMessage[] = [
      { id: 1, role: "user", content: "Hello" },
      { id: 2, role: "assistant", content: "Hi, how can I assist you?" },
    ];
    const newUserMessage: ChatMessage = {
      id: 3,
      role: "user",
      content: "What is your role?",
    };

    const payload = buildConversationPayload(existingMessages, newUserMessage);

    expect(payload).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi, how can I assist you?" },
      { role: "user", content: "What is your role?" },
    ]);
  });

  it("filters out empty messages and never injects duplicates or consecutive identical roles", () => {
    const existingMessages: ChatMessage[] = [
      { id: 0, role: "assistant", content: "" }, // empty assistant before user
      { id: 1, role: "user", content: "First question" },
      { id: 2, role: "assistant", content: "First answer" },
      { id: 3, role: "assistant", content: "Duplicate answer attempt" }, // duplicate role
      { id: 4, role: "user", content: "   " }, // whitespace user message
    ];
    const newUserMessage: ChatMessage = {
      id: 5,
      role: "user",
      content: "Second question",
    };

    const payload = buildConversationPayload(existingMessages, newUserMessage);

    expect(payload).toEqual([
      { role: "user", content: "First question" },
      { role: "assistant", content: "First answer" },
      { role: "user", content: "Second question" },
    ]);
  });

  it("ensures each assistant reply is included exactly once", () => {
    const existingMessages: ChatMessage[] = [
      { id: 1, role: "user", content: "Question 1" },
      { id: 2, role: "assistant", content: "Answer 1" },
      { id: 3, role: "user", content: "Question 2" },
      { id: 4, role: "assistant", content: "Answer 2" },
    ];
    const newUserMessage: ChatMessage = {
      id: 5,
      role: "user",
      content: "Question 3",
    };

    const payload = buildConversationPayload(existingMessages, newUserMessage);

    const assistantMessages = payload.filter((m) => m.role === "assistant");
    expect(assistantMessages).toHaveLength(2);
    expect(assistantMessages[0].content).toBe("Answer 1");
    expect(assistantMessages[1].content).toBe("Answer 2");
  });

  it("validates requestSchema for all four agents with genuine payloads", () => {
    const agents = ["JARVIS", "FRIDAY", "ULTRON", "VISION"] as const;

    for (const teamId of agents) {
      const validPayload = {
        teamId,
        modelId: "nvidia/nemotron-3-ultra-550b-a55b",
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Greetings!" },
          { role: "user", content: "Status update please." },
        ],
      };

      const parsed = requestSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);
      expect(teamInstructions[teamId]).toBeDefined();
    }
  });

  it("rejects non-alternating messages in requestSchema", () => {
    const nonAlternatingPayload = {
      teamId: "JARVIS",
      modelId: "nvidia/nemotron-3-ultra-550b-a55b",
      messages: [
        { role: "user", content: "Hello" },
        { role: "user", content: "Hello again" }, // non-alternating!
      ],
    };

    const parsed = requestSchema.safeParse(nonAlternatingPayload);
    expect(parsed.success).toBe(false);
  });

  it("rejects conversations starting with an assistant message", () => {
    const startingWithAssistant = {
      teamId: "VISION",
      modelId: "nvidia/nemotron-3-ultra-550b-a55b",
      messages: [{ role: "assistant", content: "How can I help?" }],
    };

    const parsed = requestSchema.safeParse(startingWithAssistant);
    expect(parsed.success).toBe(false);
  });

  it("does not require or inject marketContext or hidden context in requestSchema", () => {
    const cleanPayload = {
      teamId: "VISION",
      modelId: "nvidia/nemotron-3-ultra-550b-a55b",
      messages: [{ role: "user", content: "What is the Nifty 50 trend?" }],
    };

    const parsed = requestSchema.safeParse(cleanPayload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as Record<string, unknown>).marketContext).toBeUndefined();
    }
  });

  it("cleans markdown and URLs for natural speech synthesis", () => {
    const raw = "Here is the **market summary**:\n* NIFTY is up 0.5%.\n* Check https://example.com for details.";
    const cleaned = cleanTextForSpeech(raw);

    expect(cleaned).not.toContain("**");
    expect(cleaned).toContain("market summary");
    expect(cleaned).not.toContain("https://");
    expect(cleaned).toBe("Here is the market summary: NIFTY is up 0.5%. Check for details.");
  });
});
