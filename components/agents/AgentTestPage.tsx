"use client";

import { useEffect, useState } from "react";
import { agentModelsResponseSchema } from "@/lib/agent-models";

type ModelStatus = "WAITING" | "TESTING" | "WORKING" | "NOT WORKING";

type ModelResult = {
  model: string;
  responseTime: number | null;
  status: ModelStatus;
};

const TIME_LIMIT_MS = 1000;
const TEST_MESSAGE = "Reply with the word READY.";

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
): Promise<ModelResult> {
  const controller = new AbortController();
  const abortWithParent = () => controller.abort();
  parentSignal.addEventListener("abort", abortWithParent, { once: true });
  if (parentSignal.aborted) abortWithParent();

  const startedAt = performance.now();
  const timeout = window.setTimeout(() => controller.abort(), TIME_LIMIT_MS);
  let working = false;

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
    working = await hasValidCompletion(response);
  } catch {
    working = false;
  } finally {
    window.clearTimeout(timeout);
    parentSignal.removeEventListener("abort", abortWithParent);
  }

  const responseTime = performance.now() - startedAt;
  return {
    model: modelId,
    responseTime,
    status: working && responseTime <= TIME_LIMIT_MS ? "WORKING" : "NOT WORKING",
  };
}

const pageStyle = {
  minHeight: "100vh",
  padding: "clamp(24px, 5vw, 64px)",
  background:
    "radial-gradient(ellipse at 15% 0%, rgba(41, 77, 125, 0.2), transparent 42%), #090d14",
  color: "#e8edf5",
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
} as const;

export default function AgentTestPage() {
  const [results, setResults] = useState<ModelResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const discoveryController = new AbortController();

    async function runTests() {
      try {
        const response = await fetch(
          "/api/agents/models?teamId=VISION",
          { cache: "no-store", signal: discoveryController.signal },
        );
        if (!response.ok) {
          throw new Error(`Model discovery failed (${response.status}).`);
        }

        const parsed = agentModelsResponseSchema.safeParse(
          await response.json(),
        );
        if (!parsed.success) {
          throw new Error("Model discovery returned invalid data.");
        }
        if (!active) return;

        const models = parsed.data.models;
        setResults(
          models.map((model) => ({
            model,
            responseTime: null,
            status: "WAITING",
          })),
        );

        for (const [index, model] of models.entries()) {
          if (!active) return;
          setResults((current) =>
            current.map((result, resultIndex) =>
              resultIndex === index ? { ...result, status: "TESTING" } : result,
            ),
          );

          const result = await testModel(model, discoveryController.signal);
          if (!active) return;
          setResults((current) =>
            current.map((currentResult, resultIndex) =>
              resultIndex === index ? result : currentResult,
            ),
          );
        }
      } catch (caught) {
        if (!active || discoveryController.signal.aborted) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load models for the speed test.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void runTests();
    return () => {
      active = false;
      discoveryController.abort();
    };
  }, []);

  const workingCount = results.filter(
    ({ status }) => status === "WORKING",
  ).length;
  const notWorkingCount = results.filter(
    ({ status }) => status === "NOT WORKING",
  ).length;
  const sortedResults = [...results].sort((a, b) => {
    const statusOrder: Record<ModelStatus, number> = {
      WORKING: 0,
      TESTING: 1,
      WAITING: 2,
      "NOT WORKING": 3,
    };
    const statusDifference = statusOrder[a.status] - statusOrder[b.status];
    if (statusDifference !== 0) return statusDifference;
    if (a.status === "WORKING" && b.status === "WORKING") {
      return (a.responseTime ?? Infinity) - (b.responseTime ?? Infinity);
    }
    return 0;
  });
  const testing = results.some(
    ({ status }) => status === "TESTING" || status === "WAITING",
  );

  return (
    <main style={pageStyle}>
      <section style={{ maxWidth: 1040, margin: "0 auto" }}>
        <div style={{ marginBottom: 32 }}>
          <div
            style={{
              color: "#83a9e8",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            VISION · MODEL DIAGNOSTICS
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(28px, 5vw, 40px)",
              letterSpacing: "-0.04em",
              fontWeight: 650,
            }}
          >
            AI Model Speed Test Report
          </h1>
          <p style={{ color: "#94a0b2", margin: "10px 0 0", fontSize: 15 }}>
            Each available model is tested against live inference with a
            1-second response limit.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 14,
            marginBottom: 24,
          }}
        >
          {[
            { label: "Total models", value: results.length, color: "#e8edf5" },
            { label: "Working", value: workingCount, color: "#55d6a0" },
            { label: "Not working", value: notWorkingCount, color: "#ff7e86" },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              style={{
                padding: "18px 20px",
                background: "rgba(17, 24, 36, 0.82)",
                border: "1px solid #202a39",
                borderRadius: 12,
              }}
            >
              <div style={{ color: "#909db0", fontSize: 13 }}>{label}</div>
              <div
                style={{
                  marginTop: 8,
                  color,
                  fontSize: 28,
                  fontWeight: 650,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            overflow: "hidden",
            background: "rgba(17, 24, 36, 0.88)",
            border: "1px solid #202a39",
            borderRadius: 12,
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                textAlign: "left",
                minWidth: 520,
              }}
            >
              <thead>
                <tr style={{ background: "rgba(255, 255, 255, 0.025)" }}>
                  {["Model", "Response time", "Status"].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      style={{
                        padding: "15px 20px",
                        color: "#8997aa",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        borderBottom: "1px solid #202a39",
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedResults.map(({ model, responseTime, status }) => {
                  const statusColor =
                    status === "WORKING"
                      ? "#55d6a0"
                      : status === "NOT WORKING"
                        ? "#ff7e86"
                        : "#9aa8bb";
                  return (
                    <tr key={model}>
                      <td
                        style={{
                          padding: "17px 20px",
                          color: "#e5ebf4",
                          fontSize: 14,
                          fontWeight: 550,
                          borderBottom: "1px solid #1b2431",
                        }}
                      >
                        {model}
                      </td>
                      <td
                        style={{
                          padding: "17px 20px",
                          color: "#bdc7d5",
                          fontSize: 14,
                          fontVariantNumeric: "tabular-nums",
                          borderBottom: "1px solid #1b2431",
                        }}
                      >
                        {responseTime === null
                          ? "—"
                          : responseTime >= TIME_LIMIT_MS
                            ? "> 1,000 ms"
                            : `${responseTime.toFixed(1)} ms`}
                      </td>
                      <td
                        style={{
                          padding: "17px 20px",
                          borderBottom: "1px solid #1b2431",
                        }}
                      >
                        <span
                          style={{
                            color: statusColor,
                            fontSize: 11,
                            fontWeight: 750,
                            letterSpacing: "0.08em",
                          }}
                        >
                          {status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!loading && results.length === 0 && !error && (
                  <tr>
                    <td
                      colSpan={3}
                      style={{
                        padding: "28px 20px",
                        textAlign: "center",
                        color: "#8997aa",
                        fontSize: 14,
                      }}
                    >
                      No models are currently available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {(loading || testing) && (
            <div
              role="status"
              style={{
                padding: "13px 20px",
                color: "#91a0b4",
                borderTop: "1px solid #202a39",
                fontSize: 13,
              }}
            >
              {loading
                ? "Loading models and starting the report…"
                : "Testing models sequentially…"}
            </div>
          )}
          {error && (
            <div
              role="alert"
              style={{
                padding: "14px 20px",
                color: "#ff9ba1",
                borderTop: "1px solid #202a39",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}