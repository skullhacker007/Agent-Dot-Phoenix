import "server-only";

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const MODEL_CACHE_TTL_MS = 30_000;
let cachedModels: { models: string[]; expiresAt: number } | undefined;
let modelListRequest: Promise<string[]> | undefined;

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
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  let models: Promise<string[]>;
  if (cachedModels && cachedModels.expiresAt > Date.now()) {
    models = Promise.resolve(cachedModels.models);
  } else {
    modelListRequest ??= createNvidiaClient()
      .models.list()
      .then((response) => {
        const result = [...new Set(response.data.map(({ id }) => id))];
        cachedModels = {
          models: result,
          expiresAt: Date.now() + MODEL_CACHE_TTL_MS,
        };
        return result;
      })
      .finally(() => {
        modelListRequest = undefined;
      });
    models = modelListRequest;
  }

  if (!signal) return models;
  return new Promise<string[]>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    models.then(
      (result) => {
        signal.removeEventListener("abort", abort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

export function getNvidiaErrorStatus(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
    ? error.status
    : undefined;
}

export function getNvidiaRetryAfter(error: unknown) {
  if (
    typeof error !== "object" ||
    error === null ||
    !("headers" in error) ||
    !(error.headers instanceof Headers)
  ) {
    return undefined;
  }

  const value = error.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return `${Math.ceil(seconds)}`;

  const date = Date.parse(value);
  return Number.isNaN(date)
    ? undefined
    : `${Math.max(1, Math.ceil((date - Date.now()) / 1_000))}`;
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
