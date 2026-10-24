"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import "./VisionChat.css";

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
};

type VisionChatProps = {
  models: string[];
  assignedModel: string | null;
  loading: boolean;
};

function getErrorMessage(payload: unknown) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return "Vision could not process the request.";
}

export default function VisionChat({
  models,
  assignedModel,
  loading: modelsLoading,
}: VisionChatProps) {
  const assignedModelAvailable =
    assignedModel !== null && models.includes(assignedModel);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const nextId = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      activeRequest.current?.abort();
    },
    [],
  );

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy || !assignedModelAvailable) {
      return;
    }

    const userMessage: ChatMessage = {
      id: nextId.current++,
      role: "user",
      content,
    };
    const assistantMessage: ChatMessage = {
      id: nextId.current++,
      role: "assistant",
      content: "",
    };
    const conversation = [...messages, userMessage]
      .slice(-20)
      .map(({ role, content: messageContent }) => ({
        role,
        content: messageContent,
      }));
    const controller = new AbortController();
    activeRequest.current = controller;
    let responseText = "";

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setDraft("");
    setError("");
    setBusy(true);

    try {
      const response = await fetch("/api/agents/vision/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conversation }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        throw new Error(getErrorMessage(payload));
      }
      if (!response.body) {
        throw new Error("Vision did not return a response stream.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
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
          throw new Error("Vision returned an invalid response stream.", {
            cause,
          });
        }
        if (
          typeof payload !== "object" ||
          payload === null ||
          !("content" in payload) ||
          typeof payload.content !== "string"
        ) {
          return;
        }

        responseText += payload.content;
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: responseText }
              : message,
          ),
        );
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
        if (complete) await reader.cancel();
      } finally {
        reader.releaseLock();
      }

      if (!responseText) {
        throw new Error("Vision returned an empty response. Please try again.");
      }
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;
      setMessages((current) =>
        current.filter(
          (message) =>
            message.id !== assistantMessage.id || Boolean(responseText),
        ),
      );
      setError(
        caught instanceof Error
          ? caught.message
          : "Vision could not process the request.",
      );
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <section className="vision-chat" aria-labelledby="vision-chat-heading">
      <div className="vision-chat-heading">
        <div>
          <p className="vision-chat-eyebrow">VISION ASSISTANT</p>
          <h2 id="vision-chat-heading">Financial analysis</h2>
        </div>
        {assignedModel && (
          <div className="vision-chat-model">
            <span>Assigned model</span>
            <strong>{assignedModel}</strong>
          </div>
        )}
      </div>

      <div className="vision-chat-transcript" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <p className="vision-chat-empty">
            {assignedModelAvailable
              ? "Ask Vision to analyze a financial question or scenario."
              : modelsLoading
                ? "Loading available models…"
                : "Vision's assigned model is not currently available."}
          </p>
        ) : (
          messages.map((message) => (
            <article
              className={`vision-chat-message is-${message.role}`}
              key={message.id}
            >
              <span>{message.role === "user" ? "You" : "Vision"}</span>
              <p>
                {message.content ||
                  (busy && message.role === "assistant" ? "Thinking…" : "")}
              </p>
            </article>
          ))
        )}
      </div>

      {error && (
        <p className="vision-chat-error" role="alert">
          {error}
        </p>
      )}

      <form className="vision-chat-form" onSubmit={sendMessage}>
        <label className="vision-chat-input-label" htmlFor="vision-chat-input">
          Message Vision
        </label>
        <textarea
          id="vision-chat-input"
          maxLength={4000}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about a financial question or scenario..."
          rows={2}
          value={draft}
          disabled={busy}
        />
        <div className="vision-chat-form-footer">
          <span>Informational analysis only · Avoid sharing sensitive data</span>
          <button
            type="submit"
            disabled={
              busy ||
              modelsLoading ||
              !assignedModelAvailable ||
              !draft.trim()
            }
          >
            {busy ? "Analyzing..." : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}
