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
          `${team.name} settings`,
          `settings for ${team.agentId}`,
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
  if (command.type === "scroll") {
    if (command.direction === "top" || command.direction === "bottom") {
      return `Sure thing, Sir. Moving to the ${command.direction}.`;
    }
    return `Sure thing, Sir. Moving ${command.direction}.`;
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

  const destination = normalized.replace(
    /^(?:please )?(?:(?:can|could|would) you |i want to )?(?:open|go to|go back to|navigate to|take me to|switch to|show(?: me)?|bring me to|visit|load|return to)\s+/,
    "",
  );
  const targetPhrase = destination
    .replace(/^(?:the )+/, "")
    .replace(/(?: team| page)$/, "")
    .trim();

  if (/^(?:(?:agent|team) )?settings?$/.test(targetPhrase)) {
    const agentId = currentPath.split("/")[2]?.toLowerCase();
    const team = TEAM_DEFINITIONS.find(({ agentId: id }) => id === agentId);
    if (team) {
      const label = `${team.agentId[0].toUpperCase()}${team.agentId.slice(1)}`;
      return {
        type: "navigate",
        href: `/agents/${team.agentId}/settings`,
        label: `${label} settings`,
      };
    }
  }

  const target = NAVIGATION_TARGETS.find(({ aliases }) =>
    aliases.some((alias) => normalizePhrase(alias) === targetPhrase),
  );

  return target
    ? { type: "navigate", href: target.href, label: target.label }
    : { type: "unsupported" };
}
