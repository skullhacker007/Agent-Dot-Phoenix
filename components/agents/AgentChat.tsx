"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { setAgentActivity } from "@/lib/agent-activity";
import type { TeamId } from "@/lib/agent-monitoring";
import "./AgentChat.css";

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
};

type AgentChatProps = {
  teamId: TeamId;
  teamName: string;
  teamRole: string;
  assignedModel: string | null;
  loading: boolean;
  marketContext?: unknown;
};

function getErrorMessage(payload: unknown, teamName: string) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return `${teamName} could not process the request.`;
}

function estimateTokens(text: string) {
  return text ? Math.ceil(text.length / 4) : 0;
}

function renderMessageContent(content: string, isThinking = false) {
  if (!content) {
    return isThinking ? (
      <span className="agent-chat-thinking">Thinking…</span>
    ) : null;
  }

  const lines = content.split("\n");

  return (
    <div className="agent-chat-body">
      {lines.map((line, lineIndex) => {
        if (!line.trim()) {
          return <span key={lineIndex} className="agent-chat-spacer" />;
        }

        const parts: ReactNode[] = [];
        const regex = /\*\*(.*?)\*\*/g;
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(line)) !== null) {
          if (match.index > lastIndex) {
            parts.push(line.substring(lastIndex, match.index));
          }
          parts.push(
            <strong
              key={`b-${lineIndex}-${match.index}`}
              className="agent-chat-strong"
            >
              {match[1]}
            </strong>,
          );
          lastIndex = regex.lastIndex;
        }

        if (lastIndex < line.length) {
          parts.push(line.substring(lastIndex));
        }

        const isBullet = /^\s*([*•-]|(\d+\.))\s+/.test(line);

        return (
          <p
            key={lineIndex}
            className={`agent-chat-line ${isBullet ? "is-bullet" : ""}`}
          >
            {parts.length > 0 ? parts : line}
          </p>
        );
      })}
    </div>
  );
}

export default function AgentChat({
  teamId,
  teamName,
  teamRole,
  assignedModel,
  loading: modelsLoading,
  marketContext,
}: AgentChatProps) {
  const assignedModelAvailable = assignedModel !== null;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const nextId = useRef(0);
  const submitting = useRef(false);
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
    if (!content || busy || submitting.current || !assignedModelAvailable) {
      return;
    }
    submitting.current = true;

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
    const conversation: Array<Pick<ChatMessage, "role" | "content">> = [];
    for (const { role, content: messageContent } of [
      ...messages,
      userMessage,
    ]) {
      if (!messageContent.trim()) continue;
      const previous = conversation.at(-1);
      if (!previous && role === "assistant") continue;
      if (previous?.role === role) {
        previous.content =
          role === "user"
            ? `${previous.content}\n${messageContent}`
            : `${previous.content}${messageContent}`;
      } else {
        conversation.push({ role, content: messageContent });
      }
    }
    const recentConversation = conversation.slice(-20);
    if (recentConversation[0]?.role === "assistant") {
      recentConversation.shift();
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    const activity = {
      inputTokens: estimateTokens(
        recentConversation
          .map(({ content: messageContent }) => messageContent)
          .join(" "),
      ),
      outputTokens: 0,
      tokensPerSecond: 0,
      startedAt: Date.now(),
    };
    const publishActivity = (status: "idle" | "working" | "error") => {
      activity.tokensPerSecond =
        activity.outputTokens > 0
          ? Math.round(
              activity.outputTokens /
                Math.max(1, (Date.now() - activity.startedAt) / 1000),
            )
          : 0;
      setAgentActivity(teamId, { status, ...activity });
    };
    publishActivity("working");
    const activityHeartbeat = window.setInterval(() => {
      publishActivity("working");
    }, 30_000);
    let responseText = "";

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setDraft("");
    setError("");
    setBusy(true);

    try {
      const response = await fetch("/api/agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          messages: recentConversation,
          modelId: assignedModel,
          ...(teamId === "VISION" && marketContext ? { marketContext } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        throw new Error(getErrorMessage(payload, teamName));
      }
      if (!response.body) {
        throw new Error(`${teamName} did not return a response stream.`);
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
          throw new Error(`${teamName} returned an invalid response stream.`, {
            cause,
          });
        }
        if (
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
        ) {
          throw new Error(payload.error);
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
        activity.outputTokens = estimateTokens(responseText);
        publishActivity("working");
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
        throw new Error(
          `${teamName} returned an empty response. Please try again.`,
        );
      }
      publishActivity("idle");
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") {
        publishActivity("idle");
        return;
      }
      publishActivity("error");
      setMessages((current) =>
        current.filter(
          (message) =>
            message.id !== assistantMessage.id || Boolean(responseText),
        ),
      );
      setError(
        caught instanceof Error
          ? caught.message
          : `${teamName} could not process the request.`,
      );
    } finally {
      window.clearInterval(activityHeartbeat);
      submitting.current = false;
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <aside className={`agent-chat-widget ${open ? "is-open" : ""}`}>
      {open ? (
        <section
          className="agent-chat"
          aria-label={`${teamName} assistant chat`}
        >
          <div className="agent-chat-heading">
            <p className="agent-chat-eyebrow">{teamName} ASSISTANT</p>
            <div className="agent-chat-heading-actions">
              <button
                aria-label={`Minimize ${teamName} chat`}
                className="agent-chat-close"
                onClick={() => setOpen(false)}
                type="button"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 12h14" />
                </svg>
              </button>
            </div>
          </div>

          <div className="agent-chat-transcript" role="log" aria-live="polite">
            {messages.length === 0 ? (
              <p className="agent-chat-empty">
                {assignedModelAvailable
                  ? `Ask ${teamName} about ${teamRole.toLowerCase()}.`
                  : modelsLoading
                    ? "Loading available models…"
                    : "Select an available NVIDIA model in settings to start chatting."}
              </p>
            ) : (
              messages.map((message) => (
                <article
                  className={`agent-chat-message is-${message.role}`}
                  key={message.id}
                >
                  {renderMessageContent(
                    message.content,
                    busy && message.role === "assistant",
                  )}
                </article>
              ))
            )}
          </div>

          {error && (
            <p className="agent-chat-error" role="alert">
              {error}
            </p>
          )}

          <form className="agent-chat-form" onSubmit={sendMessage}>
            <label
              className="agent-chat-input-label"
              htmlFor="agent-chat-input"
            >
              Message {teamName}
            </label>
            <textarea
              id="agent-chat-input"
              maxLength={4000}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={`Message ${teamName} about ${teamRole.toLowerCase()}...`}
              rows={2}
              value={draft}
              disabled={busy}
            />
            <div className="agent-chat-form-footer">
              <span>
                {teamId === "VISION"
                  ? "Avoid sharing sensitive data"
                  : teamId === "ULTRON"
                    ? "Defensive cybersecurity assistance only"
                    : "Avoid sharing sensitive data"}
              </span>
              <button
                type="submit"
                disabled={
                  busy ||
                  modelsLoading ||
                  !assignedModelAvailable ||
                  !draft.trim()
                }
              >
                {busy ? "Thinking..." : "Send"}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <button
          aria-expanded={open}
          aria-label={`Chat with ${teamName}`}
          title={`Chat with ${teamName}`}
          className="agent-chat-launcher"
          onClick={() => setOpen(true)}
          type="button"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.6-3.2A7.5 7.5 0 1 1 20 11.5Z" />
            <path d="M8.5 11.5h.01m3.49 0h.01m3.49 0h.01" />
          </svg>
          <span>Chat with {teamName}</span>
          <span
            className={`agent-chat-launcher-status ${assignedModelAvailable ? "is-ready" : ""}`}
          />
        </button>
      )}
    </aside>
  );
}
