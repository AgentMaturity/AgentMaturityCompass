/**
 * P1-02 follow-up: a ToolHub call an approval authorizes is journaled, even in a class ToolHub otherwise runs
 * unjournaled (WRITE_LOW). The approval is spent by the journal's recheck, as P1-54 spends it for consequential classes,
 * so a call whose effect fails leaves a journal execution naming the approval that `amc action` can reconcile, instead
 * of an approval consumed by a call with no record.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { openActionJournal } from "../src/actions/actionJournal.js";
import { decideApprovalForIntent, verifyApprovalForExecution } from "../src/approvals/approvalEngine.js";
import { initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { ToolHubService } from "../src/toolhub/toolhubServer.js";
import { toolhubExecutionId } from "../src/toolhub/toolhubJournal.js";
import { workspaceIdFromDirectory } from "../src/workspaces/workspaceId.js";
import { initWorkspace } from "../src/workspace.js";
import { permitAgentActions } from "./helpers/actionPolicyFixtures.js";

const agentId = "approved-write-agent";
const dirs: string[] = [];
afterAll(() => { while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true }); });

function workspace(): string {
  process.env.AMC_VAULT_PASSPHRASE ??= "toolhub-approved-write-pass";
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-approved-write-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initApprovalPolicy(dir);
  initBudgets(dir, agentId);
  permitAgentActions(dir, agentId);
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  mkdirSync(join(dir, "workspace", "output"), { recursive: true });
  return dir;
}

test("an approved WRITE_LOW call whose write fails is journaled with its approval, not consumed unrecorded", async () => {
  const dir = workspace();
  const service = new ToolHubService(dir);
  try {
    // The parent directory does not exist, so the write itself fails.
    const intent = service.createIntent({ initiator: "fixture-operator", agentId, toolName: "fs.write",
      args: { path: "./workspace/output/missing/out.txt", content: "x" }, requestedMode: "EXECUTE" });
    expect(intent.approvalRequestId).toBeTruthy();
    const approvalId = intent.approvalRequestId!;
    decideApprovalForIntent({ workspace: dir, agentId, approvalId, decision: "APPROVED", mode: "EXECUTE", reason: "fixture review",
      userId: "owner-a", username: "owner-a", userRoles: ["OWNER"] });
    const result = await service.executeIntent({ intentId: intent.intentId, approvalRequestId: approvalId }).catch((error: unknown) => ({ thrown: String(error) }));
    expect(result).not.toHaveProperty("thrown");
    const executionId = toolhubExecutionId(workspaceIdFromDirectory(dir), intent.intentId);
    const journal = openActionJournal(dir);
    try {
      const row = journal.get(executionId);
      expect(row).toBeTruthy();
      expect(["outcome_unknown", "completed"]).toContain(row!.state);
    } finally { journal.close(); }
    expect(verifyApprovalForExecution({ workspace: dir, approvalId, expectedAgentId: agentId, expectedIntentId: intent.intentId,
      expectedToolName: "fs.write", expectedActionClass: "WRITE_LOW" }).status).toBe("CONSUMED");
  } finally { service.close(); }
});
