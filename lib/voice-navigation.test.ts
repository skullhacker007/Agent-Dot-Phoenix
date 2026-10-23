import { describe, expect, it } from "vitest";
import {
  getVoiceCommandReply,
  resolveVoiceNavigationCommand,
} from "./voice-navigation";

describe("resolveVoiceNavigationCommand", () => {
  it.each([
    ["Open Jarvis", "/agents/jarvis", "Jarvis"],
    ["Please go to Friday", "/agents/friday", "Friday"],
    ["Navigate to Ultron team", "/agents/ultron", "Ultron"],
    ["Take me to Vision page", "/agents/vision", "Vision"],
    ["Go to dashboard", "/", "Home page"],
    ["Home page", "/", "Home page"],
    ["Go to Home page", "/", "Home page"],
    ["Go back to dashboard", "/", "Home page"],
    ["I want to open Friday", "/agents/friday", "Friday"],
    ["Show me Jarvis", "/agents/jarvis", "Jarvis"],
    ["Friday", "/agents/friday", "Friday"],
  ])("resolves %s from configured destinations", (transcript, href, label) => {
    expect(resolveVoiceNavigationCommand(transcript)).toEqual({
      type: "navigate",
      href,
      label,
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
    ["go to bottom", "bottom"],
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

  it("replies naturally to navigation and scroll commands", () => {
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
  });
});
