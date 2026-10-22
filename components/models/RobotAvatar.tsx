"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import "./RobotAvatar.css";

const Spline = dynamic(() => import("@splinetool/react-spline"), {
  ssr: false,
  loading: () => (
    <div className="robot-loading" role="status">
      INITIALIZING NAVI...
    </div>
  ),
});

type VoiceStatus = "idle" | "listening" | "speaking";
type AgentId = "jarvis" | "friday" | "ultron" | "vision";

type Agent = {
  id: AgentId;
  name: string;
  role: string;
  status: "Active" | "Ready" | "Idle" | "Watching";
  task: string;
  duration: string;
  tokens: string;
  tasksToday: string;
  progress?: number;
};

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

type RobotAvatarProps = {
  onAgentSelect?: (agentId: AgentId) => void;
};

type WeatherResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
};

const AGENTS: Agent[] = [
  {
    id: "jarvis",
    name: "J.A.R.V.I.S",
    role: "Strategy & Intelligence",
    status: "Active",
    task: "Awaiting runtime task data",
    duration: "—",
    tokens: "—",
    tasksToday: "—",
  },
  {
    id: "friday",
    name: "F.R.I.D.A.Y",
    role: "Client Acquisition & Relations",
    status: "Ready",
    task: "No task reported",
    duration: "—",
    tokens: "—",
    tasksToday: "—",
  },
  {
    id: "ultron",
    name: "Ultron",
    role: "Engineering & Automation",
    status: "Idle",
    task: "No task reported",
    duration: "—",
    tokens: "—",
    tasksToday: "—",
  },
  {
    id: "vision",
    name: "Vision",
    role: "Operations, Quality & Monitoring",
    status: "Watching",
    task: "Monitoring state unavailable",
    duration: "—",
    tokens: "—",
    tasksToday: "—",
  },
];

const AGENT_ICONS: Record<AgentId, string> = {
  jarvis: "✳",
  friday: "⌁",
  ultron: "⬡",
  vision: "◉",
};

const WEATHER_DESCRIPTIONS: Record<number, string> = {
  0: "CLEAR SKY",
  1: "MAINLY CLEAR",
  2: "PARTLY CLOUDY",
  3: "OVERCAST",
  45: "FOG",
  48: "RIME FOG",
  51: "LIGHT DRIZZLE",
  53: "DRIZZLE",
  55: "HEAVY DRIZZLE",
  56: "FREEZING DRIZZLE",
  57: "FREEZING DRIZZLE",
  61: "LIGHT RAIN",
  63: "RAIN",
  65: "HEAVY RAIN",
  66: "FREEZING RAIN",
  67: "FREEZING RAIN",
  71: "LIGHT SNOW",
  73: "SNOW",
  75: "HEAVY SNOW",
  77: "SNOW GRAINS",
  80: "RAIN SHOWERS",
  81: "RAIN SHOWERS",
  82: "HEAVY SHOWERS",
  85: "SNOW SHOWERS",
  86: "HEAVY SNOW SHOWERS",
  95: "THUNDERSTORM",
  96: "THUNDERSTORM",
  99: "THUNDERSTORM",
};

export default function RobotAvatar({ onAgentSelect }: RobotAvatarProps) {
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [selectedAgent, setSelectedAgent] = useState<AgentId>("jarvis");
  const [voiceMessage, setVoiceMessage] = useState("VOICE READY");

  const recognitionRef = useRef<Recognition | null>(null);
  const statusRef = useRef<VoiceStatus>("idle");
  const mountedRef = useRef(false);

  const changeVoiceStatus = useCallback((next: VoiceStatus) => {
    statusRef.current = next;
    setVoiceStatus(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      window.speechSynthesis?.cancel();
    };
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!("speechSynthesis" in window)) {
        setVoiceMessage(text);
        changeVoiceStatus("idle");
        return;
      }

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 0.9;
      utterance.volume = 1;

      utterance.onstart = () => {
        if (mountedRef.current) {
          changeVoiceStatus("speaking");
        }
      };

      utterance.onend = () => {
        if (!mountedRef.current) return;

        changeVoiceStatus("idle");
        setVoiceMessage("VOICE READY");
      };

      utterance.onerror = () => {
        if (!mountedRef.current) return;

        changeVoiceStatus("idle");
        setVoiceMessage("SPEECH PLAYBACK INTERRUPTED");
      };

      window.speechSynthesis.speak(utterance);
    },
    [changeVoiceStatus],
  );

  const startListening = useCallback(() => {
    if (statusRef.current === "listening") {
      recognitionRef.current?.stop();
      return;
    }

    if (statusRef.current === "speaking") {
      window.speechSynthesis?.cancel();
      changeVoiceStatus("idle");
    }

    recognitionRef.current?.abort();
    recognitionRef.current = null;

    const browser = window as RecognitionWindow;
    const RecognitionAPI =
      browser.SpeechRecognition ?? browser.webkitSpeechRecognition;

    if (!RecognitionAPI) {
      setVoiceMessage("VOICE INPUT NOT SUPPORTED");
      return;
    }

    const recognition = new RecognitionAPI();

    recognition.lang = "en-IN";
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];

        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      if (finalText.trim()) {
        setVoiceMessage("VOICE CAPTURED");

        // Demo response only. Connect your NAVI backend
        // here to process commands and route them to agents.
        speak(`I heard you say: ${finalText.trim()}`);
      } else if (interimText.trim()) {
        setVoiceMessage("HEARING YOU...");
      }
    };

    recognition.onerror = (event) => {
      if (!mountedRef.current) return;

      changeVoiceStatus("idle");

      setVoiceMessage(
        event.error === "not-allowed"
          ? "ALLOW MICROPHONE ACCESS"
          : event.error === "no-speech"
            ? "NO SPEECH DETECTED"
            : "VOICE INPUT INTERRUPTED",
      );
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }

      if (mountedRef.current && statusRef.current === "listening") {
        changeVoiceStatus("idle");
        setVoiceMessage("VOICE READY");
      }
    };

    recognitionRef.current = recognition;

    try {
      setVoiceMessage("LISTENING...");
      changeVoiceStatus("listening");
      recognition.start();
    } catch {
      recognitionRef.current = null;
      changeVoiceStatus("idle");
      setVoiceMessage("COULD NOT START MICROPHONE");
    }
  }, [changeVoiceStatus, speak]);

  // Preserve the existing keyboard shortcut without displaying it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.code === "KeyV") {
        event.preventDefault();
        startListening();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [startListening]);

  const selectAgent = (agentId: AgentId) => {
    setSelectedAgent(agentId);
    onAgentSelect?.(agentId);
  };

  return (
    <main className={`robot-scene state-${voiceStatus}`}>
      <div className="robot-background" aria-hidden="true" />
      <div className="robot-glow" aria-hidden="true" />
      <div className="robot-particles" aria-hidden="true" />

      <div className="robot-model" aria-label="NAVI master agent">
        <Spline scene="/robo.spline" />
      </div>

      <div className="navi-chest-label" aria-label="NAVI Master Agent">
        N A V I
      </div>

      <div className="robot-vignette" aria-hidden="true" />

      <div className="robot-chest-reactor" aria-hidden="true">
        <span />
      </div>

      <NaviHeader />

      <section className="navi-agent-layout" aria-label="NAVI managed agents">
        <div className="navi-agent-column navi-agent-column-left">
          {AGENTS.filter(
            (agent) => agent.id === "jarvis" || agent.id === "ultron",
          ).map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              selected={selectedAgent === agent.id}
              onSelect={() => selectAgent(agent.id)}
            />
          ))}
        </div>

        <div className="navi-agent-column navi-agent-column-right">
          {AGENTS.filter(
            (agent) => agent.id === "friday" || agent.id === "vision",
          ).map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              selected={selectedAgent === agent.id}
              onSelect={() => selectAgent(agent.id)}
            />
          ))}
        </div>
      </section>

      <span className="navi-sr-only" aria-live="polite">
        {voiceMessage}
      </span>
    </main>
  );
}

/* Compact header: icon and information stay on the same line. */
function NaviHeader() {
  const [now, setNow] = useState<Date | null>(null);
  const location = "TIRUPATI";
  const [temperature, setTemperature] = useState("--°C");
  const [weatherDescription, setWeatherDescription] = useState("WEATHER");

  // Local time and date update automatically.
  useEffect(() => {
    const updateTime = () => setNow(new Date());

    updateTime();

    const timer = window.setInterval(updateTime, 1000);

    return () => window.clearInterval(timer);
  }, []);

  // Fetch weather for Tirupati, Andhra Pradesh.
  useEffect(() => {
    const controller = new AbortController();

    async function loadWeather() {
      try {
        const weatherUrl =
          "https://api.open-meteo.com/v1/forecast" +
          "?latitude=13.6288" +
          "&longitude=79.4192" +
          "&current=temperature_2m,weather_code" +
          "&temperature_unit=celsius";

        const weatherResponse = await fetch(weatherUrl, {
          signal: controller.signal,
        });

        if (!weatherResponse.ok) {
          throw new Error("Weather lookup failed");
        }

        const weatherData: WeatherResponse = await weatherResponse.json();

        if (controller.signal.aborted) return;

        const current = weatherData.current;

        if (typeof current?.temperature_2m === "number") {
          setTemperature(`${Math.round(current.temperature_2m)}°C`);
        }

        const code = current?.weather_code;

        setWeatherDescription(
          typeof code === "number"
            ? WEATHER_DESCRIPTIONS[code] || "CURRENT CONDITIONS"
            : "WEATHER UNAVAILABLE",
        );
      } catch {
        if (controller.signal.aborted) return;

        setTemperature("--°C");
        setWeatherDescription("WEATHER UNAVAILABLE");
      }
    }

    void loadWeather();

    return () => controller.abort();
  }, []);

  const time = now
    ? now.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "--:--";

  const date = now
    ? now
        .toLocaleDateString(undefined, {
          weekday: "short",
          day: "2-digit",
          month: "short",
        })
        .toUpperCase()
    : "LOADING DATE";

  return (
    <header className="navi-header" aria-label="Local time and weather">
      <div className="navi-header-information">
        {/* Time and date */}
        <div className="navi-header-group navi-header-clock">
          <svg
            className="navi-header-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7v5l3.5 2" />
          </svg>

          <div className="navi-header-copy">
            <time className="navi-header-primary">{time}</time>
            <span className="navi-header-secondary">{date}</span>
          </div>
        </div>

        <span className="navi-header-divider" aria-hidden="true" />

        {/* Weather and detected location */}
        <div className="navi-header-group navi-header-weather">
          <svg
            className="navi-header-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M7.2 18.2h10.2a3.6 3.6 0 0 0 .2-7.2 5.7 5.7 0 0 0-10.8-1.1 4.2 4.2 0 0 0 .4 8.3Z" />
            <path d="m8 3-.7 1.6M16 3l.7 1.6M3.5 8.2l1.7.5" />
          </svg>

          <div className="navi-header-copy">
            <span className="navi-header-primary">{temperature}</span>

            <span
              className="navi-header-secondary"
              title={`${location} · ${weatherDescription}`}
            >
              {location} · {weatherDescription}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

function AgentCard({
  agent,
  selected,
  onSelect,
}: {
  agent: Agent;
  selected: boolean;
  onSelect: () => void;
}) {
  const statusClass = agent.status.toLowerCase();

  return (
    <button
      type="button"
      className={`navi-agent-card ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Select ${agent.name}, status ${agent.status}`}
    >
      <div className="navi-agent-card-top">
        <span className={`navi-agent-icon icon-${agent.id}`} aria-hidden="true">
          {AGENT_ICONS[agent.id]}
        </span>

        <span className={`navi-agent-status status-${statusClass}`}>
          <span />
          {agent.status}
        </span>
      </div>

      <div className="navi-agent-name">{agent.name}</div>

      <div className="navi-agent-role">{agent.role}</div>

      <div className="navi-agent-task">
        <span className="navi-metric-label">CURRENT TASK</span>

        <span className="navi-task-value">{agent.task}</span>
      </div>

      {typeof agent.progress === "number" && (
        <div
          className="navi-agent-progress"
          aria-label={`${agent.progress}% progress`}
        >
          <span
            style={{
              width: `${Math.max(0, Math.min(100, agent.progress))}%`,
            }}
          />
        </div>
      )}

      <div className="navi-agent-metrics">
        <div>
          <span className="navi-metric-label">WORKING TIME</span>
          <strong>{agent.duration}</strong>
        </div>

        <div>
          <span className="navi-metric-label">TOKENS USED</span>
          <strong>{agent.tokens}</strong>
        </div>

        <div>
          <span className="navi-metric-label">TASKS TODAY</span>
          <strong>{agent.tasksToday}</strong>
        </div>
      </div>
    </button>
  );
}
