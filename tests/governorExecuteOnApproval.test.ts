import { appendFileSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initBudgets } from "../src/budgets/budgets.js";
import { actionPolicyPath, defaultActionPolicy, evaluateActionPermission, initActionPolicy } from "../src/governor/actionPolicyEngine.js";
import { runGovernorCheck } from "../src/governor/governorCli.js";
import { codingActionPolicy } from "../src/setup/starterProfiles.js";
import type { ActionClass } from "../src/types.js";
import { initWorkspace } from "../src/workspace.js";
import { observedRunReport } from "./helpers/actionPolicyFixtures.js";

/** `executeOnApproval`: a person's approval stands in for missing evidence, and for nothing else. */
const dirs: string[] = [];
afterEach(() => { while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true }); });

function workspace(policy = codingActionPolicy()): string {
  process.env["AMC_VAULT_PASSPHRASE"] ??= "governor-execute-on-approval";
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-exec-on-approval-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initBudgets(dir, "default");
  initActionPolicy(dir, policy);
  return dir;
}

const check = (dir: string, approvedByPerson: boolean, actionClass: ActionClass = "WRITE_LOW") =>
  runGovernorCheck({ workspace: dir, agentId: "default", actionClass, riskTier: "med", mode: "EXECUTE", approvedByPerson });

describe("executeOnApproval in the signed Action Policy", () => {
  it("runs an approved call as EXECUTE on a fresh workspace and keeps an unapproved one SIMULATE", () => {
    const dir = workspace();
    const unapproved = check(dir, false);
    expect(unapproved.effectiveMode).toBe("SIMULATE");
    expect(unapproved.conditionResults.find((row) => row.conditionId === "person-approval")?.passed).toBe(false);
    const approved = check(dir, true);
    expect(approved.effectiveMode).toBe("EXECUTE");
    expect(approved.reasons.join("\n")).toMatch(/EXECUTE ON A PERSON'S APPROVAL: WRITE_LOW runs because a person approved this call, not on evidence/);
    expect(check(dir, true, "WRITE_HIGH").effectiveMode).toBe("EXECUTE");
    expect(check(dir, true, "DEPLOY").effectiveMode, "a class without the flag").toBe("SIMULATE");
  });

  it("does nothing under the default policy, a simulate-only rule or a policy that no longer verifies", () => {
    expect(check(workspace(defaultActionPolicy()), true).effectiveMode).toBe("SIMULATE");
    const simulateOnly = codingActionPolicy();
    const security = workspace({ ...simulateOnly, actions: simulateOnly.actions.map((rule) =>
      rule.actionClass === "SECURITY" ? { ...rule, executeOnApproval: true, requireExecTicket: false } : rule) });
    expect(check(security, true, "SECURITY").effectiveMode, "allowExecute: false").toBe("SIMULATE");
    const tampered = workspace();
    appendFileSync(actionPolicyPath(tampered), "# edited after signing\n");
    expect(check(tampered, true).effectiveMode).toBe("SIMULATE");
  });

  it("still needs the person's approval once every evidence gate passes (earned evidence never skips it)", () => {
    const coding = codingActionPolicy();
    // Every evidence gate met: no maturity levels, no packs, a tier the trust summary reaches, no sandbox requirement.
    const policy = { ...coding,
      riskTierDefaults: Object.fromEntries(Object.entries(coding.riskTierDefaults).map(([tier, value]) => [tier, { ...value, requireSandboxForExecute: false }])) as typeof coding.riskTierDefaults,
      actions: coding.actions.map((rule) => ({ ...rule, minEffectiveQuestionLevels: {}, requireAssurancePacks: {}, evidenceLogic: undefined, requireTrustTierAtLeast: "SELF_REPORTED" as const })) };
    const decide = (actionClass: ActionClass, approvedByPerson: boolean, rules = policy) => evaluateActionPermission({
      agentId: "default", actionClass, riskTier: "med", targetProfile: null, currentDiagnosticRun: observedRunReport("default"),
      trustSummary: { trustTier: "OBSERVED_HARDENED", sandboxEvidence: true, untrustedConfig: false, correlationRatio: 1 },
      assuranceSummary: { packs: {} }, requestedMode: "EXECUTE", policy: rules, policySignatureValid: true, approvedByPerson });
    const withoutFlag = { ...policy, actions: policy.actions.map((rule) => ({ ...rule, executeOnApproval: undefined })) };
    expect(decide("WRITE_HIGH", false, withoutFlag).effectiveMode, "the evidence alone is enough without the flag").toBe("EXECUTE");
    for (const actionClass of ["WRITE_LOW", "WRITE_HIGH"] as const) {
      const unapproved = decide(actionClass, false);
      expect(unapproved.effectiveMode, actionClass).toBe("SIMULATE");
      expect(unapproved.conditionResults.find((row) => row.conditionId === "person-approval")?.passed).toBe(false);
      const approved = decide(actionClass, true);
      expect(approved.effectiveMode).toBe("EXECUTE");
      expect(approved.reasons.join("\n")).toMatch(new RegExp(`EXECUTE ON A PERSON'S APPROVAL: ${actionClass} runs because a person approved this call\\.`));
    }
  });
});
