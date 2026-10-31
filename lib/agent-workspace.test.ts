// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  flattenWorkspaceAgents,
  readWorkspaceAgentsByTeam,
  INITIAL_WORKSPACE_DATA,
  WORKSPACE_STORAGE_KEY,
  type WorkspaceTeam,
} from "./agent-workspace";

describe("agent-workspace utilities", () => {
  it("flattens nested workspace agents accurately", () => {
    const nested = [
      {
        id: "1",
        name: "Lead",
        children: [
          { id: "2", name: "Worker 1", children: [] },
          {
            id: "3",
            name: "Worker 2",
            children: [{ id: "4", name: "Sub Worker", children: [] }],
          },
        ],
      },
    ];

    const flat = flattenWorkspaceAgents(nested);
    expect(flat).toHaveLength(4);
    expect(flat.map((a) => a.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("reads workspace agents partitioned by team from local storage", () => {
    const mockTeams: WorkspaceTeam[] = [
      {
        id: "team-1",
        name: "Team 1",
        agents: [{ id: "j1", name: "Jarvis Agent" }],
      },
      {
        id: "team-2",
        name: "Team 2",
        agents: [{ id: "f1", name: "Friday Agent" }],
      },
      {
        id: "team-3",
        name: "Team 3",
        agents: [{ id: "u1", name: "Ultron Agent" }],
      },
      {
        id: "team-4",
        name: "Team 4",
        agents: [{ id: "v1", name: "Vision Agent" }],
      },
    ];

    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(mockTeams));

    const result = readWorkspaceAgentsByTeam();
    expect(result.total).toBe(4);
    expect(result.byTeam.JARVIS).toHaveLength(1);
    expect(result.byTeam.JARVIS[0].name).toBe("Jarvis Agent");
    expect(result.byTeam.FRIDAY).toHaveLength(1);
    expect(result.byTeam.ULTRON).toHaveLength(1);
    expect(result.byTeam.VISION).toHaveLength(1);

    localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  });

  it("assigns hierarchy teams without other team mentions (like TL1 in Team 1, TL2 in Team 2) to JARVIS", () => {
    const jarvisWorkspaceTeams: WorkspaceTeam[] = [
      {
        id: "team-1",
        name: "Team 1",
        agents: [{ id: "agt-1", name: "TL1", role: "Team Leader" }],
      },
      {
        id: "team-2",
        name: "Team 2",
        agents: [{ id: "agt-2", name: "TL2", role: "Team Leader" }],
      },
    ];

    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(jarvisWorkspaceTeams));

    const result = readWorkspaceAgentsByTeam();
    expect(result.total).toBe(2);
    expect(result.byTeam.JARVIS).toHaveLength(2);
    expect(result.byTeam.JARVIS.map((a) => a.name)).toEqual(["TL1", "TL2"]);
    expect(result.byTeam.FRIDAY).toHaveLength(0);

    localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  });

  it("provides default 3 agents for JARVIS when local storage is empty", () => {
    localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    const result = readWorkspaceAgentsByTeam();
    expect(result.total).toBe(3);
    expect(result.byTeam.JARVIS).toHaveLength(3);
    expect(result.byTeam.JARVIS.map((a) => a.name)).toEqual([
      "TL1",
      "TL2",
      "Specialist",
    ]);
  });

  it("ensures INITIAL_WORKSPACE_DATA is consistently built from default teams to avoid hydration mismatch", () => {
    expect(INITIAL_WORKSPACE_DATA.total).toBe(3);
    expect(INITIAL_WORKSPACE_DATA.byTeam.JARVIS).toHaveLength(3);
    expect(INITIAL_WORKSPACE_DATA.byTeam.FRIDAY).toHaveLength(0);
    expect(INITIAL_WORKSPACE_DATA.byTeam.ULTRON).toHaveLength(0);
    expect(INITIAL_WORKSPACE_DATA.byTeam.VISION).toHaveLength(0);
  });
});
