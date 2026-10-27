/**
 * Owned P2-24 fixture: a keyed workspace with signed policies and two FINANCIAL payment tools, a tool pipeline whose
 * compiled-policy guard pins a typed plan with one control (C) that denies every call unless a deviation covers it,
 * and helpers that record approval decisions bound to the exact request digest. The tool body only appends to an
 * in-memory list; no payment or external service is invoked. Reviewer ids are fixture data, not authenticated people.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { vi } from "vitest";
import { decideApprovalForIntent } from "../../src/approvals/approvalEngine.js";
import { initApprovalPolicy } from "../../src/approvals/approvalPolicyEngine.js";
import { initBudgets } from "../../src/budgets/budgets.js";
import type { ActiveCompiledPolicy } from "../../src/catalog/compiler/activate.js";
import { initActionPolicy } from "../../src/governor/actionPolicyEngine.js";
import type { BoundApproval } from "../../src/governor/boundRecords.js";
import { issueScopedException, requestScopedException, type ScopedExceptionV1 } from "../../src/governor/scopedExceptions.js";
import { openLedger, type Ledger } from "../../src/ledger/ledger.js";
import { closeSqlitePool } from "../../src/storage/sqlitePool.js";
import { initToolsConfig } from "../../src/toolhub/toolhubValidators.js";
import { compiledPolicyDenial, compiledPolicyFacts } from "../../src/tools/guards/compiledPolicyGuard.js";
import { toolEvidenceFor } from "../../src/tools/toolEvidence.js";
import { ToolPipeline, type ToolCallInput } from "../../src/tools/toolPipeline.js";
import { defineTool, ToolRegistry } from "../../src/tools/toolRegistry.js";
import type { ToolExecution, ToolOutcome } from "../../src/tools/toolTypes.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";

export const AGENT = "default";
export const REFUND = "payments.refund";
const TRANSFER = "payments.transfer";
export const CONTROL = "L1-PAY-01";
export const OWNER = { id: "fixture-owner", role: "OWNER" as const };
export const AUDITOR = { id: "fixture-auditor", role: "AUDITOR" as const };

const roots: string[] = [];
const ledgers: Ledger[] = [];

/** A typed plan whose only guard (control C) is one this pipeline does not implement, so it denies unless waived. */
export function planWithControl(review: "pending" | "approved" = "pending"): ActiveCompiledPolicy {
  return {
    revision: 1, entrySha256: "b".repeat(64), planDigest: `sha256:${"c".repeat(64)}`, profileSha256: "d".repeat(64),
    lockDigest: `sha256:${"e".repeat(64)}`, deployment: null,
    controls: [{ controlId: CONTROL, controlVersion: "1.0.0", points: ["tool_pipeline"], compiledPoints: ["tool_pipeline"], review }],
    runtimePolicy: {
      policyDigest: `sha256:${"a".repeat(64)}`,
      toolPipeline: { visibleTools: [REFUND, TRANSFER], approvalRequiredFor: [], guards: [{ id: "p224-fixture-control", params: {}, controlIds: [CONTROL] }] },
      approvals: {},
      egress: { mode: "deny_by_default", allowHosts: [], processorAllowlist: [], controlIds: [] },
      deletion: { unknownHold: "deny", retentionDays: {}, controlIds: [] },
      proposedSignedConfigs: { approvalPolicy: null, budgets: null, tools: null, actionPolicy: null, firewall: null, opsPolicy: null }
    }
  };
}

export interface GovernanceFixture {
  readonly workspace: string;
  readonly plan: ActiveCompiledPolicy;
  readonly ledger: Ledger;
  readonly sessionId: string;
  readonly bodies: ToolExecution[];
  readonly registry: ToolRegistry;
  readonly pipeline: ToolPipeline;
  execute(input?: Partial<ToolCallInput>): Promise<ToolOutcome>;
}

export function governanceFixture(plan: ActiveCompiledPolicy = planWithControl()): GovernanceFixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p224-")));
  roots.push(root);
  const home = join(root, "home");
  mkdirSync(home, { mode: 0o700 });
  vi.stubEnv("HOME", home);
  vi.stubEnv("AMC_HOME", home);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "p224-owned-governance-fixture");
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  vi.stubEnv("AMC_NO_SIGN", "0");
  const workspace = join(root, "workspace");
  initWorkspace({ workspacePath: workspace, agentId: AGENT, trustBoundaryMode: "isolated" });
  initActionPolicy(workspace);
  initBudgets(workspace, AGENT);
  initApprovalPolicy(workspace);
  const bindingFields = { amount: "amount", currency: "currency", recipient: "recipient", resourceId: "resourceId" };
  initToolsConfig(workspace, { tools: { version: 1, denyByDefault: true,
    allowedTools: [REFUND, TRANSFER].map((name) => ({ name, actionClass: "FINANCIAL" as const, bindingFields: { ...bindingFields } })) } });
  const ledger = openLedger(workspace);
  ledgers.push(ledger);
  const sessionId = `p224-${randomUUID()}`;
  ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "p224-fixture", binarySha256: "f".repeat(64) });
  const registry = new ToolRegistry();
  const bodies: ToolExecution[] = [];
  for (const name of [REFUND, TRANSFER]) registry.define(defineTool({ name, description: "Records the call in memory only", actionClass: "FINANCIAL",
    body: (execution) => { bodies.push(execution); return { output: "fixture effect recorded", effect: "applied" }; } }));
  registry.guard("compiled-policy", (execution) => compiledPolicyDenial(plan, workspace, execution));
  const pipeline = new ToolPipeline({ registry, workspace, authorizationContext: () => ({ sessionId, compiledPolicy: compiledPolicyFacts(plan) }),
    record: (execution, outcome) => {
      for (const row of toolEvidenceFor(execution, outcome)) ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: row.eventType,
        inline: true, payload: row.payload, payloadExt: "json", meta: row.meta });
    } });
  return { workspace, plan, ledger, sessionId, bodies, registry, pipeline,
    execute: (input = {}) => pipeline.execute({ name: REFUND, agentId: AGENT, requestedMode: "EXECUTE", ...input,
      arguments: { amount: "80.00", currency: "USD", recipient: "acme-001", resourceId: "invoice-001", ...input.arguments } }) };
}

export function cleanupGovernanceFixtures(): void {
  for (const ledger of ledgers.splice(0)) {
    try { ledger.close(); } catch { /* already closed */ }
  }
  for (const root of roots.splice(0)) {
    const workspace = join(root, "workspace");
    try {
      closeSqlitePool(`ledger:${resolve(workspace)}:${join(workspace, ".amc", "evidence.sqlite")}`);
      lockVault(workspace);
    } catch { /* fixture never finished setup */ }
    rmSync(root, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
}

/** Record one decision per reviewer, each bound to the exact request digest the approval names. */
export function decideBound(workspace: string, approval: BoundApproval, reviewers: readonly { id: string; role: "OWNER" | "AUDITOR" }[],
  decision: "APPROVED" | "DENIED" = "APPROVED"): void {
  for (const reviewer of reviewers) decideApprovalForIntent({ workspace, agentId: approval.agentId, approvalId: approval.approvalRequestId,
    decision, mode: "EXECUTE", reason: "P2-24 fixture decision on the exact request", userId: reviewer.id, username: reviewer.id,
    userRoles: [reviewer.role], expectedRequestDigestSha256: approval.requestBindingDigest });
}

/** A scoped exception for control C on the refund tool, max 100.00 USD, approved by the SECURITY quorum and issued. */
export async function issueRefundException(workspace: string, overrides: { maxAmount?: { value: string; currency: string } | null;
  controlVersion?: string } = {}): Promise<ScopedExceptionV1> {
  const now = Date.now();
  const { draft, approval } = await requestScopedException(workspace, {
    control: { controlId: CONTROL, controlVersion: overrides.controlVersion ?? "1.0.0" },
    scope: { agentIds: [AGENT], toolNames: [REFUND], actionClasses: ["FINANCIAL"], resourceIds: null,
      maxAmount: overrides.maxAmount === undefined ? { value: "100.00", currency: "USD" } : overrides.maxAmount },
    window: { notBefore: new Date(now - 1000).toISOString(), notAfter: new Date(now + 24 * 3600_000).toISOString() },
    reason: "Refunds under 100 USD during the fixture; any resource, since refunds name no fixed invoice set",
    compensatingControls: ["daily refund reconciliation"], requestedBy: "fixture-requester"
  });
  decideBound(workspace, approval, [OWNER, AUDITOR]);
  return issueScopedException(workspace, draft, approval);
}
