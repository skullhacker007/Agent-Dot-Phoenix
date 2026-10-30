import { TEAM_DEFINITIONS } from "./agent-monitoring";

type VoiceNavigationTarget = {
  href: string;
  label: string;
  aliases: string[];
};

const NAVIGATION_TARGETS: VoiceNavigationTarget[] = [
  {
    href: "/",
    label: "Home page",
    aliases: ["home", "dashboard", "main page", "navi"],
  },
  {
    href: "/agents",
    label: "Speed test",
    aliases: [
      "agents",
      "speed test",
      "speed tests",
      "model tests",
      "speed test page",
      "agent speed test",
    ],
  },
  ...TEAM_DEFINITIONS.flatMap((team) => {
    const label = `${team.agentId[0].toUpperCase()}${team.agentId.slice(1)}`;
    return [
      {
        href: `/agents/${team.agentId}`,
        label,
        aliases: [team.name, team.agentId, team.id.toLowerCase()],
      },
      {
        href: `/agents/${team.agentId}/settings`,
        label: `${label} settings`,
        aliases: [
          `${team.agentId} settings`,
          `${team.agentId} setting`,
          `${team.name} settings`,
          `${team.name} setting`,
          `settings for ${team.agentId}`,
          `settings for ${team.name}`,
          `setting for ${team.agentId}`,
          `setting for ${team.name}`,
          `settings of ${team.agentId}`,
          `settings of ${team.name}`,
          `setting of ${team.agentId}`,
          `setting of ${team.name}`,
          `${team.agentId} s settings`,
          `${team.name} s settings`,
          `${team.agentId} team settings`,
          `${team.name} team settings`,
        ],
      },
    ];
  }),
];

export type VoiceNavigationCommand =
  | { type: "back" }
  | { type: "restart" }
  | { type: "scroll"; direction: "down" | "up" | "top" | "bottom" }
  | { type: "navigate"; href: string; label: string }
  | { type: "chat"; action: "open" | "close"; agentId?: string }
  | { type: "dictate"; text: string; submit: boolean; agentId?: string }
  | { type: "unsupported" };

export function getVoiceCommandReply(
  command: VoiceNavigationCommand,
  currentPath: string,
) {
  if (command.type === "navigate") {
    return currentPath === command.href
      ? `You're already here, Sir.`
      : command.href === "/"
        ? "Here you go, Sir. You're back on the Home page."
        : `Here you go, Sir. ${command.label} is ready.`;
  }
  if (command.type === "back") return "Of course, Sir. Taking you back.";
  if (command.type === "restart") return "Sure, Sir. Refreshing the page now.";
  if (command.type === "scroll") {
    if (command.direction === "top" || command.direction === "bottom") {
      return `Sure thing, Sir. Moving to the ${command.direction}.`;
    }
    return `Sure thing, Sir. Moving ${command.direction}.`;
  }
  if (command.type === "chat") {
    if (command.action === "close") {
      return "Closing the chat, Sir.";
    }
    const label = command.agentId
      ? `${command.agentId[0].toUpperCase()}${command.agentId.slice(1)}`
      : undefined;
    return label
      ? `Opening chat with ${label}, Sir.`
      : "Opening the chat, Sir.";
  }
  if (command.type === "dictate") {
    const label = command.agentId
      ? `${command.agentId[0].toUpperCase()}${command.agentId.slice(1)}`
      : undefined;
    if (command.submit) {
      return label
        ? `Sending your message to ${label}, Sir.`
        : "Sending your message to the chat, Sir.";
    }
    return "Transcribed into chat, Sir.";
  }
  return "Sorry, Sir, I didn't catch that. Could you say it another way?";
}

function normalizePhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function resolveVoiceNavigationCommand(
  transcript: string,
  currentPath = "/",
): VoiceNavigationCommand {
  const normalized = normalizePhrase(transcript);
  if (
    /^(?:please )?(?:(?:go )?back(?: to (?:the )?previous page)?|return(?: to (?:the )?previous page)?|(?:go )?to (?:the )?previous page)$/.test(
      normalized,
    ) ||
    normalized === "previous page"
  ) {
    return { type: "back" };
  }

  if (
    /^(?:please )?(?:restart|refresh|reload)(?: the page)?$/.test(normalized)
  ) {
    return { type: "restart" };
  }

  const scrollCommand = normalized.match(
    /^(?:please )?(?:scroll|move)(?: the page)? (down|up|to top|to bottom)$|^(?:please )?go to (top|bottom)$/,
  );
  if (scrollCommand) {
    const position = scrollCommand[1] ?? scrollCommand[2];
    if (position === "down" || position === "up") {
      return { type: "scroll", direction: position };
    }
    return {
      type: "scroll",
      direction: position === "to top" || position === "top" ? "top" : "bottom",
    };
  }

  const currentAgent = currentPath.split("/")[2]?.toLowerCase();
  const defaultAgent = TEAM_DEFINITIONS.some(
    ({ agentId }) => agentId === currentAgent,
  )
    ? currentAgent
    : "jarvis";

  // Dictate commands:
  // "ask Jarvis what is your status", "tell Friday to analyze the leads", "message Jarvis: hello"
  const askTellMatch = transcript.match(
    /^(?:please\s+)?(?:ask|tell|message)\s+(jarvis|friday|ultron|vision)(?:\s+(?:to|about))?[:\s]+(.+)$/i,
  );
  if (askTellMatch) {
    const targetAgent = askTellMatch[1].toLowerCase();
    const messageText = askTellMatch[2].trim();
    if (messageText) {
      return {
        type: "dictate",
        text: messageText,
        submit: true,
        agentId: targetAgent,
      };
    }
  }

  // "send message check system health", "send a message to Friday: check leads"
  const sendMatch = transcript.match(
    /^(?:please\s+)?(?:send\s+(?:a\s+)?message(?:\s+to\s+(jarvis|friday|ultron|vision))?|send(?:\s+to\s+(jarvis|friday|ultron|vision)))[:\s]+(.+)$/i,
  );
  if (sendMatch) {
    const targetAgent =
      (sendMatch[1] ?? sendMatch[2])?.toLowerCase() ?? defaultAgent;
    const messageText = sendMatch[3].trim();
    if (messageText) {
      return {
        type: "dictate",
        text: messageText,
        submit: true,
        agentId: targetAgent,
      };
    }
  }

  // "dictate: Can you review this code?", "type What is the latest update?"
  const dictateMatch = transcript.match(
    /^(?:please\s+)?(?:dictate|type)(?:\s+to\s+(?:the\s+)?(?:chat(?:bot)?|(?:jarvis|friday|ultron|vision)))?[:\s]+(.+)$/i,
  );
  if (dictateMatch) {
    const messageText = dictateMatch[1].trim();
    if (messageText) {
      return {
        type: "dictate",
        text: messageText,
        submit: false,
        agentId: defaultAgent,
      };
    }
  }

  // Chat close commands:
  if (
    /^(?:please\s+)?(?:close|hide|minimize|dismiss)(?:\s+the)?\s+chat(?:bot)?(?:\s+window|\s+box)?$/i.test(
      transcript.trim(),
    )
  ) {
    return {
      type: "chat",
      action: "close",
      agentId: defaultAgent,
    };
  }

  // Chat open commands:
  const openChatMatch = transcript.match(
    /^(?:please\s+)?(?:(?:can|could|would)\s+you\s+|i\s+want\s+to\s+)?(?:(?:open|start|launch|show)(?:\s+the)?\s+(?:(jarvis|friday|ultron|vision)\s+)?chat(?:bot)?(?:\s+window|\s+box)?|(?:open|start|launch|show)(?:\s+the)?\s+chat(?:bot)?(?:\s+(?:with|for)\s+(jarvis|friday|ultron|vision))?|(?:chat|talk)(?:\s+with|\s+to)\s+(jarvis|friday|ultron|vision)|chat)$/i,
  );
  if (openChatMatch) {
    const targetAgent =
      (
        openChatMatch[1] ??
        openChatMatch[2] ??
        openChatMatch[3]
      )?.toLowerCase() ?? defaultAgent;
    return {
      type: "chat",
      action: "open",
      agentId: targetAgent,
    };
  }

  const destination = normalized.replace(
    /^(?:please )?(?:(?:can|could|would) you |i want to )?(?:open|go to|go back to|navigate to|take me to|switch to|show(?: me)?|bring me to|visit|load|return to)\s+/,
    "",
  );
  const targetPhrase = destination
    .replace(/^(?:the )+/, "")
    .replace(/(?: team| page)$/, "")
    .trim();

  // Explicit agent settings:
  // e.g. "Jarvis settings", "settings for Friday", "settings of Ultron", "Vision's settings", "Friday setting"
  const agentSettingsMatch = targetPhrase.match(
    /^(?:settings? (?:for|of)|(?:the )?settings? of)\s+(jarvis|friday|ultron|vision)$|^(jarvis|friday|ultron|vision)(?: s)? settings?$/,
  );
  if (agentSettingsMatch) {
    const matchedAgent = agentSettingsMatch[1] ?? agentSettingsMatch[2];
    const team = TEAM_DEFINITIONS.find(
      ({ agentId }) => agentId === matchedAgent,
    );
    if (team) {
      const label = `${team.agentId[0].toUpperCase()}${team.agentId.slice(1)}`;
      return {
        type: "navigate",
        href: `/agents/${team.agentId}/settings`,
        label: `${label} settings`,
      };
    }
  }

  // Contextual or general settings:
  // If targetPhrase is "settings", "setting", "agent settings", "team settings":
  // If on agent page, navigate to that agent's settings.
  // If on home page or non-agent page, navigate to default agent settings (Jarvis settings).
  if (/^(?:(?:agent|team) )?settings?$/.test(targetPhrase)) {
    const agentId = currentPath.split("/")[2]?.toLowerCase();
    const team =
      TEAM_DEFINITIONS.find(({ agentId: id }) => id === agentId) ??
      TEAM_DEFINITIONS[0];
    const label = `${team.agentId[0].toUpperCase()}${team.agentId.slice(1)}`;
    return {
      type: "navigate",
      href: `/agents/${team.agentId}/settings`,
      label: `${label} settings`,
    };
  }

  const target = NAVIGATION_TARGETS.find(({ aliases }) =>
    aliases.some((alias) => normalizePhrase(alias) === targetPhrase),
  );

  return target
    ? { type: "navigate", href: target.href, label: target.label }
    : { type: "unsupported" };
}
