"use client";

import { useEffect, useState } from "react";
import type { TeamId } from "./agent-monitoring";

export const WORKSPACE_STORAGE_KEY = "corporate-agent-workspace-v6";
export const WORKSPACE_UPDATE_EVENT = "agent-workspace-updated";

export type WorkspaceAgent = {
  id: string;
  name: string;
  role?: string;
  task?: string;
  tools?: string[];
  status?: string;
  children?: WorkspaceAgent[];
};

export type WorkspaceTeam = {
  id: string;
  name: string;
  code?: string;
  agents: WorkspaceAgent[];
};

export const DEFAULT_WORKSPACE_TEAMS: WorkspaceTeam[] = [
  {
    id: "team-1",
    name: "Team 1",
    code: "T1",
    agents: [
      {
        id: "agt-tl1",
        name: "TL1",
        role: "Team Leader",
        status: "active",
        task: "Oversee tactical objectives, coordinate sub-agents, and delegate tasks.",
        tools: ["REST API Gateway", "Slack & Discord Webhook"],
      },
    ],
  },
  {
    id: "team-2",
    name: "Team 2",
    code: "T2",
    agents: [
      {
        id: "agt-tl2",
        name: "TL2",
        role: "Team Leader",
        status: "active",
        task: "Monitor departmental execution benchmarks and KPI telemetry.",
        tools: ["Data Visualizer & Analytics", "PostgreSQL Database Client"],
      },
    ],
  },
  {
    id: "team-3",
    name: "Team 3",
    code: "T3",
    agents: [
      {
        id: "agt-specialist",
        name: "Specialist",
        role: "Worker",
        status: "active",
        task: "Autonomous task execution and intelligence processing pipeline.",
        tools: ["Web Search & Browsing", "Code Execution Sandbox"],
      },
    ],
  },
  {
    id: "team-4",
    name: "Team 4",
    code: "T4",
    agents: [],
  },
];

export function flattenWorkspaceAgents(items: WorkspaceAgent[]): WorkspaceAgent[] {
  return (items || []).flatMap((item) => [
    item,
    ...flattenWorkspaceAgents(item.children || []),
  ]);
}

export type WorkspaceByTeam = Record<TeamId, WorkspaceAgent[]>;

export function resolveTeamIdForTeam(team: WorkspaceTeam): TeamId {
  const teamUpper = `${team.id} ${team.name}`.toUpperCase();
  if (teamUpper.includes("FRIDAY")) return "FRIDAY";
  if (teamUpper.includes("ULTRON")) return "ULTRON";
  if (teamUpper.includes("VISION")) return "VISION";
  if (teamUpper.includes("JARVIS")) return "JARVIS";

  const agentNames = (team.agents || [])
    .map((a) => (a.name || "").toUpperCase())
    .join(" ");
  if (agentNames.includes("FRIDAY")) return "FRIDAY";
  if (agentNames.includes("ULTRON")) return "ULTRON";
  if (agentNames.includes("VISION")) return "VISION";
  if (agentNames.includes("JARVIS")) return "JARVIS";

  return "JARVIS";
}

export function buildWorkspaceAgentsByTeam(teamsToParse: WorkspaceTeam[]): {
  byTeam: WorkspaceByTeam;
  total: number;
} {
  const byTeam: WorkspaceByTeam = {
    JARVIS: [],
    FRIDAY: [],
    ULTRON: [],
    VISION: [],
  };

  for (const t of teamsToParse) {
    const teamKey = resolveTeamIdForTeam(t);
    const allAgents = flattenWorkspaceAgents(t.agents || []);
    byTeam[teamKey].push(...allAgents);
  }

  const total = Object.values(byTeam).reduce(
    (acc, list) => acc + list.length,
    0,
  );
  return { byTeam, total };
}

export function readWorkspaceAgentsByTeam(): {
  byTeam: WorkspaceByTeam;
  total: number;
} {
  let teamsToParse: WorkspaceTeam[] = DEFAULT_WORKSPACE_TEAMS;

  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as WorkspaceTeam[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const totalInParsed = parsed.reduce(
            (acc, t) => acc + flattenWorkspaceAgents(t.agents || []).length,
            0,
          );
          if (totalInParsed > 0) {
            teamsToParse = parsed;
          }
        }
      }
    } catch {
      // Fallback to DEFAULT_WORKSPACE_TEAMS
    }
  }

  return buildWorkspaceAgentsByTeam(teamsToParse);
}

export const INITIAL_WORKSPACE_DATA: {
  byTeam: WorkspaceByTeam;
  total: number;
} = buildWorkspaceAgentsByTeam(DEFAULT_WORKSPACE_TEAMS);

export function useWorkspaceAgents(teamId?: TeamId) {
  const [data, setData] = useState(INITIAL_WORKSPACE_DATA);

  useEffect(() => {
    const refresh = () => setData(readWorkspaceAgentsByTeam());
    refresh();
    window.addEventListener(WORKSPACE_UPDATE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(WORKSPACE_UPDATE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const teamAgents = teamId ? data.byTeam[teamId] ?? [] : [];
  return {
    byTeam: data.byTeam,
    total: data.total,
    teamAgents,
  };
}
