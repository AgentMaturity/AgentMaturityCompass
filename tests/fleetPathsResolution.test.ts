import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  agentExists, agentRoot, currentAgentPath, ensureAgentDirs, fleetAgentsDir, fleetConfigPath, fleetConfigSigPath, fleetRoot,
  getAgentPaths, getCurrentAgent, normalizeAgentId, resolveAgentId, resolvePathForAgent, setCurrentAgent
} from "../src/fleet/paths.js";

const roots: string[] = [];
function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-fleet-paths-"));
  roots.push(dir);
  return dir;
}
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("fleet paths", () => {
  test("fleet files live under .amc, and the signature sits next to fleet.yaml", () => {
    const ws = workspace();
    expect(fleetRoot(ws)).toBe(join(ws, ".amc"));
    expect(fleetAgentsDir(ws)).toBe(join(ws, ".amc", "agents"));
    expect(fleetConfigPath(ws)).toBe(join(ws, ".amc", "fleet.yaml"));
    expect(fleetConfigSigPath(ws)).toBe(join(ws, ".amc", "fleet.yaml.sig"));
    expect(currentAgentPath(ws)).toBe(join(ws, ".amc", "current-agent"));
  });

  test("an agent id is lower-cased, path characters become dashes, and an id with nothing left is refused", () => {
    expect(normalizeAgentId("  Billing Bot ")).toBe("billing-bot");
    expect(normalizeAgentId("../../etc/passwd")).toBe("etc-passwd");
    expect(normalizeAgentId("a_b-c")).toBe("a_b-c");
    for (const bad of ["", "   ", "///", "..."]) expect(() => normalizeAgentId(bad)).toThrow("agentId cannot be empty");
    expect(agentRoot("/ws", "../Evil")).toBe(join("/ws", ".amc", "agents", "evil"));
  });

  test("the current agent: none without the file or with a blank file; set writes the normalized id", () => {
    const ws = workspace();
    expect(getCurrentAgent(ws)).toBeNull();
    mkdirSync(join(ws, ".amc"));
    writeFileSync(currentAgentPath(ws), "  \n");
    expect(getCurrentAgent(ws)).toBeNull();
    setCurrentAgent(ws, "Support Bot");
    expect(getCurrentAgent(ws)).toBe("support-bot");
  });

  test("which agent: the one named, then AMC_AGENT_ID, then the current agent, then default", () => {
    const ws = workspace();
    vi.stubEnv("AMC_AGENT_ID", "");
    expect(resolveAgentId(ws)).toBe("default");
    expect(resolveAgentId(ws, "   ")).toBe("default");
    setCurrentAgent(ws, "current-one");
    expect(resolveAgentId(ws)).toBe("current-one");
    vi.stubEnv("AMC_AGENT_ID", "From Env");
    expect(resolveAgentId(ws)).toBe("from-env");
    expect(resolveAgentId(ws, "Named")).toBe("named");
  });

  test("default always exists; a named agent exists only with a folder", () => {
    const ws = workspace();
    expect(agentExists(ws, "default")).toBe(true);
    expect(agentExists(ws, "billing")).toBe(false);
    mkdirSync(agentRoot(ws, "billing"), { recursive: true });
    expect(agentExists(ws, "Billing")).toBe(true);
  });

  test("a named agent gets scoped paths, and ensureAgentDirs makes its folders", () => {
    const ws = workspace();
    vi.stubEnv("AMC_AGENT_ID", "");
    const paths = getAgentPaths(ws, "billing");
    expect(paths).toMatchObject({ agentId: "billing", scoped: true, rootDir: join(ws, ".amc", "agents", "billing") });
    expect(paths.agentConfigSig).toBe(join(paths.rootDir, "agent.config.yaml.sig"));
    expect(paths.gatePolicySig).toBe(join(paths.rootDir, "gatePolicy.json.sig"));
    ensureAgentDirs(paths);
    for (const dir of [paths.rootDir, paths.targetsDir, paths.runsDir, paths.reportsDir, paths.bundlesDir]) expect(existsSync(dir)).toBe(true);
    expect(resolvePathForAgent(ws, "runs/r1.json", "billing")).toBe(join(paths.rootDir, "runs", "r1.json"));
  });

  test("default: root paths without a scoped folder or with a partial one beside a legacy root config; scoped once it has its own config", () => {
    const ws = workspace();
    vi.stubEnv("AMC_AGENT_ID", "");
    const root = join(ws, ".amc");
    expect(getAgentPaths(ws)).toMatchObject({ agentId: "default", scoped: false, rootDir: root, agentConfig: join(root, "agent.config.yaml") });

    const scopedDir = join(root, "agents", "default");
    mkdirSync(scopedDir, { recursive: true });
    // A scoped folder with nothing in it and no legacy config at the root: the scoped paths are used.
    expect(getAgentPaths(ws, "default")).toMatchObject({ scoped: true, rootDir: scopedDir });

    writeFileSync(join(root, "context-graph.json"), "{}");
    expect(getAgentPaths(ws, "default")).toMatchObject({ scoped: false, rootDir: root });
    expect(resolvePathForAgent(ws, "x.json")).toBe(join(root, "x.json"));

    writeFileSync(join(scopedDir, "agent.config.yaml"), "id: default\n");
    expect(getAgentPaths(ws, "default")).toMatchObject({ scoped: true, rootDir: scopedDir, contextGraph: join(scopedDir, "context-graph.json") });
  });
});
