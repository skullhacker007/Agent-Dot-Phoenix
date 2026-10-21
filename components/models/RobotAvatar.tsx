
"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import "./RobotAvatar.css";

const Spline = dynamic(
    () => import("@splinetool/react-spline"),
    {
        ssr: false,
        loading: () => (
            <div className="robot-loading">
                INITIALIZING AGENT DOT...
            </div>
        ),
    }
);

type VoiceStatus = "idle" | "listening" | "speaking";

type SpeechRecognitionResult = {
    readonly isFinal: boolean;
    readonly [index: number]: { transcript: string };
};

type SpeechRecognitionEvent = {
    readonly resultIndex: number;
    readonly results: ArrayLike<SpeechRecognitionResult>;
};

type Recognition = {
    lang: string;
    interimResults: boolean;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
    abort: () => void;
};

type RecognitionWindow = Window & {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
};

export default function RobotAvatar() {
    const [status, setStatus] = useState<VoiceStatus>("idle");
    const [transcript, setTranscript] = useState("");
    const [message, setMessage] = useState("READY WHEN YOU ARE");
    const recognitionRef = useRef<Recognition | null>(null);
    const statusRef = useRef<VoiceStatus>("idle");

    function changeStatus(next: VoiceStatus) {
        statusRef.current = next;
        setStatus(next);
    }

    useEffect(() => {
        return () => {
            recognitionRef.current?.abort();
            window.speechSynthesis?.cancel();
        };
    }, []);

    function speak(text: string) {
        if (!("speechSynthesis" in window)) {
            setMessage(text);
            changeStatus("idle");
            return;
        }

        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1;
        utterance.pitch = 0.9;
        utterance.volume = 1;

        utterance.onstart = () => changeStatus("speaking");
        utterance.onend = () => {
            changeStatus("idle");
            setMessage("READY WHEN YOU ARE");
        };
        utterance.onerror = () => {
            changeStatus("idle");
        };

        window.speechSynthesis.speak(utterance);
    }

    function startListening() {
        if (statusRef.current === "listening") {
            recognitionRef.current?.stop();
            return;
        }

        if (statusRef.current === "speaking") {
            window.speechSynthesis.cancel();
            changeStatus("idle");
        }

        const browser = window as RecognitionWindow;
        const RecognitionAPI =
            browser.SpeechRecognition ??
            browser.webkitSpeechRecognition;

        if (!RecognitionAPI) {
            setMessage("VOICE INPUT NOT SUPPORTED IN THIS BROWSER");
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
                const text = result[0].transcript;

                if (result.isFinal) {
                    finalText += text;
                } else {
                    interimText += text;
                }
            }

            const text = (finalText || interimText).trim();

            if (text) {
                setTranscript(text);
                setMessage(finalText ? "VOICE CAPTURED" : "HEARING YOU...");
            }

            if (finalText.trim()) {
                setMessage("VOICE CAPTURED");

                // Demo feedback only. Connect your AI backend here
                // to generate a real answer to the user's request.
                speak(`I heard you say: ${finalText.trim()}`);
            }
        };

        recognition.onerror = (event) => {
            changeStatus("idle");
            setMessage(
                event.error === "not-allowed"
                    ? "PLEASE ALLOW MICROPHONE ACCESS"
                    : "VOICE INPUT INTERRUPTED"
            );
        };

        recognition.onend = () => {
            if (statusRef.current === "listening") {
                changeStatus("idle");
            }
        };

        recognitionRef.current = recognition;

        try {
            setTranscript("");
            setMessage("LISTENING...");
            changeStatus("listening");
            recognition.start();
        } catch {
            changeStatus("idle");
            setMessage("COULD NOT START MICROPHONE");
        }
    }

    return (
        <main className={`robot-scene state-${status}`}>
            <div className="robot-background" />
            <div className="robot-glow" />
            <div className="robot-energy-ring ring-one" />
            <div className="robot-energy-ring ring-two" />
            <div className="robot-particles" />

            <div className="robot-model">
                <Spline scene="/scene.splinecode" />
            </div>

            <div className="robot-vignette" />

            <div className="robot-brand">
                <span className="brand-orb" />
                <div>
                    <div className="brand-title">AGENT DOT</div>
                    <div className="brand-caption">PERSONAL AI</div>
                </div>
            </div>

            <div className="robot-status">
                <span className="status-light" />
                {status === "listening"
                    ? "LISTENING"
                    : status === "speaking"
                        ? "SPEAKING"
                        : "SYSTEM READY"}
            </div>

            <div className="robot-voice-panel" aria-live="polite">
                <div className="robot-waveform" aria-hidden="true">
                    {Array.from({ length: 27 }, (_, i) => (
                        <span
                            key={i}
                            style={{
                                "--delay": `${i * -0.08}s`,
                                "--height": `${8 + ((i * 13) % 24)}px`,
                            } as React.CSSProperties}
                        />
                    ))}
                </div>

                <div className="robot-message">{message}</div>

                {transcript && (
                    <div className="robot-transcript">
                        “{transcript}”
                    </div>
                )}

                <button
                    type="button"
                    className="robot-mic"
                    onClick={startListening}
                    aria-label={
                        status === "listening"
                            ? "Stop listening"
                            : "Start voice input"
                    }
                >
                    {status === "listening" ? "Ⅱ" : "🎙"}
                </button>

                <div className="robot-hint">
                    {status === "listening"
                        ? "TAP TO STOP"
                        : "TAP TO SPEAK"}
                </div>
            </div>
        </main>
    );
}
