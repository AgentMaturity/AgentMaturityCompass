import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentToolset } from "../src/agent/agentToolset.js";
import { initBudgets } from "../src/budgets/budgets.js";
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

  it("an honest run written by the runner verifies and is the run the governor uses", async () => {
    const dir = workspace();
    const report = await runDiagnostic({ workspace: dir, agentId: "default", window: "14d", targetName: "default", claimMode: "auto" });
    expect(latestTrustedRun(dir, "default")).toEqual({ run: report, refusal: null });
    expect(summarizeGovernorInput(dir, "default").run?.runId).toBe(report.runId);
  });
});
