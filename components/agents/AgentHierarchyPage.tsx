"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import Link from "next/link";
import {
  dashboardResponseSchema,
  type TeamDashboard,
} from "@/lib/agent-monitoring";
import { resolveAgentTeamSummary } from "@/lib/agent-team-summary";
import { useAgentModelPreferences } from "@/lib/agent-model-preferences";
import {
  getAgentActivity,
  subscribeToAgentActivity,
  type AgentActivity,
} from "@/lib/agent-activity";
import { VoiceHeaderButton } from "@/components/voice/VoiceAssistant";
import AgentChat from "./AgentChat";
import "./AgentTeamPage.css";
import "./AgentHierarchyPage.css";

export type AgentNode = {
  id: string;
  name: string;
  role?: string;
  task?: string;
  schedule?: string;
  skills?: string[];
  tools?: string[];
  status?: "online" | "idle" | "busy" | "active";
  icon?: string;
  model?: string;
  instructions?: string;
  children: AgentNode[];
};

export type Team = {
  id: string;
  name: string;
  code?: string;
  agents: AgentNode[];
  color?: string;
};

export interface Persona {
  id: string;
  name: string;
  irisType: string;
  irisName: string;
  skinHighlight: string;
  skinMid: string;
  skinShadow: string;
  skinDeep: string;
  irisCore: string;
  irisMid: string;
  irisEdge: string;
  irisLimbal: string;
  browColor: string;
  glowColor: string;
  tag: string;
}

export const MASTER_PERSONA: Persona = {
  id: "master",
  name: "Master Agent",
  irisType: "command-cyan",
  irisName: "Electric Azure",
  skinHighlight: "#ffffff",
  skinMid: "#e0f2fe",
  skinShadow: "#7dd3fc",
  skinDeep: "#0369a1",
  irisCore: "#ffffff",
  irisMid: "#38bdf8",
  irisEdge: "#0284c7",
  irisLimbal: "#082f49",
  browColor: "#1e293b",
  glowColor: "rgba(56, 189, 248, 0.55)",
  tag: "Master",
};

export const AGENT_PERSONAS: Persona[] = [];

export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getAgentPersona(id: string, isMaster = false): Persona {
  if (isMaster) return MASTER_PERSONA;
  return MASTER_PERSONA;
}

export function getCorporateInitials(name: string): string {
  if (!name) return "AG";
  const clean = name.replace(/[^a-zA-Z0-9\s]/g, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AG";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function findParentAgent(
  agents: AgentNode[],
  targetId: string,
  parent: AgentNode | null = null,
): AgentNode | null {
  for (const agent of agents || []) {
    if (agent.id === targetId) return parent;
    const found = findParentAgent(agent.children || [], targetId, agent);
    if (found) return found;
  }
  return null;
}

export function getAgentHierarchyPath(
  agents: AgentNode[],
  targetId: string,
  currentPath: AgentNode[] = [],
): AgentNode[] {
  for (const agent of agents || []) {
    const nextPath = [...currentPath, agent];
    if (agent.id === targetId) return nextPath;
    const found = getAgentHierarchyPath(agent.children || [], targetId, nextPath);
    if (found.length > 0) return found;
  }
  return [];
}

export function getSubordinateIds(agent: AgentNode): Set<string> {
  const ids = new Set<string>();
  function recurse(node: AgentNode) {
    for (const child of node.children || []) {
      ids.add(child.id);
      recurse(child);
    }
  }
  recurse(agent);
  return ids;
}

export function countAgents(agents: AgentNode[]): number {
  return (agents || []).reduce(
    (count, agent) => count + 1 + countAgents(agent.children || []),
    0,
  );
}

export function hasTeamLead(agents: AgentNode[]): boolean {
  return flattenAgents(agents).some((a) =>
    (a.role || "").toLowerCase().includes("lead"),
  );
}

export function getTeamLead(agents: AgentNode[]): AgentNode | undefined {
  return flattenAgents(agents).find((a) =>
    (a.role || "").toLowerCase().includes("lead"),
  );
}

export function countActiveAgents(agents: AgentNode[]): number {
  return (agents || []).reduce((acc, a) => {
    const isActive = a.status === "active" || a.status === "online";
    return acc + (isActive ? 1 : 0) + countActiveAgents(a.children || []);
  }, 0);
}

export function flattenAgents(
  agents: AgentNode[],
  depth = 0,
): Array<AgentNode & { depth: number; label: string }> {
  return (agents || []).flatMap((agent) => [
    { ...agent, depth, label: `${"— ".repeat(depth)}${agent.name} (${agent.id})` },
    ...flattenAgents(agent.children || [], depth + 1),
  ]);
}

export function addChild(
  agents: AgentNode[],
  parentId: string,
  child: AgentNode,
): AgentNode[] {
  return (agents || []).map((agent) =>
    agent.id === parentId
      ? { ...agent, children: [...(agent.children || []), child] }
      : { ...agent, children: addChild(agent.children || [], parentId, child) },
  );
}

export function deleteAgent(agents: AgentNode[], targetId: string): AgentNode[] {
  return (agents || []).filter((agent) => agent.id !== targetId)
    .map((agent) => ({
      ...agent,
      children: deleteAgent(agent.children || [], targetId),
    }));
}

export function updateAgent(
  agents: AgentNode[],
  targetId: string,
  updates: Partial<AgentNode>,
): AgentNode[] {
  return (agents || []).map((agent) => {
    if (agent.id === targetId) {
      return { ...agent, ...updates };
    }
    return {
      ...agent,
      children: updateAgent(agent.children || [], targetId, updates),
    };
  });
}

export function toggleAgentStatus(agents: AgentNode[], targetId: string): AgentNode[] {
  return (agents || []).map((a) => {
    if (a.id === targetId) {
      const isCurrentlyActive = a.status === "active" || a.status === "online";
      return {
        ...a,
        status: isCurrentlyActive ? "idle" : "active",
      };
    }
    return {
      ...a,
      children: toggleAgentStatus(a.children || [], targetId),
    };
  });
}

const STORAGE_KEY = "corporate-agent-workspace-v6";

export type ConfigTab = "rename" | "task" | "skills" | "tools";

export interface ConfigModalState {
  isOpen: boolean;
  teamId: string;
  agentId: string;
  initialAgent: AgentNode;
  activeTab: ConfigTab;
}

export type AgentRoleType =
  | "master"
  | "lead"
  | "manager"
  | "researcher"
  | "developer"
  | "security"
  | "analyst"
  | "communicator"
  | "creative"
  | "worker";

export function getAgentRoleType(role?: string, isMaster = false): AgentRoleType {
  if (isMaster) return "master";
  if (!role) return "worker";
  const r = role.toLowerCase();
  if (r.includes("master") || r.includes("orchestrator")) return "master";
  if (r.includes("lead")) return "lead";
  if (r.includes("manager")) return "manager";
  if (
    r.includes("research") ||
    r.includes("intel") ||
    r.includes("nlp") ||
    r.includes("scrap") ||
    r.includes("browse")
  ) {
    return "researcher";
  }
  if (
    r.includes("code") ||
    r.includes("dev") ||
    r.includes("engineer") ||
    r.includes("program") ||
    r.includes("fullstack")
  ) {
    return "developer";
  }
  if (
    r.includes("secur") ||
    r.includes("guard") ||
    r.includes("audit") ||
    r.includes("defens") ||
    r.includes("shield")
  ) {
    return "security";
  }
  if (
    r.includes("analy") ||
    r.includes("financ") ||
    r.includes("data") ||
    r.includes("market") ||
    r.includes("quant") ||
    r.includes("stock")
  ) {
    return "analyst";
  }
  if (
    r.includes("communicat") ||
    r.includes("outreach") ||
    r.includes("messag") ||
    r.includes("support") ||
    r.includes("chat") ||
    r.includes("sales")
  ) {
    return "communicator";
  }
  if (
    r.includes("creat") ||
    r.includes("design") ||
    r.includes("content") ||
    r.includes("copy") ||
    r.includes("writ") ||
    r.includes("brand")
  ) {
    return "creative";
  }
  return "worker";
}

export const ROLE_PRESETS = [
  {
    role: "Team Leader",
    category: "Management",
    icon: "⭐",
    desc: "Oversees team objectives, coordinates sub-agents, and delegates tasks.",
    suggestedTools: ["Slack & Discord Webhook", "REST API Gateway", "PostgreSQL Database Client"],
    suggestedTask: "Route incoming escalations and coordinate sub-agents daily.",
  },
  {
    role: "Team Lead",
    category: "Management",
    icon: "⭐",
    desc: "Oversees team objectives, coordinates sub-agents, and delegates tasks.",
    suggestedTools: ["Slack & Discord Webhook", "REST API Gateway", "PostgreSQL Database Client"],
    suggestedTask: "Route incoming escalations and coordinate sub-agents daily.",
  },
  {
    role: "Manager",
    category: "Management",
    icon: "💼",
    desc: "Supervises workflows, allocates resources, and tracks performance metrics.",
    suggestedTools: ["Data Visualizer & Analytics", "Email Gateway (SMTP)", "PostgreSQL Database Client"],
    suggestedTask: "Monitor daily KPI benchmarks and generate departmental summaries.",
  },
  {
    role: "Worker",
    category: "Execution",
    icon: "⚙️",
    desc: "Executes assigned directives, pipeline processing, and operational tasks.",
    suggestedTools: ["REST API Gateway", "PostgreSQL Database Client", "Python Code Interpreter"],
    suggestedTask: "Run background ETL sync and verify system heartbeats.",
  },
  {
    role: "Research Specialist",
    category: "Intelligence",
    icon: "🔍",
    desc: "Autonomous web research, competitor analysis, document chunking & synthesis.",
    suggestedTools: ["Web Search & Browsing", "Document & PDF Parser", "Vector Memory Store"],
    suggestedTask: "Extract daily market intelligence and synthesize summary report.",
  },
  {
    role: "Code Engineer",
    category: "Engineering",
    icon: "💻",
    desc: "Autonomous coding, PR reviews, bug triaging, API integration & script execution.",
    suggestedTools: ["Python Code Interpreter", "REST API Gateway", "PostgreSQL Database Client"],
    suggestedTask: "Audit repository for regressions and run automated tests.",
  },
  {
    role: "Security Analyst",
    category: "Cybersecurity",
    icon: "🛡️",
    desc: "Defensive vulnerability scanning, endpoint audits, CVE alerts & auth defenses.",
    suggestedTools: ["Security Vulnerability Scanner", "REST API Gateway", "Slack & Discord Webhook"],
    suggestedTask: "Continuous zero-day vulnerability scanning & endpoint monitoring.",
  },
  {
    role: "Financial Analyst",
    category: "Finance",
    icon: "📊",
    desc: "Quantitative modeling, live stock/crypto feeds, valuation & volatility alerts.",
    suggestedTools: ["Live Market Data Ticker", "Data Visualizer & Analytics", "Python Code Interpreter"],
    suggestedTask: "Track market baskets and alert on high-volatility movements.",
  },
  {
    role: "Communications & Outreach",
    category: "Operations",
    icon: "💬",
    desc: "Customer messaging, WhatsApp/Slack engagement, and automated follow-ups.",
    suggestedTools: ["WhatsApp Web API", "Slack & Discord Webhook", "Email Gateway (SMTP)"],
    suggestedTask: "Sync CRM leads and schedule automated follow-up sequences.",
  },
  {
    role: "Content & Copywriter",
    category: "Creative",
    icon: "✨",
    desc: "Technical writing, PR announcements, product release notes & strategy.",
    suggestedTools: ["Web Search & Browsing", "Document & PDF Parser", "Vector Memory Store"],
    suggestedTask: "Draft product updates and technical release notes.",
  },
  {
    role: "Autonomous Task Worker",
    category: "Execution",
    icon: "⚙️",
    desc: "Background task executor for scheduled pipelines and data sync.",
    suggestedTools: ["REST API Gateway", "PostgreSQL Database Client", "Python Code Interpreter"],
    suggestedTask: "Run background ETL sync and verify system heartbeats.",
  },
];

export const TOOL_DEFINITIONS = [
  { id: "web-search", name: "Web Search & Browsing", icon: "🌐", desc: "Live web search and real-time page extraction" },
  { id: "code-interpreter", name: "Python Code Interpreter", icon: "🐍", desc: "Execute sandboxed Python code and computational scripts" },
  { id: "data-analytics", name: "Data Visualizer & Analytics", icon: "📊", desc: "Aggregate tabular data and generate visual metrics" },
  { id: "postgres-db", name: "PostgreSQL Database Client", icon: "🗄️", desc: "Query database tables and maintain persistent state" },
  { id: "slack-webhook", name: "Slack & Discord Webhook", icon: "💬", desc: "Post structured alerts and notifications to team channels" },
  { id: "whatsapp-api", name: "WhatsApp Web API", icon: "📱", desc: "Send automated messages and customer support notifications" },
  { id: "document-parser", name: "Document & PDF Parser", icon: "📄", desc: "Extract and chunk text from PDFs, CSVs, and docs" },
  { id: "api-gateway", name: "REST API Gateway", icon: "⚡", desc: "Send authenticated HTTP requests to third-party endpoints" },
  { id: "security-scanner", name: "Security Vulnerability Scanner", icon: "🛡️", desc: "Scan endpoints and headers for configuration weaknesses" },
  { id: "market-ticker", name: "Live Market Data Ticker", icon: "📈", desc: "Stream real-time equities, indices, and crypto feeds" },
  { id: "vector-memory", name: "Vector Memory Store", icon: "🧠", desc: "Semantic retrieval from long-term agent memory base" },
  { id: "email-gateway", name: "Email Gateway (SMTP)", icon: "✉️", desc: "Dispatch email summaries and outreach sequences" },
];

export const TASK_PRESETS = [
  {
    title: "Daily Market Intelligence & Valuation",
    schedule: "Daily at 08:00 AM",
    description: "Extract daily market summary, track indices and compile valuation report.",
  },
  {
    title: "Autonomous Code Audit & Health Check",
    schedule: "Hourly",
    description: "Scan commits, verify endpoint health, and run automated regression checks.",
  },
  {
    title: "Customer Support & Escalation Triage",
    schedule: "Continuous (Every 15m)",
    description: "Monitor inbound tickets, classify sentiment, and route high-priority issues.",
  },
  {
    title: "CRM Lead Sync & Automated Outreach",
    schedule: "Daily at 09:30 AM",
    description: "Sync new inbound leads from database and trigger welcome sequences.",
  },
  {
    title: "Security Threat & CVE Scanner",
    schedule: "Continuous (Every 30m)",
    description: "Monitor dependency vulnerability advisories and report active CVE alerts.",
  },
  {
    title: "Morning Executive Briefing",
    schedule: "Daily at 07:30 AM",
    description: "Synthesize team activities, completed tasks, and system uptime into a briefing.",
  },
];

export const SUGGESTED_SKILLS: string[] = [
  "Automated Messaging",
  "Task Scheduling",
  "NLP & Sentiment",
  "Data Extraction",
  "Ticket Triage",
  "Web Scraping",
  "Workflow Automation",
  "Report Synthesis",
];

export const SUGGESTED_TOOLS: string[] = TOOL_DEFINITIONS.map((t) => t.name);

export const SUGGESTED_TASKS: string[] = TASK_PRESETS.map((t) => t.description);

export const INITIAL_TEAMS: Team[] = [
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
        children: [],
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
        children: [],
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
        children: [],
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

export type ConsoleMessage = {
  id: string;
  sender: "user" | "agent";
  text: string;
  timestamp: string;
  thinking?: string;
  toolCall?: {
    tool: string;
    icon: string;
    input: string;
    output: string;
  };
};

export type AgentExecutionLog = {
  id: string;
  timestamp: string;
  action: string;
  toolUsed?: string;
  status: "success" | "running" | "error";
  latencyMs?: number;
};

/* =========================================================================
   EGG CHARACTER COMPONENT (Role-based design)
   ========================================================================= */

export function EggCharacter({
  role = "Worker",
  isMaster = false,
  isLead = false,
  size = 34,
  className = "",
  status = "active",
}: {
  role?: string;
  isMaster?: boolean;
  isLead?: boolean;
  size?: number;
  className?: string;
  status?: string;
}) {
  const eggWidth = size;
  const eggHeight = Math.round(size * 1.23);
  const resolvedLead = isLead || (role || "").toLowerCase().includes("lead");
  const roleType = getAgentRoleType(role, isMaster);
  const effectiveRoleType: AgentRoleType = isMaster
    ? "master"
    : resolvedLead && roleType === "worker"
      ? "lead"
      : roleType;

  return (
    <div
      className={`egg-character-wrapper role-${effectiveRoleType} ${className}`}
      style={{ width: eggWidth, minHeight: eggHeight + 4 }}
    >
      {/* Role-specific Egg Body */}
      <div
        className={`egg-body egg-theme-${effectiveRoleType} status-${status}`}
        style={{ width: eggWidth, height: eggHeight }}
      >
        {/* Glow halo for Master and Leads */}
        {isMaster && <span className="master-glow-ring" aria-hidden="true" />}

        {/* Role Accessory: Team Lead Golden Chevron Accent */}
        {effectiveRoleType === "lead" && (
          <div className="egg-accessory egg-lead-accessory" aria-hidden="true">
            <svg
              viewBox="0 0 16 10"
              width={Math.round(size * 0.46)}
              height={Math.round(size * 0.28)}
              fill="none"
            >
              <path d="M2 3l6 4 6-4" stroke="#facc15" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}

        {/* Role Accessory: Manager Executive Monocle/Badge */}
        {effectiveRoleType === "manager" && (
          <div className="egg-accessory egg-manager-accessory" aria-hidden="true">
            <svg
              viewBox="0 0 16 16"
              width={Math.round(size * 0.44)}
              height={Math.round(size * 0.44)}
              fill="none"
            >
              <circle cx="8" cy="8" r="5" stroke="#60a5fa" strokeWidth="1.2" fill="rgba(59, 130, 246, 0.25)" />
              <circle cx="8" cy="8" r="2.2" fill="#93c5fd" />
            </svg>
          </div>
        )}

        {/* Role Accessory: Researcher Cyber Visor */}
        {effectiveRoleType === "researcher" && (
          <div className="egg-accessory egg-glasses-accessory" aria-hidden="true">
            <svg
              viewBox="0 0 22 10"
              width={Math.round(size * 0.68)}
              height={Math.round(size * 0.3)}
              fill="none"
            >
              <rect x="1" y="1" width="8" height="7" rx="2" stroke="#22d3ee" strokeWidth="1.2" fill="rgba(34, 211, 238, 0.28)" />
              <rect x="13" y="1" width="8" height="7" rx="2" stroke="#22d3ee" strokeWidth="1.2" fill="rgba(34, 211, 238, 0.28)" />
              <path d="M9 4.5h4" stroke="#22d3ee" strokeWidth="1.3" />
              <line x1="2.5" y1="2.8" x2="7.5" y2="2.8" stroke="#ffffff" strokeWidth="0.8" strokeLinecap="round" opacity="0.8" />
              <line x1="14.5" y1="2.8" x2="19.5" y2="2.8" stroke="#ffffff" strokeWidth="0.8" strokeLinecap="round" opacity="0.8" />
            </svg>
          </div>
        )}

        {/* Role Accessory: Developer Tech Headset */}
        {effectiveRoleType === "developer" && (
          <div className="egg-accessory egg-headset-accessory" aria-hidden="true">
            <svg
              viewBox="0 0 24 16"
              width={Math.round(size * 0.82)}
              height={Math.round(size * 0.52)}
              fill="none"
            >
              <path d="M4 11A8 8 0 0 1 20 11" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" />
              <rect x="2" y="8" width="3.5" height="6.5" rx="1.5" fill="#15803d" stroke="#86efac" strokeWidth="0.8" />
              <rect x="18.5" y="8" width="3.5" height="6.5" rx="1.5" fill="#15803d" stroke="#86efac" strokeWidth="0.8" />
              <circle cx="20.2" cy="11" r="1.1" fill="#4ade80" />
            </svg>
          </div>
        )}

        {/* Role Accessory: Security Tactical Crest */}
        {effectiveRoleType === "security" && (
          <div className="egg-accessory egg-security-accessory" aria-hidden="true">
            <svg
              viewBox="0 0 16 12"
              width={Math.round(size * 0.52)}
              height={Math.round(size * 0.38)}
              fill="none"
            >
              <path
                d="M8 1L2 3.8v3.5C2 10.2 8 11.5 8 11.5s6-1.3 6-4.2V3.8L8 1z"
                fill="rgba(244, 63, 94, 0.35)"
                stroke="#f43f5e"
                strokeWidth="1.1"
              />
              <path d="M8 3.5v5" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" />
            </svg>
          </div>
        )}

        {/* Role Accessory: Analyst Floating Amethyst Crystal */}
        {effectiveRoleType === "analyst" && (
          <div className="egg-accessory egg-analyst-accessory" aria-hidden="true">
            <svg
              viewBox="0 0 14 14"
              width={Math.round(size * 0.44)}
              height={Math.round(size * 0.44)}
              fill="none"
            >
              <polygon
                points="7,1 13,7 7,13 1,7"
                fill="rgba(168, 85, 247, 0.45)"
                stroke="#c084fc"
                strokeWidth="1.1"
              />
              <circle cx="7" cy="7" r="1.6" fill="#ffffff" />
            </svg>
          </div>
        )}

        {/* Role Accessory: Communicator Mic Headset */}
        {effectiveRoleType === "communicator" && (
          <div className="egg-accessory egg-communicator-accessory" aria-hidden="true">
            <svg
              viewBox="0 0 22 16"
              width={Math.round(size * 0.72)}
              height={Math.round(size * 0.5)}
              fill="none"
            >
              <path d="M3 8A7.5 7.5 0 0 1 18 8" stroke="#f97316" strokeWidth="1.6" strokeLinecap="round" />
              <rect x="16.5" y="6" width="3.2" height="5" rx="1.2" fill="#ea580c" />
              <path d="M18 11c0 3.2-4.5 3.8-8 3.8" stroke="#f97316" strokeWidth="1.3" strokeLinecap="round" fill="none" />
              <circle cx="10" cy="14.8" r="1.2" fill="#fb923c" />
            </svg>
          </div>
        )}

        {/* Role Accessory: Creative Star Sparkles */}
        {effectiveRoleType === "creative" && (
          <div className="egg-accessory egg-creative-accessory" aria-hidden="true">
            <span className="creative-star star-left">✦</span>
            <span className="creative-star star-right">✦</span>
          </div>
        )}

        {/* Expressive Face */}
        <div className="egg-face">
          <div className="egg-eyes-row">
            <div className={`egg-dot-eye eye-${effectiveRoleType}`}>
              <span className="eye-sparkle" />
              {isMaster && <span className="eye-sparkle eye-sparkle-second" />}
            </div>
            <div className={`egg-dot-eye eye-${effectiveRoleType}`}>
              <span className="eye-sparkle" />
              {isMaster && <span className="eye-sparkle eye-sparkle-second" />}
            </div>
          </div>
          <div className="egg-blush-row">
            <div className={`egg-blush blush-${effectiveRoleType}`} />
            <div className={`egg-blush blush-${effectiveRoleType}`} />
          </div>
          <div className={`egg-mouth mouth-${effectiveRoleType}`} />
        </div>
      </div>
    </div>
  );
}

/* Backward compatibility exports */
export function AgentBallAvatar({
  role = "Worker",
  size = 34,
  className = "",
  isMaster = false,
  status = "online",
}: {
  id?: string;
  name?: string;
  role?: string;
  size?: number;
  isMaster?: boolean;
  mousePos?: { x: number; y: number } | null;
  status?: "online" | "idle" | "busy";
  className?: string;
}) {
  return (
    <EggCharacter
      role={role}
      isMaster={isMaster}
      isLead={role.toLowerCase().includes("lead")}
      size={size}
      className={className}
      status={status}
    />
  );
}

/* =========================================================================
   MAIN AGENT HIERARCHY / WORKSPACE PAGE
   ========================================================================= */

export default function AgentHierarchyPage() {
  const [teams, setTeams] = useState<Team[]>(INITIAL_TEAMS);
  const storageReady = useRef(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Slide-over Add Agent Sidebar State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [targetTeamId, setTargetTeamId] = useState(INITIAL_TEAMS[0].id);
  const [role, setRole] = useState<string>("Worker");
  const [name, setName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Agent Dot Inspect / Interactive Console Sidebar State
  const [selectedAgentForSidebar, setSelectedAgentForSidebar] = useState<{
    agent: AgentNode;
    teamId: string;
  } | null>(null);
  const [sidebarActiveTab, setSidebarActiveTab] = useState<"config" | "console" | "logs">("config");

  // Console Chat State for Selected Agent
  const [consoleMessages, setConsoleMessages] = useState<ConsoleMessage[]>([]);
  const [consoleInput, setConsoleInput] = useState("");
  const [consoleModel, setConsoleModel] = useState("meta/llama-3.1-70b-instruct");
  const [isConsoleGenerating, setIsConsoleGenerating] = useState(false);
  const [executionLogs, setExecutionLogs] = useState<AgentExecutionLog[]>([]);

  // Load from local storage
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      storageReady.current = true;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_TEAMS));
        window.dispatchEvent(
          new CustomEvent("agent-workspace-updated", { detail: INITIAL_TEAMS }),
        );
      } catch {}
      return;
    }

    queueMicrotask(() => {
      try {
        const parsed = JSON.parse(saved) as Team[];
        if (Array.isArray(parsed) && parsed.length === 4) {
          const totalSavedAgents = parsed.reduce(
            (acc, t) => acc + countAgents(t.agents || []),
            0,
          );
          if (totalSavedAgents > 0) {
            setTeams(parsed);
          } else {
            setTeams(INITIAL_TEAMS);
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_TEAMS));
            window.dispatchEvent(
              new CustomEvent("agent-workspace-updated", { detail: INITIAL_TEAMS }),
            );
          }
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
      storageReady.current = true;
    });
  }, []);

  // Save to local storage & broadcast to dashboard
  useEffect(() => {
    if (!storageReady.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
      window.dispatchEvent(
        new CustomEvent("agent-workspace-updated", { detail: teams }),
      );
    } catch (e) {
      console.warn("Storage sync failed", e);
    }
  }, [teams]);

  const [dashboard, setDashboard] = useState<TeamDashboard>();
  const [loading, setLoading] = useState(true);
  const [chatActivity, setChatActivity] = useState<AgentActivity | null>(null);
  const modelPreferences = useAgentModelPreferences();

  const acceptDashboard = useCallback((payload: unknown) => {
    const parsed = dashboardResponseSchema.safeParse(payload);
    if (!parsed.success) return;
    const nextDashboard = parsed.data.teams.find(({ id }) => id === "JARVIS");
    setDashboard(nextDashboard);
    setLoading(false);
  }, []);

  useEffect(() => {
    const refresh = (activity: AgentActivity | null) => {
      setChatActivity(activity);
    };
    refresh(getAgentActivity("JARVIS"));
    const unsubscribe = subscribeToAgentActivity((changedTeamId, activity) => {
      if (changedTeamId === "JARVIS") refresh(activity);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let active = true;
    const eventSource = new EventSource("/api/monitoring/teams/stream");

    eventSource.onmessage = (event) => {
      if (!active) return;
      try {
        acceptDashboard(JSON.parse(event.data));
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        console.error("Monitoring stream sent invalid JSON.", error);
      }
    };

    eventSource.onerror = () => {
      if (active) setLoading(false);
    };

    return () => {
      active = false;
      eventSource.close();
    };
  }, [acceptDashboard]);

  const assignedModel =
    modelPreferences.JARVIS ??
    dashboard?.assignedModel ??
    null;

  const teamSummary = resolveAgentTeamSummary(
    dashboard,
    assignedModel,
    chatActivity,
    loading,
  );

  const allPageAgents = useMemo(
    () => teams.flatMap((t) => flattenAgents(t.agents || [])),
    [teams],
  );

  const workspaceCount = allPageAgents.length;
  const hasAssignedModel = Boolean(assignedModel && assignedModel.trim());

  const workspaceWorking = useMemo(
    () =>
      hasAssignedModel
        ? allPageAgents.filter(
            (a) =>
              a.status === "active" ||
              a.status === "busy" ||
              a.status === "online",
          ).length
        : 0,
    [allPageAgents, hasAssignedModel],
  );

  const workspaceIdle = useMemo(
    () =>
      hasAssignedModel
        ? allPageAgents.filter((a) => a.status === "idle" || !a.status).length
        : workspaceCount,
    [allPageAgents, hasAssignedModel, workspaceCount],
  );

  const showAgentMetrics = teamSummary.total !== null || workspaceCount > 0;
  const displayAgentsCount =
    workspaceCount > 0
      ? (teamSummary.total ?? 0) + workspaceCount
      : teamSummary.total;
  const displayWorkingCount =
    workspaceCount > 0
      ? (teamSummary.working ?? 0) + workspaceWorking
      : teamSummary.working;
  const displayIdleCount =
    workspaceCount > 0
      ? (teamSummary.idle ?? 0) + workspaceIdle
      : teamSummary.idle;
  const displayIssuesCount = teamSummary.issues;

  function openSidebar(teamId?: string) {
    const chosenTeamId = teamId || targetTeamId || teams[0]?.id || "team-1";
    setTargetTeamId(chosenTeamId);
    setRole("Worker");
    setName("");
    setErrorMsg("");
    setIsSidebarOpen(true);
  }

  function handleTeamChange(newTeamId: string) {
    setTargetTeamId(newTeamId);
  }

  function handleSaveAgent(e: FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setErrorMsg("Agent name is required.");
      return;
    }

    const newAgent: AgentNode = {
      id: `AGT-${Date.now().toString().slice(-4)}`,
      name: cleanName,
      role,
      tools: [],
      status: hasAssignedModel ? "active" : "idle",
      children: [],
    };

    setTeams((prev) =>
      prev.map((team) => {
        if (team.id !== targetTeamId) return team;
        return {
          ...team,
          agents: [...team.agents, newAgent],
        };
      }),
    );

    setIsSidebarOpen(false);
  }

  function handleDelete(teamId: string, agentId: string) {
    setTeams((prev) =>
      prev.map((team) =>
        team.id === teamId
          ? { ...team, agents: deleteAgent(team.agents, agentId) }
          : team,
      ),
    );
    if (selectedAgentForSidebar?.agent.id === agentId) {
      setSelectedAgentForSidebar(null);
    }
  }

  function handleUpdateAgent(
    teamId: string,
    agentId: string,
    updates: Partial<AgentNode>,
  ) {
    setTeams((prev) =>
      prev.map((team) =>
        team.id === teamId
          ? { ...team, agents: updateAgent(team.agents, agentId, updates) }
          : team,
      ),
    );

    // If currently opened in sidebar, update the local reference as well
    if (selectedAgentForSidebar?.agent.id === agentId) {
      setSelectedAgentForSidebar((prev) =>
        prev ? { ...prev, agent: { ...prev.agent, ...updates } } : null,
      );
    }
  }

  function handleMoveAgentTeam(
    fromTeamId: string,
    agentId: string,
    toTeamId: string,
  ) {
    if (fromTeamId === toTeamId) return;
    let targetAgent: AgentNode | null = null;
    setTeams((prev) => {
      const updated = prev.map((team) => {
        if (team.id === fromTeamId) {
          const all = flattenAgents(team.agents);
          targetAgent = all.find((a) => a.id === agentId) || null;
          return { ...team, agents: deleteAgent(team.agents, agentId) };
        }
        return team;
      });
      if (!targetAgent) return prev;
      return updated.map((team) => {
        if (team.id === toTeamId) {
          return { ...team, agents: [...team.agents, targetAgent!] };
        }
        return team;
      });
    });

    if (selectedAgentForSidebar?.agent.id === agentId) {
      setSelectedAgentForSidebar((prev) =>
        prev ? { ...prev, teamId: toTeamId } : null,
      );
    }
  }

  function handleReset() {
    if (window.confirm("Reset all 4 teams to clean state?")) {
      setTeams(INITIAL_TEAMS);
      window.localStorage.removeItem(STORAGE_KEY);
      setSelectedAgentForSidebar(null);
      window.dispatchEvent(
        new CustomEvent("agent-workspace-updated", { detail: INITIAL_TEAMS }),
      );
    }
  }

  // Open the Agent Dot Sidebar with specific tab (defaults to options/config)
  function handleOpenAgentDotSidebar(
    agent: AgentNode,
    teamId: string,
    initialTab: "config" | "console" | "logs" = "config",
  ) {
    setSelectedAgentForSidebar({ agent, teamId });
    setSidebarActiveTab(initialTab);

    const initialTools = agent.tools && agent.tools.length > 0 ? agent.tools : ["Web Search & Browsing"];
    const initialTask = agent.task || "Standby for operational directives";

    setConsoleMessages([
      {
        id: `msg-welcome-${agent.id}`,
        sender: "agent",
        text: `Greetings. I am **${agent.name}**, operating as **${agent.role || "Specialist"}**.\n\nEquipped with **${initialTools.length} tools**: ${initialTools.map((t) => `\`${t}\``).join(", ")}.\nActive directive: *"${initialTask}"*.\n\nReady to execute tasks or provide real-time intelligence. How may I assist you?`,
        timestamp: "Online",
      },
    ]);

    setExecutionLogs([
      {
        id: `log-init-${agent.id}`,
        timestamp: "Online",
        action: `Agent session initialized (${agent.role || "Worker"})`,
        status: "success",
        latencyMs: 18,
      },
    ]);
  }

  // Execute Agent Chat or Task Run (Grok & ChatGPT style)
  async function handleSendConsoleMessage(promptText?: string) {
    const text = (promptText || consoleInput).trim();
    if (!text || !selectedAgentForSidebar || isConsoleGenerating) return;

    const { agent } = selectedAgentForSidebar;
    const nowTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Append user message
    const userMsg: ConsoleMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text,
      timestamp: nowTime,
    };
    setConsoleMessages((prev) => [...prev, userMsg]);
    setConsoleInput("");
    setIsConsoleGenerating(true);

    // Pick primary tool based on agent role
    const agentTools = agent.tools && agent.tools.length > 0 ? agent.tools : ["Web Search & Browsing"];
    const chosenTool = agentTools[0];
    const toolDef = TOOL_DEFINITIONS.find((t) => t.name === chosenTool) || TOOL_DEFINITIONS[0];

    // Thinking process step
    const thinkingText = `Thinking Process (Grok 2 / o1 Style):
• Analyzed operational query: "${text.slice(0, 48)}..."
• Ingested persona constraints: ${agent.role || "Worker"} (Status: Active)
• Selected tool: [${chosenTool}] for sandboxed telemetry and execution
• Formulated verified response with strict security compliance`;

    try {
      // Simulate real agent tool call latency
      await new Promise((res) => setTimeout(res, 850));

      const toolCallResult = {
        tool: chosenTool,
        icon: toolDef.icon,
        input: JSON.stringify({ query: text, agentId: agent.id, timeoutMs: 3000 }, null, 2),
        output: JSON.stringify({ status: "SUCCESS", latency: "38ms", records: 4, score: 0.98 }, null, 2),
      };

      await new Promise((res) => setTimeout(res, 600));

      // Construct professional agent response
      let responseBody = "";
      const roleLower = (agent.role || "").toLowerCase();

      if (roleLower.includes("code") || roleLower.includes("engineer")) {
        responseBody = `### Task Analysis & Execution Completed\n\nI have evaluated the request against the codebase and executed the required sandbox verification.\n\n\`\`\`typescript\n// Autonomous Execution Output by ${agent.name}\nexport async function verifyPipeline(): Promise<{ verified: boolean }> {\n  const metrics = await querySystemHealth();\n  return { verified: metrics.status === "OK" };\n}\n\`\`\`\n\n**Findings:** All regression tests and syntax checks passed with 0 warnings. Ready to deploy.`;
      } else if (roleLower.includes("research") || roleLower.includes("intel")) {
        responseBody = `### Intelligence Synthesis Report\n\nUtilizing **${chosenTool}**, I extracted and verified the primary vectors:\n\n1. **Market Sentiment:** Bullish signals across key indices with +1.8% intraday momentum.\n2. **Entity Recognition:** Verified 14 target signals matching corporate criteria.\n3. **Recommendation:** Proceed with automated outreach queue and maintain continuous ingestion.`;
      } else if (roleLower.includes("security") || roleLower.includes("guard")) {
        responseBody = `### Defensive Security Audit Status: CLEAR 🛡️\n\n- **Zero-Day Advisories:** 0 active threats detected\n- **Endpoints Scanned:** 24 internal microservices\n- **Authorization Integrity:** 100% compliant with strict same-origin session policies.\n- **Action:** Continuous monitoring thread established.`;
      } else if (roleLower.includes("analy") || roleLower.includes("financ")) {
        responseBody = `### Quantitative Analytics & Valuation\n\n- **Volatility Delta:** Lower bound stabilized within 1.2% variance.\n- **Liquidity Depth:** Top tier order book coverage confirmed.\n- **Risk Factor:** Nominal (Score: 0.12). No adverse liquidation triggers identified.`;
      } else {
        responseBody = `I have completed the task: **"${text}"** using **${chosenTool}**.\n\n- Execution status: **Verified & Complete**\n- Response latency: **~42ms**\n- System memory: **Nominal**\n\nStanding by for next directive.`;
      }

      const agentMsg: ConsoleMessage = {
        id: `agent-${Date.now()}`,
        sender: "agent",
        text: responseBody,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        thinking: thinkingText,
        toolCall: toolCallResult,
      };

      setConsoleMessages((prev) => [...prev, agentMsg]);

      // Add to execution logs
      setExecutionLogs((prev) => [
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          action: `Executed query: "${text.slice(0, 32)}..."`,
          toolUsed: chosenTool,
          status: "success",
          latencyMs: 1450,
        },
        ...prev,
      ]);
    } catch {
      const errMsg: ConsoleMessage = {
        id: `err-${Date.now()}`,
        sender: "agent",
        text: "Encountered an unexpected execution friction. Retrying on fallback runtime.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setConsoleMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsConsoleGenerating(false);
    }
  }

  const currentTargetTeam = teams.find((t) => t.id === targetTeamId);
  const targetTeamHasLead = currentTargetTeam
    ? hasTeamLead(currentTargetTeam.agents)
    : false;

  return (
    <div className="corp-layout">
      {/* Main Workspace */}
      <div className="corp-main-view">
        {/* Top Control Bar / J.A.R.V.I.S Header */}
        <header
          className="agent-team-header is-dashboard-header"
          aria-label="J.A.R.V.I.S overview"
        >
          <div className="agent-team-title-row">
            <div>
              <h1>J.A.R.V.I.S</h1>
            </div>
            <div className="agent-team-header-actions">
              <div className="corp-search-box">
                <span className="search-icon-symbol">🔍</span>
                <input
                  type="text"
                  placeholder="Search agents or roles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search agents"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="search-reset"
                    onClick={() => setSearchQuery("")}
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>

              <button
                type="button"
                className="action-btn primary"
                onClick={() => openSidebar()}
              >
                + Add Agent
              </button>

              <Link
                aria-label="J.A.R.V.I.S settings"
                className="agent-team-settings-link"
                href="/agents/jarvis/settings"
                title="Settings"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  />
                  <path
                    d="m19.4 15 .1.1a1.8 1.8 0 1 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .9v.2a1.8 1.8 0 1 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.9l-.1.1a1.8 1.8 0 1 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.9-3h-.2a1.8 1.8 0 1 1 0-3.6h.2a1.8 1.8 0 0 0 .9-3l-.1-.1a1.8 1.8 0 1 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.9v-.2a1.8 1.8 0 1 1 3.6 0v.2a1.8 1.8 0 0 0 3 .9l.1-.1a1.8 1.8 0 1 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .9 3h.2a1.8 1.8 0 1 1 0 3.6h-.2a1.8 1.8 0 0 0-.9 3Z"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>

              <VoiceHeaderButton />
            </div>
          </div>

          <section className="agent-team-stats" aria-label="Team overview">
            {[
              ["Agents", showAgentMetrics ? displayAgentsCount : undefined],
              ["Working", showAgentMetrics ? displayWorkingCount : undefined],
              ["Idle", showAgentMetrics ? displayIdleCount : undefined],
              [
                "Issues",
                showAgentMetrics ? displayIssuesCount : undefined,
              ],
            ].map(([label, value]) => (
              <div className="agent-team-stat" key={label}>
                <span>{label}</span>
                <strong>{value ?? "—"}</strong>
              </div>
            ))}
            <div className="agent-team-stat agent-team-stat-models">
              <span>Models</span>
              <strong>
                {assignedModel ??
                  dashboard?.assignedModel ??
                  (dashboard?.models.length
                    ? dashboard.models.join(", ")
                    : "No Model assigned")}
              </strong>
            </div>
          </section>
        </header>

        <AgentChat
          assignedModel={assignedModel}
          loading={false}
          teamId="JARVIS"
          teamName="J.A.R.V.I.S"
          teamRole="Strategy & Intelligence"
        />

        {/* Step-by-Step Flow: Team Label followed by Agents */}
        <main className="corp-stepper-timeline">
          {teams.map((team, index) => {
            const isLast = index === teams.length - 1;
            const allAgents = flattenAgents(team.agents);
            const matches = allAgents.filter((a) => {
              if (!searchQuery) return true;
              const q = searchQuery.toLowerCase();
              const inName = a.name.toLowerCase().includes(q);
              const inRole = (a.role || "").toLowerCase().includes(q);
              return inName || inRole;
            });
            const teamLead = getTeamLead(team.agents);
            const agentCount = countAgents(team.agents);

            return (
              <div key={team.id} className="timeline-step-row">
                {/* Left Stepper Track */}
                <div className="timeline-rail">
                  <div className={`timeline-node ${agentCount > 0 ? "active" : ""}`}>
                    <span className="node-number">{index + 1}</span>
                  </div>
                  {!isLast && <div className="timeline-connector" />}
                </div>

                {/* Step Body */}
                <section className="team-step-section">
                  {/* Team Step Header */}
                  <div className="team-step-header">
                    <div className="team-step-title-group">
                      <h2 className="team-step-title">{team.name}</h2>
                    </div>
                    <button
                      type="button"
                      className="step-add-btn"
                      onClick={() => openSidebar(team.id)}
                      title={`Add agent to ${team.name}`}
                    >
                      + Add Agent
                    </button>
                  </div>

                  {/* Step Agents Row (Each agent design different as per role) */}
                  <div className="team-step-agents-row">
                    {matches.length === 0 ? (
                      <div className="step-empty-state">
                        <span className="empty-state-label">
                          {searchQuery
                            ? "No matching agents in this team"
                            : `No agents assigned to ${team.name} yet`}
                        </span>
                        {!searchQuery && (
                          <button
                            type="button"
                            className="empty-state-action"
                            onClick={() => openSidebar(team.id)}
                          >
                            + Add first agent to {team.name}
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        {matches.map((agent) => {
                          const isLead = (agent.role || "")
                            .toLowerCase()
                            .includes("lead");
                          const isSelected = selectedAgentForSidebar?.agent.id === agent.id;
                          const roleType = getAgentRoleType(agent.role);
                          const rolePreset = ROLE_PRESETS.find(
                            (p) => getAgentRoleType(p.role) === roleType,
                          );

                          return (
                            <div
                              key={agent.id}
                              className={`agent-item ${isSelected ? "is-selected" : ""}`}
                              onClick={() => handleOpenAgentDotSidebar(agent, team.id, "config")}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  handleOpenAgentDotSidebar(agent, team.id, "config");
                                }
                              }}
                              title={`Click to open ${agent.name} in Agent Sidebar`}
                            >
                              {/* 3-Dots Button: Opens Sidebar with All Options */}
                              <button
                                type="button"
                                className="agent-menu-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenAgentDotSidebar(agent, team.id, "config");
                                }}
                                title="Agent options (Role, Tools, Directive)"
                                aria-label={`Options for ${agent.name}`}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                  <circle cx="12" cy="4" r="2.5" />
                                  <circle cx="12" cy="12" r="2.5" />
                                  <circle cx="12" cy="20" r="2.5" />
                                </svg>
                              </button>

                              {/* Distinct Egg Avatar Styled by Role */}
                              <div className="egg-container">
                                <EggCharacter
                                  role={agent.role}
                                  isLead={isLead}
                                  size={34}
                                  status={hasAssignedModel ? (agent.status || "idle") : "idle"}
                                />
                              </div>

                              <span className="agent-item-name" title={agent.name}>
                                {agent.name}
                              </span>
                              <span
                                className={`agent-item-role role-${roleType} ${
                                  isLead ? "is-lead" : ""
                                }`}
                                title={agent.role || "Worker"}
                              >
                                {rolePreset?.icon || "⚙️"} {agent.role || "Worker"}
                              </span>

                              {/* Badges for configured Tools, Tasks & Status */}
                              {((agent.tools && agent.tools.length > 0) || agent.task) && (
                                <div className="agent-item-badges">
                                  {agent.tools && agent.tools.length > 0 && (
                                    <span
                                      className="agent-item-pill tools"
                                      title={`Tools: ${agent.tools.join(", ")}`}
                                    >
                                      🛠️ {agent.tools.length}
                                    </span>
                                  )}
                                  {agent.task && (
                                    <span
                                      className="agent-item-pill task"
                                      title={`Task: ${agent.task}`}
                                    >
                                      📋 Task
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {!searchQuery && (
                          <button
                            type="button"
                            className="inline-add-agent-btn"
                            onClick={() => openSidebar(team.id)}
                            title={`Add agent to ${team.name}`}
                          >
                            <span className="inline-add-icon">+</span>
                            <span className="inline-add-label">Add Agent</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </section>
              </div>
            );
          })}
        </main>
      </div>

      {/* =========================================================================
          AGENT 3-DOTS OPTION FORM / SLIDE-OVER DRAWER (Clean & Professional Design)
          ========================================================================= */}
      {selectedAgentForSidebar && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSelectedAgentForSidebar(null)}
          aria-modal="true"
          role="dialog"
        >
          <aside
            className="agent-dot-sidebar-panel"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 1. Header: Agent Identity & Status Segmented Toggle */}
            <div className="agent-option-header">
              <div className="agent-option-identity">
                <div className="agent-option-avatar-wrapper">
                  <EggCharacter
                    role={selectedAgentForSidebar.agent.role}
                    isLead={(selectedAgentForSidebar.agent.role || "").toLowerCase().includes("lead")}
                    size={38}
                    status={hasAssignedModel ? (selectedAgentForSidebar.agent.status || "idle") : "idle"}
                  />
                </div>
                <div className="agent-option-title-block">
                  <div className="agent-option-name-row">
                    <h3 className="agent-option-name">{selectedAgentForSidebar.agent.name}</h3>
                    <span className="agent-option-id-badge">{selectedAgentForSidebar.agent.id}</span>
                  </div>
                  <div className="agent-option-meta-tags">
                    <span className="agent-option-meta-pill team">
                      {teams.find((t) => t.id === selectedAgentForSidebar.teamId)?.name}
                    </span>
                    <span className="agent-option-meta-pill role">
                      {selectedAgentForSidebar.agent.role || "Worker"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="agent-option-header-right">
                {/* Segmented Status Toggle (Active / Idle) */}
                <div className="agent-status-segmented" role="group" aria-label="Agent operational status">
                  <button
                    type="button"
                    className={`status-segment-btn ${
                      hasAssignedModel &&
                      (selectedAgentForSidebar.agent.status === "active" ||
                        selectedAgentForSidebar.agent.status === "online")
                        ? "is-active"
                        : ""
                    }`}
                    disabled={!hasAssignedModel}
                    onClick={() => {
                      if (!hasAssignedModel) return;
                      handleUpdateAgent(
                        selectedAgentForSidebar.teamId,
                        selectedAgentForSidebar.agent.id,
                        { status: "active" },
                      );
                    }}
                    title={
                      hasAssignedModel
                        ? "Set agent to Active"
                        : "Connect a model before activating agent"
                    }
                  >
                    <span className="segment-dot green" />
                    Active
                  </button>
                  <button
                    type="button"
                    className={`status-segment-btn ${
                      !hasAssignedModel ||
                      selectedAgentForSidebar.agent.status === "idle"
                        ? "is-idle"
                        : ""
                    }`}
                    onClick={() =>
                      handleUpdateAgent(
                        selectedAgentForSidebar.teamId,
                        selectedAgentForSidebar.agent.id,
                        { status: "idle" },
                      )
                    }
                    title="Set agent to Idle"
                  >
                    <span className="segment-dot slate" />
                    Idle
                  </button>
                </div>

                {!hasAssignedModel && (
                  <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                    ⚠️ Connect model to activate
                  </div>
                )}

                <button
                  type="button"
                  className="agent-option-close-btn"
                  onClick={() => setSelectedAgentForSidebar(null)}
                  title="Close (Esc)"
                  aria-label="Close options form"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* 2. Sleek Tab Navigation */}
            <div className="agent-option-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={sidebarActiveTab === "config"}
                className={`agent-option-tab ${sidebarActiveTab === "config" ? "active" : ""}`}
                onClick={() => setSidebarActiveTab("config")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span>Configuration</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sidebarActiveTab === "console"}
                className={`agent-option-tab ${sidebarActiveTab === "console" ? "active" : ""}`}
                onClick={() => setSidebarActiveTab("console")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
                <span>Test Console</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sidebarActiveTab === "logs"}
                className={`agent-option-tab ${sidebarActiveTab === "logs" ? "active" : ""}`}
                onClick={() => setSidebarActiveTab("logs")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
                <span>Telemetry</span>
              </button>
            </div>

            {/* TAB 1: REDESIGNED CLEAN AGENT OPTIONS FORM */}
            {sidebarActiveTab === "config" && (
              <div className="agent-option-form-body">
                {/* Section A: General Identity */}
                <div className="opt-card">
                  <div className="opt-card-header">
                    <span className="opt-card-title">General Identity</span>
                    <span className="opt-card-subtitle">Basic agent metadata and team placement</span>
                  </div>

                  <div className="opt-form-grid">
                    <div className="opt-field-group">
                      <label className="opt-field-label" htmlFor="agent-name-input">
                        Agent Name
                      </label>
                      <input
                        id="agent-name-input"
                        type="text"
                        className="opt-input-element"
                        placeholder="e.g. Data Harvester"
                        value={selectedAgentForSidebar.agent.name}
                        onChange={(e) =>
                          handleUpdateAgent(
                            selectedAgentForSidebar.teamId,
                            selectedAgentForSidebar.agent.id,
                            { name: e.target.value },
                          )
                        }
                      />
                    </div>

                    <div className="opt-field-group">
                      <label className="opt-field-label" htmlFor="agent-team-select">
                        Assigned Team
                      </label>
                      <select
                        id="agent-team-select"
                        className="opt-select-element"
                        value={selectedAgentForSidebar.teamId}
                        onChange={(e) =>
                          handleMoveAgentTeam(
                            selectedAgentForSidebar.teamId,
                            selectedAgentForSidebar.agent.id,
                            e.target.value,
                          )
                        }
                      >
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section B: Role & Specialization */}
                <div className="opt-card">
                  <div className="opt-card-header">
                    <div className="opt-card-header-row">
                      <span className="opt-card-title">Role & Responsibilities</span>
                      <span className="opt-role-badge">
                        {ROLE_PRESETS.find(
                          (p) =>
                            p.role.toLowerCase() ===
                            (selectedAgentForSidebar.agent.role || "").toLowerCase(),
                        )?.icon || "⚙️"}{" "}
                        {selectedAgentForSidebar.agent.role || "Worker"}
                      </span>
                    </div>
                    <span className="opt-card-subtitle">
                      Defines agent authorization level, capabilities, and system persona
                    </span>
                  </div>

                  <div className="opt-field-group">
                    <label className="opt-field-label" htmlFor="agent-role-select">
                      Primary Role
                    </label>
                    <select
                      id="agent-role-select"
                      className="opt-select-element"
                      value={selectedAgentForSidebar.agent.role || "Worker"}
                      onChange={(e) => {
                        const nextRole = e.target.value;
                        const preset = ROLE_PRESETS.find(
                          (p) => p.role.toLowerCase() === nextRole.toLowerCase(),
                        );
                        handleUpdateAgent(
                          selectedAgentForSidebar.teamId,
                          selectedAgentForSidebar.agent.id,
                          {
                            role: nextRole,
                            ...(preset &&
                            (!selectedAgentForSidebar.agent.tools ||
                              selectedAgentForSidebar.agent.tools.length === 0)
                              ? { tools: preset.suggestedTools }
                              : {}),
                          },
                        );
                      }}
                    >
                      <optgroup label="Leadership & Coordination">
                        <option value="Team Leader">Team Leader</option>
                        <option value="Manager">Manager</option>
                      </optgroup>
                      <optgroup label="Execution & General">
                        <option value="Worker">Worker</option>
                      </optgroup>
                      <optgroup label="Specializations">
                        {ROLE_PRESETS.filter(
                          (p) => !["Team Leader", "Team Lead", "Worker", "Manager"].includes(p.role),
                        ).map((p) => (
                          <option key={p.role} value={p.role}>
                            {p.icon} {p.role}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  {/* Active Role Highlight Card */}
                  {(() => {
                    const activePreset = ROLE_PRESETS.find(
                      (p) =>
                        p.role.toLowerCase() ===
                        (selectedAgentForSidebar.agent.role || "worker").toLowerCase(),
                    ) || ROLE_PRESETS[ROLE_PRESETS.length - 1];

                    return (
                      <div className="opt-active-role-card">
                        <span className="active-role-icon">{activePreset.icon}</span>
                        <div className="active-role-text">
                          <span className="active-role-name">{activePreset.role}</span>
                          <span className="active-role-desc">{activePreset.desc}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Quick Role Shortcuts */}
                  <div className="opt-quick-roles-row">
                    <span className="quick-roles-label">Quick Switch:</span>
                    <div className="quick-roles-pills">
                      {[
                        { role: "Team Leader", icon: "⭐" },
                        { role: "Code Engineer", icon: "💻" },
                        { role: "Security Analyst", icon: "🛡️" },
                        { role: "Financial Analyst", icon: "📈" },
                        { role: "Worker", icon: "⚙️" },
                      ].map((item) => {
                        const isCurrent =
                          (selectedAgentForSidebar.agent.role || "").toLowerCase() ===
                          item.role.toLowerCase();
                        return (
                          <button
                            key={item.role}
                            type="button"
                            className={`quick-role-pill ${isCurrent ? "is-selected" : ""}`}
                            onClick={() => {
                              const p = ROLE_PRESETS.find((r) => r.role === item.role);
                              handleUpdateAgent(
                                selectedAgentForSidebar.teamId,
                                selectedAgentForSidebar.agent.id,
                                {
                                  role: item.role,
                                  tools: p?.suggestedTools || [],
                                  task: selectedAgentForSidebar.agent.task || p?.suggestedTask,
                                },
                              );
                            }}
                          >
                            <span>{item.icon}</span>
                            <span>{item.role}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Section C: Operational Directive */}
                <div className="opt-card">
                  <div className="opt-card-header">
                    <div className="opt-card-header-row">
                      <span className="opt-card-title">Operational Directive</span>
                      {/* Template Selector Dropdown */}
                      <select
                        className="opt-template-dropdown"
                        defaultValue=""
                        onChange={(e) => {
                          const chosen = TASK_PRESETS.find((t) => t.title === e.target.value);
                          if (chosen) {
                            handleUpdateAgent(
                              selectedAgentForSidebar.teamId,
                              selectedAgentForSidebar.agent.id,
                              { task: chosen.description, schedule: chosen.schedule },
                            );
                          }
                          e.target.value = "";
                        }}
                      >
                        <option value="" disabled>
                          + Load Directive Template...
                        </option>
                        {TASK_PRESETS.map((p) => (
                          <option key={p.title} value={p.title}>
                            {p.title} ({p.schedule})
                          </option>
                        ))}
                      </select>
                    </div>
                    <span className="opt-card-subtitle">
                      Instructions executed autonomously during team execution runs
                    </span>
                  </div>

                  <div className="opt-field-group">
                    <textarea
                      className="opt-textarea-element"
                      rows={3}
                      placeholder="Specify the operational directive or instructions for this agent..."
                      value={selectedAgentForSidebar.agent.task || ""}
                      onChange={(e) =>
                        handleUpdateAgent(
                          selectedAgentForSidebar.teamId,
                          selectedAgentForSidebar.agent.id,
                          { task: e.target.value },
                        )
                      }
                    />
                  </div>

                  <div className="opt-directive-meta">
                    <span className="directive-schedule-pill">
                      ⏱ {selectedAgentForSidebar.agent.schedule || "Continuous · Autonomous"}
                    </span>
                    {selectedAgentForSidebar.agent.task && (
                      <button
                        type="button"
                        className="opt-clear-btn"
                        onClick={() =>
                          handleUpdateAgent(
                            selectedAgentForSidebar.teamId,
                            selectedAgentForSidebar.agent.id,
                            { task: "" },
                          )
                        }
                      >
                        Clear directive
                      </button>
                    )}
                  </div>
                </div>

                {/* Section D: Enabled Capabilities & Tools */}
                <div className="opt-card">
                  <div className="opt-card-header">
                    <div className="opt-card-header-row">
                      <div className="opt-tools-title-group">
                        <span className="opt-card-title">Capabilities & Tools</span>
                        <span className="opt-tools-count">
                          {(selectedAgentForSidebar.agent.tools || []).length} of{" "}
                          {TOOL_DEFINITIONS.length} active
                        </span>
                      </div>
                      <div className="opt-tools-actions">
                        <button
                          type="button"
                          className="opt-action-link"
                          onClick={() =>
                            handleUpdateAgent(
                              selectedAgentForSidebar.teamId,
                              selectedAgentForSidebar.agent.id,
                              { tools: TOOL_DEFINITIONS.map((t) => t.name) },
                            )
                          }
                        >
                          Select All
                        </button>
                        <span className="opt-action-divider">·</span>
                        <button
                          type="button"
                          className="opt-action-link"
                          onClick={() =>
                            handleUpdateAgent(
                              selectedAgentForSidebar.teamId,
                              selectedAgentForSidebar.agent.id,
                              { tools: [] },
                            )
                          }
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <span className="opt-card-subtitle">
                      APIs and tools this agent can invoke during task resolution
                    </span>
                  </div>

                  {/* Clean Modern 2-Column Capability Badges */}
                  <div className="opt-tools-grid">
                    {TOOL_DEFINITIONS.map((tool) => {
                      const currentTools = selectedAgentForSidebar.agent.tools || [];
                      const isChecked = currentTools.includes(tool.name);
                      return (
                        <button
                          key={tool.id}
                          type="button"
                          className={`opt-tool-chip ${isChecked ? "is-active" : ""}`}
                          onClick={() => {
                            const nextTools = isChecked
                              ? currentTools.filter((t) => t !== tool.name)
                              : [...currentTools, tool.name];
                            handleUpdateAgent(
                              selectedAgentForSidebar.teamId,
                              selectedAgentForSidebar.agent.id,
                              { tools: nextTools },
                            );
                          }}
                          title={tool.desc}
                        >
                          <span className="opt-tool-icon">{tool.icon}</span>
                          <span className="opt-tool-label">{tool.name}</span>
                          <span className="opt-tool-checkbox">
                            {isChecked ? "✓" : "+"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Section E: Sticky Footer with Actions */}
                <div className="opt-footer-bar">
                  <button
                    type="button"
                    className="opt-delete-btn"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Are you sure you want to delete ${selectedAgentForSidebar.agent.name}?`,
                        )
                      ) {
                        handleDelete(
                          selectedAgentForSidebar.teamId,
                          selectedAgentForSidebar.agent.id,
                        );
                      }
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    <span>Delete Agent</span>
                  </button>

                  <div className="opt-footer-right">
                    <button
                      type="button"
                      className="opt-test-btn"
                      onClick={() => setSidebarActiveTab("console")}
                    >
                      ⚡ Test in Console
                    </button>
                    <button
                      type="button"
                      className="opt-save-btn"
                      onClick={() => setSelectedAgentForSidebar(null)}
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: CONSOLE / CHAT RUNNER */}
            {sidebarActiveTab === "console" && (
              <div className="agent-dot-console-pane">
                {/* Agent Quick Directive Banner */}
                <div className="agent-directive-card">
                  <div className="agent-directive-header">
                    <span className="directive-label">ACTIVE TASK</span>
                    <span className="directive-schedule">
                      {selectedAgentForSidebar.agent.schedule || "Continuous · Autonomous"}
                    </span>
                  </div>
                  <p className="directive-text">
                    {selectedAgentForSidebar.agent.task ||
                      "Standby for ad-hoc tool executions and live queries."}
                  </p>
                  <button
                    type="button"
                    className="run-task-btn"
                    onClick={() =>
                      handleSendConsoleMessage(
                        selectedAgentForSidebar.agent.task
                          ? `Execute assigned directive: "${selectedAgentForSidebar.agent.task}"`
                          : "Run operational health scan and status check",
                      )
                    }
                    disabled={isConsoleGenerating}
                  >
                    <span>⚡ Run Directive Now</span>
                  </button>
                </div>

                {/* Message Stream */}
                <div className="console-chat-stream">
                  {consoleMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`console-message ${msg.sender === "user" ? "is-user" : "is-agent"}`}
                    >
                      <div className="message-header">
                        <span className="message-sender">
                          {msg.sender === "user" ? "You (Admin)" : selectedAgentForSidebar.agent.name}
                        </span>
                        <span className="message-time">{msg.timestamp}</span>
                      </div>

                      {/* Grok/o1 Thinking Process */}
                      {msg.thinking && (
                        <details className="thinking-accordion" open>
                          <summary className="thinking-summary">
                            <span className="thinking-icon">🧠</span>
                            <span>Thinking Process (Reasoning Trace)</span>
                          </summary>
                          <pre className="thinking-body">{msg.thinking}</pre>
                        </details>
                      )}

                      {/* Tool Call Invocation Block */}
                      {msg.toolCall && (
                        <div className="tool-invocation-box">
                          <div className="tool-inv-header">
                            <span className="tool-inv-badge">
                              {msg.toolCall.icon} Tool Call: <strong>{msg.toolCall.tool}</strong>
                            </span>
                            <span className="tool-inv-status">SUCCESS (0.04s)</span>
                          </div>
                          <div className="tool-inv-details">
                            <div className="tool-io-block">
                              <span className="tool-io-label">Input</span>
                              <pre>{msg.toolCall.input}</pre>
                            </div>
                            <div className="tool-io-block">
                              <span className="tool-io-label">Output</span>
                              <pre>{msg.toolCall.output}</pre>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Main Message Body */}
                      <div className="message-body">
                        {msg.text.split("\n\n").map((para, i) => (
                          <p key={i}>{para}</p>
                        ))}
                      </div>
                    </div>
                  ))}

                  {isConsoleGenerating && (
                    <div className="console-message is-agent is-thinking-pulse">
                      <div className="thinking-spinner-row">
                        <span className="thinking-pulse-dot" />
                        <span className="thinking-pulse-dot" />
                        <span className="thinking-pulse-dot" />
                        <span className="thinking-text">
                          {selectedAgentForSidebar.agent.name} is thinking & invoking tools...
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Prompt Input Box */}
                <div className="console-input-area">
                  <div className="console-model-selector">
                    <span className="model-label">Model:</span>
                    <select
                      className="model-select-dropdown"
                      value={consoleModel}
                      onChange={(e) => setConsoleModel(e.target.value)}
                    >
                      <option value="meta/llama-3.1-70b-instruct">Llama 3.1 70B (Fast)</option>
                      <option value="nvidia/nemotron-4-340b">Nemotron 4 340B</option>
                      <option value="mistralai/mixtral-8x22b">Mixtral 8x22B (Reasoning)</option>
                      <option value="grok-turbo">Grok 2.0 (Turbo Reasoning)</option>
                    </select>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendConsoleMessage();
                    }}
                    className="console-form"
                  >
                    <input
                      type="text"
                      className="console-input-field"
                      placeholder={`Instruct ${selectedAgentForSidebar.agent.name} or prompt a task...`}
                      value={consoleInput}
                      onChange={(e) => setConsoleInput(e.target.value)}
                      disabled={isConsoleGenerating}
                    />
                    <button
                      type="submit"
                      className="console-send-btn"
                      disabled={!consoleInput.trim() || isConsoleGenerating}
                      title="Send message"
                    >
                      🚀
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* TAB 3: TELEMETRY & LOGS */}
            {sidebarActiveTab === "logs" && (
              <div className="agent-dot-logs-pane">
                <div className="telemetry-summary-cards">
                  <div className="telemetry-metric">
                    <span className="tel-label">STATUS</span>
                    <strong
                      className={`tel-value status-${
                        hasAssignedModel
                          ? selectedAgentForSidebar.agent.status === "active"
                            ? "online"
                            : selectedAgentForSidebar.agent.status || "online"
                          : "idle"
                      }`}
                    >
                      {hasAssignedModel
                        ? selectedAgentForSidebar.agent.status || "Active"
                        : "Idle"}
                    </strong>
                  </div>
                  <div className="telemetry-metric">
                    <span className="tel-label">LATENCY</span>
                    <strong className="tel-value">~38ms</strong>
                  </div>
                  <div className="telemetry-metric">
                    <span className="tel-label">TOOLS LOADED</span>
                    <strong className="tel-value">
                      {(selectedAgentForSidebar.agent.tools || []).length}
                    </strong>
                  </div>
                </div>

                <div className="execution-logs-list">
                  <span className="logs-header-title">Recent Lifecycle Executions</span>
                  {executionLogs.map((log) => (
                    <div key={log.id} className="execution-log-item">
                      <span className="log-time">{log.timestamp}</span>
                      <span className="log-action">{log.action}</span>
                      {log.toolUsed && (
                        <span className="log-tool-tag">{log.toolUsed}</span>
                      )}
                      <span className={`log-status status-${log.status}`}>
                        {log.status.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Slide-over Add Agent Sidebar Form */}
      {isSidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setIsSidebarOpen(false)}>
          <aside className="corp-sidebar-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sidebar-top">
              <span className="sidebar-heading">Add AI Agent</span>
              <button
                type="button"
                className="sidebar-close"
                onClick={() => setIsSidebarOpen(false)}
                aria-label="Close add agent sidebar"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAgent} className="sidebar-form">
              <div className="field-block">
                <label className="field-title" htmlFor="field-team">Assign to Team</label>
                <select
                  id="field-team"
                  value={targetTeamId}
                  onChange={(e) => handleTeamChange(e.target.value)}
                  className="input-element"
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
<div className="field-block">
                <label className="field-title" htmlFor="field-role">Agent Role</label>
                <select
                  id="field-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="input-element"
                >
                  <option value="Team Leader">Team Leader</option>
                  <option value="Worker">Worker</option>
                  <option value="Manager">Manager</option>
                </select>
              </div>
              <div className="field-block">
                <label className="field-title" htmlFor="field-name">Agent Name</label>
                <input
                  id="field-name"
                  type="text"
                  placeholder="e.g. Jarvis-Prime, Code-Sentinel"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-element"
                  autoFocus
                />
              </div>

              

              {errorMsg && <span className="form-alert">{errorMsg}</span>}

              <div className="sidebar-buttons">
                <button
                  type="button"
                  className="action-btn secondary"
                  onClick={() => setIsSidebarOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="action-btn primary">
                  Save Agent
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}
