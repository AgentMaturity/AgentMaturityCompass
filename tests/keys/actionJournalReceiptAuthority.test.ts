/** Actual ActionJournal lifecycle; receipt-core nested Ledger alone does not qualify these cases. */
import { sign, verify } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { reconcile } from "../../src/actions/reconcile.js";
import { FakeSystemOfRecord } from "../fixtures/actions/fakeSystemOfRecord.js";
import { PAYMENT_ADAPTER } from "../helpers/actionFaults.js";
import { actionEvidenceCoverage } from "../../src/actions/actionEvidenceCoverage.js";
import { JournalUnavailable, TransitionRefused } from "../../src/actions/receiptStates.js";
import { parseReceipt, verifyReceipt } from "../../src/receipts/receipt.js";
import { parseReceiptTransport } from "../../src/receipts/receiptTransport.js";
import { getPurposeKeyHistory } from "../../src/keys/signingKeys.js";
import { parseReceiptAuthority, RECEIPT_AUTHORITY_CURRENT } from "../../src/keys/receiptAuthority.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { ToolPipeline } from "../../src/tools/toolPipeline.js";
import { defineTool, ToolRegistry } from "../../src/tools/toolRegistry.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { PAYMENT_TOOL, FAULT_ARGUMENTS } from "../helpers/actionFaults.js";
import { publicPem } from "./providerFakes.js";
import { JOURNAL_PASS, actionReceiptFixture, cleanupActionReceiptFixtures } from "../helpers/actionJournalReceiptFixture.js";
afterEach(() => { try { vi.restoreAllMocks(); cleanupActionReceiptFixtures(); } finally { vi.unstubAllEnvs(); } });

test("default actual journal lifecycle retains exact literal v2 two-part Ed receipt bytes", () => {
  const f = actionReceiptFixture(false), { journal, ledger } = f.open(), a = f.action(); f.finish(journal, a);
  const chain = journal.verifyReceiptChain(a.id); expect(chain.ok, chain.errors.join("; ")).toBe(true);
  expect(chain.receipts.map(r => r.state)).toEqual(["requested", "authorized", "started", "completed"]);
  const rows = ledger.db.prepare("SELECT t.*, e.* FROM action_transitions t JOIN evidence_events e ON e.id=t.evidence_event_id WHERE t.execution_id=? ORDER BY t.seq").all(a.id) as Array<{ receipt_json: string; receipt_digest: string; meta_json: string; ts: number; event_hash: string; session_id: string }>;
  for (const [seq, row] of rows.entries()) {
    const meta = JSON.parse(row.meta_json), action = chain.receipts[seq]!;
    // Independently pin the old canonical JSON field order, including the nested enforcement object.
    const literal = { agentId: "default", authorizationRecordDigest: action.authorizationDigest, body_sha256: row.receipt_digest,
      enforcement: { boundary: "tool-pipeline", level: "enforced" }, event_hash: row.event_hash, executionId: a.id,
      idempotencyKey: a.request.idempotencyKey, kind: "action_state", model: null, providerId: "amc-action-journal", receipt_id: meta.receipt_id,
      session_id: row.session_id, state: action.state, ts: row.ts, v: 2 };
    const bytes = Buffer.from(JSON.stringify(literal)), signature = sign(null, bytes, f.legacyPrivate);
    expect(meta.receipt).toBe(`${bytes.toString("base64url")}.${signature.toString("base64url")}`);
    expect(row.receipt_json).toBe(canonicalize(action)); expect(row.receipt_digest).toBe(sha256Hex(row.receipt_json));
  }
  expect(actionEvidenceCoverage(f.workspace, f.sessionId)).toMatchObject({ status: "evaluated", calls: 1, linked: 1 });
});
test("real internal receipt owner serves actual journal lifecycle locally and preserves independent child-domain crypto", async () => {
  const f = actionReceiptFixture(); await f.own(); const requests = f.fake.requests.length;
  const { journal, ledger } = f.open(), a = f.action(); f.finish(journal, a);
  expect(journal.verifyReceiptChain(a.id)).toMatchObject({ ok: true, errors: [] });
  const rows = ledger.db.prepare("SELECT e.*, s.ended_ts, s.session_final_event_hash, s.session_seal_sig FROM action_transitions t JOIN evidence_events e ON e.id=t.evidence_event_id JOIN sessions s ON s.session_id=e.session_id WHERE t.execution_id=? ORDER BY t.seq").all(a.id) as Array<{ meta_json: string; event_hash: string; session_final_event_hash: string; ended_ts: number }>;
  expect(rows).toHaveLength(4);
  for (const row of rows) {
    const meta = JSON.parse(row.meta_json), parsed = parseReceiptTransport(meta.receipt);
    const bytes = Buffer.concat([Buffer.from("AMC_LEDGER_RECEIPT_V1\0", "ascii"), Buffer.from(sha256Hex(parsed.authorityBytes), "hex"), parsed.payloadBytes]);
    expect(verify(null, bytes, parsed.signed.authority.childPublicKeyPem, parsed.signature)).toBe(true);
    expect(verifyReceipt(meta.receipt, [publicPem(f.a)]).ok).toBe(true);
    expect(verifyReceipt(meta.receipt, [parsed.signed.authority.childPublicKeyPem]).ok).toBe(false);
    expect(getPurposeKeyHistory(f.workspace, "receipt")).not.toContain(parsed.signed.authority.childPublicKeyPem);
    expect(row.ended_ts).not.toBeNull(); expect(row.session_final_event_hash).toBe(row.event_hash);
  }
  expect(f.fake.requests).toHaveLength(requests);
  expect(actionEvidenceCoverage(f.workspace, f.sessionId, { trust: f.trust() })).toMatchObject({ status: "evaluated", calls: 1, linked: 1 });
});
test.each(["requested", "started"] as const)("real %s action transition SQL failure rolls back all four tables and restores", async state => {
  const f = actionReceiptFixture(); await f.own(); const { journal, ledger } = f.open(), a = f.action();
  if (state === "started") { journal.request(a.request); journal.authorize(a.id, a.digest); }
  ledger.db.exec(`CREATE TRIGGER owned_journal_refusal BEFORE INSERT ON action_transitions WHEN json_extract(NEW.receipt_json,'$.state')='${state}' BEGIN SELECT RAISE(ABORT,'owned journal transition refused'); END;`);
  const before = f.state(ledger.db);
  try { expect(() => state === "requested" ? journal.request(a.request) : journal.start(a.id, a.record)).toThrow(JournalUnavailable); expect(f.state(ledger.db)).toEqual(before); }
  finally { ledger.db.exec("DROP TRIGGER owned_journal_refusal"); }
  if (state === "requested") journal.request(a.request); else journal.start(a.id, a.record);
  expect(journal.verifyReceiptChain(a.id).ok).toBe(true);
});
test("actual journal savepoint failure preserves its observed real outer transaction and sentinel", async () => {
  const f = actionReceiptFixture(); await f.own(); const { journal, ledger } = f.open(), a = f.action();
  ledger.db.exec("CREATE TABLE owned_outer_sentinel(value TEXT); CREATE TRIGGER owned_authorize_refusal BEFORE INSERT ON action_transitions WHEN json_extract(NEW.receipt_json,'$.state')='authorized' BEGIN SELECT RAISE(ABORT,'owned authorize refused'); END;");
  ledger.db.exec("BEGIN IMMEDIATE");
  try {
    ledger.db.prepare("INSERT INTO owned_outer_sentinel VALUES (?)").run("outer-owned"); journal.request(a.request);
    expect(() => journal.authorize(a.id, a.digest)).toThrow(JournalUnavailable);
    expect(ledger.db.inTransaction).toBe(true); expect(ledger.db.prepare("SELECT * FROM owned_outer_sentinel").all()).toEqual([{ value: "outer-owned" }]);
    expect(journal.get(a.id)?.state).toBe("requested"); ledger.db.exec("ROLLBACK");
  } finally { if (ledger.db.inTransaction) ledger.db.exec("ROLLBACK"); ledger.db.exec("DROP TRIGGER owned_authorize_refusal"); }
  expect(ledger.db.prepare("SELECT * FROM action_executions WHERE execution_id=?").all(a.id)).toEqual([]);
  expect(ledger.db.prepare("SELECT * FROM owned_outer_sentinel").all()).toEqual([]);
  f.finish(journal, a); expect(journal.verifyReceiptChain(a.id).ok).toBe(true);
});
test("an already-open unlocked default journal refuses no-sign before SQL and restores", () => {
  const f = actionReceiptFixture(false), { journal, ledger } = f.open(), a = f.action(), before = f.state(ledger.db);
  vi.stubEnv("AMC_NO_SIGN", "1");
  expect(() => journal.request(a.request)).toThrow("AMC_NO_SIGN=1: an unsigned receipt attests to nothing"); expect(f.state(ledger.db)).toEqual(before);
  vi.stubEnv("AMC_NO_SIGN", "0"); f.finish(journal, a); expect(journal.verifyReceiptChain(a.id).ok).toBe(true);
});
test.each(["locked", "no-sign", "expired", "renewed"] as const)("live actual %s authority refuses stale journal insertion and fresh reopen restores", async state => {
  const f = actionReceiptFixture(); await f.own({ hours: 1 / 60 }); const { journal, ledger } = f.open(), a = f.action();
  const cert = parseReceiptAuthority(readFileSync(join(f.workspace, RECEIPT_AUTHORITY_CURRENT))), before = f.state(ledger.db);
  let clock: { mockRestore(): void } | undefined;
  try {
    if (state === "locked") { vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); lockVault(f.workspace); }
    if (state === "no-sign") vi.stubEnv("AMC_NO_SIGN", "1");
    if (state === "expired") clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse(cert.authority.notAfter));
    if (state === "renewed") await f.own();
    expect(() => journal.request(a.request)).toThrow(); expect(f.state(ledger.db)).toEqual(before);
  } finally { clock?.mockRestore(); vi.stubEnv("AMC_NO_SIGN", "0"); vi.stubEnv("AMC_VAULT_PASSPHRASE", JOURNAL_PASS); unlockVault(f.workspace, JOURNAL_PASS); }
  const fresh = f.open(), next = f.action(); f.finish(fresh.journal, next); expect(fresh.journal.verifyReceiptChain(next.id).ok).toBe(true); expect(fresh.journal.verifyReceiptChain(a.id).receipts).toHaveLength(0);
});
test("after actual body effect a late no-sign completion keeps started and incomplete evidence without replay", async () => {
  const f = actionReceiptFixture(); await f.own(); const { journal, ledger } = f.open();
  const registry = new ToolRegistry(); const effect = join(f.root, "actual-effect.json");
  registry.define(defineTool({ name: PAYMENT_TOOL, description: "Owned actual effect", actionClass: "FINANCIAL", body: execution => {
    writeFileSync(effect, JSON.stringify({ executionId: execution.executionId, idempotencyKey: execution.idempotencyKey })); vi.stubEnv("AMC_NO_SIGN", "1");
    return { ok: true, output: "owned effect", effect: "applied" as const, externalRef: "owned:effect" };
  } }));
  const pipeline = new ToolPipeline({ registry, workspace: f.workspace, journal: () => journal, authorizationContext: () => ({ sessionId: f.sessionId }) });
  const result = await pipeline.execute({ name: PAYMENT_TOOL, agentId: "default", requestedMode: "EXECUTE", arguments: { ...FAULT_ARGUMENTS[PAYMENT_TOOL] } });
  expect(JSON.parse(readFileSync(effect, "utf8")).executionId).toBe(result.action?.executionId);
  expect(result.action).toMatchObject({ state: "started", evidenceComplete: false });
  vi.stubEnv("AMC_NO_SIGN", "0"); const stored = journal.get(result.action!.executionId)!;
  expect(stored.receipts.map(row => row.state)).toEqual(["requested", "authorized", "started"]);
  expect(journal.blockingExecutions({ workspaceId: journal.workspaceId, agentId: "default" })).toContain(result.action!.executionId);
  expect(ledger.db.prepare("SELECT COUNT(*) AS n FROM action_transitions WHERE execution_id=?").get(result.action!.executionId)).toEqual({ n: 3 });
});
test("real unknown settlement binds previous receipt ID and stale settlement changes no rows", async () => {
  const f = actionReceiptFixture(); await f.own(); const { journal, ledger } = f.open(), a = f.action();
  journal.request(a.request); journal.authorize(a.id, a.digest); journal.start(a.id, a.record); journal.markUnknown(a.id, "owned lost acknowledgement");
  const head = journal.get(a.id)!.receipts.at(-1)!, chosen = f.settlement(head); journal.settle(a.id, chosen);
  const before = f.state(ledger.db); expect(() => journal.settle(a.id, chosen)).toThrow(TransitionRefused); expect(f.state(ledger.db)).toEqual(before);
  const chain = journal.verifyReceiptChain(a.id); expect(chain.ok).toBe(true);
  const tokens = ledger.db.prepare("SELECT e.meta_json FROM action_transitions t JOIN evidence_events e ON e.id=t.evidence_event_id WHERE t.execution_id=? ORDER BY t.seq").all(a.id) as Array<{ meta_json: string }>;
  const payload = parseReceipt(JSON.parse(tokens.at(-1)!.meta_json).receipt).payload; expect(payload.v).toBe(2);
  if (payload.v !== 2) throw new Error("actual settlement lost v2");
  expect(("reconciliation" in payload ? payload.reconciliation?.fromReceiptId : undefined)).toBe(parseReceipt(JSON.parse(tokens.at(-2)!.meta_json).receipt).payload.receipt_id);
});

test("actual adapter wait cannot settle a competing completed head or replay its effect", async () => {
  const f = actionReceiptFixture(); await f.own(); const { journal, ledger } = f.open(), a = f.action();
  journal.request(a.request); journal.authorize(a.id, a.digest); journal.start(a.id, a.record); journal.markUnknown(a.id, "owned acknowledgement lost");
  const sor = new FakeSystemOfRecord(join(f.root, "system-of-record.json")), args = FAULT_ARGUMENTS[PAYMENT_TOOL] as { amount: string; currency: string; payee: string };
  sor.pay(a.request.idempotencyKey!, { amount: args.amount, currency: args.currency, recipient: args.payee }, a.id);
  const original = sor.adapter(PAYMENT_ADAPTER); let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(done => { enter = done; }), gate = new Promise<void>(done => { release = done; });
  const adapter = { ...original, lookup: async (...parameters: Parameters<typeof original.lookup>) => { const observation = await original.lookup(...parameters); enter(); await gate; return observation; } };
  const pending = reconcile(a.id, { workspace: f.workspace, adapters: new Map([[PAYMENT_ADAPTER, adapter]]) });
  const outcome = pending.then(value => ({ value }), error => ({ error })); let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    expect(await Promise.race([entered.then(() => "entered"), outcome.then(() => "returned"), new Promise<string>(done => { timer = setTimeout(() => done("missing actual lookup"), 5000); })])).toBe("entered");
    const competing = f.open().journal, head = competing.get(a.id)!.receipts.at(-1)!; competing.settle(a.id, f.settlement(head));
    const before = f.state(ledger.db); release(); const result = await outcome; expect(result).toHaveProperty("error");
    if ("error" in result) expect(result.error).toBeInstanceOf(TransitionRefused);
    expect(f.state(ledger.db)).toEqual(before); expect(sor.effects).toHaveLength(1); expect(sor.lookups).toBe(1);
  } finally { clearTimeout(timer); release(); await outcome; }
  // Fresh actual adapter observation is accepted, without dispatching a body.
  const b = f.action(); journal.request(b.request); journal.authorize(b.id, b.digest); journal.start(b.id, b.record); journal.markUnknown(b.id, "owned second lost acknowledgement");
  sor.pay(b.request.idempotencyKey!, { amount: args.amount, currency: args.currency, recipient: args.payee }, b.id);
  const fresh = await reconcile(b.id, { workspace: f.workspace, adapters: new Map([[PAYMENT_ADAPTER, sor.adapter(PAYMENT_ADAPTER)]]) });
  expect(fresh.after).toBe("completed"); expect(sor.effects).toHaveLength(2); expect(journal.verifyReceiptChain(b.id).ok).toBe(true);
});
