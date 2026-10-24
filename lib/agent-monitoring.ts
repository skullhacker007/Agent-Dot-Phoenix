import { z } from "zod";

export const TEAM_DEFINITIONS = [
  {
    id: "JARVIS",
    name: "J.A.R.V.I.S",
    role: "Strategy & Intelligence",
    agentId: "jarvis",
  },
  {
    id: "FRIDAY",
    name: "F.R.I.D.A.Y",
    role: "Business Development",
    agentId: "friday",
  },
  {
    id: "ULTRON",
    name: "Ultron",
    role: "Cybersecurity Solutions",
    agentId: "ultron",
  },
  {
    id: "VISION",
    name: "Vision",
    role: "Financial Analytics",
    agentId: "vision",
  },
] as const;

export type TeamId = (typeof TEAM_DEFINITIONS)[number]["id"];
const agentStatusSchema = z.enum([
  "idle",
  "working",
  "stalled",
  "failed",
  "offline",
]);
const teamStatusSchema = z.enum([
  "idle",
  "working",
  "stalled",
  "attention",
  "partial",
  "offline",
]);

const teamDashboardSchema = z.object({
  id: z.enum(["JARVIS", "FRIDAY", "ULTRON", "VISION"]),
  status: teamStatusSchema,
  counts: z.object({
    total: z.number().int().nonnegative(),
    working: z.number().int().nonnegative(),
    idle: z.number().int().nonnegative(),
    stalled: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    offline: z.number().int().nonnegative(),
  }),
  tokens: z.object({
    input: z.number().int().nonnegative().nullable(),
    output: z.number().int().nonnegative().nullable(),
  }),
  assignedModel: z.string().min(1).nullable(),
  models: z.array(z.string()),
  agents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      role: z.string(),
      status: agentStatusSchema,
      provider: z.string().nullable(),
      model: z.string().nullable(),
      inputTokens: z.number().int().nonnegative().nullable(),
      outputTokens: z.number().int().nonnegative().nullable(),
      lastHeartbeatAt: z.string().nullable(),
      lastSuccessfulExecutionAt: z.string().nullable(),
      currentExecutionStartedAt: z.string().nullable(),
      dailyInputTokens: z.number().int().nonnegative().nullable(),
      dailyOutputTokens: z.number().int().nonnegative().nullable(),
    }),
  ),
  tasks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      status: z.literal("queued"),
      agentId: z.string().nullable(),
      agentName: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});

export const dashboardResponseSchema = z.object({
  teams: z.array(teamDashboardSchema),
  updatedAt: z.string(),
});

export type AgentStatus = z.infer<typeof agentStatusSchema>;
export type TeamStatus = z.infer<typeof teamStatusSchema>;
export type TeamDashboard = z.infer<typeof teamDashboardSchema>;

export const HEARTBEAT_STALE_AFTER_MS = 60_000;
export const HEARTBEAT_OFFLINE_AFTER_MS = 120_000;

export function resolveAgentStatus(
  reportedStatus: "idle" | "working" | "failed",
  lastHeartbeatAt: Date | null,
  now = Date.now(),
): AgentStatus {
  if (!lastHeartbeatAt) return "offline";

  const heartbeatAge = now - lastHeartbeatAt.getTime();
  if (heartbeatAge > HEARTBEAT_OFFLINE_AFTER_MS) return "offline";
  if (reportedStatus === "working" && heartbeatAge > HEARTBEAT_STALE_AFTER_MS) {
    return "stalled";
  }

  return reportedStatus;
}

export function resolveTeamStatus(statuses: AgentStatus[]): TeamStatus {
  if (statuses.length === 0 || statuses.every((status) => status === "offline")) {
    return "offline";
  }
  if (statuses.includes("failed")) return "attention";
  if (statuses.includes("stalled")) return "stalled";
  if (statuses.includes("working")) return "working";
  if (statuses.every((status) => status === "idle")) return "idle";
  return "partial";
}
