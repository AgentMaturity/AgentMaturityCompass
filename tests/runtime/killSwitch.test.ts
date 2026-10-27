/** P2-26 slice B: the signed kill switch denies protected effects, fails closed, and lifts only on a signed OWNER release. */
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { activeFreezeStatus } from "../../src/drift/freezeEngine.js";
import { createIncidentStore } from "../../src/incidents/incidentStore.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { activateKillSwitch, killSwitchDenial, killSwitchStatus, releaseKillSwitch } from "../../src/runtime/killSwitch.js";
import { ToolPipeline } from "../../src/tools/toolPipeline.js";
import { defineTool, ToolRegistry } from "../../src/tools/toolRegistry.js";
import { initWorkspace } from "../../src/workspace.js";

vi.setConfig({ testTimeout: 60_000 });
let workspace: string;
let checkpoints: string;
const tool = (actionClass: "READ_ONLY" | "WRITE_HIGH" | "FINANCIAL", agentId = "default") => ({ kind: "tool" as const, agentId, actionClass });
const model = (providerId: string | null = "openai") => ({ kind: "model" as const, agentId: "default", providerId });
const kill = (over: Partial<Parameters<typeof activateKillSwitch>[0]> = {}) => activateKillSwitch({ workspace, issuedBy: "owner-1",
  scope: { kind: "workspace", id: "workspace" }, mode: "stop_new_effects", reason: "drill", incidentId: "inc-1", ...over });
const workspaceFiles = () => readdirSync(join(workspace, ".amc", "runtime", "kill-switch"));

beforeEach(() => {
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-p226-kill-")));
  checkpoints = realpathSync(mkdtempSync(join(tmpdir(), "amc-p226-kill-checkpoints-")));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", checkpoints);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(workspace, { recursive: true, force: true });
  rmSync(checkpoints, { recursive: true, force: true });
});

describe("denial", () => {
  test("no record: nothing is denied", () => {
    expect(killSwitchDenial(workspace, tool("FINANCIAL"))).toBeNull();
    expect(activeFreezeStatus(workspace, "default").active).toBe(false);
  });

  test("a workspace stop_new_effects kill denies consequential effects, keeps reads and model calls, and freezes toolhub", async () => {
    const record = await kill();
    expect(killSwitchDenial(workspace, tool("FINANCIAL"))).toContain(`kill_switch_active: ${record.killId}`);
    expect(killSwitchDenial(workspace, tool("READ_ONLY"))).toBeNull();
    expect(killSwitchDenial(workspace, model())).toBeNull();
    const freeze = activeFreezeStatus(workspace, "default");
    expect(freeze).toMatchObject({ active: true, incidentIds: [`kill-switch:${record.killId}`] });
    expect(freeze.actionClasses).toContain("FINANCIAL");
    expect(freeze.actionClasses).not.toContain("READ_ONLY");
  });

  test("stop_all denies reads and model calls; a provider kill denies only that provider's model calls", async () => {
    await kill({ scope: { kind: "provider", id: "openai" }, mode: "stop_all" });
    expect(killSwitchDenial(workspace, model("openai"))).toContain("kill_switch_active");
    expect(killSwitchDenial(workspace, model("anthropic"))).toBeNull();
    expect(killSwitchDenial(workspace, tool("WRITE_HIGH"))).toBeNull();
    await kill({ mode: "stop_all" });
    expect(killSwitchDenial(workspace, tool("READ_ONLY"))).toContain("kill_switch_active");
  });

  test("an agent kill denies that agent only", async () => {
    await kill({ scope: { kind: "agent", id: "agent-a" } });
    expect(killSwitchDenial(workspace, tool("WRITE_HIGH", "agent-a"))).toContain("kill_switch_active");
    expect(killSwitchDenial(workspace, tool("WRITE_HIGH", "agent-b"))).toBeNull();
  });

  test("activation is recorded in the ledger and opens an incident", async () => {
    const record = await kill();
    const ledger = openLedger(workspace);
    try {
      const incidents = createIncidentStore(ledger.db).getOpenIncidents("workspace");
      expect(incidents.map((i) => i.triggerId)).toEqual([`kill_switch:${record.killId}`]);
    } finally {
      ledger.close();
    }
  });
});

describe("the pipeline's authorization stage", () => {
  function pipeline(effects: string[]) {
    const registry = new ToolRegistry();
    for (const [name, actionClass] of [["fixture.read", "READ_ONLY"], ["fixture.write", "WRITE_LOW"]] as const) {
      registry.define(defineTool({ name, description: "fixture", actionClass, body: () => { effects.push(name); return { output: name }; } }));
    }
    return new ToolPipeline({ registry, workspace });
  }
  const run = (p: ToolPipeline, name: string) => p.execute({ name, agentId: "default", arguments: {}, requestedMode: "EXECUTE" });

  test("an unbound WRITE_LOW call is refused; an allowlisted read runs", async () => {
    const effects: string[] = [];
    const p = pipeline(effects);
    expect((await run(p, "fixture.write")).denied).toBeNull();
    await kill();
    const write = await run(p, "fixture.write");
    expect(write.denied).toMatchObject({ stage: "authorization", reason: expect.stringContaining("kill_switch_active") });
    expect((await run(p, "fixture.read")).denied).toBeNull();
    expect(effects).toEqual(["fixture.write", "fixture.read"]);
  });
});

describe("fail closed", () => {
  test("an unverifiable record counts as an active stop_all", () => {
    mkdirSync(join(workspace, ".amc", "runtime", "kill-switch"), { recursive: true });
    writeFileSync(join(workspace, ".amc", "runtime", "kill-switch", "junk.json"), "{not json");
    expect(killSwitchStatus(workspace)).toMatchObject({ active: true, unverifiable: [expect.stringContaining("junk.json")] });
    expect(killSwitchDenial(workspace, tool("READ_ONLY"))).toContain("kill_switch_active");
  });

  test("attacker-writable state cannot block activation: a corrupt record and a stray lock beside it change nothing", async () => {
    const dir = join(workspace, ".amc", "runtime", "kill-switch");
    mkdirSync(join(dir, ".lock"), { recursive: true });
    writeFileSync(join(dir, "corrupt.json"), "\u0000");
    const record = await kill({ mode: "stop_all" });
    expect(workspaceFiles()).toContain(`${record.killId}.json`);
    expect(killSwitchStatus(workspace).kills.map((k) => k.killId)).toEqual([record.killId]);
  });

  test("deleting the workspace copy lifts nothing: the mirror outside the workspace still holds the kill", async () => {
    const record = await kill();
    rmSync(join(workspace, ".amc", "runtime", "kill-switch"), { recursive: true, force: true });
    expect(killSwitchDenial(workspace, tool("WRITE_HIGH"))).toContain(record.killId);
  });

  test("a forged release lifts nothing and is itself treated as active", async () => {
    const record = await kill();
    const forger = generateKeyPairSync("ed25519");
    const body = { v: 1, release: true, killId: record.killId, incidentId: "inc-1", releasedBy: "attacker", releasedTs: Date.now() };
    writeFileSync(join(workspace, ".amc", "runtime", "kill-switch", `${record.killId}.release.json`),
      JSON.stringify({ ...body, signature: sign(null, Buffer.alloc(32), forger.privateKey).toString("base64") }));
    expect(killSwitchStatus(workspace).active).toBe(true);
    expect(killSwitchDenial(workspace, tool("WRITE_HIGH"))).toContain("kill_switch_active");
  });
});

describe("release", () => {
  test("release without an OWNER principal or without the kill's incident is refused; a signed OWNER release lifts it", async () => {
    const record = await kill();
    await expect(releaseKillSwitch({ workspace, releasedBy: " ", killId: record.killId, incidentId: "inc-1" })).rejects.toThrow(/OWNER/);
    await expect(releaseKillSwitch({ workspace, releasedBy: "owner-1", killId: record.killId, incidentId: "inc-2" })).rejects.toThrow(/linked to incident inc-1/);
    await releaseKillSwitch({ workspace, releasedBy: "owner-1", killId: record.killId, incidentId: "inc-1" });
    expect(killSwitchStatus(workspace)).toEqual({ active: false, kills: [], unverifiable: [] });
    expect(killSwitchDenial(workspace, tool("FINANCIAL"))).toBeNull();
  });
});
