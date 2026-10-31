import { sign, verify } from "node:crypto";
import fs from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test, vi } from "vitest";
import { linkTransitionToTransparencyAsync, recordPolicyChangeIntentAsync, initGovernanceLineageTables,
  getTransparencyLinkByTransition, getPolicyIntentById, getClaimPolicyLinks, getLastIntentHash, generateGovernanceLineageReport } from "../../src/index.js";
import { linkTransitionToTransparency, recordPolicyChangeIntent } from "../../src/claims/governanceLineage.js";
import { insertClaim, insertClaimTransition } from "../../src/claims/claimStore.js";
import type { Claim, ClaimTransition } from "../../src/claims/claimTypes.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { initWorkspace } from "../../src/workspace.js";
import { closeSqlitePool } from "../../src/storage/sqlitePool.js";
import * as purposeProviders from "../../src/keys/purposeProviders.js";
import { getSigningKey, getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { keysetIdentity } from "../../src/keys/keyset.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";

const PASS = "owned-lineage-publication", roots: Array<{ root: string; workspace: string; ledger: ReturnType<typeof openLedger> }> = [];
afterEach(() => { vi.restoreAllMocks(); for (const f of roots.splice(0)) { if (f.ledger.db.inTransaction) f.ledger.db.exec("ROLLBACK"); f.ledger.close(); lockVault(f.workspace); closeSqlitePool(`ledger:${resolve(f.workspace)}:${join(f.workspace, ".amc", "evidence.sqlite")}`); fs.rmSync(f.root, { recursive: true, force: true }); } vi.unstubAllEnvs(); });
function fixture() {
  const root = fs.mkdtempSync(join(tmpdir(), "amc-lineage-async-")), workspace = join(root, "workspace");
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "controls")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS);
  vi.stubEnv("AMC_NO_SIGN", "0"); vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" }); const ledger = openLedger(workspace); roots.push({ root, workspace, ledger }); initGovernanceLineageTables(ledger.db);
  return { root, workspace, ledger, db: ledger.db, provider: purposeProviders.loadKeyProvider(workspace, "file"), key: getSigningKey(workspace, "artifact-seal"), pem: getSigningPublicKeyPem(workspace, "artifact-seal") };
}
function claim(f: ReturnType<typeof fixture>, id: string) {
  const value: Claim = { claimId: id, agentId: "default", runId: "owned-run", questionId: "AMC-1.1", assertionText: "Owned SQL test input; no claim-truth qualification", claimedLevel: 1,
    provenanceTag: "OBSERVED_FACT", lifecycleState: "QUARANTINE", confidence: 0.5, evidenceRefs: [], trustTier: "OBSERVED", promotedFromClaimId: null, promotionEvidence: [],
    supersededByClaimId: null, createdTs: Date.now(), lastVerifiedTs: Date.now(), expiryTs: null, prev_claim_hash: "GENESIS_CLAIMS", claim_hash: sha256Hex(id), signature: "" };
  value.signature = sign(null, Buffer.from(value.claim_hash, "hex"), f.key).toString("base64"); insertClaim(f.db, value); return value;
}
function transition(f: ReturnType<typeof fixture>, id: string) {
  const c = claim(f, "claim-" + id), value: ClaimTransition = { transitionId: id, claimId: c.claimId, fromState: "QUARANTINE", toState: "REVOKED", reason: "owned persisted transition input", evidenceRefs: ["ev-original"], ts: Date.now(), signature: "" };
  value.signature = sign(null, Buffer.from(sha256Hex(canonicalize(value)), "hex"), f.key).toString("base64"); insertClaimTransition(f.db, value); return value;
}
const params = (agentId = "default", claimIds: string[] = []) => ({ agentId, policyFilePath: "asserted-policy.yaml", policyFileSha256Before: "a".repeat(64), policyFileSha256After: "b".repeat(64),
  category: "RISK_MITIGATION" as const, rationale: "Owned reason for this policy intent", impactSummary: "Owned impact", claimIds, evidenceRefs: ["ev-original"], createdBy: "owner" });
function math(f: ReturnType<typeof fixture>, body: unknown, signature: string) {
  const digest = sha256Hex(canonicalize(body)); expect(signature).toBe(sign(null, Buffer.from(digest, "hex"), f.key).toString("base64"));
  expect(verify(null, Buffer.from(digest, "hex"), f.pem, Buffer.from(signature, "base64"))).toBe(true); return digest;
}
function counts(f: ReturnType<typeof fixture>) { return ["claim_transparency_links", "policy_change_intents", "claim_policy_links"].map(table => (f.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n); }
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function pause(f: ReturnType<typeof fixture>) {
  const entered = deferred(), release = deferred(), real = f.provider.sign.bind(f.provider);
  const spy = vi.spyOn(f.provider, "sign").mockImplementationOnce(async (...args) => { expect(f.db.inTransaction).toBe(false); const signed = await real(...args); entered.resolve(); await release.promise; return signed; }); return { entered, release, spy };
}
async function atPause(wait: ReturnType<typeof pause>, pending: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { expect(await Promise.race([wait.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "refused"), new Promise<string>(done => { timer = setTimeout(() => done("actual Sign not reached"), 5000); })])).toBe("signed"); }
  finally { clearTimeout(timer); }
}

test("root SDK async linkage preserves raw32 body and actual SQL/getter/report projection without a transparency append", async () => {
  const f = fixture(), tr = transition(f, "owned-link"), real = f.provider.sign.bind(f.provider), spy = vi.spyOn(f.provider, "sign").mockImplementation(async (...args) => { expect(f.db.inTransaction).toBe(false); return real(...args); });
  const link = await linkTransitionToTransparencyAsync(f.db, tr, "d".repeat(64), f.workspace), { signature, ...body } = link, digest = math(f, body, signature);
  expect(Object.keys(link)).toEqual(["linkId", "claimId", "transitionId", "transparencyEntryHash", "fromState", "toState", "reason", "evidenceRefs", "ts", "signature"]);
  expect(getTransparencyLinkByTransition(f.db, tr.transitionId)).toEqual(link); expect(generateGovernanceLineageReport(f.db, "default").totalTransparencyLinks).toBe(1);
  expect(spy.mock.calls.map(([ref, bytes]) => ({ ref, hex: Buffer.from(bytes).toString("hex") }))).toEqual([{ ref: { provider: "file", id: "artifact-seal" }, hex: digest }]);
});
test.each(["missing", "mismatched"] as const)("async selected %s transition refuses before provider work", async kind => {
  const f = fixture(), tr = transition(f, "selected-" + kind), spy = vi.spyOn(f.provider, "sign"), before = counts(f);
  const input = { ...tr, ...(kind === "missing" ? { transitionId: "absent" } : { reason: "caller does not match persisted reason" }) };
  await expect(linkTransitionToTransparencyAsync(f.db, input, "e".repeat(64), f.workspace)).rejects.toThrow("selected claim transition does not match"); expect(spy).not.toHaveBeenCalled(); expect(counts(f)).toEqual(before);
  await linkTransitionToTransparencyAsync(f.db, tr, "e".repeat(64), f.workspace);
});
test("lineage clones caller evidence arrays before a real Sign pause", async () => {
  const f = fixture(), tr = transition(f, "copied-input"), wait = pause(f), pending = linkTransitionToTransparencyAsync(f.db, tr, "f".repeat(64), f.workspace); void pending.catch(() => {});
  try { await atPause(wait, pending); tr.reason = "mutated caller"; tr.evidenceRefs.push("mutated caller"); wait.release.resolve(); const link = await pending;
    expect(link.reason).toBe("owned persisted transition input"); expect(link.evidenceRefs).toEqual(["ev-original"]); const { signature, ...body } = link; math(f, body, signature);
  } finally { wait.release.resolve(); await pending.catch(() => {}); }
});
test("actual selected transition drift after Sign refuses instead of signing a reread", async () => {
  const f = fixture(), tr = transition(f, "changed-source"), wait = pause(f), pending = linkTransitionToTransparencyAsync(f.db, tr, "f".repeat(64), f.workspace); void pending.catch(() => {});
  try { await atPause(wait, pending); f.db.exec("DROP TRIGGER protect_claim_transitions_immutable"); f.db.prepare("UPDATE claim_transitions SET reason = ? WHERE transition_id = ?").run("owned corrupt source", tr.transitionId);
    wait.release.resolve(); await expect(pending).rejects.toThrow("selected claim transition changed"); expect(counts(f)).toEqual([0, 0, 0]);
    f.db.prepare("UPDATE claim_transitions SET reason = ? WHERE transition_id = ?").run(tr.reason, tr.transitionId);
    await linkTransitionToTransparencyAsync(f.db, tr, "f".repeat(64), f.workspace);
  } finally { wait.release.resolve(); await pending.catch(() => {}); }
});
test("same-transition actual sync winner is retained while another transition remains independent", async () => {
  const f = fixture(), tr = transition(f, "same-winner"), other = transition(f, "other-winner"), wait = pause(f), pending = linkTransitionToTransparencyAsync(f.db, tr, "1".repeat(64), f.workspace); void pending.catch(() => {});
  try { await atPause(wait, pending); const winner = linkTransitionToTransparency(f.db, tr, "2".repeat(64), f.workspace); await linkTransitionToTransparencyAsync(f.db, other, "3".repeat(64), f.workspace);
    wait.release.resolve(); await expect(pending).rejects.toThrow("already linked"); expect(getTransparencyLinkByTransition(f.db, tr.transitionId)).toEqual(winner); expect(counts(f)[0]).toBe(2);
  } finally { wait.release.resolve(); await pending.catch(() => {}); }
});
test("root SDK async intent preserves original defaults/raw32 and atomic automatic links", async () => {
  const f = fixture(), c = claim(f, "intent-claim"), spy = vi.spyOn(f.provider, "sign"), intent = await recordPolicyChangeIntentAsync(f.db, params("default", [c.claimId]), f.workspace);
  const { signature, intent_hash, ...body } = intent; expect(intent_hash).toBe(math(f, body, signature)); expect(intent).toMatchObject({ prev_intent_hash: "GENESIS_POLICY_INTENT", reversible: true, rollbackInstructions: null });
  expect(getPolicyIntentById(f.db, intent.intentId)).toEqual(intent); expect(getClaimPolicyLinks(f.db, c.claimId).map(row => row.intentId)).toEqual([intent.intentId]); expect(counts(f)).toEqual([0, 1, 1]);
  expect(spy.mock.calls.map(([ref, bytes]) => ({ ref, hex: Buffer.from(bytes).toString("hex") }))).toEqual([{ ref: { provider: "file", id: "artifact-seal" }, hex: intent_hash }]);
});
test("per-agent rowid head CAS refuses a real same-agent winner and allows another agent", async () => {
  const f = fixture(), wait = pause(f), pending = recordPolicyChangeIntentAsync(f.db, params(), f.workspace); void pending.catch(() => {});
  try { await atPause(wait, pending); const winner = recordPolicyChangeIntent(f.db, params(), f.workspace); await recordPolicyChangeIntentAsync(f.db, params("other"), f.workspace);
    wait.release.resolve(); await expect(pending).rejects.toThrow("policy intent head changed"); expect(getLastIntentHash(f.db, "default")).toBe(winner.intent_hash); expect(counts(f)[1]).toBe(2);
    const fresh = await recordPolicyChangeIntentAsync(f.db, params(), f.workspace); expect(fresh.prev_intent_hash).toBe(winner.intent_hash);
  } finally { wait.release.resolve(); await pending.catch(() => {}); }
});
test("async intent predecessor follows rowid when real creation clocks regress", async () => {
  const f = fixture(), clock = Date.now(), now = vi.spyOn(Date, "now").mockReturnValue(clock + 10000);
  const first = recordPolicyChangeIntent(f.db, params(), f.workspace); now.mockReturnValue(clock);
  const second = recordPolicyChangeIntent(f.db, params(), f.workspace); expect(second.prev_intent_hash).toBe(first.intent_hash);
  const next = await recordPolicyChangeIntentAsync(f.db, params(), f.workspace); expect(next.prev_intent_hash).toBe(second.intent_hash);
});
test("intent caller arrays are copied and unrelated-agent insertion is not a global CAS", async () => {
  const f = fixture(), c = claim(f, "copied-intent"), extra = claim(f, "other-existing-claim"), input = params("default", [c.claimId]), wait = pause(f), pending = recordPolicyChangeIntentAsync(f.db, input, f.workspace); void pending.catch(() => {});
  try { await atPause(wait, pending); input.claimIds.push(extra.claimId); input.evidenceRefs.push("mutated"); input.rationale = "mutated caller rationale"; recordPolicyChangeIntent(f.db, params("other"), f.workspace);
    wait.release.resolve(); const intent = await pending; expect(intent.claimIds).toEqual([c.claimId]); expect(intent.evidenceRefs).toEqual(["ev-original"]); expect(intent.rationale).toBe("Owned reason for this policy intent"); const { signature, intent_hash, ...body } = intent; expect(math(f, body, signature)).toBe(intent_hash);
  } finally { wait.release.resolve(); await pending.catch(() => {}); }
});
test.each(["link", "intent"] as const)("%s rejects caller-owned transaction before provider requests and never borrows a late one", async kind => {
  const f = fixture(), tr = transition(f, "txn-" + kind), run = () => kind === "link" ? linkTransitionToTransparencyAsync(f.db, tr, "4".repeat(64), f.workspace) : recordPolicyChangeIntentAsync(f.db, params(), f.workspace), spy = vi.spyOn(f.provider, "sign");
  f.db.exec("BEGIN"); await expect(run()).rejects.toThrow("no active caller transaction"); expect(f.db.inTransaction).toBe(true); expect(spy).not.toHaveBeenCalled(); expect(counts(f)).toEqual([0, 0, 0]); f.db.exec("ROLLBACK"); vi.restoreAllMocks();
  const wait = pause(f), pending = run(); void pending.catch(() => {});
  try { await atPause(wait, pending); f.db.exec("BEGIN"); wait.release.resolve(); await expect(pending).rejects.toThrow("no active caller transaction"); expect(f.db.inTransaction).toBe(true); expect(counts(f)).toEqual([0, 0, 0]); }
  finally { wait.release.resolve(); await pending.catch(() => {}); if (f.db.inTransaction) f.db.exec("ROLLBACK"); }
  await run();
});
test("async intent rolls its real intent and first-link insertion back after a native second-link fault", async () => {
  const f = fixture(), a = claim(f, "rollback-a"), b = claim(f, "rollback-b"); let firstInsertSeen = false;
  f.db.function("owned_first_link_seen", () => { firstInsertSeen = true; return 0; });
  f.db.exec(`CREATE TRIGGER owned_first_link AFTER INSERT ON claim_policy_links WHEN NEW.claim_id = 'rollback-a' BEGIN SELECT owned_first_link_seen(); END;
    CREATE TRIGGER owned_second_link BEFORE INSERT ON claim_policy_links WHEN NEW.claim_id = 'rollback-b' BEGIN SELECT RAISE(ABORT, 'owned second link fault'); END;`);
  await expect(recordPolicyChangeIntentAsync(f.db, params("default", [a.claimId, b.claimId]), f.workspace)).rejects.toThrow("owned second link fault"); expect(firstInsertSeen).toBe(true); expect(counts(f)).toEqual([0, 0, 0]);
  f.db.exec("DROP TRIGGER owned_second_link"); await recordPolicyChangeIntentAsync(f.db, params("default", [a.claimId, b.claimId]), f.workspace); expect(counts(f)).toEqual([0, 1, 2]);
});
test.each(["link", "intent"] as const)("%s final original generation survives checked result and serialization", async kind => {
  const f = fixture(), tr = transition(f, "generation-" + kind), generation = keysetIdentity(f.workspace)!.generation, real = purposeProviders.signWithPurposeKey; let reached = false, changed = 0;
  vi.spyOn(purposeProviders, "signWithPurposeKey").mockImplementationOnce(async (...args) => { const signed = await real(...args); changed = rotatePurposeKeys({ workspace: f.workspace, purposes: ["session"], passphrase: PASS }).generation; reached = true; return signed; });
  const run = () => kind === "link" ? linkTransitionToTransparencyAsync(f.db, tr, "5".repeat(64), f.workspace) : recordPolicyChangeIntentAsync(f.db, params(), f.workspace);
  // The retained original run authority refuses the new generation before the purpose publication comparison.
  await expect(run()).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED", message: expect.stringContaining("the original run purpose generation changed") }); expect(reached).toBe(true); expect(changed).toBe(generation + 1); expect(counts(f)).toEqual([0, 0, 0]); await run();
});
test("lineage checked signing refuses unlocked no-sign and never publishes unsigned after locked refusal", async () => {
  // Signed run-hash authority refuses no-sign mode even with an unlocked vault; nothing is published.
  const f = fixture(), first = await recordPolicyChangeIntentAsync(f.db, params(), f.workspace), { signature, intent_hash, ...body } = first; expect(math(f, body, signature)).toBe(intent_hash);
  vi.stubEnv("AMC_NO_SIGN", "1"); const unlocked = counts(f);
  await expect(recordPolicyChangeIntentAsync(f.db, params(), f.workspace)).rejects.toThrow("no-sign mode does not authorize policy signing"); expect(counts(f)).toEqual(unlocked);
  const before = counts(f); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); lockVault(f.workspace); await expect(recordPolicyChangeIntentAsync(f.db, params(), f.workspace)).rejects.toThrow(); expect(counts(f)).toEqual(before);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); vi.stubEnv("AMC_NO_SIGN", "0"); await recordPolicyChangeIntentAsync(f.db, params(), f.workspace);
});
