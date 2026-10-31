import { describe, expect, it } from "vitest";
import {
  addChild,
  countActiveAgents,
  countAgents,
  deleteAgent,
  findParentAgent,
  flattenAgents,
  getAgentHierarchyPath,
  getAgentPersona,
  getAgentRoleType,
  getCorporateInitials,
  getSubordinateIds,
  hasTeamLead,
  INITIAL_TEAMS,
  MASTER_PERSONA,
  ROLE_PRESETS,
  TASK_PRESETS,
  toggleAgentStatus,
  TOOL_DEFINITIONS,
  updateAgent,
  type AgentNode,
} from "./AgentHierarchyPage";

describe("AgentHierarchyPage core hierarchy functions", () => {
  const initialAgents: AgentNode[] = [
    {
      id: "lead-1",
      name: "Lead Agent",
      children: [
        {
          id: "sub-1",
          name: "Sub Agent 1",
          children: [
            {
              id: "sub-sub-1",
              name: "Sub Sub Agent 1",
              children: [],
            },
          ],
        },
        {
          id: "sub-2",
          name: "Sub Agent 2",
          children: [],
        },
      ],
    },
  ];

  it("counts total agents in a deep hierarchy accurately", () => {
    const total = countAgents(initialAgents);
    expect(total).toBe(4);
  });

  it("flattens agents with depth information for parent select options", () => {
    const flattened = flattenAgents(initialAgents);
    expect(flattened).toHaveLength(4);
    expect(flattened[0].id).toBe("lead-1");
    expect(flattened[0].depth).toBe(0);
    expect(flattened[1].id).toBe("sub-1");
    expect(flattened[1].depth).toBe(1);
    expect(flattened[2].id).toBe("sub-sub-1");
    expect(flattened[2].depth).toBe(2);
    expect(flattened[3].id).toBe("sub-2");
    expect(flattened[3].depth).toBe(1);
  });

  it("adds child agent under the specified parent node", () => {
    const newChild: AgentNode = {
      id: "sub-sub-2",
      name: "Sub Sub Agent 2",
      children: [],
    };

    const updated = addChild(initialAgents, "sub-2", newChild);
    expect(countAgents(updated)).toBe(5);

    const sub2 = updated[0].children.find((c) => c.id === "sub-2");
    expect(sub2?.children).toHaveLength(1);
    expect(sub2?.children[0].id).toBe("sub-sub-2");
  });

  it("deletes specified agent and its subtree correctly", () => {
    const updated = deleteAgent(initialAgents, "sub-1");
    expect(countAgents(updated)).toBe(2); // lead-1 and sub-2 remaining
    expect(updated[0].children).toHaveLength(1);
    expect(updated[0].children[0].id).toBe("sub-2");
  });

  it("returns stable deterministic human eye personas for agent balls", () => {
    const personaMaster = getAgentPersona("jarvis-master", true);
    expect(personaMaster.id).toBe("master");
    expect(personaMaster.irisType).toBe("command-cyan");
  });

  it("generates concise corporate initials for badges", () => {
    expect(getCorporateInitials("Master Agent")).toBe("MA");
    expect(getCorporateInitials("WhatsApp Agent")).toBe("WA");
    expect(getCorporateInitials("Sentinel")).toBe("SE");
    expect(getCorporateInitials("")).toBe("AG");
  });

  it("finds direct supervisor and hierarchy path logic-wise", () => {
    const parentOfSub1 = findParentAgent(initialAgents, "sub-1");
    expect(parentOfSub1?.id).toBe("lead-1");

    const parentOfSubSub1 = findParentAgent(initialAgents, "sub-sub-1");
    expect(parentOfSubSub1?.id).toBe("sub-1");

    const parentOfLead = findParentAgent(initialAgents, "lead-1");
    expect(parentOfLead).toBeNull();

    const path = getAgentHierarchyPath(initialAgents, "sub-sub-1");
    expect(path.map((n) => n.id)).toEqual(["lead-1", "sub-1", "sub-sub-1"]);

    const subIds = getSubordinateIds(initialAgents[0]);
    expect(subIds.has("sub-1")).toBe(true);
    expect(subIds.has("sub-sub-1")).toBe(true);
    expect(subIds.has("sub-2")).toBe(true);
    expect(subIds.size).toBe(3);
  });
});

describe("Corporate Workspace Architecture", () => {
  it("initializes with 4 teams and 3 initial agents (TL1, TL2, Specialist)", () => {
    expect(INITIAL_TEAMS).toHaveLength(4);
    expect(INITIAL_TEAMS.map((t) => t.name)).toEqual([
      "Team 1",
      "Team 2",
      "Team 3",
      "Team 4",
    ]);

    expect(countAgents(INITIAL_TEAMS.flatMap((t) => t.agents))).toBe(3);
    expect(INITIAL_TEAMS[0].agents[0].name).toBe("TL1");
    expect(INITIAL_TEAMS[1].agents[0].name).toBe("TL2");
    expect(INITIAL_TEAMS[2].agents[0].name).toBe("Specialist");
    expect(INITIAL_TEAMS[3].agents).toHaveLength(0);
  });

  it("allows adding user-defined agents with task, skills, and tools", () => {
    const userAgent: AgentNode = {
      id: "AGT-001",
      name: "WhatsApp Agent",
      task: "Send Good Morning at 08:00 AM every day to mentioned numbers",
      schedule: "Daily · 08:00 AM",
      skills: ["Automated Messaging", "Scheduler"],
      tools: ["WhatsApp Web API", "Contacts DB"],
      status: "active",
      children: [],
    };

    const team1WithAgent = {
      ...INITIAL_TEAMS[0],
      agents: [userAgent],
    };

    expect(team1WithAgent.agents).toHaveLength(1);
    expect(team1WithAgent.agents[0].name).toBe("WhatsApp Agent");
    expect(team1WithAgent.agents[0].task).toContain("Good Morning");
    expect(team1WithAgent.agents[0].skills).toContain("Automated Messaging");
    expect(team1WithAgent.agents[0].tools).toContain("WhatsApp Web API");
  });

  it("exports Master Agent coordinator persona", () => {
    expect(MASTER_PERSONA.name).toBe("Master Agent");
    expect(MASTER_PERSONA.tag).toBe("Master");
  });

  it("supports simplified agent creation with team assignment, roles, and parent agent selection", () => {
    const parentAgent: AgentNode = {
      id: "AGT-101",
      name: "Lead Support Agent",
      role: "Team Lead",
      status: "active",
      children: [],
    };

    const childAgent: AgentNode = {
      id: "AGT-102",
      name: "Ticket Triage Agent",
      role: "Worker",
      status: "active",
      children: [],
    };

    // Add parent to Team 2
    const teamWithParent = {
      ...INITIAL_TEAMS[1],
      agents: [parentAgent],
    };

    // Flatten shows parent is available for selection
    const availableParents = flattenAgents(teamWithParent.agents);
    expect(availableParents).toHaveLength(1);
    expect(availableParents[0].id).toBe("AGT-101");
    expect(availableParents[0].label).toBe("Lead Support Agent (AGT-101)");
    expect(availableParents[0].role).toBe("Team Lead");

    // Add child under parent
    const teamWithChild = {
      ...teamWithParent,
      agents: addChild(teamWithParent.agents, "AGT-101", childAgent),
    };

    expect(countAgents(teamWithChild.agents)).toBe(2);
    expect(countActiveAgents(teamWithChild.agents)).toBe(2);

    // Verify parent resolution: child reports to parentAgent, parent reports to Master Agent
    const childParent = findParentAgent(teamWithChild.agents, "AGT-102");
    expect(childParent?.name).toBe("Lead Support Agent");

    const topParent = findParentAgent(teamWithChild.agents, "AGT-101");
    expect(topParent).toBeNull(); // top-level reports to Master Agent

    // Toggle child status to idle
    const updated = toggleAgentStatus(teamWithChild.agents, "AGT-102");
    expect(countActiveAgents(updated)).toBe(1);
  });

  describe("Single Team Lead per Team Rule", () => {
    it("detects when a team does not have a Team Lead", () => {
      expect(hasTeamLead([])).toBe(false);
      const teamWithWorkersOnly: AgentNode[] = [
        { id: "1", name: "Worker 1", role: "Worker", children: [] },
        { id: "2", name: "Worker 2", role: "Worker", children: [] },
      ];
      expect(hasTeamLead(teamWithWorkersOnly)).toBe(false);
    });

    it("detects when a team already has a Team Lead", () => {
      const teamWithLead: AgentNode[] = [
        { id: "1", name: "Alpha Lead", role: "Team Lead", children: [] },
        { id: "2", name: "Worker 1", role: "Worker", children: [] },
      ];
      expect(hasTeamLead(teamWithLead)).toBe(true);
    });

    it("detects Team Lead even if nested in legacy hierarchy tree", () => {
      const nestedWithLead: AgentNode[] = [
        {
          id: "top",
          name: "Top Agent",
          role: "Worker",
          children: [
            { id: "sub", name: "Sub Agent", role: "Team Lead", children: [] },
          ],
        },
      ];
      expect(hasTeamLead(nestedWithLead)).toBe(true);
    });
  });

  describe("Agent Configuration: Rename, Task, Skills, and Tools", () => {
    const testAgents: AgentNode[] = [
      {
        id: "AGT-001",
        name: "Old Name Agent",
        role: "Worker",
        children: [
          {
            id: "AGT-002",
            name: "Child Agent",
            role: "Worker",
            children: [],
          },
        ],
      },
    ];

    it("renames an agent correctly via updateAgent", () => {
      const updated = updateAgent(testAgents, "AGT-001", {
        name: "WhatsApp Master Agent",
      });
      expect(updated[0].name).toBe("WhatsApp Master Agent");
      expect(updated[0].children[0].name).toBe("Child Agent");
    });

    it("updates agent task and schedule description", () => {
      const taskText = "Send Good Morning at 08:00 AM every day to mentioned numbers";
      const scheduleText = "Daily · 08:00 AM";
      const updated = updateAgent(testAgents, "AGT-001", {
        task: taskText,
        schedule: scheduleText,
      });
      expect(updated[0].task).toBe(taskText);
      expect(updated[0].schedule).toBe(scheduleText);
    });

    it("provides skills and tools for an agent", () => {
      const skills = ["Automated Messaging", "Scheduler", "NLP"];
      const tools = ["WhatsApp Web API", "Contacts DB", "PostgreSQL"];

      const updated = updateAgent(testAgents, "AGT-001", {
        skills,
        tools,
      });

      expect(updated[0].skills).toEqual(skills);
      expect(updated[0].tools).toEqual(tools);
    });

    it("updates nested subordinate agents accurately", () => {
      const updated = updateAgent(testAgents, "AGT-002", {
        name: "Renamed Subordinate",
        task: "Subordinate ticket triage task",
        skills: ["Triage"],
        tools: ["Zendesk API"],
      });

      expect(updated[0].children[0].name).toBe("Renamed Subordinate");
      expect(updated[0].children[0].task).toBe("Subordinate ticket triage task");
      expect(updated[0].children[0].skills).toEqual(["Triage"]);
      expect(updated[0].children[0].tools).toEqual(["Zendesk API"]);
      // Root agent remains unchanged
      expect(updated[0].name).toBe("Old Name Agent");
    });
  });

  describe("Role-based Agent Design and Tool Execution", () => {
    it("classifies agent roles for distinctive visual designs and accessories", () => {
      expect(getAgentRoleType("Master Agent", true)).toBe("master");
      expect(getAgentRoleType("Team Lead")).toBe("lead");
      expect(getAgentRoleType("Research Specialist")).toBe("researcher");
      expect(getAgentRoleType("Code Engineer")).toBe("developer");
      expect(getAgentRoleType("Security Analyst")).toBe("security");
      expect(getAgentRoleType("Financial Analyst")).toBe("analyst");
      expect(getAgentRoleType("Communications & Outreach")).toBe("communicator");
      expect(getAgentRoleType("Content & Copywriter")).toBe("creative");
      expect(getAgentRoleType("Manager")).toBe("manager");
      expect(getAgentRoleType("Worker")).toBe("worker");
      expect(getAgentRoleType("")).toBe("worker");
    });

    it("provides curated role presets with tools and directives", () => {
      expect(ROLE_PRESETS.length).toBeGreaterThanOrEqual(8);
      const lead = ROLE_PRESETS.find((r) => r.role === "Team Lead" || r.role === "Team Leader");
      expect(lead?.icon).toBe("⭐");
      const coder = ROLE_PRESETS.find((r) => r.role === "Code Engineer");
      expect(coder?.suggestedTools).toContain("Python Code Interpreter");
    });

    it("provides comprehensive real-world tool definitions", () => {
      expect(TOOL_DEFINITIONS).toHaveLength(12);
      const toolNames = TOOL_DEFINITIONS.map((t) => t.name);
      expect(toolNames).toContain("Web Search & Browsing");
      expect(toolNames).toContain("Python Code Interpreter");
      expect(toolNames).toContain("PostgreSQL Database Client");
      expect(toolNames).toContain("Security Vulnerability Scanner");
      expect(toolNames).toContain("Live Market Data Ticker");
    });

    it("provides structured task presets with schedules", () => {
      expect(TASK_PRESETS.length).toBeGreaterThanOrEqual(6);
      expect(TASK_PRESETS[0]).toHaveProperty("schedule");
      expect(TASK_PRESETS[0]).toHaveProperty("description");
    });
  });

  describe("J.A.R.V.I.S Header Display Counts & Metrics", () => {
    it("computes active and idle counts from workspace hierarchy agents", () => {
      const workspaceAgents: AgentNode[] = [
        { id: "agt-1", name: "Agent 1", status: "active", children: [] },
        { id: "agt-2", name: "Agent 2", status: "idle", children: [] },
        { id: "agt-3", name: "Agent 3", status: "busy", children: [] },
        {
          id: "agt-4",
          name: "Agent 4",
          status: "idle",
          children: [
            { id: "agt-5", name: "Agent 5", status: "online", children: [] },
          ],
        },
      ];

      const flat = flattenAgents(workspaceAgents);
      expect(flat).toHaveLength(5);

      const working = flat.filter(
        (a) => a.status === "active" || a.status === "busy" || a.status === "online",
      ).length;
      const idle = flat.filter((a) => a.status === "idle").length;

      expect(working).toBe(3); // agt-1, agt-3, agt-5
      expect(idle).toBe(2);    // agt-2, agt-4
    });
  });
});
