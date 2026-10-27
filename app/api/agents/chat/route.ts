import { z } from "zod";
import { isSameOriginRequest } from "@/lib/agent-admin-auth";
import {
  getNvidiaErrorStatus,
  getNvidiaRetryAfter,
  listNvidiaModels,
  NvidiaConfigurationError,
  streamNvidiaCompletion,
} from "@/lib/nvidia";
import { TEAM_DEFINITIONS, type TeamId } from "@/lib/agent-monitoring";
import { buildVisionMarketContext } from "@/server/market-data/chat-context";
import { getPipeline } from "@/server/market-data/registry";
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import type { Stream } from "openai/streaming";

const MAX_REQUEST_BYTES = 64 * 1024;

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
    marketContext: z
      .object({
        activeFilter: z.string().optional(),
        categoryCounts: z
          .object({
            stocks: z.number().optional(),
            indices: z.number().optional(),
            futures: z.number().optional(),
            options: z.number().optional(),
            commodities: z.number().optional(),
            total: z.number().optional(),
          })
          .optional(),
        analytics: z.any().optional(),
        selectedPoint: z.any().optional(),
        compactPoints: z
          .array(
            z.object({
              symbol: z.string().optional(),
              label: z.string().optional(),
              group: z.string().optional(),
              value: z.number().nullable().optional(),
              change: z.number().nullable().optional(),
              changePercent: z.number().nullable().optional(),
              volume: z.number().nullable().optional(),
              high: z.number().nullable().optional(),
              low: z.number().nullable().optional(),
              open: z.number().nullable().optional(),
            }),
          )
          .optional(),
      })
      .nullish(),
  })
  .superRefine(({ messages }, context) => {
    messages.forEach((message, index) => {
      const expectedRole = index % 2 === 0 ? "user" : "assistant";
      if (message.role !== expectedRole) {
        context.addIssue({
          code: "custom",
          message: "Messages must start with a user and alternate roles.",
          path: ["messages", index, "role"],
        });
      }
    });
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
    "You are Vision, an elite quantitative financial analytics assistant. You have full, direct real-time access to the active Indian financial markets dashboard (NSE equities, benchmark indices, derivatives futures & options, and MCX commodities) streamed via Upstox API v2. Provide clear, data-driven analysis with exact figures, counts, price levels, and market breadth insights.",
};

const RESPONSE_CONCISENESS_RULES = `
### RESPONSE CONCISENESS & FORMATTING RULES:
- Keep answers short, clear, and focused on the user's exact question. Keep default answers within 5–8 lines.
- Separate top gainers from best buy candidates: top daily gainers are not automatically the best buy candidates.
- When asked for best stocks, buy candidates, or stock/option analysis:
  * Rank the top 3 stocks directly using available price, volume, momentum, trend, and risk data.
  * Always include profit data (projected target price & profit % potential) alongside CMP, daily change, key reason, and risk in one line per stock (e.g. "1. **SYMBOL**: CMP ₹X (+Y%) | Target/Profit: ₹Z (+P% upside) | Reason: [volume/momentum/trend] | Risk: [support/stop loss]").
- For counts, return the number directly without preamble.
- If indicators or data are missing (such as RSI, moving averages, or order depth), say so explicitly rather than inventing them. Never invent values or hallucinate indicators.
- Do not repeat the user's question and do not provide generic disclaimers or subjective hedging (e.g. never say "*Note: Direct 'best buy' is subjective; review...").
- Give a longer explanation only when the user asks for detailed analysis; otherwise keep it simple.
`.trim();

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
    if (request.signal.aborted) {
      return Response.json({ error: "Chat request was cancelled." }, { status: 499 });
    }
    if (error instanceof NvidiaConfigurationError) {
      return Response.json(
        { error: error.message },
        { status: 503 },
      );
    }

    const status = getNvidiaErrorStatus(error);
    const retryAfter = status === 429 ? (getNvidiaRetryAfter(error) ?? "60") : null;
    console.error("Unable to verify the selected NVIDIA model.", {
      status,
      message:
        error instanceof Error ? error.message : "Unknown provider error.",
    });
    return Response.json(
      {
        error:
          status === 429
            ? "NVIDIA rate-limited model discovery. Please try again later."
            : status === 401 || status === 403
              ? "NVIDIA rejected the server credentials."
              : "Unable to verify the selected model with NVIDIA.",
      },
      {
        status: status === 429 ? 429 : status === 401 || status === 403 ? 503 : 502,
        ...(retryAfter ? { headers: { "Retry-After": retryAfter } } : {}),
      },
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
    let systemInstruction = `${teamInstructions[parsed.data.teamId]}\n\n${RESPONSE_CONCISENESS_RULES}`;

    if (parsed.data.teamId === "VISION") {
      let serverSnapshot = null;
      const pipeline = getPipeline("indian-equities");
      if (pipeline) {
        serverSnapshot = pipeline.getSnapshot();
        if (!serverSnapshot || serverSnapshot.dataPoints.length === 0) {
          try {
            await pipeline.getData({ signal: request.signal });
            serverSnapshot = pipeline.getSnapshot();
          } catch {
            // Gracefully proceed with client context
          }
        }
      }
      const marketContextString = buildVisionMarketContext(
        parsed.data.marketContext,
        serverSnapshot,
      );
      systemInstruction = `${systemInstruction}\n\n${marketContextString}`;
    }

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemInstruction },
      ...parsed.data.messages,
    ];
    completion = await streamNvidiaCompletion(
      parsed.data.modelId,
      messages,
      request.signal,
    );
  } catch (error) {
    if (request.signal.aborted) {
      return Response.json({ error: "Chat request was cancelled." }, { status: 499 });
    }
    const status = getNvidiaErrorStatus(error);
    const retryAfter = status === 429 ? (getNvidiaRetryAfter(error) ?? "60") : null;
    console.error(`Unable to start ${team.name}'s NVIDIA completion.`, {
      status,
      message:
        error instanceof Error ? error.message : "Unknown provider error.",
    });
    const errorMessage =
      status === 400 || status === 404
        ? "The selected model does not support chat completions or is unavailable."
        : status === 429
          ? "NVIDIA rate-limited this model. Please try again later."
          : `${team.name} could not connect to its model provider.`;
    return Response.json(
      {
        error:
          status === 401 || status === 403
            ? "NVIDIA rejected the server credentials."
            : errorMessage,
      },
      {
        status:
          status === 400 || status === 404
            ? 400
            : status === 429
              ? 429
              : status === 401 || status === 403
              ? 503
              : 502,
        ...(retryAfter ? { headers: { "Retry-After": retryAfter } } : {}),
      },
    );
  }

  const encoder = new TextEncoder();
  let closed = false;
  let abortRequest = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (value: string) => {
        if (closed || request.signal.aborted) return;
        controller.enqueue(encoder.encode(`data: ${value}\n\n`));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        request.signal.removeEventListener("abort", abort);
        controller.close();
      };
      const abort = () => {
        void completion.controller.abort();
        close();
      };
      abortRequest = abort;
      request.signal.addEventListener("abort", abortRequest, { once: true });
      if (request.signal.aborted) abortRequest();

      try {
        for await (const chunk of completion) {
          if (closed || request.signal.aborted) return;
          const content = chunk.choices[0]?.delta?.content;
          if (content) emit(JSON.stringify({ content }));
        }
        emit("[DONE]");
        close();
      } catch (error) {
        if (closed || request.signal.aborted) return;
        const status = getNvidiaErrorStatus(error);
        const retryAfter = status === 429 ? (getNvidiaRetryAfter(error) ?? "60") : null;
        console.error(`${team.name} NVIDIA response stream failed.`, {
          status,
          message:
            error instanceof Error ? error.message : "Unknown provider error.",
        });
        emit(
          JSON.stringify({
            error:
              status === 429
                ? "NVIDIA rate-limited this response. Please try again later."
                : `${team.name}'s response stream was interrupted.`,
            ...(retryAfter ? { retryAfter } : {}),
          }),
        );
        close();
      }
    },
    async cancel() {
      closed = true;
      request.signal.removeEventListener("abort", abortRequest);
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
