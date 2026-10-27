import YAML from "yaml";
import { signAmcConfig } from "../../src/workspace.js";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { bindPurposeProviderKey } from "../../src/keys/purposeProviders.js";
import { withPins } from "../../src/trust/trustContext.js";
import { workspaceKeyTrust } from "../helpers/trustContext.js";
import { AWS_ARN, awsFake, fakeKey } from "../keys/providerFakes.js";
import { openSessionEventStore } from "../../src/persistence/openSessionEventStore.js";
import { SessionService } from "../../src/session/sessionService.js";
import { ToolPipeline } from "../../src/tools/toolPipeline.js";
import { ToolRegistry } from "../../src/tools/toolRegistry.js";
import { toolEvidenceFor } from "../../src/tools/toolEvidence.js";
import { DELETION_TOOL, faultTools } from "../helpers/actionFaults.js";
import { FakeSystemOfRecord } from "../fixtures/actions/fakeSystemOfRecord.js";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import { actionEvidenceCoverage } from "../../src/actions/actionEvidenceCoverage.js";
import { openActionJournal, verifyChainIn, type ActionJournal, type ActionRequest, type Settlement } from "../../src/actions/actionJournal.js";
import { bindAuthorization } from "../../src/actions/authorize.js";
import { ALLOWED_TRANSITIONS, JournalUnavailable, receiptDigest, transitionAllowed, TransitionRefused,
  type ActionReceiptV1, type ReceiptState } from "../../src/actions/receiptStates.js";
import { getPublicKeyPem, verifyHexDigest } from "../../src/crypto/keys.js";
import { openLedger, type Ledger } from "../../src/ledger/ledger.js";
import { runMigrations } from "../../src/ledger/ledgerSchema.js";
import { verifyLedgerIntegrity } from "../../src/ledger/ledgerVerification.js";
import { verifyReceipt } from "../../src/receipts/receipt.js";
import { closeSqlitePool } from "../../src/storage/sqlitePool.js";
import type { ToolExecution } from "../../src/tools/toolTypes.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { canonicalize } from "../../src/utils/json.js";
import { lockVault } from "../../src/vault/vault.js";
import { runMigrations as runV11Migrations } from "../fixtures/actions/ledgerSchemaV11.js";
import { FAULT_ARGUMENTS, PAYMENT_TOOL, prepareFaultWorkspace } from "../helpers/actionFaults.js";

// Direct public journal controls. Local signatures attest to these owned test
// transitions; they do not prove a payment, authenticated reviewer or provider.
const STATES: readonly ReceiptState[] = ["requested", "authorized", "started", "completed", "denied", "cancelled", "outcome_unknown"];
const CONTRACT: Record<ReceiptState | "none", readonly ReceiptState[]> = {
  none: ["requested"], requested: ["authorized", "denied", "cancelled"], authorized: ["started", "denied", "cancelled"],
  started: ["completed", "outcome_unknown"], outcome_unknown: ["completed"], completed: [], denied: [], cancelled: []
};
const FORBIDDEN = (Object.keys(CONTRACT) as Array<ReceiptState | "none">)
  .flatMap(from => STATES.filter(to => !CONTRACT[from].includes(to)).map(to => [from, to] as const));
interface Fixture { root: string; workspace: string; monitor: string; sessionId: string; ledger: Ledger; journal: ActionJournal; release(): void; cold(): void }
const fixtures: Fixture[] = [];
const roots: string[] = [];
const workspaces: string[] = [];

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "amc-p103-receipts-"));
  roots.push(root);
  const home = join(root, "home");
  mkdirSync(home, { mode: 0o700 });
  vi.stubEnv("HOME", home); vi.stubEnv("AMC_HOME", home);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", `owned-receipts-${randomUUID()}`);
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  vi.stubEnv("AMC_NO_SIGN", "0"); vi.stubEnv("AMC_LEDGER_SQLITE_SYNCHRONOUS", "FULL");
  vi.stubEnv("AMC_LEDGER_SQLITE_POOL_SIZE", "1");
  // Named identity prevents another fixture's intentional failed transition
  // from sharing the journal's in-process workspace/agent block map.
  const workspace = join(root, "workspaces", `owned-${randomUUID()}`);
  workspaces.push(workspace);
  prepareFaultWorkspace(workspace);
  roots.push(workspace);
  const monitor = getPublicKeyPem(workspace, "monitor");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", sha256Hex(monitor));
  // Keep the pooled handle first; the journal uses an overflow lease. This
  // also permits an actual cached-connection pragma refusal control below.
  const ledger = openLedger(workspace);
  const journal = openActionJournal(workspace);
  let released = false;
  const f: Fixture = { root, workspace, monitor, sessionId: `owned-native-session-${randomUUID()}`, ledger, journal,
    release() { if (!released) { journal.close(); ledger.close(); released = true; } },
    cold() { f.release(); closeSqlitePool(`ledger:${resolve(workspace)}:${join(workspace, ".amc", "evidence.sqlite")}`); } };
  fixtures.push(f);
  return f;
}

afterEach(() => {
  const errors: unknown[] = [];
  const unsafe = new Set<string>();
  try {
    for (const f of fixtures.splice(0).reverse()) {
      try { f.release(); } catch (error) { errors.push(error); unsafe.add(f.workspace); }
    }
    // Include partially initialized fixtures whose setup failed before their
    // journal/reader pair could be registered above.
    for (const workspace of workspaces.splice(0).reverse()) {
      try {
        closeSqlitePool(`ledger:${resolve(workspace)}:${join(workspace, ".amc", "evidence.sqlite")}`);
        lockVault(workspace);
      } catch (error) { errors.push(error); unsafe.add(workspace); }
    }
    for (const root of roots.splice(0).reverse()) {
      if ([...unsafe].some(workspace => workspace === root || workspace.startsWith(`${root}/`))) continue;
      try { rmSync(root, { recursive: true, force: true }); } catch (error) { errors.push(error); }
    }
  } finally { vi.unstubAllEnvs(); }
  if (errors.length) throw new AggregateError(errors, "Owned receipt fixture cleanup failed");
});

function action(f: Fixture, callId = `owned-call-${randomUUID()}`) {
  const execution: ToolExecution = { token: randomUUID(), callId, rootCallId: callId, parentToken: null,
    workspace: f.workspace, name: PAYMENT_TOOL, agentId: "default", actionClass: "FINANCIAL",
    requestedMode: "EXECUTE", effectiveMode: "EXECUTE", arguments: { ...FAULT_ARGUMENTS[PAYMENT_TOOL] } };
  const bound = bindAuthorization(execution, { sessionId: f.sessionId });
  if (!bound.ok) throw new Error(`Owned journal binding failed: ${bound.reason}`);
  const request: ActionRequest = { executionId: bound.record.executionId, agentId: "default", toolName: PAYMENT_TOOL,
    actionClass: "FINANCIAL", sessionId: f.sessionId, callId, parentExecutionId: null, idempotencyKey: bound.record.idempotencyKey };
  return { ...bound, request, id: bound.record.executionId };
}
type Action = ReturnType<typeof action>;
const result = { effect: "applied" as const, outcomeDigest: sha256Hex("owned local outcome"), externalRef: "owned:effect", reasonCode: "owned_completed" };

function toState(f: Fixture, a: Action, state: ReceiptState | "none"): void {
  if (state === "none") return;
  f.journal.request(a.request);
  if (state === "requested") return;
  if (state === "denied") { f.journal.deny(a.id, "owned_denial"); return; }
  if (state === "cancelled") { f.journal.cancel(a.id, "owned_pre_dispatch_cancel"); return; }
  f.journal.authorize(a.id, a.digest);
  if (state === "authorized") return;
  f.journal.start(a.id, a.record);
  if (state === "completed") f.journal.complete(a.id, result);
  if (state === "outcome_unknown") f.journal.markUnknown(a.id, "owned_ambiguous_outcome");
}
function transition(f: Fixture, a: Action, to: ReceiptState): void {
  switch (to) {
    case "requested": f.journal.request(a.request); break;
    case "authorized": f.journal.authorize(a.id, a.digest); break;
    case "started": f.journal.start(a.id, a.record); break;
    case "completed": f.journal.complete(a.id, result); break;
    case "denied": f.journal.deny(a.id, "owned_denial"); break;
    case "cancelled": f.journal.cancel(a.id, "owned_cancel"); break;
    case "outcome_unknown": f.journal.markUnknown(a.id, "owned_unknown"); break;
  }
}
function logical(db: Database.Database) {
  const schema = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>;
  return { schema, rows: Object.fromEntries(tables.map(({ name }) => [name, db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).all()])) };
}
function settlement(head: ActionReceiptV1, resolution: "adapter" | "operator", evidenceComplete = true): Settlement {
  return { headDigest: receiptDigest(head), resolution, effect: "applied", externalRef: head.externalRef ?? "owned:observed-effect", evidenceComplete,
    reasonCode: "owned_reconciliation", method: "owned-local-observation", evidenceRefs: ["fixture:owned-observation"],
    outcomeDigest: head.outcomeDigest ?? sha256Hex("owned observation, no external provider"), meta: { fixture: "local receipt state qualification" } };
}
function dropCopyTriggers(db: Database.Database, table: string): void {
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name=?").all(table) as Array<{ name: string }>;
  for (const { name } of names) db.exec(`DROP TRIGGER "${name.replaceAll('"', '""')}"`);
}
function coldCopy(f: Fixture): string {
  f.cold();
  // Keep the named workspace identity while copying all actual signed bytes.
  const copy = join(f.root, `copy-${randomUUID()}`, "workspaces", basename(f.workspace));
  mkdirSync(dirname(copy), { recursive: true });
  cpSync(f.workspace, copy, { recursive: true });
  return copy;
}

describe("P1-03 public receipt transitions", () => {
  test("keeps the normative transition table and its explicit repeat/settlement exceptions", () => {
    expect(ALLOWED_TRANSITIONS).toEqual(CONTRACT);
    expect(transitionAllowed({ state: "completed", evidenceComplete: true }, { state: "completed", evidenceComplete: false })).toBe(true);
    expect(transitionAllowed({ state: "completed", evidenceComplete: false }, { state: "completed", evidenceComplete: false })).toBe(false);
    expect(transitionAllowed({ state: "completed", evidenceComplete: false }, { state: "completed", evidenceComplete: true })).toBe(false);
    expect(transitionAllowed({ state: "completed", evidenceComplete: false }, { state: "completed", evidenceComplete: true, resolution: "adapter" })).toBe(true);
    expect(transitionAllowed({ state: "outcome_unknown", evidenceComplete: true }, { state: "completed", evidenceComplete: true })).toBe(false);
    expect(transitionAllowed({ state: "outcome_unknown", evidenceComplete: true }, { state: "completed", evidenceComplete: true, resolution: "operator" })).toBe(true);
    expect(transitionAllowed({ state: "started", evidenceComplete: true }, { state: "cancelled", evidenceComplete: true, resolution: "operator" })).toBe(false);
  });

  test.each(FORBIDDEN)("%s -> %s refuses through the public journal without any persisted write", (from, to) => {
    const f = fixture(), a = action(f);
    toState(f, a, from);
    const before = logical(f.ledger.db);
    expect(() => transition(f, a, to)).toThrow(TransitionRefused);
    expect(logical(f.ledger.db)).toEqual(before);
  });

  test("ordinary completion cannot settle unknown, but an explicitly labelled operator resolution can", () => {
    const f = fixture(), a = action(f);
    toState(f, a, "outcome_unknown");
    const before = logical(f.ledger.db);
    expect(() => f.journal.complete(a.id, result)).toThrow(TransitionRefused);
    expect(logical(f.ledger.db)).toEqual(before);
    const head = f.journal.get(a.id)!.receipts.at(-1)!;
    f.journal.settle(a.id, settlement(head, "operator"));
    expect(f.journal.get(a.id)).toMatchObject({ state: "completed", evidenceComplete: true, effect: "applied" });
    expect(f.journal.verifyReceiptChain(a.id).ok).toBe(true);
    expect(actionEvidenceCoverage(f.workspace, f.sessionId)).toMatchObject({ status: "evaluated", calls: 1, linked: 0, operatorResolved: 1 });
  });

  test("one incomplete repeat preserves the result; only settlement restores it and stale settlement writes nothing", () => {
    const f = fixture(), a = action(f);
    toState(f, a, "completed");
    const incomplete = f.journal.markEvidenceIncomplete(a.id, "owned_recorder_failure");
    expect(incomplete).toMatchObject({ state: "completed", previousState: "completed", effect: "applied", evidenceComplete: false,
      outcomeDigest: result.outcomeDigest, externalRef: result.externalRef });
    const before = logical(f.ledger.db);
    expect(() => f.journal.markEvidenceIncomplete(a.id, "repeat")).toThrow(TransitionRefused);
    expect(logical(f.ledger.db)).toEqual(before);
    const stale = settlement(incomplete, "adapter");
    expect(() => f.journal.settle(a.id, { ...stale, effect: "not_applied" })).toThrow(TransitionRefused);
    expect(logical(f.ledger.db)).toEqual(before);
    f.journal.settle(a.id, stale);
    expect(f.journal.get(a.id)).toMatchObject({ state: "completed", evidenceComplete: true, effect: "applied" });
    const restored = logical(f.ledger.db);
    expect(() => f.journal.settle(a.id, stale)).toThrow(TransitionRefused);
    expect(logical(f.ledger.db)).toEqual(restored);
    expect(f.journal.verifyReceiptChain(a.id).ok).toBe(true);
  });

  test("each real transition binds canonical bytes, the pinned monitor, evidence and its sealed ledger session", () => {
    const f = fixture(), a = action(f);
    toState(f, a, "completed");
    const chain = f.journal.verifyReceiptChain(a.id);
    expect(chain.ok).toBe(true);
    expect(chain.receipts.map(r => r.state)).toEqual(["requested", "authorized", "started", "completed"]);
    const rows = f.ledger.db.prepare(`SELECT t.*, e.session_id, e.event_hash, e.writer_sig, e.payload_inline, e.payload_sha256, e.meta_json,
      s.ended_ts, s.session_final_event_hash, s.session_seal_sig FROM action_transitions t
      JOIN evidence_events e ON e.id=t.evidence_event_id JOIN sessions s ON s.session_id=e.session_id
      WHERE t.execution_id=? ORDER BY t.seq`).all(a.id) as Array<{ seq: number; receipt_json: string; receipt_digest: string;
        session_id: string; event_hash: string; writer_sig: string; payload_inline: string; payload_sha256: string; meta_json: string;
        ended_ts: number | null; session_final_event_hash: string; session_seal_sig: string }>;
    expect(rows).toHaveLength(4);
    rows.forEach((row, seq) => {
      expect(row.seq).toBe(seq);
      expect(row.receipt_json).toBe(canonicalize(chain.receipts[seq]));
      expect(row.receipt_digest).toBe(sha256Hex(row.receipt_json));
      expect(row.payload_inline).toBe(row.receipt_json); expect(row.payload_sha256).toBe(row.receipt_digest);
      expect(row.session_id).toBe(`action-${a.id}-${seq}`);
      expect(row.ended_ts).not.toBeNull(); expect(row.session_final_event_hash).toBe(row.event_hash);
      expect(verifyHexDigest(row.event_hash, row.writer_sig, f.monitor)).toBe(true);
      const meta = JSON.parse(row.meta_json) as Record<string, unknown>;
      expect(meta).toMatchObject({ auditType: "ACTION_STATE", executionId: a.id, seq });
      if (seq === 0) expect(meta).toMatchObject({ agentSessionId: f.sessionId, callId: a.request.callId });
      const receipt = verifyReceipt(String(meta.receipt), [f.monitor]);
      expect(receipt.ok).toBe(true);
      if (!receipt.ok) throw new Error(receipt.error);
      expect(receipt.payload).toMatchObject({ v: 2, kind: "action_state", executionId: a.id, body_sha256: row.receipt_digest,
        event_hash: row.event_hash, session_id: row.session_id, state: chain.receipts[seq]!.state });
    });
    expect(f.journal.get(a.id)!.intent).toMatchObject({ authorizationId: a.record.authorizationId, authorizationDigest: a.digest,
      callId: a.request.callId, sessionId: f.sessionId, argumentsDigest: a.record.action.argumentsDigest });
    expect(getPublicKeyPem(f.workspace, "monitor")).toBe(f.monitor);
    expect(verifyLedgerIntegrity(f.workspace, { expectedMonitorFingerprint: sha256Hex(f.monitor) }).chain.ok).toBe(true);
  });

  test.each(["UPDATE action_transitions SET receipt_digest=receipt_digest WHERE execution_id=?",
    "DELETE FROM action_transitions WHERE execution_id=?"])("actual SQLite append-only protection rejects %s", sql => {
    const f = fixture(), a = action(f); toState(f, a, "completed");
    const before = logical(f.ledger.db);
    expect(() => f.ledger.db.prepare(sql).run(a.id)).toThrow(/action_transitions is append-only/);
    expect(logical(f.ledger.db)).toEqual(before);
  });
});

const ATTACKS = ["deleted", "duplicated", "reordered", "broken-link", "foreign-workspace", "second-terminal", "evidence-session"] as const;
describe("P1-03 signed chain tamper controls on owned cold copies", () => {
  test.each(ATTACKS)("%s gives no receipt-chain or coverage pass", attack => {
    const f = fixture(), a = action(f); toState(f, a, "completed");
    const copy = coldCopy(f), dbPath = join(copy, ".amc", "evidence.sqlite");
    const originalDigest = sha256Hex(readFileSync(join(f.workspace, ".amc", "evidence.sqlite")));
    expect(actionEvidenceCoverage(copy, f.sessionId)).toMatchObject({ status: "evaluated", calls: 1, linked: 1 });
    const db = new Database(dbPath);
    try {
      expect(verifyChainIn({ workspace: copy, db }, a.id).ok).toBe(true);
      dropCopyTriggers(db, "action_transitions");
      const head = db.prepare("SELECT * FROM action_transitions WHERE execution_id=? AND seq=3").get(a.id) as
        { receipt_json: string; receipt_digest: string; evidence_event_id: string };
      if (attack === "deleted") db.prepare("DELETE FROM action_transitions WHERE execution_id=? AND seq=1").run(a.id);
      if (attack === "duplicated") db.prepare("INSERT INTO action_transitions VALUES (?,4,?,?,?)").run(a.id, head.receipt_json, head.receipt_digest, head.evidence_event_id);
      if (attack === "reordered") {
        db.prepare("UPDATE action_transitions SET seq=9 WHERE execution_id=? AND seq=1").run(a.id);
        db.prepare("UPDATE action_transitions SET seq=1 WHERE execution_id=? AND seq=2").run(a.id);
        db.prepare("UPDATE action_transitions SET seq=2 WHERE execution_id=? AND seq=9").run(a.id);
      }
      if (attack === "broken-link" || attack === "foreign-workspace") {
        const row = JSON.parse(head.receipt_json) as ActionReceiptV1;
        const changed = attack === "broken-link" ? { ...row, prevReceiptDigest: "0".repeat(64) } : { ...row, workspaceId: "foreign" };
        const bytes = canonicalize(changed);
        db.prepare("UPDATE action_transitions SET receipt_json=?, receipt_digest=? WHERE execution_id=? AND seq=3").run(bytes, sha256Hex(bytes), a.id);
      }
      if (attack === "second-terminal") {
        const changed = { ...JSON.parse(head.receipt_json), seq: 4, previousState: "completed", state: "denied", prevReceiptDigest: head.receipt_digest };
        const bytes = canonicalize(changed);
        db.prepare("INSERT INTO action_transitions VALUES (?,4,?,?,?)").run(a.id, bytes, sha256Hex(bytes), head.evidence_event_id);
      }
      if (attack === "evidence-session") {
        dropCopyTriggers(db, "evidence_events");
        db.prepare("UPDATE evidence_events SET session_id=? WHERE id=?").run(`action-${a.id}-0`, head.evidence_event_id);
      }
      const verified = verifyChainIn({ workspace: copy, db }, a.id);
      expect(verified.ok).toBe(false); expect(verified.errors.length).toBeGreaterThan(0);
      const expected = { deleted: /expected seq|broken link/, duplicated: /another execution or position|evidence row already used/,
        reordered: /another execution or position/, "broken-link": /broken link/, "foreign-workspace": /receipt names workspace/,
        "second-terminal": /completed -> denied is not an allowed transition/, "evidence-session": /evidence row hash does not verify/ };
      expect(verified.errors.join("; ")).toMatch(expected[attack]);
    } finally { db.close(); }
    const coverage = actionEvidenceCoverage(copy, f.sessionId);
    if (coverage.status === "evaluated") { expect(coverage.linked).toBe(0); expect(coverage.integrityFailures).toBeGreaterThan(0); }
    else expect(coverage.reason).toContain("ledger_integrity_failed");
    expect(sha256Hex(readFileSync(join(f.workspace, ".amc", "evidence.sqlite")))).toBe(originalDigest);
  });
});


async function bindOwnedReaderProvider(workspace: string) {
  const key = fakeKey("p256"), id = AWS_ARN(`outer-reader-${randomUUID()}`), fake = awsFake({ [id]: key });
  const publicKeyPem = key.publicKey.export({ format: "pem", type: "spki" }).toString();
  // Operator choices are fixed before the binding and new provider-authorized artifacts exist.
  const operatorPins = withPins(workspaceKeyTrust(workspace), [{ keyId: signingKeyId(publicKeyPem)!, purposes: ["ledger-row"], origin: "owned independent outer-reader operator" }]);
  const path = join(workspace, ".amc", "amc.config.yaml"), config = YAML.parse(readFileSync(path, "utf8"));
  config.keys = { ...(config.keys ?? {}), refs: { ...(config.keys?.refs ?? {}), "ledger-row": { provider: "aws-kms", id } } };
  writeFileSync(path, YAML.stringify(config)); signAmcConfig(workspace);
  const binding = await bindPurposeProviderKey(workspace, "ledger-row", { passphrase: process.env.AMC_VAULT_PASSPHRASE!,
    provider: awsKmsProvider(fake.call), delegation: { maxEvents: 10_000 } });
  expect(binding.keyId).toBe(signingKeyId(publicKeyPem));
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", "");
  return { binding, operatorPins, fake };
}

describe("P1-03 evidence coverage and durability", () => {
  test("provider-bound public action coverage propagates independent trust through ledger, row loading and every receipt chain", async () => {
    const f = fixture();
    const { operatorPins, binding } = await bindOwnedReaderProvider(f.workspace);
    const a = action(f); toState(f, a, "completed");
    const pinned = { ...operatorPins, asOf: new Date() }, absent = { ...pinned, explicitPins: [] };
    const rows = f.ledger.getAllEvents().filter(row => JSON.parse(row.meta_json).auditType === "ACTION_STATE");
    expect(rows).toHaveLength(4);
    expect(rows.every(row => JSON.parse(row.meta_json).amcKeyDelegation?.sha256 === binding.delegationSha256)).toBe(true);
    expect(verifyChainIn(f.ledger, a.id, { trust: pinned }).ok).toBe(true);
    expect(actionEvidenceCoverage(f.workspace, f.sessionId, { trust: pinned })).toMatchObject({
      status: "evaluated", calls: 1, linked: 1, operatorResolved: 0, unknown: 0, unlinked: 0, integrityFailures: 0, duplicateExecutions: 0
    });
    for (const trust of [absent, undefined]) {
      const coverage = actionEvidenceCoverage(f.workspace, f.sessionId, trust === undefined ? {} : { trust });
      expect(coverage.status).toBe("not_evaluated");
      if (coverage.status !== "not_evaluated") throw new Error("unadmitted provider action evidence was counted");
      expect(coverage.reason).toContain("ledger_integrity_failed");
      expect(coverage.integrityErrors?.join("; ")).toMatch(/issuer.*not-pinned/);
    }
    expect(actionEvidenceCoverage(f.workspace, f.sessionId, { trust: { ...operatorPins, asOf: new Date() } })).toMatchObject({
      status: "evaluated", calls: 1, linked: 1, integrityFailures: 0
    });
  });

  test("zero calls are not evaluated and a real completed chain is linked", () => {
    const f = fixture();
    expect(actionEvidenceCoverage(f.workspace, f.sessionId)).toEqual({ status: "not_evaluated", reason: "no consequential call in this session" });
    const a = action(f); toState(f, a, "completed");
    expect(actionEvidenceCoverage(f.workspace, f.sessionId)).toMatchObject({ status: "evaluated", calls: 1, linked: 1, unknown: 0, unlinked: 0, integrityFailures: 0 });
  });
  test.each(["started", "outcome_unknown", "incomplete"] as const)("%s remains unknown, never linked", state => {
    const f = fixture(), a = action(f);
    toState(f, a, state === "incomplete" ? "completed" : state);
    if (state === "incomplete") f.journal.markEvidenceIncomplete(a.id, "owned_missing_recorder_evidence");
    expect(actionEvidenceCoverage(f.workspace, f.sessionId)).toMatchObject({ status: "evaluated", calls: 1, linked: 0, unknown: 1, integrityFailures: 0 });
  });
  test("two actual completed executions for one call are a duplicate, never linked", () => {
    const f = fixture(), callId = `owned-duplicate-call-${randomUUID()}`;
    toState(f, action(f, callId), "completed");
    toState(f, action(f, callId), "completed");
    expect(actionEvidenceCoverage(f.workspace, f.sessionId)).toMatchObject({ status: "evaluated", calls: 1, linked: 0,
      unknown: 1, duplicateExecutions: 1, integrityFailures: 0 });
  });
  test.each(["NORMAL", "OFF", "NO_SIGN"])("%s refuses journal open without persisted writes", setting => {
    const f = fixture(), before = logical(f.ledger.db);
    if (setting === "NO_SIGN") vi.stubEnv("AMC_NO_SIGN", "1"); else vi.stubEnv("AMC_LEDGER_SQLITE_SYNCHRONOUS", setting);
    expect(() => openActionJournal(f.workspace)).toThrow(JournalUnavailable);
    expect(logical(f.ledger.db)).toEqual(before);
  });
  test("FULL environment cannot disguise a real cached SQLite connection using NORMAL", () => {
    const f = fixture();
    f.ledger.db.pragma("synchronous=NORMAL");
    expect(f.ledger.db.pragma("synchronous", { simple: true })).toBe(1);
    f.release(); // Last pooled handle is now idle; do not close or reconfigure it before the admission read.
    expect(() => openActionJournal(f.workspace)).toThrow(/connection commits with synchronous=1/);
    const probe = openLedger(f.workspace);
    try { expect(probe.db.pragma("synchronous", { simple: true })).toBe(1); } finally { probe.close(); }
  });
});

test("a real historical v11 file migrates to current v13 including action tables, preserves data and is logically idempotent", () => {
  const root = mkdtempSync(join(tmpdir(), "amc-p103-migration-")); roots.push(root);
  const bytes = readFileSync(fileURLToPath(new URL("../fixtures/actions/ledgerSchemaV11.ts", import.meta.url)));
  expect(bytes.length).toBe(20_118);
  expect(sha256Hex(bytes)).toBe("ca6cf29d441657d58eab139fbf85901d2d1124f27a0e0fec9243a979ce2a1bc1");
  const db = new Database(join(root, "historical-v11.sqlite"));
  try {
    runV11Migrations(db);
    expect(db.prepare("SELECT version FROM schema_migrations ORDER BY version").all()).toEqual(Array.from({ length: 11 }, (_, i) => ({ version: i + 1 })));
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'action_%' OR name LIKE 'a4_%')").all()).toEqual([]);
    // Clearly synthetic preservation sentinels, never used as signed evidence or a diagnostic pass.
    db.prepare("INSERT INTO sessions(session_id,started_ts,runtime,binary_path,binary_sha256) VALUES ('synthetic-migration-session',1,'unknown','synthetic-fixture','not-a-real-binary-hash')").run();
    db.prepare(`INSERT INTO evidence_events(id,ts,session_id,runtime,event_type,payload_inline,payload_sha256,meta_json,prev_event_hash,event_hash,writer_sig)
      VALUES ('synthetic-migration-event',1,'synthetic-migration-session','unknown','stdout','synthetic migration sentinel','not-a-real-payload-hash',
      '{"synthetic":true,"source":"migration-fixture"}','not-a-real-prev-hash','not-a-real-event-hash','not-a-signature')`).run();
    db.prepare("INSERT INTO amc_guard_events(id,agent_id,module_code,decision,reason,severity,created_at) VALUES ('synthetic-migration-guard','default','TEST','deny','synthetic migration sentinel','low','1970-01-01T00:00:00.001Z')").run();
    const before = logical(db);
    runMigrations(db);
    expect(db.prepare("SELECT version FROM schema_migrations ORDER BY version").all()).toEqual(Array.from({ length: 13 }, (_, i) => ({ version: i + 1 })));
    for (const name of ["action_executions", "action_transitions", "a4_projects"]) expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name)).toEqual({ name });
    const after = logical(db);
    for (const [name, rows] of Object.entries(before.rows)) {
      if (name === "schema_migrations") expect(after.rows[name]!.slice(0, 11)).toEqual(rows);
      else expect(after.rows[name], name).toEqual(rows);
    }
    for (const entry of before.schema) expect(after.schema).toContainEqual(entry);
    runMigrations(db);
    expect(logical(db)).toEqual(after);
    expect(db.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
  } finally { db.close(); }
});


// Real session and recorder composition with deliberately omitted journal
// dispatch wiring. These are owned keyless file effects, not remote deletions,
// a model run, an authenticated caller, or a fabricated trusted report.
test.each(["absent", "requested-only"] as const)("a genuine dispatch with %s journal evidence is unlinked", async journalEvidence => {
  const f = fixture();
  const callId = `owned-unlinked-call-${randomUUID()}`;
  const sor = new FakeSystemOfRecord(join(f.root, "unlinked-system-of-record.json"));
  const registry = new ToolRegistry();
  for (const definition of faultTools(sor)) registry.define(definition);
  let requestedId: string | null = null;
  if (journalEvidence === "requested-only") registry.guard("owned requested-only receipt", execution => {
    const record = execution.authorization?.record;
    if (record === undefined) throw new Error("owned dispatch did not bind its actual authorization record");
    // Public journal API, tied to the actual call and bound record. It is
    // intentionally never authorized or started by this miscomposed pipeline.
    f.journal.request({ executionId: record.executionId, agentId: execution.agentId, toolName: execution.name,
      actionClass: execution.actionClass, sessionId: f.sessionId, callId: execution.callId,
      parentExecutionId: record.delegation.parentExecutionId, idempotencyKey: record.idempotencyKey });
    requestedId = record.executionId;
    return undefined;
  });
  const store = openSessionEventStore(f.workspace, "sqlite");
  const session = new SessionService(f.workspace, store);
  const recordingErrors: unknown[] = [];
  let recordingCalls = 0;
  let closed = false;
  try {
    session.open({ sessionId: f.sessionId, agentId: "default", harnessVersion: "owned-unlinked-coverage-fixture",
      compositionDigest: sha256Hex("owned journal-less pipeline"), policyDigest: sha256Hex("owned signed tool policy fixture") });
    session.startTurn({ trigger: "user" });
    session.startStep();
    session.recordToolCall({ toolCallId: callId, toolName: DELETION_TOOL, dispatch: "native", parentToken: null,
      args: JSON.stringify(FAULT_ARGUMENTS[DELETION_TOOL]) });
    const pipeline = new ToolPipeline({ workspace: f.workspace, registry,
      // Deliberately no journal callback; the coverage reader must detect the
      // genuine recorded dispatch, not mistake missing wiring for no calls.
      authorizationContext: () => ({ sessionId: f.sessionId }),
      record(execution, outcome) {
        recordingCalls++;
        try {
          for (const row of toolEvidenceFor(execution, outcome)) session.recordProjectedEvidence(row);
        } catch (error) { recordingErrors.push(error); }
      }
    });
    const outcome = await pipeline.execute({ name: DELETION_TOOL, agentId: "default", requestedMode: "EXECUTE",
      arguments: { ...FAULT_ARGUMENTS[DELETION_TOOL] }, callId });
    session.recordToolResult({ toolCallId: callId, outcome: outcome.denied !== null ? "DENIED" : outcome.ok ? "OK" : "ERROR",
      content: outcome.output, exitCode: outcome.exitCode, timedOut: outcome.timedOut, denied: outcome.denied !== null });
    session.endStep({ stopReason: "end_turn", usage: { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0 } });
    session.endTurn({ reason: "complete" });
    session.sealTurn();
    session.close({ reason: "owned unlinked dispatch fixture complete" });
    closed = true;
    expect(outcome).toMatchObject({ ok: true, denied: null, output: "deleted del_1" });
    expect(outcome.action).toBeUndefined();
    expect(recordingCalls).toBe(1);
    // Pipeline contains recorder errors; a successful effect is not sufficient
    // unless the real session recorder also completed every projection write.
    expect(recordingErrors).toEqual([]);
    expect(sor.effects).toHaveLength(1);
    expect(sor.effects[0]).toMatchObject({ kind: "deletion", key: null, ref: "del_1",
      facts: { resourceId: FAULT_ARGUMENTS[DELETION_TOOL].resourceId } });
    expect(sor.effects[0]!.executionId).not.toBeNull();
    const sessionRows = f.ledger.db.prepare("SELECT event_type, meta_json, event_hash, writer_sig FROM evidence_events WHERE session_id = ? ORDER BY rowid")
      .all(f.sessionId) as Array<{ event_type: string; meta_json: string; event_hash: string; writer_sig: string }>;
    expect(sessionRows.filter(row => row.event_type === "tool/call")).toHaveLength(1);
    expect(sessionRows.filter(row => row.event_type === "tool/result")).toHaveLength(1);
    const dispatchRows = sessionRows.filter(row => row.event_type === "audit" && JSON.parse(row.meta_json).auditType === "TOOL_CALL_ALLOWED");
    expect(dispatchRows).toHaveLength(1);
    expect(JSON.parse(dispatchRows[0]!.meta_json)).toMatchObject({ callId, toolName: DELETION_TOOL, actionClass: "DATA_EXPORT" });
    for (const row of sessionRows) expect(verifyHexDigest(row.event_hash, row.writer_sig, f.monitor)).toBe(true);
    const executions = f.ledger.db.prepare("SELECT execution_id FROM action_executions WHERE session_id = ? AND call_id = ?")
      .all(f.sessionId, callId) as Array<{ execution_id: string }>;
    if (journalEvidence === "requested-only") {
      expect(requestedId).not.toBeNull();
      expect(executions).toEqual([{ execution_id: requestedId }]);
      expect(sor.effects[0]!.executionId).toBe(requestedId);
      expect(f.journal.get(requestedId!)?.receipts.map(receipt => receipt.state)).toEqual(["requested"]);
      expect(f.journal.verifyReceiptChain(requestedId!)).toMatchObject({ ok: true, errors: [] });
    } else {
      expect(requestedId).toBeNull();
      expect(executions).toEqual([]);
    }
    expect(getPublicKeyPem(f.workspace, "monitor")).toBe(f.monitor);
    expect(verifyLedgerIntegrity(f.workspace).chain.ok).toBe(true);
    expect(actionEvidenceCoverage(f.workspace, f.sessionId)).toEqual({ status: "evaluated", calls: 1, linked: 0,
      operatorResolved: 0, unknown: 0, unlinked: 1, integrityFailures: 0, duplicateExecutions: 0 });
  } finally {
    // The public writer closes its own session store before the existing
    // fixture cleanup closes the journal/pool and locks/removes the vault.
    if (!closed) session.disposeWithoutClosing();
  }
});
