import { describe, expect, it } from "vitest";
import {
  getVoiceCommandReply,
  resolveVoiceNavigationCommand,
} from "./voice-navigation";

describe("resolveVoiceNavigationCommand", () => {
  it.each([
    ["Open Jarvis", "/agents/jarvis", "Jarvis"],
    ["Please Go to Friday", "/agents/friday", "Friday"],
    ["Navigate to Ultron team", "/agents/ultron", "Ultron"],
    ["Take me to Vision page", "/agents/vision", "Vision"],
    ["Go to dashboard", "/", "Home page"],
    ["Home page", "/", "Home page"],
    ["Go to Home page", "/", "Home page"],
    ["Go back to dashboard", "/", "Home page"],
    ["I want to open Friday", "/agents/friday", "Friday"],
    ["Show me Jarvis", "/agents/jarvis", "Jarvis"],
    ["Friday", "/agents/friday", "Friday"],
    ["Go to Jarvis settings", "/agents/jarvis/settings", "Jarvis settings"],
    ["Open settings for Friday", "/agents/friday/settings", "Friday settings"],
    ["Speed test", "/agents", "Speed test"],
    ["Go to speed test page", "/agents", "Speed test"],
  ])("resolves %s from configured destinations", (transcript, href, label) => {
    expect(resolveVoiceNavigationCommand(transcript)).toEqual({
      type: "navigate",
      href,
      label,
    });
  });

  it.each([
    ["settings", "/agents/jarvis", "/agents/jarvis/settings", "Jarvis settings"],
    [
      "Go to setting",
      "/agents/friday",
      "/agents/friday/settings",
      "Friday settings",
    ],
    [
      "Open agent settings",
      "/agents/ultron",
      "/agents/ultron/settings",
      "Ultron settings",
    ],
    [
      "team settings",
      "/agents/vision",
      "/agents/vision/settings",
      "Vision settings",
    ],
    ["settings", "/", "/agents/jarvis/settings", "Jarvis settings"],
    ["open settings", "/", "/agents/jarvis/settings", "Jarvis settings"],
    ["go to settings", "/", "/agents/jarvis/settings", "Jarvis settings"],
    ["agent settings", "/", "/agents/jarvis/settings", "Jarvis settings"],
  ])(
    "resolves contextual settings requests from %s",
    (transcript, currentPath, href, label) => {
      expect(resolveVoiceNavigationCommand(transcript, currentPath)).toEqual({
        type: "navigate",
        href,
        label,
      });
    },
  );

  it.each([
    ["Open Friday setting", "/agents/friday/settings", "Friday settings"],
    ["Open settings of Friday", "/agents/friday/settings", "Friday settings"],
    ["Friday's settings", "/agents/friday/settings", "Friday settings"],
    ["settings for Ultron", "/agents/ultron/settings", "Ultron settings"],
    ["settings of Vision", "/agents/vision/settings", "Vision settings"],
    ["Vision's settings", "/agents/vision/settings", "Vision settings"],
    ["Jarvis's settings", "/agents/jarvis/settings", "Jarvis settings"],
  ])("resolves explicit agent settings requests (%s)", (transcript, href, label) => {
    expect(resolveVoiceNavigationCommand(transcript)).toEqual({
      type: "navigate",
      href,
      label,
    });
  });

  describe("chat flows", () => {
    it.each([
      ["open chat", "/agents/jarvis", "jarvis"],
      ["open chat", "/agents/friday", "friday"],
      ["open chat", "/agents/ultron", "ultron"],
      ["open chat", "/agents/vision", "vision"],
      ["open chat", "/", "jarvis"],
      ["open the chat", "/agents/jarvis", "jarvis"],
      ["start chat", "/agents/jarvis", "jarvis"],
      ["show chat", "/agents/jarvis", "jarvis"],
      ["launch chat", "/agents/jarvis", "jarvis"],
      ["chat", "/agents/friday", "friday"],
      ["chat with Jarvis", "/", "jarvis"],
      ["open Jarvis chat", "/", "jarvis"],
      ["chat with Friday", "/", "friday"],
      ["talk to Friday", "/", "friday"],
      ["open Friday chat", "/", "friday"],
      ["open chat with Friday", "/", "friday"],
      ["chat with Ultron", "/", "ultron"],
      ["chat with Vision", "/", "vision"],
    ])("resolves open chat command '%s' on %s", (transcript, currentPath, agentId) => {
      expect(resolveVoiceNavigationCommand(transcript, currentPath)).toEqual({
        type: "chat",
        action: "open",
        agentId,
      });
    });

    it.each([
      ["close chat", "/agents/jarvis", "jarvis"],
      ["close the chat", "/agents/friday", "friday"],
      ["hide chat", "/agents/ultron", "ultron"],
      ["minimize chat", "/agents/vision", "vision"],
    ])("resolves close chat command '%s' on %s", (transcript, currentPath, agentId) => {
      expect(resolveVoiceNavigationCommand(transcript, currentPath)).toEqual({
        type: "chat",
        action: "close",
        agentId,
      });
    });
  });

  describe("dictation flows (dictating text instead of typing)", () => {
    it.each([
      [
        "dictate hello how are you",
        "/agents/jarvis",
        "hello how are you",
        false,
        "jarvis",
      ],
      [
        "dictate: Can you review this code?",
        "/agents/jarvis",
        "Can you review this code?",
        false,
        "jarvis",
      ],
      [
        "type What is the latest update?",
        "/agents/jarvis",
        "What is the latest update?",
        false,
        "jarvis",
      ],
      [
        "dictate analyze current stock patterns",
        "/agents/vision",
        "analyze current stock patterns",
        false,
        "vision",
      ],
    ])(
      "resolves transcription dictation '%s' without auto-submitting",
      (transcript, currentPath, text, submit, agentId) => {
        expect(resolveVoiceNavigationCommand(transcript, currentPath)).toEqual({
          type: "dictate",
          text,
          submit,
          agentId,
        });
      },
    );

    it.each([
      [
        "send message check system health",
        "/agents/jarvis",
        "check system health",
        true,
        "jarvis",
      ],
      [
        "send message: Check the latest market trends",
        "/agents/vision",
        "Check the latest market trends",
        true,
        "vision",
      ],
      [
        "ask Jarvis what is your status",
        "/",
        "what is your status",
        true,
        "jarvis",
      ],
      [
        "ask Jarvis: What is your status?",
        "/",
        "What is your status?",
        true,
        "jarvis",
      ],
      [
        "ask Friday to analyze the leads",
        "/",
        "analyze the leads",
        true,
        "friday",
      ],
      [
        "tell Friday to summarize today's leads",
        "/",
        "summarize today's leads",
        true,
        "friday",
      ],
      [
        "tell Ultron to inspect firewall logs",
        "/",
        "inspect firewall logs",
        true,
        "ultron",
      ],
      [
        "tell Vision check stock trends",
        "/",
        "check stock trends",
        true,
        "vision",
      ],
      [
        "message Jarvis: hello there",
        "/",
        "hello there",
        true,
        "jarvis",
      ],
    ])(
      "resolves direct dictation message '%s' with auto-submit",
      (transcript, currentPath, text, submit, agentId) => {
        expect(resolveVoiceNavigationCommand(transcript, currentPath)).toEqual({
          type: "dictate",
          text,
          submit,
          agentId,
        });
      },
    );
  });

  it.each([
    "restart",
    "refresh",
    "reload",
    "refresh the page",
    "restart the page",
  ])("recognizes the page refresh command %s", (transcript) => {
    expect(resolveVoiceNavigationCommand(transcript)).toEqual({
      type: "restart",
    });
  });

  it.each([
    "back",
    "go back",
    "please go back to the previous page",
    "previous page",
  ])("recognizes the back command %s", (transcript) => {
    expect(resolveVoiceNavigationCommand(transcript)).toEqual({
      type: "back",
    });
  });

  it.each([
    ["scroll down", "down"],
    ["please scroll the page down", "down"],
    ["scroll up", "up"],
    ["scroll to top", "top"],
    ["Go to bottom", "bottom"],
  ] as const)("resolves the scroll command %s", (transcript, direction) => {
    expect(resolveVoiceNavigationCommand(transcript)).toEqual({
      type: "scroll",
      direction,
    });
  });

  it("does not treat unknown requests as navigable URLs", () => {
    expect(resolveVoiceNavigationCommand("open an unknown page")).toEqual({
      type: "unsupported",
    });
  });

  it("replies naturally to navigation, settings, chat, and dictation commands", () => {
    expect(
      getVoiceCommandReply(
        resolveVoiceNavigationCommand("home page"),
        "/agents/jarvis",
      ),
    ).toBe("Here you go, Sir. You're back on the Home page.");
    expect(
      getVoiceCommandReply(resolveVoiceNavigationCommand("scroll down"), "/"),
    ).toBe("Sure thing, Sir. Moving down.");
    expect(
      getVoiceCommandReply(resolveVoiceNavigationCommand("home page"), "/"),
    ).toBe("You're already here, Sir.");
    expect(
      getVoiceCommandReply(
        resolveVoiceNavigationCommand("settings", "/agents/jarvis/settings"),
        "/agents/jarvis/settings",
      ),
    ).toBe("You're already here, Sir.");
    expect(
      getVoiceCommandReply(
        resolveVoiceNavigationCommand("settings", "/"),
        "/",
      ),
    ).toBe("Here you go, Sir. Jarvis settings is ready.");
    expect(
      getVoiceCommandReply(
        resolveVoiceNavigationCommand("open chat", "/agents/jarvis"),
        "/agents/jarvis",
      ),
    ).toBe("Opening chat with Jarvis, Sir.");
    expect(
      getVoiceCommandReply(
        resolveVoiceNavigationCommand("chat with Friday", "/"),
        "/",
      ),
    ).toBe("Opening chat with Friday, Sir.");
    expect(
      getVoiceCommandReply(
        resolveVoiceNavigationCommand("close chat", "/agents/jarvis"),
        "/agents/jarvis",
      ),
    ).toBe("Closing the chat, Sir.");
    expect(
      getVoiceCommandReply(
        resolveVoiceNavigationCommand("dictate hello", "/agents/jarvis"),
        "/agents/jarvis",
      ),
    ).toBe("Transcribed into chat, Sir.");
    expect(
      getVoiceCommandReply(
        resolveVoiceNavigationCommand("ask Jarvis what is your status"),
        "/",
      ),
    ).toBe("Sending your message to Jarvis, Sir.");
    expect(
      getVoiceCommandReply(
        resolveVoiceNavigationCommand("tell Friday to optimize"),
        "/",
      ),
    ).toBe("Sending your message to Friday, Sir.");
    expect(
      getVoiceCommandReply(resolveVoiceNavigationCommand("refresh"), "/"),
    ).toBe("Sure, Sir. Refreshing the page now.");
  });
});
