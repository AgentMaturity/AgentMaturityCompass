/**
 * P2-36: A4 under the G2 enterprise-data systems. The workspace is the owned P2-24 governance fixture (signed policies, a
 * real vault, a real ledger); live roles are OWNER by fiat, everything else is real: the store, the deletion gate and
 * legal-hold registry (P2-01), the detectors (P2-02), the algorithm policy (P2-08), ledger encryption and the Postgres
 * backend selection (P2-09). No Postgres server runs: the backend check reads the selection and the mirror list only.
 */
import { generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("../../src/a4/a4Identity.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/a4/a4Identity.js")>()),
  liveRolesFor: () => ["OWNER"]
}));

import { A4BlobError, getPrivate } from "../../src/a4/a4Blobs.js";
import { buildA4BinderSlice } from "../../src/a4/a4Binder.js";
import { eraseProjectPrivate, ERASURE_EFFECT_NOTE } from "../../src/a4/a4Erasure.js";
import { a4AlgorithmAllowed } from "../../src/a4/a4Evidence.js";
import { emptyScan, redactExportValue } from "../../src/a4/a4ExportScan.js";
import { readinessFor } from "../../src/a4/a4Gates.js";
import { ledgerBackendGap } from "../../src/a4/a4LedgerBackend.js";
import { openA4Store, type A4Store } from "../../src/a4/a4Store.js";
import { verifyA4Bundle, verifyA4Chain } from "../../src/a4/a4Verify.js";
import { auditBindersExportsDir } from "../../src/audit/auditPolicyStore.js";
import { copyA4Slice, type A4BundleSlice } from "../../src/bundles/bundleA4.js";
import { registerTenant } from "../../src/compliance/dataResidency.js";
import type { A4Principal } from "../../src/contracts/v1/a4Project.js";
import { getPublicKeyPem } from "../../src/crypto/keys.js";
import { lowS } from "../../src/keys/algorithmPolicy.js";
import { closeLedgerDataKeys, rotateDataKey } from "../../src/ledger/encryption/dataKeys.js";
import { encryptExistingLedger } from "../../src/ledger/encryption/encryptMigration.js";
import { isEncryptedField } from "../../src/ledger/encryption/ledgerCipher.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { loadOpsPolicy, opsPolicyPath, signOpsPolicy } from "../../src/ops/policy.js";
import { initLegalHoldRegistry, issueScopedLegalHold } from "../../src/residency/legalHoldRegistry.js";
import { loadTrustContext } from "../../src/trust/trustContext.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { AGENT, cleanupGovernanceFixtures, governanceFixture } from "../governor/governanceFixture.js";

vi.setConfig({ testTimeout: 60_000 });
const stores: A4Store[] = [];
const temps: string[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  closeLedgerDataKeys();
  cleanupGovernanceFixtures();
});

const owner = {
  key: "LOCAL_USER:owner", authSource: "LOCAL_USER", userId: "owner", username: "owner", roles: ["OWNER"], admission: "native_login_token",
  identityCheck: "users_yaml", provenance: { usersYamlSignerFingerprint: null, createdTs: null, createdBy: null }
} as unknown as A4Principal;
const EMAIL = "jane.doe@example.com";
const TOKEN = "tok_7Hq2Vx9Lm4Np8Rs3";
const nulls = (...slots: string[]) => Object.fromEntries(slots.map((slot) => [slot, null]));
const DIGESTS = {
  schema: "amc.a4-resource-digests/v1", brief: nulls("contextGraphSha256", "agentConfigSha256"),
  enforce: nulls("manifestId", "resourcesSha256", "snapshotBundleSha256"), composition: nulls("compositionDigest", "policyDigest", "presetSha256"),
  graph: nulls("typedGraphDigest"), signedConfigs: nulls("tools", "approvalPolicy", "budgets", "firewall", "actionPolicy", "opsPolicy"),
  plan: nulls("planDigest", "lockDigest", "journalEntrySha256"), operatingProfile: nulls("sha256", "activationSha256"),
  context: nulls("contextPluginSha256", "promptPackSha256", "memoryPolicySha256"),
  release: nulls("packageDigest", "imageDigest", "chartOrComposeDigest", "valuesDigest"), gatePolicyDigest: null
} as never;

function temp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

/** A project whose brief names an email address and whose comments carry a token; returns the comments' blob refs. */
function project(workspace: string): { store: A4Store; projectId: string; blobs: Array<{ ref: string; sha: string }> } {
  const store = openA4Store(workspace);
  stores.push(store);
  const created = store.createProject({ actor: owner, agentId: AGENT, name: "P2-36 fixture", hostedRouter: false });
  if (created.replay) throw new Error("unexpected replay");
  const projectId = created.projectId;
  store.appendRevision(projectId, { actor: owner, stage: "aspire", spec: { brief: `Reach the requester at ${EMAIL}.` }, resourceDigests: DIGESTS,
    expectedHeadSeq: store.readHead(projectId)!.head_seq });
  store.addComment(projectId, { actor: owner, body: `Use ${TOKEN} for the sandbox.`, cardId: "brief" });
  store.addComment(projectId, { actor: owner, body: `Personal context: ${EMAIL}`, cardId: "brief" });
  const blobs = store.snapshot(projectId).rows.a4_comments.map((row) => ({ ref: String(row.blob_ref), sha: String(row.body_sha256) }));
  return { store, projectId, blobs };
}

function verified(workspace: string, projectId: string) {
  const ledger = openLedger(workspace, { readonly: true });
  try {
    return verifyA4Chain(ledger, projectId);
  } finally {
    ledger.close();
  }
}

function enableLedgerEncryption(workspace: string): void {
  const policy = loadOpsPolicy(workspace);
  policy.opsPolicy.encryption.ledgerEncryptionEnabled = true;
  writeFileSync(opsPolicyPath(workspace), YAML.stringify(policy));
  signOpsPolicy(workspace);
}

/** A trust context pinning the workspace's monitor key for ledger-row and receipt and its auditor key for artifact-seal. */
function pinnedTrust(workspace: string) {
  const dir = temp("amc-p236-trust-");
  const auditor = join(dir, "auditor.pub");
  writeFileSync(auditor, getPublicKeyPem(workspace, "auditor"));
  return loadTrustContext({ amcHome: dir, pubkey: { path: auditor, purposes: ["artifact-seal"] }, expectMonitor: sha256Hex(getPublicKeyPem(workspace, "monitor")), env: {} });
}

function exportSlice(workspace: string): { index: A4BundleSlice; record: string } {
  vi.stubEnv("AMC_A4_PREVIEW", "1");
  const root = temp("amc-p236-bundle-");
  copyA4Slice({ workspace, root, agentId: AGENT, slice: null });
  const index = JSON.parse(readFileSync(join(root, "a4", "index.json"), "utf8")) as A4BundleSlice;
  return { index, record: join(root, "a4", `${index.projects[0]!.projectId}.json`) };
}

describe("ledger backend (P2-36, reconcile/G2.md conflict 11)", () => {
  test("a Postgres backend whose mirror lacks the a4_* tables refuses every A4 write, and readiness shows LEDGER_BACKEND_INCOMPLETE", () => {
    const { workspace } = governanceFixture();
    const { store, projectId } = project(workspace);
    expect(readinessFor(store, projectId, owner, {}).items.some((item) => item.id === "store.ledger_backend")).toBe(false);
    vi.stubEnv("AMC_SESSION_STORE", "postgres");
    const gap = ledgerBackendGap(workspace, store.ledger.db);
    expect(gap).toEqual(expect.arrayContaining(["a4_projects", "a4_transitions", "a4_comments"]));
    expect(() => store.addComment(projectId, { actor: owner, body: "after the switch", cardId: "brief" })).toThrow(/LEDGER_BACKEND_INCOMPLETE/);
    const fresh = openA4Store(workspace);
    stores.push(fresh);
    expect(() => fresh.createProject({ actor: owner, agentId: "agent-two", name: "refused", hostedRouter: false })).toThrow(/LEDGER_BACKEND_INCOMPLETE/);
    const readiness = readinessFor(store, projectId, owner, {});
    expect(readiness.items.find((item) => item.id === "store.ledger_backend")).toMatchObject({ status: "BLOCKED",
      reasonCodes: expect.arrayContaining(["LEDGER_BACKEND_INCOMPLETE", "NOT_MIRRORED:a4_projects"]) });
    expect(readiness.status).toBe("BLOCKED");
  });
});

describe("owner erasure (P2-36)", () => {
  test("destroys the project key through the deletion gate: every blob unreadable, hashes kept, the chain verifies, ERASED recorded", () => {
    const { workspace } = governanceFixture();
    const { store, projectId, blobs } = project(workspace);
    expect(getPrivate(workspace, projectId, blobs[0]!.ref, blobs[0]!.sha).toString("utf8")).toContain(TOKEN);
    const result = eraseProjectPrivate(store, projectId, { principal: owner, reason: "data subject request", expectedHeadSeq: store.readHead(projectId)!.head_seq });
    expect(result).toMatchObject({ replay: false, kind: "ERASED" });
    const last = store.readChain(projectId).at(-1)!;
    expect(last).toMatchObject({ kind: "ERASED" });
    expect(last.body).toMatchObject({ reason: "data subject request", executor: "a4-private-erase", effective: ERASURE_EFFECT_NOTE });
    const privateDir = join(workspace, "a4-projects", projectId, "private");
    expect(existsSync(join(privateDir, "key.enc"))).toBe(false);
    for (const blob of blobs) {
      expect(existsSync(join(privateDir, `${blob.ref}.enc`))).toBe(true);
      expect(() => getPrivate(workspace, projectId, blob.ref, blob.sha)).toThrow(/PROJECT_KEY_DESTROYED/);
    }
    // Without the tombstone the blobs still do not open: the key file and the wrap secret are gone.
    rmSync(join(privateDir, "key.destroyed"));
    for (const blob of blobs) expect(() => getPrivate(workspace, projectId, blob.ref, blob.sha)).toThrow(A4BlobError);
    expect(store.snapshot(projectId).rows.a4_comments.map((row) => row.body_sha256)).toEqual(blobs.map((blob) => blob.sha));
    expect(verified(workspace, projectId).integrity.status).toBe("pass");
    const audits = store.ledger.db.prepare("SELECT payload_inline FROM evidence_events WHERE session_id LIKE 'ops-deletion_allowed-%'").all() as Array<{ payload_inline: string }>;
    expect(audits.map((row) => JSON.parse(row.payload_inline) as { executor: string })).toEqual(expect.arrayContaining([expect.objectContaining({ executor: "a4-private-erase" })]));
    expect(() => eraseProjectPrivate(store, projectId, { principal: owner, reason: "again", expectedHeadSeq: store.readHead(projectId)!.head_seq }))
      .toThrow(/A4_ALREADY_ERASED/);
  });

  test("a legal hold on blobs refuses the erasure before anything is destroyed or recorded", () => {
    const { workspace } = governanceFixture();
    const { store, projectId, blobs } = project(workspace);
    registerTenant({ tenantId: "tenant-p236", workspaceId: "p236-workspace", region: "us-east-1" }, workspace);
    initLegalHoldRegistry(workspace);
    issueScopedLegalHold({ workspace, scope: { tenantId: "tenant-p236", workspaceIds: [], sessionIds: [], dataKinds: ["blobs"] }, reason: "litigation", issuedBy: "owner" });
    const headSeq = store.readHead(projectId)!.head_seq;
    expect(() => eraseProjectPrivate(store, projectId, { principal: owner, reason: "data subject request", expectedHeadSeq: headSeq })).toThrow(/DELETION_DENIED/);
    expect(existsSync(join(workspace, "a4-projects", projectId, "private", "key.enc"))).toBe(true);
    expect(getPrivate(workspace, projectId, blobs[0]!.ref, blobs[0]!.sha).toString("utf8")).toContain(TOKEN);
    expect(store.readHead(projectId)!.head_seq).toBe(headSeq);
  });
});

describe("ledger encryption (P2-36, reconcile/G2.md conflict 12)", () => {
  test("verifyA4Chain passes on encrypted audit rows, and the exported slice verifies without any key", async () => {
    const { workspace } = governanceFixture();
    enableLedgerEncryption(workspace);
    await rotateDataKey(workspace);
    const { store, projectId } = project(workspace);
    const seq = store.readHead(projectId)!.head_seq;
    const event = store.ledger.db.prepare("SELECT payload_inline FROM evidence_events WHERE session_id = ?").get(`a4-${projectId}-${seq}`) as { payload_inline: string };
    expect(isEncryptedField(event.payload_inline)).toBe(true);
    expect(verified(workspace, projectId).integrity).toMatchObject({ status: "pass" });
    const { index, record } = exportSlice(workspace);
    expect(index.plaintext).toMatchObject({ decryptedLedgerRows: 0 });
    expect(index.plaintext?.protectedDataFindings.pii ?? 0).toBeGreaterThan(0);
    const trusted = await verifyA4Bundle(record, pinnedTrust(workspace));
    expect(trusted.integrity.status).toBe("pass");
    // This project has no gate yet, so no envelope: the rows are admitted by the pinned monitor key alone.
    expect(trusted.anchoring.status).toBe("anchored");
    expect(trusted.scope.status).toBe("pass");
    expect(trusted.completeness.status).toBe("pass");
    const unpinned = await verifyA4Bundle(record, loadTrustContext({ amcHome: temp("amc-p236-empty-"), env: {} }));
    expect(unpinned.integrity.status).toBe("pass");
    expect(unpinned.anchoring.status).toBe("unanchored");
    expect(unpinned.scope.status).toBe("not-evaluated");
    expect(unpinned.satisfaction.status).toBe("not-evaluated");
  });

  test("rows encrypted after they were hashed verify with the key and are exported as their plaintext", async () => {
    const { workspace } = governanceFixture();
    const { projectId } = project(workspace);
    enableLedgerEncryption(workspace);
    await rotateDataKey(workspace);
    await encryptExistingLedger(workspace);
    expect(verified(workspace, projectId).integrity).toMatchObject({ status: "pass" });
    const { index, record } = exportSlice(workspace);
    expect(index.plaintext?.decryptedLedgerRows).toBeGreaterThan(0);
    expect((await verifyA4Bundle(record, pinnedTrust(workspace))).integrity.status).toBe("pass");
  });

  test("a referenced ledger row of other evidence, encrypted after it was hashed, is never decrypted into the export", async () => {
    const { workspace, ledger, sessionId } = governanceFixture();
    const { store, projectId } = project(workspace);
    const SECRET = "api_key = sk_live_51HqLyjWDarjtT1zdp7dcFOREIGNROW00";
    const rowId = ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: "stdout", payload: `unrelated evidence ${SECRET}`, inline: true,
      meta: { agentId: AGENT, trustTier: "SELF_REPORTED" } });
    store.addEvidenceRef(projectId, { actor: owner, refKind: "ledger_event", refId: rowId, sha256: ledger.getEventById(rowId)!.event_hash, claimKind: "self_reported",
      method: null, label: "foreign row", column: "implementation", expectedHeadSeq: store.readHead(projectId)!.head_seq });
    enableLedgerEncryption(workspace);
    await rotateDataKey(workspace);
    await encryptExistingLedger(workspace);
    vi.stubEnv("AMC_A4_PREVIEW", "1");
    const root = temp("amc-p236-foreign-");
    expect(() => copyA4Slice({ workspace, root, agentId: AGENT, slice: null })).toThrow(/A4_EXPORT_REF_ENCRYPTED/);
    expect(existsSync(join(root, "a4"))).toBe(false);
  });

  test("record files carrying plaintext are written owner-only (0o600)", () => {
    const { workspace } = governanceFixture();
    project(workspace);
    const { record } = exportSlice(workspace);
    expect(statSync(record).mode & 0o777).toBe(0o600);
  });
});

describe("redacted exports (P2-36, CISO must-fix §8.1)", () => {
  test("a binder slice of a project whose brief names an email and whose comment carries a token holds neither, nor key material", () => {
    const { workspace } = governanceFixture();
    const { projectId } = project(workspace);
    vi.stubEnv("AMC_A4_PREVIEW", "1");
    const slice = buildA4BinderSlice(workspace, { projectId });
    expect(slice.dir.startsWith(`${auditBindersExportsDir(workspace)}/`)).toBe(true);
    const text = (dir: string): string => readdirSync(dir, { withFileTypes: true })
      .map((entry) => entry.isDirectory() ? text(join(dir, entry.name)) : readFileSync(join(dir, entry.name), "utf8")).join("\n");
    const all = text(slice.dir);
    for (const secret of [EMAIL, TOKEN, "PRIVATE KEY"]) expect(all).not.toContain(secret);
  });

  test("a bundle slice whose A4 rows hold a credential is refused; other detector matches are counted, not rewritten", () => {
    const { workspace } = governanceFixture();
    const { store, projectId } = project(workspace);
    expect(exportSlice(workspace).index.plaintext?.protectedDataFindings.pii ?? 0).toBeGreaterThan(0);
    store.appendRevision(projectId, { actor: owner, stage: "aspire", spec: { brief: "api_key = sk_live_51HqLyjWDarjtT1zdp7dcXXXXXXXXXXXX" }, resourceDigests: DIGESTS,
      expectedHeadSeq: store.readHead(projectId)!.head_seq });
    expect(() => exportSlice(workspace)).toThrow(/A4_BUNDLE_REFUSED/);
  });

  test("detector matches become hashes and a credential is reported", () => {
    const scan = emptyScan();
    const out = redactExportValue({ note: `write to ${EMAIL}`, key: "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ" }, "file.json", (match) => `hash:${sha256Hex(match).slice(0, 16)}`, scan);
    expect(JSON.stringify(out)).not.toContain(EMAIL);
    expect(JSON.stringify(out)).toContain(`hash:${sha256Hex(EMAIL).slice(0, 16)}`);
    expect(scan.counts.pii).toBe(1);
    expect(scan.credentials.length).toBeGreaterThan(0);
  });
});

describe("algorithm policy (P2-08, P2-36)", () => {
  function p256Envelope(digest: string) {
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const signature = sign("sha256", Buffer.from(digest, "hex"), { key: privateKey, dsaEncoding: "ieee-p1363" });
    // AMC accepts only the low-S encoding (algorithmPolicy.ts); Node signs with a random S.
    return { pem, signature: lowS(signature).toString("base64") };
  }
  function allowOnly(workspace: string, allowed: string[]): void {
    mkdirSync(join(workspace, ".amc"), { recursive: true });
    writeFileSync(join(workspace, ".amc", "amc.config.yaml"), YAML.stringify({ keys: { algorithmPolicy: { allowed } } }));
  }

  test("an ecdsa-p256-sha256 envelope verifies under a policy that allows it and is refused under one that does not", () => {
    const { workspace } = governanceFixture();
    const { store, projectId } = project(workspace);
    const digest = (store.ledger.db.prepare("SELECT body_digest FROM a4_transitions WHERE project_id = ? AND seq = 0").get(projectId) as { body_digest: string }).body_digest;
    const { pem, signature } = p256Envelope(digest);
    const envelope = { digestSha256: digest, signature, signedTs: Date.now(), envelope: { pubkeyB64: Buffer.from(pem, "utf8").toString("base64") } };
    // envelope_json lies outside the body digest; the append-only trigger is lifted for this one fixture write only.
    const db = store.ledger.db;
    const triggers = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'a4_transitions'").all() as Array<{ name: string; sql: string }>;
    for (const trigger of triggers) db.exec(`DROP TRIGGER ${trigger.name}`);
    db.prepare("UPDATE a4_transitions SET envelope_json = ? WHERE project_id = ? AND seq = 0").run(JSON.stringify(envelope), projectId);
    for (const trigger of triggers) db.exec(trigger.sql);
    expect(a4AlgorithmAllowed(workspace, pem)).toBe(true);
    expect(verified(workspace, projectId).integrity.errors.filter((error) => error.startsWith("A4_ENVELOPE"))).toEqual([]);
    allowOnly(workspace, ["ed25519"]);
    expect(a4AlgorithmAllowed(workspace, pem)).toBe(false);
    expect(a4AlgorithmAllowed(workspace, getPublicKeyPem(workspace, "auditor"))).toBe(true);
    expect(verified(workspace, projectId).integrity.errors).toEqual(expect.arrayContaining([expect.stringMatching(/^A4_ENVELOPE_ALGORITHM_REFUSED: transition 0/)]));
  });
});
