import { timingSafeEqual } from "node:crypto";
import {
  AgentEventType,
  AgentRuntimeStatus,
  Prisma,
  TeamId,
} from "@prisma/client";
import { z } from "zod";
import { getPrisma } from "@/server/database/prisma";

const MAX_EVENT_BODY_BYTES = 16_384;

const agentSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(160),
  provider: z.string().trim().min(1).max(80).optional(),
  model: z.string().trim().min(1).max(160).optional(),
});

const executionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  provider: z.string().trim().min(1).max(80).optional(),
  model: z.string().trim().min(1).max(160).optional(),
});

const tokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
});

const baseEventSchema = z.object({
  eventId: z.string().trim().min(1).max(120),
  teamId: z.enum(["JARVIS", "FRIDAY", "ULTRON", "VISION"]),
  agent: agentSchema,
});

const eventSchema = z.discriminatedUnion("type", [
  baseEventSchema.extend({
    type: z.literal("heartbeat"),
    status: z.enum(["idle", "working", "failed"]),
  }),
  baseEventSchema.extend({
    type: z.literal("run_started"),
    execution: executionSchema,
  }),
  baseEventSchema.extend({
    type: z.literal("run_progress"),
    execution: executionSchema.merge(tokenUsageSchema),
  }),
  baseEventSchema.extend({
    type: z.literal("run_succeeded"),
    execution: executionSchema.merge(tokenUsageSchema),
  }),
  baseEventSchema.extend({
    type: z.literal("run_failed"),
    execution: executionSchema.merge(tokenUsageSchema),
  }),
]);

type AgentEventInput = z.infer<typeof eventSchema>;

const eventTypes = {
  heartbeat: AgentEventType.HEARTBEAT,
  run_started: AgentEventType.RUN_STARTED,
  run_progress: AgentEventType.RUN_PROGRESS,
  run_succeeded: AgentEventType.RUN_SUCCEEDED,
  run_failed: AgentEventType.RUN_FAILED,
} satisfies Record<AgentEventInput["type"], AgentEventType>;

const runtimeStatuses = {
  idle: AgentRuntimeStatus.IDLE,
  working: AgentRuntimeStatus.WORKING,
  failed: AgentRuntimeStatus.FAILED,
} as const;

const teamIds = {
  JARVIS: TeamId.JARVIS,
  FRIDAY: TeamId.FRIDAY,
  ULTRON: TeamId.ULTRON,
  VISION: TeamId.VISION,
} satisfies Record<AgentEventInput["teamId"], TeamId>;

class EventConflictError extends Error {}

function hasValidToken(request: Request) {
  const expected = process.env.AGENT_MONITORING_TOKEN;
  if (!expected) return false;

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;

  const received = Buffer.from(authorization.slice("Bearer ".length));
  const expectedBytes = Buffer.from(expected);
  return (
    received.length === expectedBytes.length &&
    timingSafeEqual(received, expectedBytes)
  );
}

export async function POST(request: Request) {
  if (
    !process.env.AGENT_MONITORING_TOKEN ||
    Buffer.byteLength(process.env.AGENT_MONITORING_TOKEN) < 32
  ) {
    return Response.json(
      { error: "Agent monitoring requires a token of at least 32 bytes." },
      { status: 503 },
    );
  }
  if (!hasValidToken(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_EVENT_BODY_BYTES) {
    return Response.json({ error: "Request body is too large." }, { status: 413 });
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return Response.json({ error: "Request body is required." }, { status: 400 });
  }

  const chunks: Uint8Array[] = [];
  let bodyLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bodyLength += value.byteLength;
      if (bodyLength > MAX_EVENT_BODY_BYTES) {
        await reader.cancel();
        return Response.json(
          { error: "Request body is too large." },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bodyBytes = new Uint8Array(bodyLength);
  let offset = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    throw error;
  }

  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid monitoring event.", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const event = parsed.data;
  const prisma = getPrisma();
  const receivedAt = new Date();

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.subAgent.upsert({
        where: { id: event.agent.id },
        create: {
          id: event.agent.id,
          teamId: teamIds[event.teamId],
          name: event.agent.name,
          role: event.agent.role,
          status:
            event.type === "heartbeat"
              ? runtimeStatuses[event.status]
              : event.type === "run_failed"
                ? AgentRuntimeStatus.FAILED
                : event.type === "run_succeeded"
                  ? AgentRuntimeStatus.IDLE
                  : AgentRuntimeStatus.WORKING,
          provider: event.agent.provider ?? null,
          model: event.agent.model ?? null,
          lastHeartbeatAt: receivedAt,
          lastSuccessfulExecutionAt:
            event.type === "run_succeeded" ? receivedAt : null,
        },
        update: {
          teamId: teamIds[event.teamId],
          name: event.agent.name,
          role: event.agent.role,
          provider: event.agent.provider,
          model: event.agent.model,
          lastHeartbeatAt: receivedAt,
        },
      });

      await transaction.agentEvent.create({
        data: {
          id: event.eventId,
          agentId: event.agent.id,
          type: eventTypes[event.type],
          executionId: "execution" in event ? event.execution.id : null,
          receivedAt,
        },
      });

      if (event.type === "heartbeat") {
        await transaction.subAgent.update({
          where: { id: event.agent.id },
          data: { status: runtimeStatuses[event.status] },
        });
        return;
      }

      if (event.type === "run_started") {
        await transaction.agentExecution.create({
          data: {
            id: event.execution.id,
            agentId: event.agent.id,
            status: "RUNNING",
            provider: event.execution.provider ?? event.agent.provider ?? null,
            model: event.execution.model ?? event.agent.model ?? null,
            startedAt: receivedAt,
          },
        });
        await transaction.subAgent.update({
          where: { id: event.agent.id },
          data: {
            status: AgentRuntimeStatus.WORKING,
            provider: event.execution.provider ?? event.agent.provider,
            model: event.execution.model ?? event.agent.model,
          },
        });
        return;
      }

      if (event.type === "run_progress") {
        const result = await transaction.agentExecution.updateMany({
          where: {
            id: event.execution.id,
            agentId: event.agent.id,
            status: "RUNNING",
          },
          data: {
            inputTokens: event.execution.inputTokens,
            outputTokens: event.execution.outputTokens,
            provider: event.execution.provider ?? event.agent.provider,
            model: event.execution.model ?? event.agent.model,
          },
        });
        if (result.count !== 1) {
          throw new EventConflictError("Progress event does not match a running execution.");
        }
        await transaction.subAgent.update({
          where: { id: event.agent.id },
          data: {
            status: AgentRuntimeStatus.WORKING,
            provider: event.execution.provider ?? event.agent.provider,
            model: event.execution.model ?? event.agent.model,
          },
        });
        return;
      }

      const status =
        event.type === "run_succeeded" ? "SUCCEEDED" : "FAILED";
      const result = await transaction.agentExecution.updateMany({
        where: {
          id: event.execution.id,
          agentId: event.agent.id,
          status: "RUNNING",
        },
        data: {
          status,
          inputTokens: event.execution.inputTokens,
          outputTokens: event.execution.outputTokens,
          provider: event.execution.provider ?? event.agent.provider,
          model: event.execution.model ?? event.agent.model,
          finishedAt: receivedAt,
        },
      });
      if (result.count !== 1) {
        throw new EventConflictError("Completion event does not match a running execution.");
      }

      await transaction.subAgent.update({
        where: { id: event.agent.id },
        data: {
          status:
            event.type === "run_succeeded"
              ? AgentRuntimeStatus.IDLE
              : AgentRuntimeStatus.FAILED,
          ...(event.type === "run_succeeded"
            ? { lastSuccessfulExecutionAt: receivedAt }
            : {}),
        },
      });
    });
  } catch (error) {
    if (error instanceof EventConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        const existingEvent = await prisma.agentEvent.findUnique({
          where: { id: event.eventId },
          select: { id: true },
        });
        if (existingEvent) {
          return Response.json({ accepted: true, duplicate: true });
        }
        return Response.json(
          { error: "Execution ID already exists." },
          { status: 409 },
        );
      }
      console.error("Failed to persist agent monitoring event.", error);
      return Response.json(
        { error: "Unable to persist agent monitoring event." },
        { status: 500 },
      );
    }
    throw error;
  }

  return Response.json({ accepted: true });
}
