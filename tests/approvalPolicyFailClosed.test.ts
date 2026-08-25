import { mkdtempSync, rmSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import {
  initApprovalPolicy,
  approvalPolicyPath,
  verifyApprovalPolicySignature
} from "../src/approvals/approvalPolicyEngine.js";
import { createApprovalForIntent } from "../src/approvals/approvalEngine.js";

/**
 * Deleting a file must never widen what an agent may do.
 *
 * `createApprovalForIntent` bootstrapped a default policy whenever the failure
 * reason merely CONTAINED "missing" — which matched "approval policy signature
 * missing", i.e. a policy that exists but is unsigned. On that path
 * `initApprovalPolicy` overwrites the operator's rules with the default AND
 * signs the default, so removing a .sig file silently replaced a deliberate
 * policy with a permissive one and gave it a valid signature.
 *
 * An unsigned-but-present policy is tampering or a broken deployment. The only
 * correct response is to refuse.
 */
const PASS = "approval-policy-fail-closed-pass";

function withWorkspace<T>(fn: (workspace: string) => T): T {
  const prior = process.env["AMC_VAULT_PASSPHRASE"];
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const workspace = mkdtempSync(join(tmpdir(), "amc-approval-policy-"));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  try {
    return fn(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
    if (prior === undefined) delete process.env["AMC_VAULT_PASSPHRASE"];
    else process.env["AMC_VAULT_PASSPHRASE"] = prior;
  }
}

const intent = (workspace: string) => ({
  workspace,
  agentId: "default",
  intentId: "intent-1",
  toolName: "delete_bucket",
  actionClass: "WRITE_HIGH" as const,
  requestedMode: "EXECUTE" as const,
  effectiveMode: "EXECUTE" as const,
  riskTier: "high" as const,
  intentPayload: { bucket: "production" }
});

describe("approval policy verification fails closed", () => {
  it("bootstraps a default only when there is NO policy at all", () => {
    withWorkspace((workspace) => {
      // A fresh workspace with no approval policy may legitimately get one.
      expect(verifyApprovalPolicySignature(workspace).reason).toBe("approval policy missing");
      const created = createApprovalForIntent(intent(workspace));
      expect(created.approval.status).toBe("PENDING");
      expect(verifyApprovalPolicySignature(workspace).valid).toBe(true);
    });
  });

  it("REFUSES when a policy exists but its signature was removed", () => {
    withWorkspace((workspace) => {
      initApprovalPolicy(workspace);
      const policyPath = approvalPolicyPath(workspace);
      const operatorPolicy = readFileSync(policyPath, "utf8");

      // The attack: delete only the signature.
      const sigPath = `${policyPath}.sig`;
      expect(existsSync(sigPath)).toBe(true);
      unlinkSync(sigPath);
      expect(verifyApprovalPolicySignature(workspace).reason).toBe("approval policy signature missing");

      expect(
        () => createApprovalForIntent(intent(workspace)),
        "an unsigned policy must not be silently repaired"
      ).toThrow(/policy signature invalid/);

      // And crucially: the operator's policy is STILL THEIRS. The old path
      // overwrote it with the default and signed that.
      expect(readFileSync(policyPath, "utf8"), "the operator's policy must survive").toBe(operatorPolicy);
      expect(existsSync(sigPath), "and must not be re-signed behind their back").toBe(false);
    });
  });

  it("names the fix rather than only the failure", () => {
    withWorkspace((workspace) => {
      initApprovalPolicy(workspace);
      unlinkSync(`${approvalPolicyPath(workspace)}.sig`);
      // An operator hitting this at 3am needs the command, not a diagnosis.
      expect(() => createApprovalForIntent(intent(workspace))).toThrow(/amc approvals policy sign/);
    });
  });
});
