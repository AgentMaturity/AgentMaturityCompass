import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { agentToolset } from "../src/agent/agentToolset.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { runDoctorRules } from "../src/doctor/doctorRules.js";
import { buildOperatingProfile } from "../src/domains/operatingProfiles/index.js";
import { fragmentWeakenings } from "../src/domains/operatingProfiles/operatingProfileActivation.js";
import { inspectActionEvidenceLogic } from "../src/enforce/actionEvidenceLogic.js";
import { buildControlProjection } from "../src/enforce/controlProjection.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import {
  actionPolicyPath, defaultActionPolicy, deriveTrustSummaryFromRun, evaluateActionPermission, loadActionPolicy, signActionPolicy, summarizeGovernorInput,
} from "../src/governor/actionPolicyEngine.js";
import { actionPolicyRuleSchema, actionPolicySchema, runIntegrityAtLeast } from "../src/governor/actionPolicySchema.js";
import { runGovernorCheck } from "../src/governor/governorCli.js";
import { openLedger } from "../src/ledger/ledger.js";
import { BUILT_IN_POLICY_PACKS } from "../src/policyPacks/builtInPacks.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { simulateTargetWhatIf } from "../src/simulator/targetWhatIf.js";
import { generateFullOpenApiSpec } from "../src/studio/openapi.js";
import type { ActionClass, DiagnosticReport } from "../src/types.js";
import { initWorkspace } from "../src/workspace.js";
import {
  baselineRunReport, installObservedRun, observedRunReport, signOwnerWaiverPolicy, signPermissiveActionPolicy, writeSealedRun,
} from "./helpers/actionPolicyFixtures.js";

/**
 * The per-rule run-integrity threshold (the AXR-02 trust-gate decision). A rule's `requireRunIntegrityAtLeast` (absent: 0.6,
 * the HIGH TRUST line) is what the agent's latest sealed, ledger-anchored run must reach before that class may EXECUTE.
 * Below 0.6 is an owner waiver that every decision names. No threshold admits a refused run history, a run that failed
 * ledger verification or violated the trust boundary, or no run at all; a waiver never covers findings against the agent.
 */
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const SESSION = "run-integrity-rule-session";
const UNRELIABLE = "UNRELIABLE — DO NOT USE FOR CLAIMS";

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] ??= "governor-run-integrity-pass";
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-run-integrity-")));
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
const check = (dir: string, actionClass: ActionClass = "WRITE_LOW") =>
  runGovernorCheck({ workspace: dir, agentId: "default", actionClass, riskTier: "med", mode: "EXECUTE" });
const runIntegrity = (decision: ReturnType<typeof check>) => decision.conditionResults.find((row) => row.conditionId === "run-integrity");
const waivedReasons = (decision: ReturnType<typeof check>) => decision.reasons.filter((reason) => /WAIVED/.test(reason));

async function nativeWrite(dir: string): Promise<boolean> {
  const toolset = agentToolset({ workspace: dir, agentId: "default", sessionId: SESSION });
  try {
    await toolset.pipeline.execute({ name: "fs.write", agentId: "default", arguments: { path: "workspace/output/out.txt", content: "x" }, requestedMode: "EXECUTE" });
  } finally {
    toolset.close();
  }
  return existsSync(join(dir, "workspace", "output", "out.txt"));
}

describe("per-rule run-integrity threshold", () => {
  it("the schema bounds the threshold, absent means 0.6, and the default policy and its YAML carry no key", () => {
    const rule = { actionClass: "WRITE_LOW" };
    for (const bad of [1.5, -0.1, "0.3", null]) {
      expect(actionPolicyRuleSchema.safeParse({ ...rule, requireRunIntegrityAtLeast: bad }).success, String(bad)).toBe(false);
    }
    const absent = actionPolicyRuleSchema.parse(rule);
    expect(absent.requireRunIntegrityAtLeast).toBeUndefined();
    expect(runIntegrityAtLeast(absent)).toBe(0.6);
    expect(runIntegrityAtLeast(actionPolicyRuleSchema.parse({ ...rule, requireRunIntegrityAtLeast: 0 }))).toBe(0);
    expect(defaultActionPolicy().actions.some((row) => "requireRunIntegrityAtLeast" in row)).toBe(false);
    expect(YAML.stringify(defaultActionPolicy())).not.toContain("requireRunIntegrityAtLeast");
  });

  it("an owner waiver lifts EXECUTE over a sealed, anchored baseline run and names itself", async () => {
    const dir = workspace();
    signOwnerWaiverPolicy(dir);
    writeSealedRun(dir, baselineRunReport("default"));
    const decision = check(dir);
    expect(decision.effectiveMode).toBe("EXECUTE");
    expect(decision.reasons).toContain(`RUN INTEGRITY WAIVED: the signed WRITE_LOW rule sets requireRunIntegrityAtLeast 0 (AMC default 0.6); latest trusted run run_baseline has integrity 0.000 (${UNRELIABLE}).`);
    expect(runIntegrity(decision)).toMatchObject({ passed: true, actual: 0, expected: 0 });
    expect(await nativeWrite(dir)).toBe(true);

    // The waiver is per class: WRITE_HIGH keeps the 0.6 default and stays SIMULATE.
    const writeHigh = check(dir, "WRITE_HIGH");
    expect(writeHigh.effectiveMode).toBe("SIMULATE");
    expect(runIntegrity(writeHigh)).toMatchObject({ passed: false, actual: 0, expected: 0.6 });
    expect(writeHigh.reasons).toContain(`UNTRUSTED RUN: latest trusted run run_baseline has integrity 0.000 (${UNRELIABLE}), below 0.6.`);
    expect(waivedReasons(writeHigh)).toEqual([]);
  });

  it("a waiver needs a sealed, anchored run: with no run every threshold fails (G1)", async () => {
    const dir = workspace();
    signOwnerWaiverPolicy(dir);
    const decision = check(dir);
    expect(decision.effectiveMode).toBe("SIMULATE");
    expect(decision.reasons).toContain("UNTRUSTED RUN: agent default has no trusted diagnostic run.");
    expect(waivedReasons(decision)).toEqual([]);
    expect(runIntegrity(decision)).toMatchObject({ passed: false, actual: null, expected: 0 });
    expect(await nativeWrite(dir)).toBe(false);

    // A run the caller holds but that carries no finite index (the runner's scores-only stub) is no run either.
    const policy = loadActionPolicy(dir);
    const trust = { trustTier: "SELF_REPORTED" as const, sandboxEvidence: false, untrustedConfig: false, correlationRatio: 0 };
    const base = { agentId: "default", actionClass: "WRITE_LOW" as const, riskTier: "med" as const, targetProfile: null, trustSummary: trust,
      assuranceSummary: { packs: {} }, requestedMode: "EXECUTE" as const, policy, policySignatureValid: true };
    const stub = evaluateActionPermission({ ...base, currentDiagnosticRun: { questionScores: [] } as unknown as DiagnosticReport });
    expect(stub.effectiveMode).toBe("SIMULATE");
    expect(stub.reasons).toContain("UNTRUSTED RUN: agent default has no trusted diagnostic run.");
    const notANumber = evaluateActionPermission({ ...base, currentDiagnosticRun: { ...observedRunReport("default"), integrityIndex: Number.NaN } });
    expect(notANumber.effectiveMode).toBe("SIMULATE");
    expect(runIntegrity(notANumber)).toMatchObject({ passed: false, actual: null });
  });

  it("a refused run history stays a hard gate under threshold 0, wherever the trust summary is derived (G5)", async () => {
    const dir = workspace();
    signOwnerWaiverPolicy(dir);
    const planted = { ...baselineRunReport("default"), runId: "run_planted", runSealSig: "fixture", reportJsonSha256: "fixture" };
    mkdirSync(getAgentPaths(dir, "default").runsDir, { recursive: true });
    writeFileSync(runPath(dir, "default", "run_planted"), JSON.stringify(planted));
    const decision = check(dir);
    expect(decision.effectiveMode).toBe("SIMULATE");
    expect(decision.reasons.join("\n")).toMatch(/run_planted\.json.*seal/);
    expect(decision.conditionResults).toContainEqual(expect.objectContaining({
      conditionId: "action-policy-signature", passed: false, reason: expect.stringMatching(/run history cannot vouch for its configuration: .*run_planted\.json/),
    }));
    expect(await nativeWrite(dir)).toBe(false);
    expect(deriveTrustSummaryFromRun(dir, "default", null)).toMatchObject({ untrustedConfig: true, runRefusal: expect.stringMatching(/run_planted\.json.*seal/) });

    // What-if predicts the hard gate the live decision applies, and names the same refusal.
    const cell = simulateTargetWhatIf({ workspace: dir, agentId: "default", proposedTarget: {} }).governor.matrix
      .find((row) => row.actionClass === "WRITE_LOW" && row.riskTier === "med");
    expect(cell?.executeAllowed).toBe(false);
    expect(cell?.executeReasons.join("\n")).toMatch(/run_planted\.json.*seal/);
  });

  it("deleting the newest run file does not roll a waived class back to an older run (G5)", async () => {
    const dir = workspace();
    signOwnerWaiverPolicy(dir);
    installObservedRun(dir, "default");
    writeSealedRun(dir, { ...observedRunReport("default"), runId: "run_newer_failing", ts: Date.now() + 1000, integrityIndex: 0.1, trustLabel: "LOW TRUST" });
    rmSync(runPath(dir, "default", "run_newer_failing"));
    const decision = check(dir);
    expect(decision.effectiveMode).toBe("SIMULATE");
    expect(decision.reasons.join("\n")).toMatch(/UNTRUSTED RUN: .*run_newer_failing/);
    expect(decision.requiredEvidence.join("\n")).toMatch(/Restore the agent's run history: its newest sealed run must be ledger-anchored and verify/);
    expect(decision.requiredEvidence.join("\n")).not.toMatch(/Re-sign/);
    expect(await nativeWrite(dir)).toBe(false);
  });

  it("no threshold admits a run that failed ledger verification, is not VALID or violated the trust boundary", () => {
    const BOUNDARY_FIX = "Fix: set security.trustBoundaryMode: isolated in .amc/amc.config.yaml (only when the monitor and auditor keys are isolated from the evaluated agent), re-sign it with amc verify --sign-config, then run a new score run (amc run --score-only)";
    const cases: Array<[Partial<DiagnosticReport>, string]> = [
      [{ runId: "run_unverified", verificationPassed: false }, "UNTRUSTED RUN: latest trusted run run_unverified failed ledger verification (status VALID)."],
      [{ runId: "run_invalid", status: "INVALID" }, "UNTRUSTED RUN: latest trusted run run_invalid is not VALID (status INVALID) although its ledger verification passed."],
      [{ runId: "run_boundary", trustBoundaryViolated: true, trustBoundaryMessage: "x" }, `UNTRUSTED RUN: latest trusted run run_boundary violated the trust boundary: x. ${BOUNDARY_FIX}.`],
      // M-2: the boundary marks the run INVALID while its ledger verification passed; the boundary is the cause, not the ledger.
      [{ runId: "run_boundary_invalid", status: "INVALID", verificationPassed: true, trustBoundaryViolated: true, trustBoundaryMessage: "runtime and signing keys are not marked isolated" },
        `UNTRUSTED RUN: latest trusted run run_boundary_invalid violated the trust boundary: runtime and signing keys are not marked isolated. ${BOUNDARY_FIX}.`],
      // A run that does not record the boundary result is not read as within it.
      [{ runId: "run_unbounded", trustBoundaryViolated: undefined }, "UNTRUSTED RUN: latest trusted run run_unbounded records no trust-boundary result."],
    ];
    for (const [fields, reason] of cases) {
      const dir = workspace();
      signOwnerWaiverPolicy(dir);
      writeSealedRun(dir, { ...baselineRunReport("default"), ...fields });
      const decision = check(dir);
      expect(decision.effectiveMode, reason).toBe("SIMULATE");
      expect(decision.reasons).toContain(reason);
      expect(deriveTrustSummaryFromRun(dir, "default", summarizeGovernorInput(dir, "default").run)).toMatchObject({ untrustedConfig: true });
    }
  });

  it("a waiver never covers findings against the agent; at the default the label still vouches as before (G2)", () => {
    const findings: Array<[Partial<DiagnosticReport>, string]> = [
      [{ contradictionCount: 2 }, "2 contradictions"],
      [{ unsupportedClaimCount: 1 }, "1 unsupported claims"],
      [{ inflationAttempts: [{ questionId: "AMC-1.7", claimed: 3, supported: 0 }] }, "1 inflation attempts"],
      [{ invalidReceiptsCount: 1 }, "1 invalid receipts"],
    ];
    for (const [fields, named] of findings) {
      const waived = workspace();
      signOwnerWaiverPolicy(waived);
      writeSealedRun(waived, { ...baselineRunReport("default"), ...fields });
      const decision = check(waived);
      expect(decision.effectiveMode, named).toBe("SIMULATE");
      expect(runIntegrity(decision)).toMatchObject({ passed: false, reason: expect.stringContaining(`does not cover findings against the agent (${named})`) });
      expect(decision.reasons.join("\n")).toContain(`findings against the agent (${named}) are not covered by the WRITE_LOW rule's threshold 0`);
      expect(decision.requiredEvidence.join("\n")).toMatch(/without findings against it/);
      expect(waivedReasons(decision)).toEqual([]);

      const atDefault = workspace();
      signPermissiveActionPolicy(atDefault);
      writeSealedRun(atDefault, { ...observedRunReport("default"), ...fields });
      expect(check(atDefault).effectiveMode, named).toBe("EXECUTE");
    }
    // A count the run does not carry is never read as zero under a waiver.
    const { contradictionCount: _omitted, ...unrecorded } = baselineRunReport("default");
    const dir = workspace();
    signOwnerWaiverPolicy(dir);
    writeSealedRun(dir, unrecorded as DiagnosticReport);
    const decision = check(dir);
    expect(decision.effectiveMode).toBe("SIMULATE");
    expect(decision.reasons.join("\n")).toContain("findings against the agent (contradictions not recorded)");
  });

  it("a threshold the run meets lifts EXECUTE and is named; just below it does not", () => {
    const meets = workspace();
    signOwnerWaiverPolicy(meets, ["WRITE_LOW"], 0.3);
    writeSealedRun(meets, { ...baselineRunReport("default"), runId: "run_x", integrityIndex: 0.3 });
    const passed = check(meets);
    expect(passed.effectiveMode).toBe("EXECUTE");
    expect(passed.reasons).toContain(`RUN INTEGRITY WAIVED: the signed WRITE_LOW rule sets requireRunIntegrityAtLeast 0.3 (AMC default 0.6); latest trusted run run_x has integrity 0.300 (${UNRELIABLE}).`);

    const below = workspace();
    signOwnerWaiverPolicy(below, ["WRITE_LOW"], 0.3);
    writeSealedRun(below, { ...baselineRunReport("default"), runId: "run_x", integrityIndex: 0.299 });
    const failed = check(below);
    expect(failed.effectiveMode).toBe("SIMULATE");
    expect(failed.reasons).toContain(`UNTRUSTED RUN: latest trusted run run_x has integrity 0.299 (${UNRELIABLE}), below 0.3.`);
    expect(failed.requiredEvidence).toContain('A sealed amc run for this agent with integrity >= 0.3; see docs/GOVERNOR.md "Reaching EXECUTE".');
  });

  it("a threshold above the default is met by the number, not by the HIGH TRUST label", () => {
    const strong = workspace();
    signOwnerWaiverPolicy(strong, ["WRITE_LOW"], 0.9);
    installObservedRun(strong, "default");
    const passed = check(strong);
    expect(passed.effectiveMode).toBe("EXECUTE");
    expect(waivedReasons(passed)).toEqual([]);

    const labelled = workspace();
    signOwnerWaiverPolicy(labelled, ["WRITE_LOW"], 0.9);
    writeSealedRun(labelled, { ...observedRunReport("default"), runId: "run_x", integrityIndex: 0.65 });
    const failed = check(labelled);
    expect(failed.effectiveMode).toBe("SIMULATE");
    expect(failed.reasons).toContain("UNTRUSTED RUN: latest trusted run run_x has integrity 0.650 (HIGH TRUST), below 0.9.");
    expect(failed.requiredEvidence).toContain('A sealed amc run for this agent with integrity >= 0.9 (HIGH TRUST); see docs/GOVERNOR.md "Reaching EXECUTE".');
  });

  it("at the default the gate is today's: integrity 0.6 or the HIGH TRUST label", () => {
    for (const [integrityIndex, trustLabel] of [[0.7, "LOW TRUST"], [0.55, "HIGH TRUST"]] as const) {
      const dir = workspace();
      signPermissiveActionPolicy(dir);
      writeSealedRun(dir, { ...observedRunReport("default"), runId: "run_x", integrityIndex, trustLabel });
      const decision = check(dir);
      expect(decision.effectiveMode, `${integrityIndex} ${trustLabel}`).toBe("EXECUTE");
      expect(runIntegrity(decision)).toMatchObject({ passed: true, actual: integrityIndex, expected: 0.6 });
      expect(waivedReasons(decision)).toEqual([]);
    }
  });

  it("a fresh workspace under the default policy names the missing run as the rule's condition, not a signature failure", () => {
    const dir = workspace();
    const decision = check(dir, "READ_ONLY");
    expect(decision.effectiveMode).toBe("SIMULATE");
    expect(decision.conditionResults).toContainEqual(expect.objectContaining({ conditionId: "action-policy-signature", passed: true }));
    expect(runIntegrity(decision)).toMatchObject({ passed: false, actual: null, expected: 0.6 });
    expect(decision.reasons).toContain("UNTRUSTED RUN: agent default has no trusted diagnostic run.");
    expect(waivedReasons(decision)).toEqual([]);
    expect(decision.requiredEvidence.join("\n")).toMatch(/integrity >= 0\.6 \(HIGH TRUST\)/);
  });

  it("a configuration-signature failure is not reported as a run problem", () => {
    const dir = workspace();
    // ToolHub's shape when tools.yaml does not verify: the run summary with its own signature failure OR-ed in.
    const decision = evaluateActionPermission({
      agentId: "default", actionClass: "WRITE_LOW", riskTier: "med", currentDiagnosticRun: null, targetProfile: null,
      trustSummary: { ...summarizeGovernorInput(dir, "default").trust, untrustedConfig: true }, assuranceSummary: { packs: {} },
      requestedMode: "EXECUTE", policy: loadActionPolicy(dir), policySignatureValid: true,
    });
    expect(decision.effectiveMode).toBe("SIMULATE");
    expect(decision.reasons).toContain("UNTRUSTED CONFIG: the policy/config signatures or the agent's trusted run do not vouch for it. EXECUTE is denied.");
    expect(decision.reasons.join("\n")).not.toMatch(/UNTRUSTED RUN/);
    expect(decision.requiredEvidence).toContain("Re-sign policy/config files and rerun amc verify.");
    expect(decision.conditionResults).toContainEqual(expect.objectContaining({
      conditionId: "action-policy-signature", passed: false, reason: "Action Policy or dependent configuration trust verification failed.",
    }));
  });

  it("amc policy controls projects each class's threshold and names a waiver", () => {
    const dir = workspace();
    const when = () => buildControlProjection(dir).families.flatMap((family) => family.controls).find((row) => row.controlId === "action:WRITE_LOW")?.when;
    expect(when()).toContain("mandatory: trusted-run integrity at least 0.6");
    signOwnerWaiverPolicy(dir);
    expect(when()).toContain("mandatory: trusted-run integrity at least 0 (owner waiver below the 0.6 default)");
  });

  it("profile activation reports a lowered threshold as a widening and a raised one as none", () => {
    const base = buildOperatingProfile({ station: "wealth", agentId: "default" }).proposedSignedConfigs;
    const withThreshold = (value: number | undefined) => {
      const configs = structuredClone(base);
      const rule = (configs.actionPolicy as { actions: Array<Record<string, unknown>> }).actions.find((row) => row.actionClass === "WRITE_LOW")!;
      if (value === undefined) delete rule.requireRunIntegrityAtLeast;
      else rule.requireRunIntegrityAtLeast = value;
      return configs;
    };
    const widened = (from: number | undefined, to: number | undefined) =>
      fragmentWeakenings(withThreshold(from), withThreshold(to)).filter((line) => line.includes("requireRunIntegrityAtLeast"));
    expect(widened(undefined, 0.3)).toEqual(["actionPolicy: actions[WRITE_LOW].requireRunIntegrityAtLeast absent -> 0.3"]);
    expect(widened(undefined, 0.6)).toEqual([]);
    expect(widened(undefined, 0.9)).toEqual([]);
    expect(widened(0.9, undefined)).toEqual(["actionPolicy: actions[WRITE_LOW].requireRunIntegrityAtLeast 0.9 -> absent"]);
  });

  it("amc doctor warns on every rule below 0.6 and on a signed policy that does not parse (G3)", async () => {
    const fresh = workspace();
    const plain = await runDoctorRules(fresh);
    expect(plain.checks.map((row) => row.id)).not.toContain("action-policy-run-integrity-waiver");
    expect(plain.checks.map((row) => row.id)).not.toContain("action-policy-parse");

    const waived = workspace();
    signOwnerWaiverPolicy(waived);
    const report = await runDoctorRules(waived);
    const row = report.checks.find((candidate) => candidate.id === "action-policy-run-integrity-waiver");
    expect(row).toMatchObject({ status: "WARN", message: expect.stringContaining("READ_ONLY=0, WRITE_LOW=0") });
    expect(row?.fixHint).toContain("amc fix-signatures");
    expect(report.ok).toBe(plain.ok);

    const garbled = workspace();
    writeFileSync(actionPolicyPath(garbled), "version: 1\nactions: not-a-list\n");
    signActionPolicy(garbled);
    const unparsed = (await runDoctorRules(garbled)).checks.find((candidate) => candidate.id === "action-policy-parse");
    expect(unparsed).toMatchObject({ status: "WARN", message: expect.stringContaining("every governed class is denied") });
  });

  it("the evidence-logic API lists run-integrity among the mandatory gates, and both OpenAPI documents count it", () => {
    const gates = inspectActionEvidenceLogic({ workspace: workspace(), actionClass: "WRITE_LOW" }).mandatoryGates;
    expect(gates).toContain("run-integrity");
    type Spec = { components: { schemas: Record<string, { properties: Record<string, unknown> }> } };
    const generated = generateFullOpenApiSpec() as unknown as Spec;
    const published = YAML.parse(readFileSync("website/openapi.yaml", "utf8")) as Spec;
    for (const [name, spec] of [["generated", generated], ["published", published]] as const) {
      for (const schema of ["ActionEvidenceLogicInspection", "ActionEvidenceLogicCompilation"]) {
        expect(spec.components.schemas[schema]?.properties.mandatoryGates, `${name} ${schema}`).toMatchObject({ minItems: gates.length, maxItems: gates.length });
      }
    }
  });

  it("every built-in policy pack keeps the 0.6 run-integrity default on every rule (G7)", () => {
    for (const pack of BUILT_IN_POLICY_PACKS) {
      const policy = actionPolicySchema.parse(pack.actionPolicy);
      expect(policy.actions.map(runIntegrityAtLeast), pack.id).toEqual(policy.actions.map(() => 0.6));
    }
  });
});
