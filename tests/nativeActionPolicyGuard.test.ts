import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentToolset, checkToolsetReadiness } from "../src/agent/agentToolset.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { actionPolicyPath, defaultActionPolicy, initActionPolicy } from "../src/governor/actionPolicyEngine.js";
import { openLedger } from "../src/ledger/ledger.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { initWorkspace } from "../src/workspace.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { runDoctorRules } from "../src/doctor/doctorRules.js";
import { installObservedRun, permitAgentActions, removeActionPolicy } from "./helpers/actionPolicyFixtures.js";

/**
 * AXR-02: the governor's signed Action Policy on native tool calls. Absent, native calls behave as before and readiness
 * says "not configured"; present but tampered, every governed class is denied; present and signed, the decision ToolHub
 * makes is enforced, including its downgrade of EXECUTE to SIMULATE.
 */
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const SESSION = "action-policy-session";

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] ??= "native-action-policy-pass";
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-native-ap-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
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
  it("absent: behaves as before, and readiness and doctor say not configured", async () => {
    const dir = workspace();
    removeActionPolicy(dir);
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
