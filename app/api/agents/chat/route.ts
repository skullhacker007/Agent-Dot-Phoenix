import { z } from "zod";
import { isSameOriginRequest } from "@/lib/agent-admin-auth";
import {
  listNvidiaModels,
  NvidiaConfigurationError,
  streamNvidiaCompletion,
} from "@/lib/nvidia";
import { TEAM_DEFINITIONS, type TeamId } from "@/lib/agent-monitoring";
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import type { Stream } from "openai/streaming";

const MAX_REQUEST_BYTES = 32 * 1024;

const requestSchema = z
  .object({
    teamId: z.enum(["JARVIS", "FRIDAY", "ULTRON", "VISION"]),
    modelId: z.string().trim().min(1).max(200),
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().trim().min(1).max(4000),
        }),
      )
      .min(1)
      .max(20),
  })
  .superRefine(({ messages }, context) => {
    const totalCharacters = messages.reduce(
      (total, message) => total + message.content.length,
      0,
    );
    if (totalCharacters > 20_000) {
      context.addIssue({
        code: "custom",
        message: "Conversation is too long.",
      });
    }
  });

const teamInstructions: Record<TeamId, string> = {
  JARVIS:
    "You are J.A.R.V.I.S, a strategic intelligence assistant. Give concise, structured, evidence-aware advice, state assumptions, and distinguish known facts from estimates. Never claim access to live systems or data unless provided in the conversation.",
  FRIDAY:
    "You are F.R.I.D.A.Y, a business development assistant. Help with ethical prospect research, customer communication, proposals, and growth planning. Be practical, professional, and transparent about assumptions; never fabricate research or make deceptive claims.",
  ULTRON:
    "You are Ultron, a defensive cybersecurity solutions assistant. Focus on secure design, authorized defensive assessment, detection, incident response, and remediation. Do not provide instructions, code, or operational steps to compromise systems, evade detection, steal credentials, deploy malware, or access systems without authorization. Keep security guidance bounded to systems the user owns or is authorized to protect.",
  VISION:
    "You are Vision, a financial analytics assistant. Provide clear, structured analysis, state assumptions, distinguish facts from estimates, and never claim access to live financial data unless it is included in the conversation. Your responses are informational and are not personalized financial advice.",
};

async function readBoundedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return Response.json({ error: "Chat request is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    const bodyText = await readBoundedBody(request);
    if (bodyText === null) {
      return Response.json({ error: "Chat request is too large." }, { status: 413 });
    }
    body = JSON.parse(bodyText);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      );
    }
    console.error("Unable to read the agent chat request.", error);
    return Response.json(
      { error: "Unable to read the chat request." },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid chat request." }, { status: 400 });
  }

  let availableModels: string[];
  try {
    availableModels = await listNvidiaModels(request.signal);
  } catch (error) {
    if (error instanceof NvidiaConfigurationError) {
      return Response.json(
        { error: error.message },
        { status: 503 },
      );
    }

    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : undefined;
    console.error("Unable to verify the selected NVIDIA model.", {
      status,
      message:
        error instanceof Error ? error.message : "Unknown provider error.",
    });
    return Response.json(
      {
        error:
          status === 401 || status === 403
            ? "NVIDIA rejected the server credentials."
            : "Unable to verify the selected model with NVIDIA.",
      },
      { status: status === 401 || status === 403 ? 503 : 502 },
    );
  }

  if (!availableModels.includes(parsed.data.modelId)) {
    return Response.json(
      { error: "The selected model is not currently available from NVIDIA." },
      { status: 400 },
    );
  }

  const team = TEAM_DEFINITIONS.find(({ id }) => id === parsed.data.teamId);
  if (!team) {
    return Response.json({ error: "Unknown agent team." }, { status: 400 });
  }

  let completion: Stream<ChatCompletionChunk>;
  try {
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: teamInstructions[parsed.data.teamId] },
      ...parsed.data.messages,
    ];
    completion = await streamNvidiaCompletion(
      parsed.data.modelId,
      messages,
      request.signal,
    );
  } catch (error) {
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : undefined;
    console.error(`Unable to start ${team.name}'s NVIDIA completion.`, {
      status,
      message:
        error instanceof Error ? error.message : "Unknown provider error.",
    });
    return Response.json(
      {
        error:
          status === 401 || status === 403
            ? "NVIDIA rejected the server credentials."
            : `${team.name} could not connect to its model provider.`,
      },
      { status: 502 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (value: string) => {
        controller.enqueue(encoder.encode(`data: ${value}\n\n`));
      };

      try {
        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) emit(JSON.stringify({ content }));
        }
        emit("[DONE]");
        controller.close();
      } catch (error) {
        const status =
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          typeof error.status === "number"
            ? error.status
            : undefined;
        console.error(`${team.name} NVIDIA response stream failed.`, {
          status,
          message:
            error instanceof Error ? error.message : "Unknown provider error.",
        });
        controller.error(new Error(`${team.name}'s response stream was interrupted.`));
      }
    },
    async cancel() {
      await completion.controller.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store, no-transform",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
