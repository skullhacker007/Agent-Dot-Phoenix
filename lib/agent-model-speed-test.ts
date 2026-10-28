export const MODEL_RESPONSE_TIME_LIMIT_MS = 5000;

const TEST_MESSAGE = "Reply with the word READY.";
const RESULT_CACHE_TTL_MS = 60_000;

export type ModelSpeedTestResult = {
  model: string;
  responseTime: number | null;
  status: "WAITING" | "TESTING" | "WORKING" | "NOT WORKING";
  statusCode?: number | null;
  errorMessage?: string | null;
};

const resultCache = new Map<
  string,
  { result: ModelSpeedTestResult; expiresAt: number }
>();

async function hasValidCompletion(response: Response) {
  if (!response.ok || !response.body) return false;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let responseText = "";
  let complete = false;

  const processLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data) return;
    if (data === "[DONE]") {
      complete = true;
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch (cause) {
      throw new Error("Inference returned an invalid response stream.", {
        cause,
      });
    }
    if (
      typeof payload === "object" &&
      payload !== null &&
      "content" in payload &&
      typeof payload.content === "string"
    ) {
      responseText += payload.content;
    }
  };

  try {
    while (!complete) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        processLine(line);
        if (complete) break;
      }
    }
    if (!complete && buffer) processLine(buffer);
    return complete && responseText.trim().length > 0;
  } finally {
    reader.releaseLock();
  }
}

export async function testModel(
  modelId: string,
  parentSignal: AbortSignal,
): Promise<ModelSpeedTestResult> {
  if (parentSignal.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  const cached = resultCache.get(modelId);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const controller = new AbortController();
  const abortWithParent = () => controller.abort();
  parentSignal.addEventListener("abort", abortWithParent, { once: true });
  if (parentSignal.aborted) abortWithParent();

  const startedAt = performance.now();
  const timeout = window.setTimeout(
    () => controller.abort(),
    MODEL_RESPONSE_TIME_LIMIT_MS,
  );
  let working = false;
  let statusCode: number | null = null;
  let errorMessage: string | null = null;

  try {
    const response = await fetch("/api/agents/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId: "VISION",
        modelId,
        messages: [{ role: "user", content: TEST_MESSAGE }],
      }),
      signal: controller.signal,
    });
    statusCode = response.status;
    if (!response.ok) {
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || response.statusText;
      } catch {
        errorMessage = response.statusText;
      }
    } else {
      working = await hasValidCompletion(response);
    }
  } catch (error) {
    if (parentSignal.aborted) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      errorMessage = `Timed out (> ${MODEL_RESPONSE_TIME_LIMIT_MS} ms)`;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
  } finally {
    window.clearTimeout(timeout);
    parentSignal.removeEventListener("abort", abortWithParent);
  }

  const responseTime = performance.now() - startedAt;
  const result: ModelSpeedTestResult = {
    model: modelId,
    responseTime,
    status:
      working && responseTime <= MODEL_RESPONSE_TIME_LIMIT_MS
        ? "WORKING"
        : "NOT WORKING",
    statusCode,
    errorMessage,
  };
  resultCache.set(modelId, {
    result,
    expiresAt: Date.now() + RESULT_CACHE_TTL_MS,
  });
  return result;
}
