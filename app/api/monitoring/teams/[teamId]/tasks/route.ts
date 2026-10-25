import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  isAdminSessionValid,
  isSameOriginRequest,
} from "@/lib/agent-admin-auth";
import { TEAM_DEFINITIONS } from "@/lib/agent-monitoring";
import {
  MonitoringConflictError,
  queueMonitoredTask,
} from "@/server/agents/monitoring-store";

const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  agentId: z.string().trim().min(1).max(120).nullable(),
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

  const parsed = taskSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid task details.", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const id = randomUUID();
  try {
    const task = queueMonitoredTask({
      id,
      teamId: team.id,
      agentId: parsed.data.agentId,
      title: parsed.data.title,
      description: parsed.data.description,
    });

    return Response.json(
      { task, message: "Task queued and waiting for an available worker." },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof MonitoringConflictError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("Failed to queue agent task.", error);
    return Response.json({ error: "Unable to queue task." }, { status: 500 });
  }
}
