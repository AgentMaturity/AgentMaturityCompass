import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { initWorkspace } from "../../src/workspace.js";
import { budgetsPath, defaultBudgets, signBudgetsConfig } from "../../src/budgets/budgets.js";
import { initApprovalPolicy } from "../../src/approvals/approvalPolicyEngine.js";
import { decideApprovalForIntent } from "../../src/approvals/approvalEngine.js";
import { listApprovalRequests } from "../../src/approvals/approvalChainStore.js";
import { writeRuntimeFirewallPolicy } from "../../src/runtime/firewall.js";
import { defaultToolsConfig } from "../../src/toolhub/toolsSchema.js";
import { initToolsConfig, loadVerifiedToolsConfigSnapshot } from "../../src/toolhub/toolhubValidators.js";
import { loadNativeValidationConfiguration } from "../../src/setup/nativeValidationConfig.js";

export type OutcomeCase = "success" | "nonzero" | "denied" | "budget";
/** Disposable signed operator policy. No production credential or external model. */
export function validationOperatorFixture(workspace: string, mode: OutcomeCase) {
  mkdirSync(workspace, { recursive: true });
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  const budget = defaultBudgets("default");
  if (mode === "budget") budget.budgets.perAgent.default!.daily.maxToolExecutes.WRITE_HIGH = 0;
  writeFileSync(budgetsPath(workspace), YAML.stringify(budget)); signBudgetsConfig(workspace);
  initApprovalPolicy(workspace);
  writeRuntimeFirewallPolicy({ workspace, mode: "block" });
  const command = `printf validation-outcome > validation-effect; printf validation-outcome; exit ${mode === "nonzero" ? 7 : 0}`;
  const tools = defaultToolsConfig();
  tools.tools.allowedTools = tools.tools.allowedTools.filter(tool => tool.name === "bash");
  // Narrow the shipped shell declaration to this exact fixture command. Keep
  // all shipped denials; do not disable policy, budget, approvals or signatures.
  tools.tools.allowedTools[0]!.deny!.argvRegexDenylist!.push(`^(?!${command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$)[\\s\\S]*$`);
  initToolsConfig(workspace, tools);
  const checks = join(workspace, "operator-checks.json");
  writeFileSync(checks, JSON.stringify({ schemaVersion: 1, checks: [{ id: "public", title: "Exact operator fixture", command, timeoutMs: 15000 }] }));
  const loaded = loadNativeValidationConfiguration(checks);
  return { checks, sha256: loaded.sha256, toolsDigest: loadVerifiedToolsConfigSnapshot(workspace).digestSha256!,
    effect: () => existsSync(join(workspace, "validation-effect")) ? readFileSync(join(workspace, "validation-effect"), "utf8") : null };
}

/** Automated fixture approvers, not human evidence. Existing signed quorum is unchanged. */
export function observeFixtureApprovals(workspace: string, mode: OutcomeCase) {
  const handled = new Set<string>();
  const errors: unknown[] = [];
  let decisions = 0;
  const timer = setInterval(() => {
    try {
      for (const request of listApprovalRequests({ workspace, agentId: "default" })) {
        if (request.status !== "PENDING" || handled.has(request.approvalRequestId)) continue;
        handled.add(request.approvalRequestId);
        if (request.toolName !== "bash" || request.actionClass !== "WRITE_HIGH" || request.requiredApprovals !== 2) {
          throw new Error("Unexpected fixture approval identity or quorum; no decision was granted.");
        }
        for (const user of ["validation-fixture-ada", "validation-fixture-grace"]) {
          decideApprovalForIntent({ workspace, agentId: "default", approvalId: request.approvalRequestId,
            decision: mode === "denied" ? "DENIED" : "APPROVED", mode: "EXECUTE",
            reason: "Automated validation regression fixture decision, not a human trial.", username: user, userId: user, userRoles: ["APPROVER"] });
          decisions++;
          if (mode === "denied") break;
        }
      }
    } catch (error) { errors.push(error); clearInterval(timer); }
  }, 25);
  return { stop: () => { clearInterval(timer); return { errors, decisions, requests: handled.size }; } };
}
