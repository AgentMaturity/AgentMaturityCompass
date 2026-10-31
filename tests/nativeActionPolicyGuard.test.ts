import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentToolset, checkToolsetReadiness } from "../src/agent/agentToolset.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { actionPolicyPath, actionPolicySigPath, defaultActionPolicy, initActionPolicy, initActionPolicyAsync, prepareActionPolicyPair,
  signActionPolicy, signActionPolicyWithLockHeld } from "../src/governor/actionPolicyEngine.js";
import { actionPolicyAbsentPath } from "../src/governor/actionPolicyStore.js";
import YAML from "yaml";
import { openLedger } from "../src/ledger/ledger.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { initWorkspace } from "../src/workspace.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { runDoctorRules } from "../src/doctor/doctorRules.js";
import { initWorkspaceWithoutActionPolicy, installObservedRun, permitAgentActions, removeActionPolicy } from "./helpers/actionPolicyFixtures.js";

/**
 * AXR-02: the governor's signed Action Policy on native tool calls. Never configured, native calls behave as before and
 * readiness says "not configured"; removed after signing (no signed absence declaration) or present but tampered, every
 * governed class is denied; present and signed, the decision ToolHub makes is enforced, including its downgrade of
 * EXECUTE to SIMULATE.
 */
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const SESSION = "action-policy-session";

function workspace(options: { neverConfigured?: boolean } = {}): string {
  process.env["AMC_VAULT_PASSPHRASE"] ??= "native-action-policy-pass";
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-native-ap-")));
  dirs.push(dir);
  (options.neverConfigured ? initWorkspaceWithoutActionPolicy : initWorkspace)({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initBudgets(dir, "default");
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  const ledger = openLedger(dir);
  ledger.startSession({ sessionId: SESSION, runtime: "amc", binaryPath: "test", binarySha256: "test" });
  ledger.close();
  return dir;
}

async function write(dir: string) {
  const toolset = agentToolset({ workspace: dir, agentId: "default", sessionId: SESSION });
  try {
    return await toolset.pipeline.execute({ name: "fs.write", agentId: "default", arguments: { path: "workspace/output/out.txt", content: "x" }, requestedMode: "EXECUTE" });
  } finally {
    toolset.close();
  }
}

const written = (dir: string): boolean => existsSync(join(dir, "workspace", "output", "out.txt"));

describe("native calls and the signed Action Policy", () => {
  it("never configured: behaves as before, and readiness and doctor say not configured", async () => {
    const dir = workspace({ neverConfigured: true });
    expect(existsSync(actionPolicyPath(dir))).toBe(false);
    expect(checkToolsetReadiness(dir).actionPolicy).toBe("not configured");
    const doctor = (await runDoctorRules(dir)).checks.find((check) => check.id === "sig-action-policy");
    expect(doctor?.message).toContain("action policy: not configured");
    const outcome = await write(dir);
    expect(outcome.ok, outcome.denied?.reason).toBe(true);
    expect(written(dir)).toBe(true);
  });

  it("tampered: denies every governed class, reads included", async () => {
    const dir = workspace();
    permitAgentActions(dir, "default");
    writeFileSync(actionPolicyPath(dir), `${readFileSync(actionPolicyPath(dir), "utf8")}\n# tamper\n`);
    expect(checkToolsetReadiness(dir).actionPolicy).toBe("untrusted");
    const outcome = await write(dir);
    expect(outcome.ok).toBe(false);
    expect(outcome.denied?.guardLabel).toBe("action-policy");
    expect(written(dir)).toBe(false);
    const toolset = agentToolset({ workspace: dir, agentId: "default", sessionId: SESSION });
    try {
      const read = await toolset.pipeline.execute({ name: "fs.read", agentId: "default", arguments: { path: "workspace/x" }, requestedMode: "EXECUTE" });
      expect(read.denied?.guardLabel).toBe("action-policy");
    } finally {
      toolset.close();
    }
  });

  it("removed after signing, signature too: every governed class is denied, and readiness and doctor say so", async () => {
    // The attack: a process with .amc/ write access removes the signed pair amc init wrote, hoping native calls read it
    // as never configured and run unchecked. Only a workspace created without a policy carries the signed declaration.
    const dir = workspace();
    removeActionPolicy(dir);
    const readiness = checkToolsetReadiness(dir);
    expect(readiness.actionPolicy).toBe("untrusted");
    expect(readiness.blockers.join("\n")).toContain("removed after signing");
    const doctor = (await runDoctorRules(dir)).checks.find((check) => check.id === "sig-action-policy");
    expect(doctor).toMatchObject({ status: "FAIL", message: "action policy removed after signing: restore it from backup or run amc policy action init" });
    const outcome = await write(dir);
    expect(outcome.ok).toBe(false);
    expect(outcome.denied?.guardLabel).toBe("action-policy");
    expect(outcome.denied?.reason).toContain("removed after signing");
    expect(written(dir)).toBe(false);
    const toolset = agentToolset({ workspace: dir, agentId: "default", sessionId: SESSION });
    try {
      const read = await toolset.pipeline.execute({ name: "fs.read", agentId: "default", arguments: { path: "workspace/x" }, requestedMode: "EXECUTE" });
      expect(read.denied?.guardLabel).toBe("action-policy");
    } finally {
      toolset.close();
    }
  });

  it("every signing path retires the absence declaration, so removing what it published is denied", async () => {
    const policyBytes = YAML.stringify(defaultActionPolicy());
    const signers: Record<string, (dir: string) => unknown> = {
      initActionPolicy: (dir) => initActionPolicy(dir),
      initActionPolicyAsync: (dir) => initActionPolicyAsync(dir),
      "prepareActionPolicyPair (observed publish)": async (dir) => (await prepareActionPolicyPair(dir, Buffer.from(policyBytes))).publish(() => undefined),
      signActionPolicy: (dir) => { writeFileSync(actionPolicyPath(dir), policyBytes); return signActionPolicy(dir); },
      signActionPolicyWithLockHeld: (dir) => { writeFileSync(actionPolicyPath(dir), policyBytes); return signActionPolicyWithLockHeld(dir); }
    };
    for (const [name, sign] of Object.entries(signers)) {
      const dir = workspace({ neverConfigured: true });
      expect(checkToolsetReadiness(dir).actionPolicy, name).toBe("not configured");
      await sign(dir);
      expect(checkToolsetReadiness(dir).actionPolicy, name).toBe("signed");
      rmSync(actionPolicyPath(dir));
      rmSync(actionPolicySigPath(dir));
      expect(checkToolsetReadiness(dir).actionPolicy, name).toBe("untrusted");
    }
  });

  it("an absence declaration that is deleted, edited or another workspace's is not trusted", () => {
    const dir = workspace({ neverConfigured: true });
    const declaration = actionPolicyAbsentPath(dir);
    expect(checkToolsetReadiness(dir).actionPolicy).toBe("not configured");
    const signed = readFileSync(declaration, "utf8");
    writeFileSync(declaration, JSON.stringify({ ...JSON.parse(signed), signature: Buffer.alloc(64).toString("base64") }));
    expect(checkToolsetReadiness(dir).actionPolicy).toBe("untrusted");
    rmSync(declaration);
    expect(checkToolsetReadiness(dir).actionPolicy).toBe("untrusted");
    // Planted from another workspace: signed by a key this workspace does not hold.
    writeFileSync(declaration, readFileSync(actionPolicyAbsentPath(workspace({ neverConfigured: true })), "utf8"));
    expect(checkToolsetReadiness(dir).actionPolicy).toBe("untrusted");
  });

  it("removed with its signature left behind: treated as tampered, not as absent", async () => {
    const dir = workspace();
    rmSync(actionPolicyPath(dir));
    expect(checkToolsetReadiness(dir).actionPolicy).toBe("untrusted");
    expect((await write(dir)).denied?.guardLabel).toBe("action-policy");
  });

  it("signed and denying: a class the policy denies is refused before the body", async () => {
    const dir = workspace();
    installObservedRun(dir, "default");
    const policy = defaultActionPolicy();
    policy.defaultMode = "DENY";
    policy.actions = policy.actions.filter((rule) => rule.actionClass !== "WRITE_LOW");
    initActionPolicy(dir, policy);
    const outcome = await write(dir);
    expect(outcome.denied?.guardLabel).toBe("action-policy");
    expect(outcome.denied?.reason).toContain("WRITE_LOW");
    expect(written(dir)).toBe(false);
  });

  it("signed, without the evidence it asks for: EXECUTE runs as SIMULATE and writes nothing", async () => {
    const dir = workspace(); // amc init's signed default policy, and no diagnostic run
    expect(checkToolsetReadiness(dir).actionPolicy).toBe("signed");
    const outcome = await write(dir);
    expect(outcome.denied).toBeNull();
    expect(written(dir)).toBe(false);
  });

  it("signed and satisfied: EXECUTE runs", async () => {
    const dir = workspace();
    permitAgentActions(dir, "default");
    const outcome = await write(dir);
    expect(outcome.ok, outcome.denied?.reason).toBe(true);
    expect(written(dir)).toBe(true);
  });

  it("signed, under a freeze: EXECUTE is refused, never run as SIMULATE", async () => {
    const dir = workspace();
    permitAgentActions(dir, "default");
    const incidents = join(getAgentPaths(dir, "default").rootDir, "incidents");
    mkdirSync(incidents, { recursive: true });
    writeFileSync(join(incidents, "inc_tampered.json"), "{ not an incident");
    const outcome = await write(dir);
    expect(outcome.ok).toBe(false);
    expect(outcome.denied?.reason).toMatch(/frozen/i);
    expect(written(dir)).toBe(false);
  });
});
