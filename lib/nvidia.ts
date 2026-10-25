import "server-only";

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

export class NvidiaConfigurationError extends Error {
  constructor(message = "NVIDIA_API_KEY is not configured.") {
    super(message);
    this.name = "NvidiaConfigurationError";
  }
}

function createNvidiaClient() {
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) {
    throw new NvidiaConfigurationError();
  }
  if (!apiKey.startsWith("nvapi-")) {
    throw new NvidiaConfigurationError(
      "NVIDIA_API_KEY must be a raw NVIDIA API Catalog key (typically starts with nvapi-); do not include a Bearer prefix.",
    );
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

export function streamNvidiaCompletion(
  model: string,
  messages: ChatCompletionMessageParam[],
  signal?: AbortSignal,
) {
  const client = createNvidiaClient();
  return client.chat.completions.create(
    {
      model,
      messages,
      stream: true,
    },
    { signal },
  );
}
