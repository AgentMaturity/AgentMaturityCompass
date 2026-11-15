import { appendFileSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initBudgets } from "../src/budgets/budgets.js";
import { actionPolicyPath, defaultActionPolicy, initActionPolicy } from "../src/governor/actionPolicyEngine.js";
import { runGovernorCheck } from "../src/governor/governorCli.js";
import { codingActionPolicy } from "../src/setup/starterProfiles.js";
import type { ActionClass } from "../src/types.js";
import { initWorkspace } from "../src/workspace.js";

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
});
