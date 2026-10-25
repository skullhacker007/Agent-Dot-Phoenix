import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  MonitoringConflictError,
  recordMonitoringEvent,
} from "@/server/agents/monitoring-store";

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

  try {
    const result = recordMonitoringEvent(parsed.data);
    return Response.json({ accepted: true, ...result });
  } catch (error) {
    if (error instanceof MonitoringConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    console.error("Failed to record agent monitoring event.", error);
    return Response.json(
      { error: "Unable to record agent monitoring event." },
      { status: 500 },
    );
  }
}
