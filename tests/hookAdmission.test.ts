/** P1-23: `checkHookAdmission`, the UserPromptSubmit admission check. Every failed check refuses; a healthy workspace admits. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { approvalPolicyPath } from "../src/approvals/approvalPolicyEngine.js";
import { createFreezeIncident } from "../src/drift/freezeEngine.js";
import { checkHookAdmission } from "../src/bridge/hookAdmission.js";
import { revokeLeaseForCli } from "../src/leases/leaseCli.js";
import { agentId, claudeWorkspace } from "./helpers/claudeCodeHookFixtures.js";
import { removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

afterEach(removeFixtureWorkspaces);

const leaseOf = (workspace: string) => JSON.parse(readFileSync(join(workspace, ".amc", "hooks", "claude-code.json"), "utf8")) as { leaseId: string; leaseExpiresTs: number };

describe("Claude Code UserPromptSubmit admission", () => {
  test("a healthy workspace admits", () => {
    expect(checkHookAdmission(claudeWorkspace(), agentId, Date.now())).toEqual({ admitted: true });
  });

  test("an expired lease blocks", () => {
    const workspace = claudeWorkspace();
    expect(checkHookAdmission(workspace, agentId, leaseOf(workspace).leaseExpiresTs + 1)).toEqual({ admitted: false, reason: "the hook lease has expired" });
  });

  test("a revoked lease and another agent's lease block", () => {
    const workspace = claudeWorkspace();
    expect(checkHookAdmission(workspace, "someone-else", Date.now())).toMatchObject({ admitted: false, reason: expect.stringContaining("hook lease is not valid") });
    revokeLeaseForCli({ workspace, leaseId: leaseOf(workspace).leaseId, reason: "P1-23 admission test" });
    expect(checkHookAdmission(workspace, agentId, Date.now())).toMatchObject({ admitted: false, reason: expect.stringContaining("lease revoked") });
  });

  test("a tampered Approval Policy signature blocks", () => {
    const workspace = claudeWorkspace();
    writeFileSync(approvalPolicyPath(workspace), `${readFileSync(approvalPolicyPath(workspace), "utf8")}\n# tampered\n`);
    expect(checkHookAdmission(workspace, agentId, Date.now())).toEqual({ admitted: false, reason: "the Approval Policy signature does not verify" });
  });

  test("an active freeze blocks", () => {
    const workspace = claudeWorkspace();
    const incident = createFreezeIncident({ workspace, agentId, ruleId: "p1-23-admission", previousRunId: "a", currentRunId: "b",
      deltas: { overallDrop: 1, integrityDrop: 0, correlationDrop: 0, maxLayerDrop: 1 }, actionClasses: ["WRITE_LOW"], reason: "P1-23 admission test" });
    expect(checkHookAdmission(workspace, agentId, Date.now())).toEqual({ admitted: false, reason: `a freeze is active (${incident.incidentId})` });
  });
});
