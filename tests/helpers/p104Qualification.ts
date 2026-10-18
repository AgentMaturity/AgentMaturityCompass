/** Local P1-04 fixtures: actual signed policy/journal and independent owned JSON effects, not a provider or person. */
import { randomUUID, verify } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect } from "vitest";
import { openActionJournal, type ActionJournal } from "../../src/actions/actionJournal.js";
import { receiptDigest, type ActionReceiptV1 } from "../../src/actions/receiptStates.js";
import { requestManualResolution, resolveManually, RESOLVE_TOOL, type ManualResolutionInput } from "../../src/actions/reconcile.js";
import { approvalRequestBindingDigest, listApprovalDecisions, loadApprovalConsumed, loadApprovalRequestRecord } from "../../src/approvals/approvalChainStore.js";
import { decideApprovalForIntent, verifyApprovalForExecution } from "../../src/approvals/approvalEngine.js";
import { getPublicKeyPem } from "../../src/crypto/keys.js";
import { getAgentPaths } from "../../src/fleet/paths.js";
import { openLedger, type Ledger } from "../../src/ledger/ledger.js";
import { closeSqlitePool } from "../../src/storage/sqlitePool.js";
import { initToolsConfig, loadToolsConfig } from "../../src/toolhub/toolhubValidators.js";
import type { ToolsConfig } from "../../src/toolhub/toolsSchema.js";
import { ToolPipeline } from "../../src/tools/toolPipeline.js";
import { ToolRegistry } from "../../src/tools/toolRegistry.js";
import { toolhubAllowlistGuard } from "../../src/tools/guards/policyGuards.js";
import type { RecordedToolCall, ToolExecution, ToolOutcome } from "../../src/tools/toolTypes.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";
import { FAULT_ARGUMENTS, PAYMENT_TOOL, faultTools, prepareFaultWorkspace, type BodyFaults, type FaultTool } from "./actionFaults.js";
import { FakeSystemOfRecord } from "../fixtures/actions/fakeSystemOfRecord.js";

export interface P104Options {
  readonly faults?: BodyFaults;
  readonly recorderFails?: boolean;
  readonly configureTools?: (config: ToolsConfig) => void;
}
export interface P104Fixture {
  root: string; workspace: string; home: string; sessionId: string; monitor: string; auditor: string; oracleFile: string;
  sor: FakeSystemOfRecord; registry: ToolRegistry; pipeline: ToolPipeline; journal: ActionJournal; readonly ledger: Ledger;
  recordings: Array<{ execution: RecordedToolCall; outcome: ToolOutcome }>; beforeEffects: unknown[]; observations: unknown[];
  closeStores(): void;
  run(tool?: FaultTool, args?: Record<string, unknown>): Promise<ToolOutcome>;
  /** The same call through a second pipeline over the same registry and journal whose recorder does not throw. */
  runWithWorkingRecorder(tool?: FaultTool, args?: Record<string, unknown>): Promise<ToolOutcome>;
  finish(success: boolean): void;
}

export function createP104Fixture(options: P104Options = {}): P104Fixture {
  const root = mkdtempSync(join(tmpdir(), "amc-p104-")); chmodSync(root, 0o700);
  const home = join(root, "home"); mkdirSync(home, { mode: 0o700 });
  const workspace = join(root, "workspaces", `p104-${randomUUID()}`);
  const chosen: Record<string, string | undefined> = { HOME: home, AMC_HOME: home,
    AMC_CONTROL_CHECKPOINT_DIR: join(root, "checkpoints"), AMC_VAULT_PASSPHRASE: `p104-owned-${randomUUID()}`,
    AMC_VAULT_PASSPHRASE_FILE: undefined, AMC_VAULT_REMEMBER: "0", AMC_NO_SIGN: "0", AMC_LEDGER_SQLITE_SYNCHRONOUS: "FULL" };
  const prior = Object.fromEntries(Object.keys(chosen).map(key => [key, process.env[key]]));
  const assign = (env: Record<string, string | undefined>): void => {
    for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  };
  assign(chosen);
  let journal: ActionJournal | null = null, ledger: Ledger | null = null, finished = false;
  const recordings: Array<{ execution: RecordedToolCall; outcome: ToolOutcome }> = [];
  const beforeEffects: unknown[] = [], observations: unknown[] = [];
  function closeStores(): void {
    journal?.close(); journal = null; ledger?.close(); ledger = null;
    closeSqlitePool(`ledger:${resolve(workspace)}:${join(workspace, ".amc", "evidence.sqlite")}`);
  }
  try {
    prepareFaultWorkspace(workspace);
    const monitor = getPublicKeyPem(workspace, "monitor"), auditor = getPublicKeyPem(workspace, "auditor");
    // Pins precede this fixture's first request and any optional policy amendment or manual approval.
    if (options.configureTools) { const config = loadToolsConfig(workspace); options.configureTools(config); initToolsConfig(workspace, config); }
    signedArtifact(join(workspace, ".amc", "tools.yaml"), auditor);
    closeStores(); // Initialization's pooled handle must not remain open during a later crash child.
    const oracleFile = join(root, "system-of-record.json"), sor = new FakeSystemOfRecord(oracleFile);
    const sessionId = `p104-session-${randomUUID()}`;
    const registry = new ToolRegistry();
    let f: P104Fixture;
    for (const definition of faultTools(sor, { ...options.faults, beforeEffect: () => {
      const rows = f.ledger.db.prepare("SELECT execution_id FROM action_executions WHERE state = 'started'").all() as Array<{ execution_id: string }>;
      expect(rows).toHaveLength(1);
      const view = f.journal.get(rows[0]!.execution_id)!;
      expect(view.intent?.idempotencyKey).toMatch(/^amc1_[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(view.intent?.owner.pid).toBe(process.pid);
      beforeEffects.push({ view, receipts: checkedChain(f, view.executionId) });
      options.faults?.beforeEffect?.();
    } })) registry.define(definition);
    registry.guard("signed tools allowlist", toolhubAllowlistGuard(workspace, execution => registry.visible(execution.agentId).get(execution.name)));
    const pipelineWith = (recorderFails: boolean): ToolPipeline => new ToolPipeline({ registry, workspace, journal: () => f.journal,
      authorizationContext: () => ({ sessionId }), record: (execution, outcome) => {
        recordings.push({ execution, outcome });
        if (recorderFails) throw new Error("owned P104 recorder unavailable after effect");
      } });
    const pipeline = pipelineWith(options.recorderFails === true);
    f = { root, workspace, home, sessionId, monitor, auditor, oracleFile, sor, registry, pipeline, recordings, beforeEffects, observations,
      get journal(): ActionJournal { return journal ??= openActionJournal(workspace); },
      set journal(value: ActionJournal) { journal = value; },
      get ledger(): Ledger { return ledger ??= openLedger(workspace); },
      closeStores,
      run: (tool: FaultTool = PAYMENT_TOOL, args: Record<string, unknown> = FAULT_ARGUMENTS[tool]) => pipeline.execute({ name: tool,
        agentId: "default", arguments: { ...args }, requestedMode: "EXECUTE" }),
      runWithWorkingRecorder: (tool: FaultTool = PAYMENT_TOOL, args: Record<string, unknown> = FAULT_ARGUMENTS[tool]) =>
        pipelineWith(false).execute({ name: tool, agentId: "default", arguments: { ...args }, requestedMode: "EXECUTE" }),
      finish(success: boolean): void {
        if (finished) return; finished = true;
        const errors: unknown[] = [];
        try { closeStores(); } catch (error) { errors.push(error); }
        try { lockVault(workspace); } catch (error) { errors.push(error); }
        try { writeFileSync(join(root, "observations.json"), JSON.stringify({ success, observations, beforeEffects, recordings,
          oracle: JSON.parse(readFileSync(oracleFile, "utf8")), monitor, auditor, cleanupErrors: errors.map(String) }, null, 2) + "\n", { flag: "wx", mode: 0o600 }); }
        catch (error) { errors.push(error); }
        assign(prior);
        if (success && errors.length === 0) rmSync(root, { recursive: true });
        else console.error("P104 owned fixture retained", JSON.stringify({ root, workspace }));
        if (errors.length) throw new AggregateError(errors, "Owned P104 cleanup/observation failed");
      }
    };
    return f;
  } catch (error) {
    try { closeStores(); } finally { try { lockVault(workspace); } finally { assign(prior); } }
    console.error("P104 setup fixture retained", JSON.stringify({ root, workspace }));
    throw error;
  }
}

/** Independent signature check of the payload bytes; approvals remain local SOFTWARE trust. YAML is verify-only. */
export function signedArtifact(path: string, auditor: string): void {
  const bytes = readFileSync(path);
  const sig = JSON.parse(readFileSync(`${path}.sig`, "utf8")) as { signer: string; digestSha256: string; signature: string };
  expect(sig.signer).toBe("auditor"); expect(sig.digestSha256).toBe(sha256Hex(bytes));
  expect(verify(null, Buffer.from(sig.digestSha256, "hex"), auditor, Buffer.from(sig.signature, "base64"))).toBe(true);
}

export function checkedChain(f: P104Fixture, executionId: string): readonly ActionReceiptV1[] {
  const checked = f.journal.verifyReceiptChain(executionId);
  expect(checked.ok, checked.errors.join("; ")).toBe(true);
  const rows = f.ledger.db.prepare(`SELECT t.receipt_json, t.receipt_digest, e.payload_inline, e.payload_sha256,
    e.event_hash, e.writer_sig, e.meta_json, s.ended_ts FROM action_transitions t
    JOIN evidence_events e ON e.id = t.evidence_event_id JOIN sessions s ON s.session_id = e.session_id
    WHERE t.execution_id = ? ORDER BY t.seq`).all(executionId) as Array<{ receipt_json: string; receipt_digest: string;
      payload_inline: string; payload_sha256: string; event_hash: string; writer_sig: string; meta_json: string; ended_ts: number | null }>;
  expect(rows).toHaveLength(checked.receipts.length);
  checked.receipts.forEach((receipt, i) => {
    const row = rows[i]!;
    expect(row.receipt_json).toBe(canonicalize(receipt)); expect(row.payload_inline).toBe(row.receipt_json);
    expect(row.receipt_digest).toBe(receiptDigest(receipt)); expect(row.payload_sha256).toBe(row.receipt_digest);
    expect(row.ended_ts).not.toBeNull();
    expect(verify(null, Buffer.from(row.event_hash, "hex"), f.monitor, Buffer.from(row.writer_sig, "base64"))).toBe(true);
  });
  expect(getPublicKeyPem(f.workspace, "monitor")).toBe(f.monitor);
  return checked.receipts;
}

/** Authenticate each indexed intent via its signed chain before using its key/id to account for effects. */
export function oracleCounts(f: P104Fixture) {
  const rows = f.ledger.db.prepare("SELECT execution_id, intent_json FROM action_executions WHERE intent_json IS NOT NULL")
    .all() as Array<{ execution_id: string; intent_json: string }>;
  const keys = new Set<string>(), executionIds = new Set<string>();
  for (const row of rows) {
    const chain = checkedChain(f, row.execution_id), view = f.journal.get(row.execution_id)!;
    expect(row.intent_json).toBe(canonicalize(view.intent));
    expect(chain.some(receipt => receipt.state === "started" && receipt.intentDigest === receiptDigest(view.intent!))).toBe(true);
    expect(view.intent?.idempotencyKey).toMatch(/^amc1_[0-9A-HJKMNP-TV-Z]{26}$/);
    executionIds.add(view.executionId); keys.add(view.intent!.idempotencyKey!);
    const recorded = f.recordings.find(call => call.execution.executionId === view.executionId);
    if (recorded) {
      expect(recorded.execution.authorization?.record.idempotencyKey).toBe(view.intent?.idempotencyKey);
      expect(recorded.execution.authorization?.digest).toBe(view.intent?.authorizationDigest);
      expect(recorded.execution.idempotencyKey).toBe(view.intent?.idempotencyKey);
    }
  }
  return { effects: [...f.sor.effects], lookups: f.sor.lookups, duplicateEffects: f.sor.duplicateEffects(),
    effectsWithoutIntent: f.sor.effectsWithoutIntent({ keys, executionIds }), intents: rows.map(row => JSON.parse(row.intent_json)) as unknown[] };
}

/** Real exact-head request and distinct OWNER/AUDITOR decisions, without claiming authenticated human identities. */
export function settleByOperator(f: P104Fixture, id: string, effect: "applied" | "not_applied", externalRef: string | null) {
  const statement: ManualResolutionInput = { workspace: f.workspace, effect, externalRef,
    operatorId: "owned-resolution-operator", note: "The owned JSON oracle was read; this is a local self-reported resolution." };
  const created = requestManualResolution(id, statement);
  const request = loadApprovalRequestRecord({ workspace: f.workspace, agentId: "default", approvalRequestId: created.approvalRequestId });
  expect(created).toMatchObject({ requiredApprovals: 2 });
  const base = join(getAgentPaths(f.workspace, "default").rootDir, "approvals");
  signedArtifact(join(base, "requests", `${created.approvalRequestId}.json`), f.auditor);
  for (const reviewer of [{ id: "owned-owner", role: "OWNER" as const }, { id: "owned-auditor", role: "AUDITOR" as const }]) {
    decideApprovalForIntent({ workspace: f.workspace, agentId: "default", approvalId: created.approvalRequestId,
      decision: "APPROVED", mode: "EXECUTE", reason: "Review only this owned exact-head resolution",
      userId: reviewer.id, username: reviewer.id, userRoles: [reviewer.role], expectedRequestDigestSha256: approvalRequestBindingDigest(request) });
  }
  const decisions = listApprovalDecisions({ workspace: f.workspace, agentId: "default", approvalRequestId: created.approvalRequestId });
  expect(decisions).toHaveLength(2); expect(new Set(decisions.map(decision => decision.userId)).size).toBe(2);
  for (const decision of decisions) signedArtifact(join(base, "decisions", `${decision.approvalDecisionId}.json`), f.auditor);
  signedArtifact(join(base, "requests", `${created.approvalRequestId}.json`), f.auditor);
  expect(verifyApprovalForExecution({ workspace: f.workspace, approvalId: created.approvalRequestId, expectedAgentId: "default",
    expectedToolName: RESOLVE_TOOL, expectedActionClass: request.actionClass, expectedIntentHash: request.boundHashes.intentHash }).ok).toBe(true);
  const receipt = resolveManually(id, { ...statement, approvalRequestId: created.approvalRequestId });
  expect(receipt).toMatchObject({ state: "completed", effect, evidenceComplete: true, resolution: "operator" });
  expect(loadApprovalConsumed({ workspace: f.workspace, agentId: "default", approvalRequestId: created.approvalRequestId })?.executionId).toBe(id);
  const row = f.ledger.db.prepare(`SELECT e.meta_json FROM action_transitions t JOIN evidence_events e ON e.id = t.evidence_event_id
    WHERE t.execution_id = ? ORDER BY t.seq DESC LIMIT 1`).get(id) as { meta_json: string };
  expect(JSON.parse(row.meta_json)).toMatchObject({ trustTier: "SELF_REPORTED", claimKind: "self_reported", resolution: "operator" });
  checkedChain(f, id); f.observations.push({ kind: "manual-resolution", created, request, decisions, receipt });
  return receipt;
}
