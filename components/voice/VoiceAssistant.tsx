"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getVoiceCommandReply,
  resolveVoiceNavigationCommand,
} from "@/lib/voice-navigation";
import "./VoiceAssistant.css";

type VoiceStatus = "idle" | "listening" | "speaking";

type SpeechRecognitionResult = {
  readonly isFinal: boolean;
  readonly [index: number]: { readonly transcript: string };
};

type SpeechRecognitionEvent = {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResult>;
};

type RecognitionErrorEvent = {
  readonly error: string;
};

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type RecognitionWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export default function VoiceAssistant() {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [activated, setActivated] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("Activate voice assistance");
  const recognitionRef = useRef<Recognition | null>(null);
  const statusRef = useRef<VoiceStatus>("idle");
  const activatedRef = useRef(false);
  const mountedRef = useRef(false);
  const routeHistoryRef = useRef<string[]>([]);
  const responsePendingRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const startRecognitionRef = useRef<() => void>(() => {});

  useEffect(() => {
    const history = routeHistoryRef.current;
    if (history.at(-1) === pathname) return;
    if (history.length > 1 && history.at(-2) === pathname) {
      history.pop();
      return;
    }
    history.push(pathname);
    if (history.length > 50) history.shift();
  }, [pathname]);

  const changeStatus = useCallback((next: VoiceStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const speak = useCallback(
    (text: string) => {
      setMessage(text);
      if (!("speechSynthesis" in window)) {
        changeStatus("idle");
        responsePendingRef.current = false;
        if (activatedRef.current) startRecognitionRef.current();
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 0.9;
      utterance.onstart = () => {
        if (mountedRef.current) changeStatus("speaking");
      };
      utterance.onend = () => {
        if (!mountedRef.current) return;
        changeStatus("idle");
        responsePendingRef.current = false;
        if (activatedRef.current) startRecognitionRef.current();
      };
      utterance.onerror = () => {
        if (!mountedRef.current) return;
        changeStatus("idle");
        setMessage("Speech playback was interrupted");
        responsePendingRef.current = false;
        if (activatedRef.current) startRecognitionRef.current();
      };
      window.speechSynthesis.speak(utterance);
    },
    [changeStatus],
  );

  const runCommand = useCallback(
    (spokenText: string) => {
      const command = resolveVoiceNavigationCommand(spokenText);
      responsePendingRef.current = true;
      if (command.type === "scroll") {
        if (command.direction === "top") {
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else if (command.direction === "bottom") {
          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: "smooth",
          });
        } else {
          window.scrollBy({
            top:
              (command.direction === "down" ? 1 : -1) *
              Math.round(window.innerHeight * 0.75),
            behavior: "smooth",
          });
        }
        speak(getVoiceCommandReply(command, pathname));
        return;
      }

      if (command.type === "back") {
        if (routeHistoryRef.current.length > 1) {
          routeHistoryRef.current.pop();
          speak(getVoiceCommandReply(command, pathname));
          router.back();
        } else if (pathname !== "/") {
          speak("Of course, Sir. You're back on the Home page.");
          routeHistoryRef.current = ["/"];
          router.replace("/");
        } else {
          speak("You're already home, Sir.");
        }
        return;
      }

      if (command.type === "navigate") {
        speak(getVoiceCommandReply(command, pathname));
        if (pathname !== command.href) router.push(command.href);
        return;
      }

      speak(getVoiceCommandReply(command, pathname));
    },
    [pathname, router, speak],
  );

  const startRecognition = useCallback(() => {
    if (
      !activatedRef.current ||
      !mountedRef.current ||
      responsePendingRef.current ||
      recognitionRef.current
    ) {
      return;
    }

    const browser = window as RecognitionWindow;
    const RecognitionAPI =
      browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!RecognitionAPI) return;

    const recognition = new RecognitionAPI();
    recognition.lang = "en-IN";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (
        let index = event.resultIndex;
        index < event.results.length;
        index++
      ) {
        const result = event.results[index];
        if (result.isFinal) finalText += `${result[0].transcript} `;
        else interimText += result[0].transcript;
      }

      if (interimText.trim()) setTranscript(interimText.trim());
      if (finalText.trim()) {
        const spokenText = finalText.trim();
        setTranscript(spokenText);
        responsePendingRef.current = true;
        recognition.stop();
        runCommand(spokenText);
      }
    };
    recognition.onerror = (event) => {
      if (!mountedRef.current) return;
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        activatedRef.current = false;
        setActivated(false);
        setMessage(
          "Microphone access denied. Enable it to use voice assistance.",
        );
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        setMessage("Voice input was interrupted. Reconnecting…");
      }
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (!mountedRef.current) return;
      if (activatedRef.current && !responsePendingRef.current) {
        restartTimerRef.current = window.setTimeout(() => {
          restartTimerRef.current = null;
          startRecognitionRef.current();
        }, 400);
      } else if (!activatedRef.current) {
        changeStatus("idle");
      }
    };

    recognitionRef.current = recognition;
    setMessage("Listening for your next request");
    changeStatus("listening");
    try {
      recognition.start();
    } catch (error) {
      recognitionRef.current = null;
      changeStatus("idle");
      setMessage("Could not start voice input");
      console.error("Unable to start voice recognition.", error);
    }
  }, [changeStatus, runCommand]);

  useEffect(() => {
    startRecognitionRef.current = startRecognition;
  }, [startRecognition]);

  const startListening = useCallback(() => {
    if (activatedRef.current) {
      activatedRef.current = false;
      setActivated(false);
      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      window.speechSynthesis?.cancel();
      responsePendingRef.current = false;
      changeStatus("idle");
      setMessage("Voice assistance paused");
      return;
    }

    const browser = window as RecognitionWindow;
    const RecognitionAPI =
      browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!RecognitionAPI) {
      setMessage("Voice input is not supported in this browser");
      return;
    }

    activatedRef.current = true;
    setActivated(true);
    setTranscript("");
    responsePendingRef.current = true;
    speak("Voice assistant activated sir.");
  }, [changeStatus, speak]);

  useEffect(() => {
    mountedRef.current = true;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.code === "KeyV") {
        event.preventDefault();
        startListening();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("keydown", onKeyDown);
      activatedRef.current = false;
      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current);
      }
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      window.speechSynthesis?.cancel();
    };
  }, [startListening]);

  return (
    <aside className={`voice-assistant voice-assistant-${status}`}>
      <button
        className={`voice-assistant-button ${activated ? "is-active" : "is-inactive"}`}
        type="button"
        onClick={startListening}
        aria-label={
          activated ? "Pause voice assistance" : "Activate voice assistance"
        }
        aria-pressed={activated}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8" />
          {!activated && <path d="m4 4 16 16" />}
        </svg>
      </button>
      <div
        className="voice-assistant-copy"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="voice-assistant-transcript">
          {transcript || message}
        </span>
      </div>
    </aside>
  );
}
