import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  isAdminSessionValid,
  isSameOriginRequest,
} from "@/lib/agent-admin-auth";
import { TEAM_DEFINITIONS } from "@/lib/agent-monitoring";
import { createMonitoredAgent } from "@/server/agents/monitoring-store";

const agentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(160),
  instructions: z.string().trim().max(4000).default(""),
  provider: z.string().trim().max(80).optional(),
  model: z.string().trim().max(160).optional(),
});

type RouteContext = { params: Promise<{ teamId: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  try {
    if (!isAdminSessionValid(request)) {
      return Response.json({ error: "Admin sign-in required." }, { status: 401 });
    }
  } catch (error) {
    console.error("Agent management session validation failed.", error);
    return Response.json(
      { error: "Agent management is not configured." },
      { status: 503 },
    );
  }

  const { teamId } = await context.params;
  const team = TEAM_DEFINITIONS.find(
    ({ agentId }) => agentId === teamId.toLowerCase(),
  );
  if (!team) {
    return Response.json({ error: "Unknown agent team." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    throw error;
  }

  const parsed = agentSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid agent details.", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const agentId = randomUUID();
  try {
    const agent = createMonitoredAgent({
        id: agentId,
        teamId: team.id,
        name: parsed.data.name,
        role: parsed.data.role,
        instructions: parsed.data.instructions,
        provider: parsed.data.provider,
        model: parsed.data.model,
    });

    return Response.json({ agent }, { status: 201 });
  } catch (error) {
    console.error("Failed to create sub-agent.", error);
    return Response.json({ error: "Unable to create sub-agent." }, { status: 500 });
  }
}
