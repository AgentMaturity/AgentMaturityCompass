/** Actual fault policies + genuine internal receipt owner. Not normal CLI binding. */
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { vi } from "vitest";
import { signAmcConfig } from "../../src/workspace.js";
import { bindAuthorization } from "../../src/actions/authorize.js";
import { openActionJournal, type ActionJournal } from "../../src/actions/actionJournal.js";
import type { Settlement } from "../../src/actions/actionJournal.js";
import { receiptDigest, type ActionReceiptV1 } from "../../src/actions/receiptStates.js";
import * as ledgerModule from "../../src/ledger/ledger.js";
import { openLedger, type Ledger } from "../../src/ledger/ledger.js";
import { prepareReceiptAuthorityOwner } from "../../src/keys/receiptAuthorityOwner.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { getSigningKey } from "../../src/keys/signingKeys.js";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { withPins } from "../../src/trust/trustContext.js";
import { initBlobKey } from "../../src/storage/blobs/blobKeys.js";
import { closeSqlitePool } from "../../src/storage/sqlitePool.js";
import { lockVault } from "../../src/vault/vault.js";
import type { ToolExecution } from "../../src/tools/toolTypes.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { workspaceKeyTrust } from "./trustContext.js";
import { prepareFaultWorkspace, PAYMENT_TOOL, FAULT_ARGUMENTS } from "./actionFaults.js";
import { AWS_ARN, awsFake, fakeKey, publicPem } from "../keys/providerFakes.js";
export const JOURNAL_PASS = "owned-action-receipt-passphrase";
const fixtures: Array<{ root: string; workspace: string; handles: Array<{ close(): void }> }> = [];
export function cleanupActionReceiptFixtures(): void {
  const failures: unknown[] = [];
  for (const f of fixtures.splice(0).reverse()) {
    try {
      for (const handle of f.handles.splice(0).reverse()) handle.close();
      closeSqlitePool(`ledger:${resolve(f.workspace)}:${join(f.workspace, ".amc/evidence.sqlite")}`);
      lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true });
    } catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, "Owned action receipt fixture cleanup failed");
}
export function actionReceiptFixture(configured = true) {
  const root = mkdtempSync(join(tmpdir(), "amc-action-receipt-")), workspace = join(root, "workspaces", `owned-${randomUUID()}`);
  const handles: Array<{ close(): void }> = []; fixtures.push({ root, workspace, handles });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  vi.stubEnv("AMC_VAULT_PASSPHRASE", JOURNAL_PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_LEDGER_SQLITE_SYNCHRONOUS", "FULL"); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  prepareFaultWorkspace(workspace); initBlobKey(workspace);
  const legacyPrivate = getSigningKey(workspace, "receipt");
  const a = fakeKey("p256"), b = fakeKey("ed25519"), id = AWS_ARN(randomUUID()), nextId = AWS_ARN(randomUUID());
  const fake = awsFake({ [id]: a, [nextId]: b }), provider = awsKmsProvider(fake.call);
  // Independent choices fixed before the certificate and action artifacts exist.
  const pins = withPins(workspaceKeyTrust(workspace), [a, b].map(key => ({ keyId: signingKeyId(publicPem(key))!, purposes: ["receipt"] as const, origin: "owned pre-artifact journal operator" })));
  const configure = (selected = id) => {
    const path = join(workspace, ".amc/amc.config.yaml"), config = YAML.parse(readFileSync(path, "utf8"));
    config.keys = { ...config.keys, refs: { ...config.keys?.refs, receipt: { provider: "aws-kms", id: selected } } };
    writeFileSync(path, YAML.stringify(config)); signAmcConfig(workspace);
  };
  if (configured) configure();
  const own = (options: Parameters<typeof prepareReceiptAuthorityOwner>[1] = {}) => prepareReceiptAuthorityOwner(workspace, { passphrase: JOURNAL_PASS, provider, ...options });
  const trust = () => ({ ...pins, asOf: new Date(Date.now()) });
  const reader = <T>(read: (ledger: Ledger) => T): T => { const ledger = openLedger(workspace, { readonly: true }); try { return read(ledger); } finally { ledger.close(); } };
  const open = () => {
    const original = ledgerModule.openLedger; let actual: Ledger | undefined;
    // Observe the actual private connection; delegate every invocation. No injected database or fake journal.
    const spy = vi.spyOn(ledgerModule, "openLedger").mockImplementation((path, options) => {
      const result = original(path, options); if (path === workspace && !options?.readonly) actual = result; return result;
    });
    let journal: ActionJournal;
    try { journal = openActionJournal(workspace); } finally { spy.mockRestore(); }
    handles.push(journal); if (actual === undefined) throw new Error("actual journal Ledger was not observed");
    return { journal, ledger: actual };
  };
  const sessionId = `actual-journal-session-${randomUUID()}`;
  const action = () => {
    const callId = randomUUID(), execution: ToolExecution = { token: randomUUID(), callId, rootCallId: callId, parentToken: null,
      workspace, name: PAYMENT_TOOL, agentId: "default", actionClass: "FINANCIAL", requestedMode: "EXECUTE", effectiveMode: "EXECUTE", arguments: { ...FAULT_ARGUMENTS[PAYMENT_TOOL] } };
    const bound = bindAuthorization(execution, { sessionId }); if (!bound.ok) throw new Error(`actual authorization refused: ${bound.reason}`);
    const request = { executionId: bound.record.executionId, agentId: "default", toolName: PAYMENT_TOOL, actionClass: "FINANCIAL" as const,
      sessionId, callId, parentExecutionId: null, idempotencyKey: bound.record.idempotencyKey };
    return { id: request.executionId, request, record: bound.record, digest: bound.digest };
  };
  const finish = (journal: ActionJournal, chosen: ReturnType<typeof action>) => {
    journal.request(chosen.request); journal.authorize(chosen.id, chosen.digest); journal.start(chosen.id, chosen.record);
    return journal.complete(chosen.id, { effect: "applied", outcomeDigest: sha256Hex("owned effect"), externalRef: "owned:effect", reasonCode: "owned_completed" });
  };
  const state = (db: Ledger["db"]) => Object.fromEntries(["action_executions", "action_transitions", "evidence_events", "sessions"]
    .map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
  const settlement = (head: ActionReceiptV1): Settlement => ({ headDigest: receiptDigest(head), resolution: "adapter", effect: "applied", externalRef: "owned:effect", evidenceComplete: true,
    reasonCode: "owned_settled", method: "owned-local-observation", evidenceRefs: ["owned:effect"], outcomeDigest: sha256Hex("owned effect"), meta: {} });
  return { root, workspace, legacyPrivate, a, b, id, nextId, fake, provider, configure, own, trust, reader, open, action, finish, state, settlement, sessionId };
}
export type ActionReceiptFixture = ReturnType<typeof actionReceiptFixture>;
