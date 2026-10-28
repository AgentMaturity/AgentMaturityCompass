import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthorizationRecordV1 } from "../../src/actions/authorizationRecord.js";
import { initBudgets } from "../../src/budgets/budgets.js";
import { defaultActionPolicy, initActionPolicy } from "../../src/governor/actionPolicyEngine.js";
import { AUTHZ_DECISION_AUDIT_TYPE, authzDecisionLogEntrySchema, type AuthzDecisionLogEntry } from "../../src/governor/decisionLog.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../../src/ledger/ledgerVerification.js";
import { initToolsConfig } from "../../src/toolhub/toolhubValidators.js";
import { ToolHubService } from "../../src/toolhub/toolhubServer.js";
import { toolEvidenceFor, type ToolEvidenceRecord } from "../../src/tools/toolEvidence.js";
import type { RecordedToolCall, ToolOutcome } from "../../src/tools/toolTypes.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";

/**
 * P2-25: every authorization decision, allow or deny, writes exactly one AuthZEN-shaped AUTHZ_DECISION entry; denies
 * carry reasons; entries sit in the hash-chained ledger; arguments appear only as a digest; agent-supplied metadata
 * never sets a subject field.
 */
const SECRET = "acct-4111-1111-1111-1111";
const record = (overrides: Partial<AuthorizationRecordV1> = {}): AuthorizationRecordV1 => ({
  ...(JSON.parse(readFileSync(join(import.meta.dirname, "..", "fixtures", "contracts", "authorization-record", "valid", "financial-transfer.json"), "utf8")) as AuthorizationRecordV1),
  ...overrides
});
const call = (authorization: RecordedToolCall["authorization"] | undefined): RecordedToolCall => ({
  name: "payments.transfer", actionClass: "FINANCIAL", agentId: "agent-1", arguments: { account: SECRET, amount: "10.00" },
  token: "tok-1", parentToken: null, callId: "call-1", rootCallId: "call-1", effectiveMode: "EXECUTE", workspace: "/unused",
  ...(authorization === undefined ? {} : { authorization })
} as unknown as RecordedToolCall);
const bound = (r: AuthorizationRecordV1) => ({ authorizationId: r.authorizationId, digest: "a".repeat(64), record: r }) as unknown as RecordedToolCall["authorization"];
const allowed: ToolOutcome = { ok: true, exitCode: 0, timedOut: false, denied: null, output: "", bytes: 0 };
const denied = (stage: "guard" | "authorization", reason: string): ToolOutcome =>
  ({ ok: false, exitCode: null, timedOut: false, denied: { stage, reason, guardLabel: null }, output: "", bytes: 0 });
const decisions = (rows: readonly ToolEvidenceRecord[]): AuthzDecisionLogEntry[] => rows.filter((row) => row.meta.auditType === AUTHZ_DECISION_AUDIT_TYPE)
  .map((row) => (JSON.parse(row.payload) as { entry: AuthzDecisionLogEntry }).entry);

describe("tool pipeline decisions", () => {
  it("an allow produces exactly one entry that validates", () => {
    const [entry, ...rest] = decisions(toolEvidenceFor(call(bound(record())), allowed));
    expect(rest).toEqual([]);
    expect(authzDecisionLogEntrySchema.parse(entry)).toMatchObject({ decision: true, reasons: [], subject: { type: "agent", id: "agent-1" },
      action: { name: "FINANCIAL", properties: { tool: "payments.transfer" } }, pdp: { name: "amc" } });
    expect(entry!.context.authorizationRecordDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("a deny produces exactly one entry with its reasons", () => {
    const entries = decisions(toolEvidenceFor(call(bound(record())), denied("authorization", "approval_missing, kill_switch_active")));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ decision: false, reasons: [{ id: "approval_missing" }, { id: "kill_switch_active" }] });
  });

  it("a call refused before its record bound still produces one deny entry; a read the stage never saw produces none", () => {
    const entries = decisions(toolEvidenceFor(call(undefined), denied("authorization", "agent_not_active: agent-1 is suspended")));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ decision: false, context: { authorizationRecordDigest: null, policyDigest: null },
      subject: { properties: { claimKind: "self_reported" } } });
    expect(decisions(toolEvidenceFor(call(undefined), allowed))).toEqual([]);
  });

  it("stores no raw arguments", () => {
    for (const row of toolEvidenceFor(call(bound(record())), allowed).filter((r) => r.meta.auditType === AUTHZ_DECISION_AUDIT_TYPE)) {
      expect(row.payload).not.toContain(SECRET);
      expect(JSON.stringify(row.meta)).not.toContain(SECRET);
    }
  });

  it("agent-supplied metadata cannot set subject fields", () => {
    const forged = record({ agentSuppliedMetadata: { spiffeId: "spiffe://evil.org/x", principal: "human:ceo", governedAs: "root", claimKind: "observed" } });
    const [entry] = decisions(toolEvidenceFor(call(bound(forged)), allowed));
    expect(entry!.subject).toEqual({ type: "agent", id: "agent-1", properties: { spiffeId: null, principal: "human:ops-lead",
      delegationChainDigest: null, claimKind: "self_reported" } });
  });

  it("a v2 lease's SPIFFE ID and chain digest reach the subject as observed", () => {
    const base = record();
    const withChain = record({ delegation: { ...base.delegation, chainDigest: "c".repeat(64), spiffeId: "spiffe://example.org/agent/payments" } });
    const [entry] = decisions(toolEvidenceFor(call(bound(withChain)), allowed));
    expect(entry!.subject.properties).toEqual({ spiffeId: "spiffe://example.org/agent/payments", principal: "human:ops-lead",
      delegationChainDigest: "c".repeat(64), claimKind: "observed" });
  });
});

describe("toolhub decisions in the ledger", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); }
    vi.unstubAllEnvs();
  });

  it("each intent, allowed or denied, writes exactly one entry, and the entries chain in the ledger", () => {
    const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-decision-log-")));
    roots.push(workspace);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "decision-log-fixture-passphrase");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    initBudgets(workspace, "default");
    initActionPolicy(workspace);
    initToolsConfig(workspace);
    const service = new ToolHubService(workspace);
    try {
      const intent = () => service.createIntent({ initiator: "fixture", agentId: "default", toolName: "fs.write",
        args: { path: `./workspace/${SECRET}.txt` }, requestedMode: "EXECUTE" });
      expect(intent().allowed).toBe(true);
      // A signed policy that denies by default and has no WRITE_LOW rule denies the next intent.
      const policy = defaultActionPolicy();
      initActionPolicy(workspace, { ...policy, defaultMode: "DENY", actions: policy.actions.filter((rule) => rule.actionClass !== "WRITE_LOW") });
      expect(intent().allowed).toBe(false);
    } finally {
      service.close();
    }
    const ledger = openLedger(workspace);
    const rows = ledger.getEventsBetween(0, Date.now()).filter((event) => (JSON.parse(event.meta_json) as Record<string, unknown>).auditType === AUTHZ_DECISION_AUDIT_TYPE);
    ledger.close();
    expect(rows).toHaveLength(2);
    const entries = rows.map((row) => authzDecisionLogEntrySchema.parse((JSON.parse(row.payload_inline!) as { entry: unknown }).entry));
    expect(entries.map((entry) => entry.decision)).toEqual([true, false]);
    expect(entries[1]!.reasons.length).toBeGreaterThan(0);
    expect(entries[0]!.context.policyDigest).not.toBe(entries[1]!.context.policyDigest);
    expect(rows.map((row) => row.payload_inline).join("\n")).not.toContain(SECRET);
    expect(verifyLedgerIntegrity(workspace)).toMatchObject({ ok: true });
  });
});
