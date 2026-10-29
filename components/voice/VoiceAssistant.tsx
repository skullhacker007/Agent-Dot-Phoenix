"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getVoiceCommandReply,
  resolveVoiceNavigationCommand,
} from "@/lib/voice-navigation";
import "./VoiceAssistant.css";

const STORAGE_KEY = "voice_assistant_active";
const ACTIVE_CHANGE_EVENT = "voice-assistant-active-change";

function subscribeToVoiceActive(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(ACTIVE_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(ACTIVE_CHANGE_EVENT, callback);
  };
}

function getVoiceActiveSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function getVoiceActiveServerSnapshot(): boolean {
  return false;
}

function setVoiceActive(active: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, active ? "true" : "false");
    window.dispatchEvent(new Event(ACTIVE_CHANGE_EVENT));
  } catch {}
}

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
  const compact = pathname !== "/";

  const activated = useSyncExternalStore(
    subscribeToVoiceActive,
    getVoiceActiveSnapshot,
    getVoiceActiveServerSnapshot,
  );

  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("Activate voice assistance");

  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const recognitionRef = useRef<Recognition | null>(null);
  const statusRef = useRef<VoiceStatus>("idle");
  const activatedRef = useRef(activated);
  const mountedRef = useRef(false);
  const routeHistoryRef = useRef<string[]>([]);
  const responsePendingRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const finalResultTimerRef = useRef<number | null>(null);
  const finalTranscriptRef = useRef("");
  const startRecognitionRef = useRef<() => void>(() => {});
  const runCommandRef = useRef<(spokenText: string) => void>(() => {});

  useEffect(() => {
    activatedRef.current = activated;
    if (activated) {
      startRecognitionRef.current();
    } else {
      if (finalResultTimerRef.current !== null) {
        window.clearTimeout(finalResultTimerRef.current);
        finalResultTimerRef.current = null;
      }
      finalTranscriptRef.current = "";
      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      responsePendingRef.current = false;
      statusRef.current = "idle";
    }
  }, [activated]);

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
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        changeStatus("idle");
        responsePendingRef.current = false;
        if (activatedRef.current) startRecognitionRef.current();
        return;
      }

      // Abort ongoing recognition while speaking to prevent feedback loops
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 0.9;

      const voices = window.speechSynthesis.getVoices();
      const preferredVoice =
        voices.find((v) => v.lang === "en-IN" || v.lang === "en_IN") ||
        voices.find((v) => v.lang.startsWith("en") && !v.localService) ||
        voices.find((v) => v.lang.startsWith("en"));
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

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
        responsePendingRef.current = false;
        if (activatedRef.current) startRecognitionRef.current();
      };
      window.speechSynthesis.speak(utterance);
    },
    [changeStatus],
  );

  const runCommand = useCallback(
    (spokenText: string) => {
      const currentPath = pathnameRef.current;
      const command = resolveVoiceNavigationCommand(spokenText, currentPath);
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
        speak(getVoiceCommandReply(command, currentPath));
        return;
      }

      if (command.type === "restart") {
        speak("Sure, Sir. Refreshing the page now.");
        window.setTimeout(() => window.location.reload(), 700);
        return;
      }

      if (command.type === "back") {
        if (routeHistoryRef.current.length > 1) {
          routeHistoryRef.current.pop();
          speak(getVoiceCommandReply(command, currentPath));
          router.back();
        } else if (currentPath !== "/") {
          speak("Of course, Sir. You're back on the Home page.");
          routeHistoryRef.current = ["/"];
          router.replace("/");
        } else {
          speak("You're already home, Sir.");
        }
        return;
      }

      if (command.type === "navigate") {
        speak(getVoiceCommandReply(command, currentPath));
        if (currentPath !== command.href) router.push(command.href);
        return;
      }

      speak(getVoiceCommandReply(command, currentPath));
    },
    [router, speak],
  );

  useEffect(() => {
    runCommandRef.current = runCommand;
  }, [runCommand]);

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
    recognition.lang =
      typeof navigator !== "undefined" && navigator.language?.startsWith("en")
        ? navigator.language
        : "en-IN";
    recognition.interimResults = true;
    recognition.continuous = true;
    finalTranscriptRef.current = "";

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

      if (finalText.trim()) {
        finalTranscriptRef.current = [
          finalTranscriptRef.current,
          finalText.trim(),
        ]
          .filter(Boolean)
          .join(" ");
      }
      const displayedText = [
        finalTranscriptRef.current,
        interimText.trim(),
      ]
        .filter(Boolean)
        .join(" ");
      if (displayedText) setTranscript(displayedText);

      if (finalTranscriptRef.current) {
        if (finalResultTimerRef.current !== null) {
          window.clearTimeout(finalResultTimerRef.current);
        }
        finalResultTimerRef.current = window.setTimeout(() => {
          finalResultTimerRef.current = null;
          const spokenText = finalTranscriptRef.current.trim();
          finalTranscriptRef.current = "";
          if (!spokenText) return;

          setTranscript(spokenText);
          responsePendingRef.current = true;
          try {
            recognition.stop();
          } catch {}
          runCommandRef.current(spokenText);
        }, 700);
      }
    };

    recognition.onerror = (event) => {
      if (!mountedRef.current) return;
      if (event.error === "no-speech" || event.error === "aborted") {
        return;
      }
      // Never display error messages or deactivate assistant on transient audio/permission glitch
      if (finalResultTimerRef.current !== null) {
        window.clearTimeout(finalResultTimerRef.current);
        finalResultTimerRef.current = null;
      }
      finalTranscriptRef.current = "";
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (!mountedRef.current) return;
      if (
        activatedRef.current &&
        !responsePendingRef.current &&
        finalResultTimerRef.current === null
      ) {
        if (restartTimerRef.current !== null) {
          window.clearTimeout(restartTimerRef.current);
        }
        restartTimerRef.current = window.setTimeout(() => {
          restartTimerRef.current = null;
          if (
            activatedRef.current &&
            mountedRef.current &&
            !responsePendingRef.current
          ) {
            startRecognitionRef.current();
          }
        }, 400);
      } else if (!activatedRef.current) {
        changeStatus("idle");
      }
    };

    recognitionRef.current = recognition;
    changeStatus("listening");
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      changeStatus("idle");
      if (activatedRef.current && !responsePendingRef.current) {
        if (restartTimerRef.current !== null) {
          window.clearTimeout(restartTimerRef.current);
        }
        restartTimerRef.current = window.setTimeout(() => {
          restartTimerRef.current = null;
          if (
            activatedRef.current &&
            mountedRef.current &&
            !responsePendingRef.current
          ) {
            startRecognitionRef.current();
          }
        }, 800);
      }
    }
  }, [changeStatus]);

  useEffect(() => {
    startRecognitionRef.current = startRecognition;
  }, [startRecognition]);

  const startListening = useCallback(async () => {
    if (activatedRef.current) {
      // User requested mute
      setVoiceActive(false);
      if (finalResultTimerRef.current !== null) {
        window.clearTimeout(finalResultTimerRef.current);
        finalResultTimerRef.current = null;
      }
      finalTranscriptRef.current = "";
      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      responsePendingRef.current = false;
      changeStatus("idle");
      setMessage("Voice assistant muted");
      return;
    }

    // Direct user click/activation: request microphone stream to guarantee earpod / browser permission
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch (err) {
        console.warn("Audio input initialization:", err);
      }
    }

    const browser = window as RecognitionWindow;
    const RecognitionAPI =
      browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!RecognitionAPI) {
      setMessage("Voice input is not supported in this browser");
      return;
    }

    setVoiceActive(true);
    setTranscript("");
    responsePendingRef.current = true;
    speak("Voice assistant activated sir.");
  }, [changeStatus, speak]);

  // Reconnect on audio device changes (e.g. earpods plugged in or connected via Bluetooth)
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.addEventListener) {
      return;
    }
    const handleDeviceChange = () => {
      if (!mountedRef.current || !activatedRef.current) return;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
      if (!responsePendingRef.current) {
        if (restartTimerRef.current !== null) {
          window.clearTimeout(restartTimerRef.current);
        }
        restartTimerRef.current = window.setTimeout(() => {
          restartTimerRef.current = null;
          if (
            activatedRef.current &&
            mountedRef.current &&
            !responsePendingRef.current
          ) {
            startRecognitionRef.current();
          }
        }, 500);
      }
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, []);

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
      if (finalResultTimerRef.current !== null) {
        window.clearTimeout(finalResultTimerRef.current);
      }
      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [startListening]);

  const displayedMessage =
    transcript || (activated ? "Voice assistant activated sir." : message);

  return (
    <aside
      className={`voice-assistant voice-assistant-${status} ${
        compact ? "voice-assistant-compact" : ""
      }`}
    >
      <button
        className={`voice-assistant-button ${activated ? "is-active" : "is-inactive"}`}
        type="button"
        onClick={startListening}
        aria-label={
          activated ? "Mute voice assistant" : "Activate voice assistance"
        }
        aria-pressed={activated}
        title={
          activated
            ? "Voice assistant active (Click to mute)"
            : "Activate voice assistance (Alt+Shift+V)"
        }
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
          {displayedMessage}
        </span>
        <span className="voice-assistant-hint">
          {activated
            ? status === "speaking"
              ? "Voice assistant"
              : status === "listening"
                ? "Listening for requests"
                : "Voice assistant active"
            : "Voice assistant muted"}
        </span>
      </div>
    </aside>
  );
}
