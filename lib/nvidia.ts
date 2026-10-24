import "server-only";

import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

export const ASSIGNED_VISION_MODEL_ID = "nvidia/nemotron-3-ultra-550b-a55b";

export class NvidiaConfigurationError extends Error {
  constructor() {
    super("NVIDIA_API_KEY is not configured.");
    this.name = "NvidiaConfigurationError";
  }
}

function createNvidiaClient() {
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) {
    throw new NvidiaConfigurationError();
  }

  return new OpenAI({
    apiKey,
    baseURL: NVIDIA_BASE_URL,
    timeout: 300_000,
    maxRetries: 0,
  });
}

export async function listNvidiaModels(signal?: AbortSignal) {
  const client = createNvidiaClient();
  const models = await client.models.list({ signal });
  return [...new Set(models.data.map(({ id }) => id))];
}

export function streamVisionCompletion(
  messages: ChatCompletionMessageParam[],
  signal?: AbortSignal,
) {
  const client = createNvidiaClient();
  const params: ChatCompletionCreateParamsStreaming & {
    chat_template_kwargs: { enable_thinking: boolean };
  } = {
    model: ASSIGNED_VISION_MODEL_ID,
    messages,
    temperature: 1,
    top_p: 0.95,
    max_tokens: 16_384,
    chat_template_kwargs: { enable_thinking: true },
    stream: true,
  };

  return client.chat.completions.create(
    params,
    { signal },
  );
}
