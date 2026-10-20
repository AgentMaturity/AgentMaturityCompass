import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyHexDigestAny } from "../../src/crypto/keys.js";
import { signingKeyId, verifyCanonical } from "../../src/keys/algorithmPolicy.js";
import { AntiRollbackError } from "../../src/keys/highWater.js";
import { keysetPaths } from "../../src/keys/keyset.js";
import { KeyProviderError, signChecked, type KeyProvider } from "../../src/keys/provider.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { bindPurposeProviderKey, exportPurposePublicKey, signWithPurposeKey } from "../../src/keys/purposeProviders.js";
import { getPurposeKeyHistory, getSigningKey, getSigningPublicKeyPem, listKeys, revokeKey, rotatePurposeKeys, verifyProofOfPossession } from "../../src/keys/purposeKeys.js";
import { lockVault, vaultPaths, vaultStatus } from "../../src/vault/vault.js";
import { initWorkspace, loadAMCConfig, saveAMCConfig, signAmcConfig } from "../../src/workspace.js";
import { logSequence } from "../../src/keys/anchorLog.js";
import { encodeDelegation, issueDelegation } from "../../src/keys/delegation.js";
import { KeyRevokedError, keyRevocationLocation } from "../../src/keys/keyRevocations.js";
import { nextRevocationList, publishRevocationList, readAnchoredRevocationList, revocationListSha256 } from "../../src/keys/revocationList.js";
import { gcpKmsProvider } from "../../src/keys/providers/gcpKms.js";
import { fileKeyProvider } from "../../src/keys/providers/file.js";
import { setMode } from "../../src/mode/mode.js";
import { generateKeyPairSync, sign } from "node:crypto";
import { AWS_ARN, awsFake, fakeKey, GCP_KEY, gcpFake } from "./providerFakes.js";
import { openSessionEventStore } from "../../src/persistence/openSessionEventStore.js";
import { openLedger, verifyEvidenceEventIntegrity, verifyLedgerIntegrity, canonicalMetadataForHash } from "../../src/ledger/ledger.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { verifyStoredSessionEventMetadata } from "../../src/persistence/sessionStoreVerification.js";
import { jsonlEventsPath, serializeEventRow } from "../../src/persistence/jsonl/jsonlEventLog.js";
import { loadTrustContext, withPins, workspaceSelfTrust } from "../../src/trust/trustContext.js";
import { workspaceKeyTrust } from "../helpers/trustContext.js";

// The built-in distrust list ships empty; tests put a key on it through this hoisted state.
const distrust = vi.hoisted(() => ({ entries: [] as Array<{ keyId: string; distrustedFrom: string | null; reason: "key-compromise"; note: string; source: string }> }));
vi.mock("../../src/trust/builtInDistrust.js", () => ({ builtInDistrust: () => distrust.entries }));

const PASS = process.env.AMC_VAULT_PASSPHRASE!;
const roots: string[] = [];
afterEach(() => { distrust.entries = []; for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } });

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-purpose-providers-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}

/**
 * Writes the `keys` section of .amc/amc.config.yaml (null removes it) and signs the file, as an owner does with
 * `amc verify --sign-config`; `signed: false` leaves the edit unsigned.
 */
function configureKeys(root: string, keys: unknown, opts: { signed?: boolean } = {}): void {
  const path = join(root, ".amc", "amc.config.yaml");
  const config = (YAML.parse(readFileSync(path, "utf8")) ?? {}) as Record<string, unknown>;
  if (keys === null) delete config.keys;
  else config.keys = keys;
  writeFileSync(path, YAML.stringify(config));
  if (opts.signed !== false) signAmcConfig(root);
}

/** Records a revocation of `keyId` straight into the workspace key revocation list (as another tool or a restore would). */
function recordRevocation(root: string, keyId: string): void {
  const location = keyRevocationLocation(root);
  const current = readAnchoredRevocationList(location)!;
  const list = nextRevocationList(location.listId, { sequence: current.list.sequence, sha256: revocationListSha256(current.list) },
    [...current.list.revoked, { id: keyId, kind: "key", revokedAt: new Date().toISOString(), reason: "key-compromise: ledger-row" }], 0);
  publishRevocationList(location, list, getSigningKey(root, "revocation-list"), logSequence);
}

const sealKey = fakeKey("p256");
const issuerKey = fakeKey("ed25519");
const otherKey = fakeKey("p256");
function kms(fail?: string) {
  const fake = awsFake({ [AWS_ARN("seal")]: sealKey, [AWS_ARN("issuer")]: issuerKey, [AWS_ARN("other")]: otherKey }, { fail });
  return { fake, provider: awsKmsProvider(fake.call) };
}
const isCode = (code: string) => (error: unknown) => error instanceof KeyProviderError && error.code === code;

describe("purpose keys held by key providers (P2-08)", () => {
  it("file-provider signing preserves vault refusals across the async boundary", async () => {
    const root = workspace();
    const provider = fileKeyProvider(root);
    const ref = { provider: "file" as const, id: "ledger-row" };
    const description = await provider.describe(ref);
    const message = Buffer.from("AMC_P2_08_FILE_SIGNING_COMPATIBILITY_V1");
    const legacy = sign(null, message, getSigningKey(root, "ledger-row"));
    expect((await signWithPurposeKey(root, "ledger-row", message)).signature).toEqual(legacy);
    lockVault(root);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    try {
      await expect(signChecked(provider, description, message)).rejects.toThrow(/Vault locked/i);
      await expect(signWithPurposeKey(root, "ledger-row", message)).rejects.toThrow(/Vault locked/i);
    } finally {
      vi.unstubAllEnvs();
    }
    recordRevocation(root, description.keyId);
    await expect(signChecked(provider, description, message)).rejects.toBeInstanceOf(KeyRevokedError);
    await expect(signWithPurposeKey(root, "ledger-row", message)).rejects.toBeInstanceOf(KeyRevokedError);
  });

  it("without a keys section every purpose signs with the vault exactly as before", async () => {
    const root = workspace();
    const vaultKey = getSigningKey(root, "artifact-seal");
    const signed = await signWithPurposeKey(root, "artifact-seal", Buffer.alloc(32, 1));
    expect(signed).toMatchObject({ provider: "file", algorithm: "ed25519", publicKeyPem: getSigningPublicKeyPem(root, "artifact-seal") });
    expect(verifyHexDigestAny("01".repeat(32), signed.signature.toString("base64"), [signed.publicKeyPem])).toBe(true);
    expect(getSigningKey(root, "artifact-seal")).toBe(vaultKey);
    expect(listKeys(root).purposes.find(row => row.purpose === "artifact-seal")).toMatchObject({ provider: "file", algorithm: "ed25519", protection: "software", protectionBasis: "configured", providerKeyId: null });
  });

  it("a purpose configured to a provider never falls back to the vault, bound or not", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "artifact-seal": { provider: "aws-kms", id: AWS_ARN("seal") } } });
    expect(() => getSigningKey(root, "artifact-seal")).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" }));
    await expect(signWithPurposeKey(root, "artifact-seal", Buffer.alloc(32), { provider: kms().provider })).rejects.toSatisfy(isCode("KEY_PROVIDER_KEY_REFUSED"));
    // Other purposes keep the vault.
    expect(getSigningKey(root, "receipt")).toContain("PRIVATE KEY");
    // Saving the workspace config (amc config, setup) keeps the keys section, so the refusal survives it.
    saveAMCConfig(root, loadAMCConfig(root));
    expect(() => getSigningKey(root, "artifact-seal")).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" }));
  });

  it("only ledger-row can be bound in this release: other purposes keep refusing their vault key until removed from keys.refs", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "artifact-seal": { provider: "aws-kms", id: AWS_ARN("seal") } } });
    const { fake, provider } = kms();
    await expect(bindPurposeProviderKey(root, "artifact-seal", { passphrase: PASS, provider })).rejects.toThrow(/cannot be bound to artifact-seal yet/);
    expect(fake.requests).toEqual([]);
    expect(() => getSigningKey(root, "artifact-seal")).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" }));
    configureKeys(root, null);
    expect(getSigningKey(root, "artifact-seal")).toContain("PRIVATE KEY");
  });

  it("binding commits a key-set generation naming the provider key; signing then goes through the provider only", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("seal") } } });
    const { fake, provider } = kms();
    const before = listKeys(root).generation!;
    const bound = await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider });
    const pem = sealKey.publicKey.export({ format: "pem", type: "spki" }).toString();
    expect(bound).toMatchObject({ purpose: "ledger-row", generation: before + 1, provider: "aws-kms", keyId: signingKeyId(pem), algorithm: "ecdsa-p256-sha256", protection: "hsm", protectionBasis: "provider-metadata" });
    const keyset = JSON.parse(readFileSync(keysetPaths(root).keyset, "utf8"));
    expect(bound.delegationSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(keyset.providers["ledger-row"]).toEqual({ provider: "aws-kms", id: AWS_ARN("seal"), keyId: signingKeyId(pem), algorithm: "ecdsa-p256-sha256", protection: "hsm", protectionBasis: "provider-metadata", delegationSha256: bound.delegationSha256 });
    expect(keyset.files["keys/ledger-row-provider.pub"]).toMatch(/^[0-9a-f]{64}$/);
    expect(listKeys(root).purposes.find(row => row.purpose === "ledger-row")).toMatchObject({ provider: "aws-kms", algorithm: "ecdsa-p256-sha256", protection: "hsm", protectionBasis: "provider-metadata", providerKeyId: signingKeyId(pem) });

    const message = Buffer.alloc(32, 5);
    const signsBefore = fake.requests.filter(row => row.operation === "Sign").length;
    const signed = await signWithPurposeKey(root, "ledger-row", message, { provider });
    expect(fake.requests.filter(row => row.operation === "Sign").length).toBe(signsBefore + 1);
    expect(signed).toMatchObject({ provider: "aws-kms", algorithm: "ecdsa-p256-sha256", keyId: signingKeyId(pem), publicKeyPem: pem });
    expect(verifyCanonical("ecdsa-p256-sha256", message, pem, signed.signature)).toBe(true);
    // The bound key is admitted for its purpose, beside the vault delegate.
    expect(getPurposeKeyHistory(root, "ledger-row")).toEqual(expect.arrayContaining([pem, getSigningPublicKeyPem(root, "ledger-row")]));
    expect(verifyHexDigestAny("05".repeat(32), signed.signature.toString("base64"), getPurposeKeyHistory(root, "ledger-row"))).toBe(true);
  });

  it("fails closed: an unreachable provider, another key, a lost config or a rolled-back key set never signs with the vault", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("seal") } } });
    const unbound = readFileSync(keysetPaths(root).keyset);
    await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider: kms().provider });
    const delegate = getSigningKey(root, "ledger-row");

    const down = (await signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider: kms("TimeoutError").provider }).catch((e: unknown) => e)) as KeyProviderError;
    expect(down).toMatchObject({ code: "KEY_PROVIDER_UNAVAILABLE", status: 503 });
    expect(down.message).not.toMatch(/vault locked|internal\.example|111122223333/i);
    await expect(bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider: kms("AccessDeniedException").provider })).rejects.toSatisfy(isCode("KEY_PROVIDER_AUTH_FAILED"));

    // The key set, not the config, decides which key signs: a config naming another key, or none, changes nothing until
    // the owner binds again, and only the delegate the provider certified keeps signing rows.
    const boundId = listKeys(root).purposes.find(row => row.purpose === "ledger-row")!.providerKeyId;
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("other") } } });
    await expect(signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider: kms().provider })).resolves.toMatchObject({ keyId: boundId });
    configureKeys(root, null);
    await expect(signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider: kms().provider })).resolves.toMatchObject({ keyId: boundId });
    expect(getSigningKey(root, "ledger-row")).toBe(delegate);
    // A provider that describes another key than the bound one is refused.
    const swapped = awsFake({ [AWS_ARN("seal")]: otherKey });
    await expect(signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider: awsKmsProvider(swapped.call) })).rejects.toThrow(/not the key the key set binds/);

    // Putting back the key set from before the binding is a rollback this machine refuses.
    writeFileSync(keysetPaths(root).keyset, unbound);
    expect(() => getSigningKey(root, "ledger-row")).toThrow(AntiRollbackError);
  });

  it("a later rotation carries the binding forward; re-binding retains the old exact-purpose issuer as historical evidence", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("seal") } } });
    const { provider } = kms();
    const first = await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider });
    rotatePurposeKeys({ workspace: root, purposes: ["receipt"], passphrase: PASS });
    expect(JSON.parse(readFileSync(keysetPaths(root).keyset, "utf8")).providers["ledger-row"].keyId).toBe(first.keyId);
    await expect(signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider })).resolves.toMatchObject({ provider: "aws-kms", keyId: first.keyId });
    // A bound key still signs: revoking it is refused, as for any key in use (rotate, here re-bind, first).
    expect(() => revokeKey(root, "ledger-row", first.keyId, "key-compromise", PASS)).toThrow(/still signs/);

    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("other") } } });
    const second = await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider });
    expect(second.generation).toBeGreaterThan(first.generation);
    expect(second.keyId).toBe(signingKeyId(otherKey.publicKey.export({ format: "pem", type: "spki" }).toString()));
    expect(getPurposeKeyHistory(root, "ledger-row").map(pem => signingKeyId(pem))).toContain(first.keyId);
    await expect(signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider })).resolves.toMatchObject({ keyId: second.keyId });
    expect(getSigningKey(root, "ledger-row")).toContain("PRIVATE KEY");
  });

  it("public verification requires independent issuer admission even when the bound epoch has zero delegated rows", async () => {
    const root = workspace();
    const operatorHome = mkdtempSync(join(root, "empty-operator-home-"));
    vi.stubEnv("AMC_HOME", operatorHome);
    vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", "");
    try {
      const providerPem = sealKey.publicKey.export({ format: "pem", type: "spki" }).toString();
      // The operator's keys are chosen before the legacy row or provider-bound artifact exists.
      const operatorPins = withPins(workspaceKeyTrust(root), [{ keyId: signingKeyId(providerPem)!, purposes: ["ledger-row"], origin: "fixture independent provider operator" }]);
      const emptyOperator = loadTrustContext({ amcHome: operatorHome, env: {} });
      expect(emptyOperator.explicitPins).toEqual([]);
      expect(emptyOperator.lists).toEqual([]);
      const sql = openLedger(root);
      try {
        sql.startSession({ sessionId: "zero-row-epoch", runtime: "unknown", binaryPath: "zero-row-epoch-test", binarySha256: "a".repeat(64) });
        const legacy = sql.appendEvidenceDetailed({ sessionId: "zero-row-epoch", runtime: "unknown", eventType: "audit", meta: {} });
        configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("seal") } } });
        await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider: kms().provider });
        expect(sql.getAllEvents()).toHaveLength(1); // No row has a delegated marker yet.
        const pinned = { ...operatorPins, asOf: new Date() };
        expect(verifyEvidenceEventIntegrity({ ledger: sql, eventId: legacy.id, trust: pinned }).ok).toBe(true);
        expect(verifyStoredSessionEventMetadata(root, sql.getAllEvents(), { trust: pinned }).ok).toBe(true);
        const self = verifyStoredSessionEventMetadata(root, sql.getAllEvents(), { trust: workspaceSelfTrust(root) });
        expect(self.ok).toBe(true);
        expect(self.trustRoot.anchored).toBe(false);
        for (const trust of [{ ...emptyOperator, asOf: new Date() }, undefined]) {
          const event = verifyEvidenceEventIntegrity({ ledger: sql, eventId: legacy.id, ...(trust === undefined ? {} : { trust }) });
          expect(event.ok).toBe(false);
          expect(event.errors).toContainEqual(expect.stringMatching(/delegation.*issuer.*not-pinned|issuer.*not-pinned/i));
          const stream = verifyStoredSessionEventMetadata(root, sql.getAllEvents(), trust === undefined ? {} : { trust });
          expect(stream.ok).toBe(false);
          expect(stream.trustRoot.anchored).toBe(false);
          expect(stream.errors).toContainEqual(expect.stringMatching(/delegation.*issuer.*not-pinned|issuer.*not-pinned/i));
        }
      } finally { sql.close(); }
    } finally { vi.unstubAllEnvs(); }
  });

  for (const order of ["receipt-first", "outcome-first"] as const) {
    it(`${order}: actual receipt and outcome builders share the durable cap and require public issuer admission`, async () => {
      const root = workspace();
      const operatorHome = mkdtempSync(join(root, "empty-operator-home-"));
      vi.stubEnv("AMC_HOME", operatorHome);
      vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", "");
      try {
        const providerPem = sealKey.publicKey.export({ format: "pem", type: "spki" }).toString();
        // Independent operator choices precede the binding, receipt and outcome artifacts.
        const operatorPins = withPins(workspaceKeyTrust(root), [{ keyId: signingKeyId(providerPem)!, purposes: ["ledger-row"], origin: "fixture independent SQL provider operator" }]);
        const emptyOperator = loadTrustContext({ amcHome: operatorHome, env: {} });
        expect(emptyOperator.explicitPins).toEqual([]);
        expect(emptyOperator.lists).toEqual([]);
        configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("seal") } } });
        const { fake, provider } = kms();
        const bound = await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider, delegation: { maxEvents: 2 } });
        const remoteSigns = fake.requests.filter(row => row.operation === "Sign").length;
        let sql = openLedger(root);
        try {
          sql.startSession({ sessionId: "receipt-cap", runtime: "unknown", binaryPath: "receipt-cap-test", binarySha256: "a".repeat(64) });
          const body = "receipt-bearing evidence payload";
          const receiptInput = {
            sessionId: "receipt-cap", runtime: "unknown" as const, eventType: "audit" as const,
            payload: body, inline: true, meta: { trustTier: "SELF_REPORTED", witness: "receipt-builder" },
            receipt: { kind: "guard_check" as const, agentId: "default", providerId: "fixture", model: null, bodySha256: sha256Hex(body) }
          };
          const outcomeInput = { agentId: "default", category: "Functional" as const, metricId: "quota-public-admission", value: 1,
            trustTier: "SELF_REPORTED" as const, source: "manual" as const, meta: { witness: "outcome-builder" } };
          let receiptId: string;
          if (order === "receipt-first") {
            receiptId = sql.appendEvidenceWithReceipt(receiptInput).id;
            sql.appendOutcomeEvent(outcomeInput);
          } else {
            sql.appendOutcomeEvent(outcomeInput);
            receiptId = sql.appendEvidenceWithReceipt(receiptInput).id;
          }
          const evidence = sql.getEventById(receiptId)!;
          const outcome = sql.getAllOutcomeEvents()[0]!;
          const evidenceMarker = JSON.parse(evidence.meta_json).amcKeyDelegation;
          const outcomeMarker = JSON.parse(outcome.meta_json).amcKeyDelegation;
          expect(evidenceMarker).toEqual({ sha256: bound.delegationSha256, useSequence: order === "receipt-first" ? 1 : 2 });
          expect(outcomeMarker).toEqual({ sha256: bound.delegationSha256, useSequence: order === "receipt-first" ? 2 : 1 });
          const delegate = getSigningPublicKeyPem(root, "ledger-row");
          expect(verifyHexDigestAny(evidence.event_hash, evidence.writer_sig, [delegate])).toBe(true);
          expect(verifyHexDigestAny(outcome.event_hash, outcome.signature, [delegate])).toBe(true);
          sql.sealSession("receipt-cap");
          const pinned = { ...operatorPins, asOf: new Date() };
          expect(verifyEvidenceEventIntegrity({ ledger: sql, eventId: receiptId, requireReceipt: true, trust: pinned }).chain).toEqual({ ok: true, errors: [] });
          expect(verifyLedgerIntegrity(root, { trust: pinned }).chain).toEqual({ ok: true, errors: [] });
          for (const trust of [{ ...emptyOperator, asOf: new Date() }, undefined]) {
            const opts = trust === undefined ? {} : { trust };
            const event = verifyEvidenceEventIntegrity({ ledger: sql, eventId: receiptId, requireReceipt: true, ...opts });
            expect(event.chain.ok).toBe(false);
            expect(event.chain.errors).toContainEqual(expect.stringMatching(/delegation.*issuer.*not-pinned|issuer.*not-pinned/i));
            const whole = verifyLedgerIntegrity(root, opts);
            expect(whole.chain.ok).toBe(false);
            expect(whole.chain.errors).toContainEqual(expect.stringMatching(/delegation.*issuer.*not-pinned|issuer.*not-pinned/i));
          }
          // Reopen the real SQL writer: both distinct insertion paths read the same persisted grant usage.
          sql.close(); sql = openLedger(root);
          expect(() => sql.appendEvidenceWithReceipt(receiptInput)).toThrow(expect.objectContaining({ code: "KEY_DELEGATION_INVALID" }));
          expect(() => sql.appendOutcomeEvent(outcomeInput)).toThrow(expect.objectContaining({ code: "KEY_DELEGATION_INVALID" }));
          expect(sql.getAllEvents()).toHaveLength(1);
          expect(sql.getAllOutcomeEvents()).toHaveLength(1);
          expect(fake.requests.filter(row => row.operation === "Sign").length).toBe(remoteSigns);
          expect(verifyLedgerIntegrity(root, { trust: { ...operatorPins, asOf: new Date() } }).chain).toEqual({ ok: true, errors: [] });
        } finally { sql.close(); }
      } finally { vi.unstubAllEnvs(); }
    });
  }

  it("enforces an owner-selected two-row cap shared by SQLite control evidence and JSONL sessions", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("issuer") } } });
    const { fake, provider } = kms();
    const bound = await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider, delegation: { maxEvents: 2 } });
    const trust = withPins(workspaceKeyTrust(root), [{ keyId: bound.keyId, purposes: ["ledger-row"], origin: "fixture operator provider" }]);
    const remoteSigns = fake.requests.filter(request => request.operation === "Sign").length;
    let sql = openLedger(root); // control ledger coexists with the sticky JSONL session backend
    let jsonl = openSessionEventStore(root, "jsonl");
    try {
      sql.startSession({ sessionId: "control", runtime: "unknown", binaryPath: "control-test", binarySha256: "a".repeat(64) });
      jsonl.startSession({ sessionId: "session", runtime: "unknown", binaryPath: "session-test", binarySha256: "b".repeat(64) });
      const first = sql.appendEvidenceDetailed({ sessionId: "control", runtime: "unknown", eventType: "audit", meta: {} });
      jsonl.appendSessionEvent({ sessionId: "session", runtime: "unknown", eventType: "audit", meta: {} });
      expect(verifyEvidenceEventIntegrity({ ledger: sql, eventId: first.id, trust }).ok).toBe(true);
      expect(verifyStoredSessionEventMetadata(root, jsonl.readAllEvents(), { trust }).ok).toBe(true);
      jsonl.close(); sql.close();
      sql = openLedger(root);
      jsonl = openSessionEventStore(root, "jsonl");
      expect(() => sql.appendEvidence({ sessionId: "control", runtime: "unknown", eventType: "audit", meta: {} }))
        .toThrow(expect.objectContaining({ code: "KEY_DELEGATION_INVALID" }));
      expect(sql.getAllEvents()).toHaveLength(1);
      expect(jsonl.readAllEvents()).toHaveLength(1);
      expect(fake.requests.filter(request => request.operation === "Sign").length).toBe(remoteSigns);
      const markers = [sql.getAllEvents()[0]!, jsonl.readAllEvents()[0]!].map(row => JSON.parse(row.meta_json).amcKeyDelegation);
      expect(markers.map(marker => marker.useSequence)).toEqual([1, 2]);
      expect(new Set(markers.map(marker => marker.sha256))).toEqual(new Set([bound.delegationSha256]));
    } finally { jsonl.close(); sql.close(); }
  });

  it("preserves a real same-key legacy prefix and rejects a mathematically valid marker-free new row", async () => {
    const root = workspace();
    const issuerPem = issuerKey.publicKey.export({ format: "pem", type: "spki" }).toString();
    const trust = withPins(workspaceKeyTrust(root), [{ keyId: signingKeyId(issuerPem)!, purposes: ["ledger-row"], origin: "fixture operator before cutover" }]);
    const sql = openLedger(root);
    try {
      sql.startSession({ sessionId: "cutover", runtime: "unknown", binaryPath: "cutover-test", binarySha256: "a".repeat(64) });
      const old = sql.appendEvidenceDetailed({ sessionId: "cutover", runtime: "unknown", eventType: "audit", meta: {} });
      configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("issuer") } } });
      await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider: kms().provider, delegation: { maxEvents: 2 } });
      const current = sql.appendEvidenceDetailed({ sessionId: "cutover", runtime: "unknown", eventType: "audit", meta: {} });
      expect(verifyEvidenceEventIntegrity({ ledger: sql, eventId: old.id, trust }).ok).toBe(true);
      expect(verifyEvidenceEventIntegrity({ ledger: sql, eventId: current.id, trust }).ok).toBe(true);
      const row = sql.getEventById(current.id)!;
      const metadata = canonicalMetadataForHash({ id: row.id, ts: row.ts, sessionId: row.session_id, runtime: row.runtime, eventType: row.event_type,
        payloadPath: row.canonical_payload_path ?? row.payload_path, payloadInline: row.canonical_payload_inline ?? row.payload_inline, metaJson: "{}" });
      const forgedHash = sha256Hex(`${row.prev_event_hash}${metadata}${row.payload_sha256}`);
      const forgedSignature = sign(null, Buffer.from(forgedHash, "hex"), getSigningKey(root, "ledger-row")).toString("base64");
      expect(verifyHexDigestAny(forgedHash, forgedSignature, [getSigningPublicKeyPem(root, "ledger-row")])).toBe(true);
      // Simulate a replaced database in this owned fixture; the verifier must survive loss of writer-side triggers.
      sql.db.exec("DROP TRIGGER protect_evidence_immutable");
      sql.db.prepare("UPDATE evidence_events SET meta_json = ?, event_hash = ?, writer_sig = ? WHERE id = ?").run("{}", forgedHash, forgedSignature, current.id);
      const rejected = verifyEvidenceEventIntegrity({ ledger: sql, eventId: current.id, trust });
      expect(rejected.ok).toBe(false);
      expect(rejected.errors).toContainEqual(expect.stringMatching(/marker missing/));
    } finally { sql.close(); }
  });

  for (const backend of ["sqlite", "jsonl"] as const) {
    it(`${backend}: refuses a recorded timestamp outside its grant before consuming a row slot`, async () => {
      const root = workspace();
      configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("issuer") } } });
      const { provider } = kms();
      const bound = await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider, delegation: { maxEvents: 2 } });
      const store = openSessionEventStore(root, backend);
      try {
        store.startSession({ sessionId: "recorded-time", runtime: "unknown", binaryPath: "recorded-time-test", binarySha256: "a".repeat(64) });
        expect(() => store.appendSessionEvent({ sessionId: "recorded-time", runtime: "unknown", eventType: "audit", meta: {}, ts: Date.parse(bound.delegation!.notBefore) - 1 }))
          .toThrow(expect.objectContaining({ code: "KEY_DELEGATION_INVALID" }));
        expect(store.readAllEvents()).toHaveLength(0);
        store.appendSessionEvent({ sessionId: "recorded-time", runtime: "unknown", eventType: "audit", meta: {} });
        expect(JSON.parse(store.readAllEvents()[0]!.meta_json).amcKeyDelegation.useSequence).toBe(1);
      } finally { store.close(); }
    });

    it(`${backend}: refuses corruption in an existing prefix after a quota mark already exists`, async () => {
      const root = workspace();
      configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("issuer") } } });
      const { provider } = kms();
      await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider, delegation: { maxEvents: 2 } });
      const store = openSessionEventStore(root, backend);
      try {
        store.startSession({ sessionId: "corrupt-prefix", runtime: "unknown", binaryPath: "corrupt-prefix-test", binarySha256: "a".repeat(64) });
        const append = () => store.appendSessionEvent({ sessionId: "corrupt-prefix", runtime: "unknown", eventType: "audit", meta: {} });
        append();
        if (backend === "jsonl") writeFileSync(jsonlEventsPath(root), store.readAllEvents().map(row => serializeEventRow({ ...row, meta_json: "{}" })).join("\n") + "\n");
        else {
          const sql = openLedger(root);
          try {
            sql.db.exec("DROP TRIGGER protect_evidence_immutable"); // Owned adversarial database fixture only.
            sql.db.prepare("UPDATE evidence_events SET meta_json = ?").run("{}");
          } finally { sql.close(); }
        }
        expect(append).toThrow(/unverified|mismatch|delegation invalid/i);
        expect(store.readAllEvents()).toHaveLength(1);
      } finally { store.close(); }
    });
  }

  it("renews into a new pinned generation and preserves the actual old delegated row/archive", async () => {
    const root = workspace();
    const issuerPem = issuerKey.publicKey.export({ format: "pem", type: "spki" }).toString();
    const trust = withPins(workspaceKeyTrust(root), [{ keyId: signingKeyId(issuerPem)!, purposes: ["ledger-row"], origin: "fixture operator before cutover" }]);
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("issuer") } } });
    const { provider } = kms();
    const first = await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider, delegation: { maxEvents: 2 } });
    const archive = join(root, ".amc", "keys", "delegations", `${first.delegationSha256}.json`);
    const original = readFileSync(archive);
    const sql = openLedger(root);
    try {
      sql.startSession({ sessionId: "renewed", runtime: "unknown", binaryPath: "renew-test", binarySha256: "a".repeat(64) });
      const oldRow = sql.appendEvidenceDetailed({ sessionId: "renewed", runtime: "unknown", eventType: "audit", meta: {} });
      const second = await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider, delegation: { maxEvents: 2 } });
      expect(second.generation).toBeGreaterThan(first.generation);
      expect(second.delegationSha256).not.toBe(first.delegationSha256);
      expect(readFileSync(archive)).toEqual(original);
      const newRow = sql.appendEvidenceDetailed({ sessionId: "renewed", runtime: "unknown", eventType: "audit", meta: {} });
      expect(verifyEvidenceEventIntegrity({ ledger: sql, eventId: oldRow.id, trust }).ok).toBe(true);
      expect(verifyEvidenceEventIntegrity({ ledger: sql, eventId: newRow.id, trust }).ok).toBe(true);
      expect(JSON.parse(sql.getEventById(newRow.id)!.meta_json).amcKeyDelegation).toEqual({ sha256: second.delegationSha256, useSequence: 1 });
    } finally { sql.close(); }
  });

  it("export-public of a provider-held key prints the public key and a provider-signed proof of possession only", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("seal") } } });
    const { provider } = kms();
    await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider });
    const exported = await exportPurposePublicKey(root, "ledger-row", { provider });
    expect(exported).toMatchObject({ provider: "aws-kms", algorithm: "ecdsa-p256-sha256", publicKeyPem: sealKey.publicKey.export({ format: "pem", type: "spki" }).toString() });
    expect(Object.keys(exported).sort()).toEqual(["algorithm", "keyId", "proofOfPossession", "provider", "publicKeyPem", "purpose"]);
    expect(JSON.stringify(exported)).not.toContain("PRIVATE KEY");
    expect(verifyProofOfPossession(exported)).toBe(true);
    expect(verifyProofOfPossession({ ...exported, purpose: "artifact-seal" })).toBe(false);
  });

  it("review: a provider-held purpose is refused before the vault is touched", () => {
    const root = workspace();
    configureKeys(root, { refs: { "artifact-seal": { provider: "aws-kms", id: AWS_ARN("seal") } } }, { signed: false });
    lockVault(root);
    // AMC_VAULT_PASSPHRASE is set, so touching the vault would unlock it.
    expect(() => getSigningKey(root, "artifact-seal")).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" }));
    expect(vaultStatus(root).unlocked).toBe(false);
  });

  it("review: picking a provider key needs a signed amc.config.yaml, and the bytes verified are the bytes used", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("seal") } } }, { signed: false });
    const { fake, provider } = kms();
    await expect(bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider })).rejects.toThrow(/amc\.config\.yaml/);
    expect(fake.requests).toEqual([]);
    // Unsigned, the section still refuses the vault (it can only refuse, never pick a key).
    expect(() => getSigningKey(root, "ledger-row")).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" }));
    signAmcConfig(root);
    await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider });
    // An unsigned edit naming another key binds nothing; renewing the bound key needs no signature; signing ignores the config.
    const requests = fake.requests.length;
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("other") } } }, { signed: false });
    await expect(bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider })).rejects.toThrow(/amc\.config\.yaml/);
    expect(fake.requests.length).toBe(requests);
    await expect(signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider })).resolves.toMatchObject({ keyId: signingKeyId(sealKey.publicKey.export({ format: "pem", type: "spki" }).toString()) });
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("seal") } }, requireNonExportable: true }, { signed: false });
    await expect(bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider })).resolves.toMatchObject({ delegation: expect.any(Object) });
  });

  it("review: the ledger-row delegate is refused once the bound provider key is revoked", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("seal") } } });
    const { provider } = kms();
    const bound = await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider });
    expect(getSigningKey(root, "ledger-row")).toContain("PRIVATE KEY");
    recordRevocation(root, bound.keyId);
    expect(() => getSigningKey(root, "ledger-row")).toThrow(KeyRevokedError);
    await expect(signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider })).rejects.toBeInstanceOf(KeyRevokedError);
  });

  it("review: a delegation for any key but the one the vault serves is refused", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("seal") } } });
    const { provider } = kms();
    await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider });
    const issuer = await provider.describe({ provider: "aws-kms", id: AWS_ARN("seal") });
    const stranger = generateKeyPairSync("ed25519").publicKey.export({ format: "pem", type: "spki" }).toString();
    const forged = await issueDelegation(provider, issuer, { delegatePublicKeyPem: stranger, notBefore: new Date(), hours: 24, maxEvents: 10 });
    writeFileSync(join(vaultPaths(root).keysDir, "delegations", "ledger-row.json"), encodeDelegation(forged));
    expect(() => getSigningKey(root, "ledger-row")).toThrow(/key set generation.*incomplete/);
  });

  it("review: never another provider, and key changes stay owner-only", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("seal") } } });
    await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider: kms().provider });
    // The config now names a Google key: the binding is AWS, so nothing is asked of Google and nothing signs.
    configureKeys(root, { refs: { "ledger-row": { provider: "gcp-kms", id: GCP_KEY, version: "1" } } });
    const google = gcpFake(fakeKey("p256"), "HSM");
    await expect(signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider: gcpKmsProvider(google.call) })).rejects.toSatisfy(isCode("KEY_PROVIDER_KEY_REFUSED"));
    expect(google.requests).toEqual([]);
    // Even a provider of another kind that presents the bound key (and can sign with it) is not asked.
    const bound = await kms().provider.describe({ provider: "aws-kms", id: AWS_ARN("seal") });
    let asked = 0;
    const confused: KeyProvider = { id: "gcp-kms", describe: async ref => { asked++; return { ...bound, ref }; },
      sign: async (_ref, message) => { asked++; return sign("sha256", message, { key: sealKey.privateKey, dsaEncoding: "ieee-p1363" }); } };
    await expect(signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider: confused })).rejects.toSatisfy(isCode("KEY_PROVIDER_KEY_REFUSED"));
    expect(asked).toBe(0);
    // Agent mode: binding and creating a file-provider wrap key are refused inside the functions.
    setMode(root, "agent");
    await expect(bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider: kms().provider })).rejects.toThrow(/owner mode|agent mode/i);
    await expect(fileKeyProvider(root).wrapKey!({ provider: "file", id: "ledger-dek" }, Buffer.alloc(32))).rejects.toThrow(/owner mode|agent mode/i);
  });

  it("review 5: AMC, not the provider, decides revocation: a revoked bound key refuses with KeyRevokedError before the provider is asked", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("seal") } } });
    const { fake, provider } = kms();
    const bound = await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider });
    recordRevocation(root, bound.keyId);
    const asked = fake.requests.length;
    const refused = await signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(KeyRevokedError);
    expect(refused).toMatchObject({ code: "KEY_REVOKED" });
    await expect(exportPurposePublicKey(root, "ledger-row", { provider })).rejects.toBeInstanceOf(KeyRevokedError);
    expect(fake.requests.length).toBe(asked);
  });

  it("review 5: AMC, not the provider, decides the binding: a provider presenting another key than the key set names is refused with KEY_PROVIDER_KEY_REFUSED", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("seal") } } });
    await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider: kms().provider });
    // The provider answers for the bound ref with another key, and even reports the bound key id for it.
    const boundId = listKeys(root).purposes.find(row => row.purpose === "ledger-row")!.providerKeyId!;
    const swapped = awsKmsProvider(awsFake({ [AWS_ARN("seal")]: otherKey }).call);
    const liar: KeyProvider = { ...swapped, describe: async ref => ({ ...(await swapped.describe(ref)), keyId: boundId }) };
    for (const provider of [swapped, liar]) {
      await expect(signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider })).rejects.toSatisfy(isCode("KEY_PROVIDER_KEY_REFUSED"));
    }
  });

  it("review 5: a key on the distrust list refuses at the server clock, on the provider and the vault path alike", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("seal") } } });
    const { fake, provider } = kms();
    const bound = await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider });
    distrust.entries = [{ keyId: bound.keyId, distrustedFrom: new Date(Date.now() + 3_600_000).toISOString(), reason: "key-compromise", note: "test", source: "test" }];
    await expect(signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider })).resolves.toMatchObject({ keyId: bound.keyId });
    distrust.entries = [{ ...distrust.entries[0]!, distrustedFrom: null }];
    const asked = fake.requests.length;
    await expect(signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider })).rejects.toThrow(/distrusted/);
    expect(fake.requests.length).toBe(asked);
    // The delegate path checks its issuer the same way.
    expect(() => getSigningKey(root, "ledger-row")).toThrow(/distrusted/);
    // And the vault path, through the same function.
    const vaultKeyId = listKeys(root).purposes.find(row => row.purpose === "receipt")!.keyId!;
    distrust.entries = [{ keyId: vaultKeyId, distrustedFrom: null, reason: "key-compromise", note: "test", source: "test" }];
    expect(() => getSigningKey(root, "receipt")).toThrow(/distrusted/);
  });

  it("keys.requireNonExportable refuses the vault (file provider) for unbound purposes", async () => {
    const root = workspace();
    // Unsigned: the setting only refuses, so it counts as written (and the vault could not sign the config under it).
    configureKeys(root, { requireNonExportable: true }, { signed: false });
    expect(() => getSigningKey(root, "receipt")).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_KEY_REFUSED" }));
    await expect(signWithPurposeKey(root, "receipt", Buffer.alloc(32))).rejects.toSatisfy(isCode("KEY_PROVIDER_KEY_REFUSED"));
  });

  it("a locked vault still reports itself as locked for vault purposes", () => {
    const root = workspace();
    configureKeys(root, { refs: { "artifact-seal": { provider: "aws-kms", id: AWS_ARN("seal") } } });
    lockVault(root);
    const prior = process.env.AMC_VAULT_PASSPHRASE;
    delete process.env.AMC_VAULT_PASSPHRASE;
    try {
      expect(() => getSigningKey(root, "receipt")).toThrow(/Vault locked/);
    } finally {
      process.env.AMC_VAULT_PASSPHRASE = prior;
    }
  });

  it("ledger-row: the vault delegate signs rows only while a provider-signed delegation for it is current", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("issuer") } } });
    expect(() => getSigningKey(root, "ledger-row")).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" }));
    const { fake, provider } = kms();
    const now = new Date();
    const bound = await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider, now });
    expect(bound.delegation).toMatchObject({ notBefore: now.toISOString(), notAfter: new Date(now.getTime() + 24 * 3_600_000).toISOString() });
    const delegate = getSigningKey(root, "ledger-row");
    expect(delegate).toContain("PRIVATE KEY");
    const signs = fake.requests.filter(row => row.operation === "Sign").length;
    for (let i = 0; i < 5; i++) getSigningKey(root, "ledger-row");
    expect(fake.requests.filter(row => row.operation === "Sign").length).toBe(signs);

    const delegationFile = join(vaultPaths(root).keysDir, "delegations", "ledger-row.json");
    const current = readFileSync(delegationFile);
    // Expiry is exercised below by a grant actually committed while current on an owned historical clock.
    // Signed by another key: refused.
    const forged = JSON.parse(current.toString());
    forged.signature = Buffer.alloc(64, 3).toString("base64");
    writeFileSync(delegationFile, JSON.stringify(forged));
    expect(() => getSigningKey(root, "ledger-row")).toThrow(/key set generation.*incomplete/);
    rmSync(delegationFile);
    expect(() => getSigningKey(root, "ledger-row")).toThrow(/key set generation.*incomplete/);
    // Restore this generation's exact committed bytes before renewing; an unpinned pointer is never an owner repair.
    writeFileSync(delegationFile, current);
    await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider });
    expect(getSigningKey(root, "ledger-row")).toBe(delegate);
  });

  it("an owned historical grant was current when published and is refused after its signed expiry", async () => {
    const liveNow = Date.now(), historicalNow = liveNow - 25 * 3_600_000;
    let root = "", delegate = "";
    const { provider } = kms();
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(historicalNow);
      root = workspace();
      configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("issuer") } } });
      const bound = await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider });
      expect(bound.delegation).toMatchObject({ notBefore: new Date(historicalNow).toISOString(), notAfter: new Date(historicalNow + 24 * 3_600_000).toISOString() });
      delegate = getSigningKey(root, "ledger-row");
      expect(delegate).toContain("PRIVATE KEY");
    } finally { vi.useRealTimers(); }
    // The same exact committed file was not rewritten or re-signed to manufacture an expired state.
    expect(() => getSigningKey(root, "ledger-row")).toThrow(expect.objectContaining({ code: "KEY_DELEGATION_INVALID" }));
    await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider });
    expect(getSigningKey(root, "ledger-row")).toBe(delegate);
  });

  for (const backend of ["sqlite", "jsonl"] as const) {
    it.each(["expired", "locked", "issuer-revoked", "delegate-revoked", "keyset-rollback"] as const)(`${backend}: reauthorizes a warmed ledger key after %s`, async refusal => {
      const root = workspace();
      const initialKeyset = readFileSync(keysetPaths(root).keyset);
      configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("issuer") } } });
      const { fake, provider } = kms();
      const binding = await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider });
      const delegateId = signingKeyId(getSigningPublicKeyPem(root, "ledger-row"))!;
      const store = openSessionEventStore(root, backend);
      try {
        const sessionId = `delegation-cache-${backend}`;
        store.startSession({ sessionId, runtime: "unknown", binaryPath: "delegation-cache-test", binarySha256: "a".repeat(64) });
        const append = () => store.appendSessionEvent({ sessionId, runtime: "unknown", eventType: "audit", meta: {} });
        append(); // Warm the production writer's parsed private-key cache.
        const count = store.readAllEvents().length;
        const signCalls = fake.requests.filter(request => request.operation === "Sign").length;
        if (refusal === "expired") {
          vi.useFakeTimers({ toFake: ["Date"] });
          vi.setSystemTime(new Date(Date.parse(binding.delegation!.notAfter) + 1));
        } else if (refusal === "locked") {
          lockVault(root);
          vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
        } else if (refusal === "issuer-revoked") recordRevocation(root, binding.keyId);
        else if (refusal === "delegate-revoked") recordRevocation(root, delegateId);
        else writeFileSync(keysetPaths(root).keyset, initialKeyset);
        if (refusal === "expired") expect(append).toThrow(expect.objectContaining({ code: "KEY_DELEGATION_INVALID" }));
        else if (refusal === "locked") expect(append).toThrow(/Vault locked/);
        else if (refusal === "keyset-rollback") expect(append).toThrow(AntiRollbackError);
        else expect(append).toThrow(KeyRevokedError);
        expect(store.readAllEvents()).toHaveLength(count);
        expect(fake.requests.filter(request => request.operation === "Sign").length).toBe(signCalls);
      } finally {
        store.close();
        vi.useRealTimers();
        vi.unstubAllEnvs();
      }
    });
  }
});
