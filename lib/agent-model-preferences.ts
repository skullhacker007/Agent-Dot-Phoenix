"use client";

import { useEffect, useState } from "react";
import type { TeamId } from "@/lib/agent-monitoring";

const STORAGE_KEY = "agent-model-preferences";
const CHANGE_EVENT = "agent-model-preferences-change";

export type AgentModelPreferences = Partial<Record<TeamId, string>>;

function readPreferences(): AgentModelPreferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {};
    }

    const preferences: AgentModelPreferences = {};
    const teams = [
      ["JARVIS", "jarvis"],
      ["FRIDAY", "friday"],
      ["ULTRON", "ultron"],
      ["VISION", "vision"],
    ] as const;
    for (const [teamId, agentId] of teams) {
      const modelId = Reflect.get(value, teamId) ?? Reflect.get(value, agentId);
      if (typeof modelId === "string" && modelId.trim()) {
        preferences[teamId] = modelId;
      }
    }
    return preferences;
  } catch (error) {
    console.error("Unable to read saved agent model preferences.", error);
    return {};
  }
}

export function saveAgentModelPreference(teamId: TeamId, modelId: string) {
  const preferences = readPreferences();
  preferences[teamId] = modelId;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useAgentModelPreferences() {
  const [preferences, setPreferences] = useState<AgentModelPreferences>({});

  useEffect(() => {
    const refresh = () => setPreferences(readPreferences());
    refresh();
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return preferences;
}
