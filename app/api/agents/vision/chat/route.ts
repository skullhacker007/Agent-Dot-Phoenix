import { z } from "zod";
import { isSameOriginRequest } from "@/lib/agent-admin-auth";
import {
  ASSIGNED_VISION_MODEL_ID,
  listNvidiaModels,
  NvidiaConfigurationError,
  streamVisionCompletion,
} from "@/lib/nvidia";
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import type { Stream } from "openai/streaming";

const MAX_REQUEST_BYTES = 32 * 1024;

const requestSchema = z
  .object({
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

const systemMessage: ChatCompletionMessageParam = {
  role: "system",
  content:
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
    console.error("Unable to read the Vision chat request.", error);
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
        { error: "Vision model provider is not configured." },
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
    console.error("Unable to verify Vision's assigned NVIDIA model.", {
      status,
      message:
        error instanceof Error ? error.message : "Unknown provider error.",
    });
    return Response.json(
      {
        error:
          status === 401 || status === 403
            ? "NVIDIA rejected the server credentials."
            : "Unable to verify Vision's assigned model with NVIDIA.",
      },
      { status: status === 401 || status === 403 ? 503 : 502 },
    );
  }

  if (!availableModels.includes(ASSIGNED_VISION_MODEL_ID)) {
    return Response.json(
      { error: "Vision's assigned model is not currently available." },
      { status: 503 },
    );
  }

  let completion: Stream<ChatCompletionChunk>;
  try {
    const messages: ChatCompletionMessageParam[] = [
      systemMessage,
      ...parsed.data.messages,
    ];
    completion = await streamVisionCompletion(messages, request.signal);
  } catch (error) {
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : undefined;
    console.error("Unable to start Vision's NVIDIA completion.", {
      status,
      message:
        error instanceof Error ? error.message : "Unknown provider error.",
    });
    return Response.json(
      {
        error:
          status === 401 || status === 403
            ? "NVIDIA rejected the server credentials."
            : "Vision could not connect to its model provider.",
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
        console.error("Vision NVIDIA response stream failed.", {
          status,
          message:
            error instanceof Error ? error.message : "Unknown provider error.",
        });
        controller.error(new Error("Vision's response stream was interrupted."));
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
