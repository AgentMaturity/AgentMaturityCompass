import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentToolset } from "../src/agent/agentToolset.js";
import { loadAuditMapActive } from "../src/audit/auditMapStore.js";
import { loadAuditPolicy } from "../src/audit/auditPolicyStore.js";
import { collectAuditBinderData } from "../src/audit/binderCollector.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { generateTrustCertificate } from "../src/cert/trustCertificate.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { latestRunForAgent, latestTrustedRun, summarizeGovernorInput } from "../src/governor/actionPolicyEngine.js";
import { runGovernorCheck } from "../src/governor/governorCli.js";
import { openLedger } from "../src/ledger/ledger.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { initWorkspace } from "../src/workspace.js";
import { installObservedRun, observedRunReport, permitAgentActions, signPermissiveActionPolicy, writeSealedRun } from "./helpers/actionPolicyFixtures.js";

/**
 * The governor's run reader. A run lifts "untrusted config" (EXECUTE downgraded to SIMULATE, AXR-02) only when its seal
 * verifies under the workspace run-hash keys, it is anchored in the ledger `runs` table, and it names this agent. A run
 * JSON anyone can write into the runs directory must not.
 */
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const SESSION = "run-trust-session";

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] ??= "governor-run-trust-pass";
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-run-trust-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initBudgets(dir, "default");
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  const ledger = openLedger(dir);
  ledger.startSession({ sessionId: SESSION, runtime: "amc", binaryPath: "test", binarySha256: "test" });
  ledger.close();
  return dir;
}

const runPath = (dir: string, agentId: string, runId: string) => join(getAgentPaths(dir, agentId).runsDir, `${runId}.json`);
const check = (dir: string) => runGovernorCheck({ workspace: dir, agentId: "default", actionClass: "WRITE_LOW", riskTier: "med", mode: "EXECUTE" });

async function nativeWrite(dir: string): Promise<boolean> {
  const toolset = agentToolset({ workspace: dir, agentId: "default", sessionId: SESSION });
  try {
    await toolset.pipeline.execute({ name: "fs.write", agentId: "default", arguments: { path: "workspace/output/out.txt", content: "x" }, requestedMode: "EXECUTE" });
  } finally {
    toolset.close();
  }
  return existsSync(join(dir, "workspace", "output", "out.txt"));
}

describe("governor run trust", () => {
  it("the sealed, anchored fixture run lifts SIMULATE to EXECUTE (control)", async () => {
    const dir = workspace();
    permitAgentActions(dir, "default");
    expect(latestRunForAgent(dir, "default")?.runId).toBe("run_action_policy_fixture");
    expect(check(dir).effectiveMode).toBe("EXECUTE");
    expect(await nativeWrite(dir)).toBe(true);
  });

  it("a planted VALID run JSON does not lift SIMULATE to EXECUTE", async () => {
    const dir = workspace();
    signPermissiveActionPolicy(dir);
    const planted = { ...observedRunReport("default"), runId: "run_planted", runSealSig: "fixture", reportJsonSha256: "fixture" };
    mkdirSync(getAgentPaths(dir, "default").runsDir, { recursive: true });
    writeFileSync(runPath(dir, "default", "run_planted"), JSON.stringify(planted));
    expect(latestRunForAgent(dir, "default")).toBeNull();
    const decision = check(dir);
    expect(decision.effectiveMode).toBe("SIMULATE");
    expect(decision.reasons.join("\n")).toMatch(/run_planted\.json.*seal/);
    expect(await nativeWrite(dir)).toBe(false);
  });

  it("a tampered signed run is refused, and does not roll back to an older sealed run", () => {
    const dir = workspace();
    permitAgentActions(dir, "default");
    const file = runPath(dir, "default", "run_action_policy_fixture");
    const tampered = { ...JSON.parse(readFileSync(file, "utf8")), runId: "run_action_policy_fixture", ts: Date.now() + 1000, integrityIndex: 0.99 };
    writeFileSync(runPath(dir, "default", "run_tampered"), JSON.stringify(tampered));
    expect(latestTrustedRun(dir, "default").refusal).toMatch(/run_tampered\.json/);
    expect(check(dir).effectiveMode).toBe("SIMULATE");
  });

  it("a sealed run copied from another agent is refused", () => {
    const dir = workspace();
    signPermissiveActionPolicy(dir);
    installObservedRun(dir, "other-agent");
    mkdirSync(getAgentPaths(dir, "default").runsDir, { recursive: true });
    copyFileSync(runPath(dir, "other-agent", "run_action_policy_fixture"), runPath(dir, "default", "run_action_policy_fixture"));
    expect(latestTrustedRun(dir, "default").refusal).toMatch(/other-agent/);
    expect(check(dir).effectiveMode).toBe("SIMULATE");
  });

  it("a sealed run missing from the ledger is refused", () => {
    const dir = workspace();
    signPermissiveActionPolicy(dir);
    writeSealedRun(dir, observedRunReport("default"), { anchor: false });
    expect(latestTrustedRun(dir, "default").refusal).toMatch(/not anchored in the ledger/);
    expect(check(dir).effectiveMode).toBe("SIMULATE");
  });

  it("deleting the newest run file does not roll the gate back to an older passing run", async () => {
    const dir = workspace();
    permitAgentActions(dir, "default");
    const failing = { ...observedRunReport("default"), runId: "run_newer_failing", ts: Date.now() + 1000, integrityIndex: 0.1, trustLabel: "LOW TRUST" as const };
    writeSealedRun(dir, failing);
    expect(check(dir).effectiveMode).toBe("SIMULATE");
    rmSync(runPath(dir, "default", "run_newer_failing"));
    expect(latestTrustedRun(dir, "default")).toEqual({ run: null, refusal: expect.stringMatching(/newer run run_newer_failing with no matching run file/) });
    const decision = check(dir);
    expect(decision.effectiveMode).toBe("SIMULATE");
    expect(decision.reasons.join("\n")).toMatch(/UNTRUSTED RUN: .*run_newer_failing/);
    expect(await nativeWrite(dir)).toBe(false);
  });

  it("another agent's newer run does not block this agent's newest run", () => {
    const dir = workspace();
    permitAgentActions(dir, "default");
    writeSealedRun(dir, { ...observedRunReport("other-agent"), runId: "run_other_agent", ts: Date.now() + 1000 });
    expect(latestTrustedRun(dir, "default")).toMatchObject({ refusal: null, run: { runId: "run_action_policy_fixture" } });
    expect(check(dir).effectiveMode).toBe("EXECUTE");
  });

  it("the trust certificate and audit binder refuse a sealed run copied from another agent", async () => {
    const signCert = (dir: string) => generateTrustCertificate({ workspace: dir, agentId: "default", outputPath: "cert.json", nowTs: Date.now() });
    const binderText = async (dir: string) => JSON.stringify((await collectAuditBinderData({ workspace: dir, scope: { type: "AGENT", id: "default" },
      policy: loadAuditPolicy(dir), map: loadAuditMapActive(dir), nowTs: Date.now() })).binder);
    const control = workspace();
    installObservedRun(control, "default");
    expect(signCert(control).envelope.payload.scoreSourceRunId).toBe("run_action_policy_fixture");
    expect(await binderText(control)).not.toContain("Unverifiable agent diagnostic runs");

    const dir = workspace();
    installObservedRun(dir, "other-agent");
    mkdirSync(getAgentPaths(dir, "default").runsDir, { recursive: true });
    copyFileSync(runPath(dir, "other-agent", "run_action_policy_fixture"), runPath(dir, "default", "run_action_policy_fixture"));
    expect(() => signCert(dir)).toThrow(/sealed for agent other-agent, not default/);
    expect(await binderText(dir)).toContain("block the latest result: diagnostic run run_action_policy_fixture is sealed for agent other-agent");
  });

  it("the trust certificate does not roll back past a deleted newest run", () => {
    const dir = workspace();
    installObservedRun(dir, "default");
    writeSealedRun(dir, { ...observedRunReport("default"), runId: "run_newer_failing", ts: Date.now() + 1000, integrityIndex: 0.1 });
    rmSync(runPath(dir, "default", "run_newer_failing"));
    expect(() => generateTrustCertificate({ workspace: dir, agentId: "default", outputPath: "cert.json" })).toThrow(/newer run run_newer_failing/);
  });

  it("an honest run written by the runner verifies and is the run the governor uses", async () => {
    const dir = workspace();
    const report = await runDiagnostic({ workspace: dir, agentId: "default", window: "14d", targetName: "default", claimMode: "auto" });
    expect(latestTrustedRun(dir, "default")).toEqual({ run: report, refusal: null });
    expect(summarizeGovernorInput(dir, "default").run?.runId).toBe(report.runId);
  });
});
