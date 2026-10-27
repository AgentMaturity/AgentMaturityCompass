/** Fixed direct trust-config operation. The configuration being replaced cannot select its own signer. */
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import YAML from "yaml";
import { relative, resolve } from "node:path";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { signDigestWithPurpose } from "../crypto/signing/signerPurpose.js";
import { signDigestWithVault } from "../crypto/signing/signerVault.js";
import { verifySignatureEnvelope } from "../crypto/signing/signatureEnvelope.js";
import { withConfigSignaturePairLock } from "../config/configSignaturePair.js";
import { canonicalSigningKey, signingKeyId, verifyWithKey } from "../keys/algorithmPolicy.js";
import { assertKeyNotRevoked, readKeyRevocations } from "../keys/keyRevocations.js";
import { assertKeysetComplete, boundProviderKey, keysetCommittedMark, keysetDeclared } from "../keys/keyset.js";
import { keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import { capturePurposePublication } from "../keys/purposePublication.js";
import { assertSigningKeyUsable, assertVaultMaySign, getPurposeKeyHistory, getSigningPublicKeyPem } from "../keys/signingKeys.js";
import { orgSignatureSchema } from "../org/orgSchema.js";
import { assertOrgPairsCurrent, captureOrgFiles, captureOrgPairs, orgPairBytes, OrgPairsPublicationError, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { distrustAt } from "./admissionRule.js";
import { loadTrustContext, operatorDistrust } from "./trustContext.js";
import { defaultTrustConfig, trustConfigPath, trustConfigSchema } from "./trustConfig.js";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { captureVaultPurposeContinuity, vaultStatus } from "../vault/vault.js";

/** Refusal only: a pin or allow flag never supplies a signing key or overrides current negatives. */
function assertTrustKeyCurrent(workspace: string, publicKeyPem: string): void {
  const keyId = signingKeyId(publicKeyPem);
  if (keyId === null) throw new Error("trust signer public key is unsupported");
  assertKeyNotRevoked(workspace, keysetDeclared(workspace), keyId, "artifact-seal");
  const operator = loadTrustContext(), now = Date.now();
  if (distrustAt(operator.distrust, keyId, now) || operator.lists.some(list => list.entries.some(entry =>
    entry.keyId === keyId && entry.revocationReason === "key-compromise"))) {
    throw new Error("trust signer current distrust state refused");
  }
}

/** History keys whose signature the pair carries (legacy auditor history first, then direct artifact-seal); revocation and distrust are the caller's. */
function trustPairSigners(workspace: string, body: Buffer, sigBytes: Buffer): { digestMatches: boolean; signers: string[] } {
  const signed = orgSignatureSchema.parse(JSON.parse(sigBytes.toString("utf8")) as unknown);
  const digest = sha256Hex(body);
  if (digest !== signed.digestSha256) return { digestMatches: false, signers: [] };
  const matches = (keys: string[]) => keys.filter(publicKeyPem => signed.envelope === undefined
    ? verifyWithKey(Buffer.from(digest, "hex"), publicKeyPem, Buffer.from(signed.signature, "base64"))
    : signed.signature === signed.envelope.sigB64
      && verifySignatureEnvelope(digest, signed.envelope, { trustedPublicKeys: [publicKeyPem], requireTrustedKey: true }));
  const matching = matches(getPublicKeyHistory(workspace, "auditor"));
  // A refused legacy match cannot fall through to another purpose; NOTARY never selects a policy route here.
  const signers = matching.length === 0 && signed.envelope?.signer.type !== "NOTARY" ? matches(getPurposeKeyHistory(workspace, "artifact-seal")) : matching;
  return { digestMatches: true, signers };
}

/** Same captured body/signature bytes and old role precedence, with a direct purpose-only successor. */
export function verifyTrustConfigPublication(workspace: string) {
  const path = trustConfigPath(workspace), sigPath = `${path}.sig`;
  if (!pathExists(path)) return { valid: false, signatureExists: false, reason: "file missing", path, sigPath };
  if (!pathExists(sigPath)) return { valid: false, signatureExists: false, reason: "signature missing", path, sigPath };
  try {
    const { digestMatches, signers } = trustPairSigners(workspace, readFileSync(path), readFileSync(sigPath));
    if (!digestMatches) return { valid: false, signatureExists: true, reason: "digest mismatch", path, sigPath };
    for (const publicKeyPem of signers) assertTrustKeyCurrent(workspace, publicKeyPem);
    const valid = signers.length > 0;
    return { valid, signatureExists: true, reason: valid ? null : "signature verify failed", path, sigPath };
  } catch (error) {
    return { valid: false, signatureExists: true, reason: String(error), path, sigPath };
  }
}

/** The commands that re-sign a verified trust.yaml whose signer was retired or revoked (P0-37). */
const TRUST_RESIGN_RECOVERY = "amc trust resign --confirm";
const TRUST_COMPROMISED_RECOVERY = "review .amc/trust.yaml, then amc trust resign --confirm --accept-compromised-signer";
const TRUST_INIT_RECOVERY = "amc trust init";
type AcceptSigners = (signers: string[]) => void;

const keyIdsOf = (signers: string[]) => signers.flatMap(publicKeyPem => signingKeyId(publicKeyPem) ?? []);
/** Signers the workspace revoked as key-compromise: their content may be an attacker's, re-signed only on explicit acceptance. */
function compromisedSigners(workspace: string, signers: string[]): string[] {
  const compromised = new Set(readKeyRevocations(workspace, keysetDeclared(workspace)).filter(row => row.reason === "key-compromise").map(row => row.keyId));
  return keyIdsOf(signers).filter(keyId => compromised.has(keyId));
}
/** Signers the operator distrusts (built-in list, AMC home trust lists' distrust and key-compromise revocations): never re-signed. */
function distrustedSigners(signers: string[]): string[] {
  const now = Date.now(), distrust = operatorDistrust(new Date(now));
  return keyIdsOf(signers).filter(keyId => distrustAt(distrust, keyId, now) !== undefined);
}

/** The captured trust.yaml bytes, unchanged, once the captured pair verifies under a history key `accept` admits. */
function acceptedTrustBytes(workspace: string, previous: OrgPairsSnapshot, accept: AcceptSigners): Buffer {
  const path = trustConfigPath(workspace), body = orgPairBytes(previous, path), sig = orgPairBytes(previous, `${path}.sig`);
  if (body === null || sig === null) throw new Error(`trust.yaml or its signature is missing; nothing to re-sign (${TRUST_INIT_RECOVERY} creates it)`);
  const { digestMatches, signers } = trustPairSigners(workspace, body, sig);
  if (!digestMatches) throw new Error("trust.yaml does not match its signature; refusing to re-sign it");
  if (signers.length === 0) throw new Error("trust.yaml's signature does not verify under any artifact-seal history key; refusing to re-sign it");
  trustConfigSchema.parse(YAML.parse(body.toString("utf8")) as unknown);
  accept(signers);
  return body;
}

/** What `amc trust resign` would re-sign, for the operator to review first: content digest, settings and signers. */
export function describeTrustConfigResign(workspace: string) {
  const path = trustConfigPath(workspace);
  let signers: string[] = [];
  const body = acceptedTrustBytes(workspace, withConfigSignaturePairLock(workspace, () => captureOrgPairs([path])), found => { signers = found; });
  const config = trustConfigSchema.parse(YAML.parse(body.toString("utf8")) as unknown);
  return { sha256: sha256Hex(body), config, signerKeyIds: keyIdsOf(signers),
    compromisedSignerKeyIds: compromisedSigners(workspace, signers), distrustedSignerKeyIds: distrustedSigners(signers) };
}

/**
 * `amc trust resign`: an owner re-signs trust.yaml's current bytes in place (NOTARY settings included) with the current
 * artifact-seal key. The bytes must verify under their recorded signer from key history; that signer may be retired or
 * revoked for this one operation only, a key-compromise signer only with `acceptCompromisedSigner`, and a signer the
 * operator distrusts never. `expectedSha256`
 * binds the re-sign to the content the operator reviewed. Content that does not verify is refused and nothing is written.
 */
export async function resignTrustConfig(workspace: string, opts: { acceptCompromisedSigner?: boolean; expectedSha256?: string; beforePublish?: () => void } = {}) {
  let mode: string | undefined;
  const completed = await captureTrustConfigOperation(workspace, opts.beforePublish).publish(previous => {
    const body = acceptedTrustBytes(workspace, previous, signers => {
      const distrusted = distrustedSigners(signers);
      if (distrusted.length > 0) throw new Error(`trust.yaml is signed by ${distrusted.join(", ")}, which the operator trust context distrusts; refusing to re-sign it (${TRUST_INIT_RECOVERY} recreates it)`);
      const compromised = compromisedSigners(workspace, signers);
      if (compromised.length > 0 && opts.acceptCompromisedSigner !== true) {
        throw new Error(`trust.yaml is signed by ${compromised.join(", ")}, revoked as key-compromise; ${TRUST_COMPROMISED_RECOVERY}`);
      }
    });
    if (opts.expectedSha256 !== undefined && sha256Hex(body) !== opts.expectedSha256) throw new Error("trust.yaml changed since it was reviewed; refusing to re-sign it");
    mode = trustConfigSchema.parse(YAML.parse(body.toString("utf8")) as unknown).trust.mode;
    return body;
  });
  completed.assertCurrent();
  return { path: completed.path, sigPath: completed.sigPath, mode };
}

export interface TrustConfigRevocationOutcome {
  status: "absent" | "unchanged" | "resigned" | "refused";
  reason?: string; recovery?: string;
}
function refusedTrust(workspace: string, reason: string): TrustConfigRevocationOutcome {
  let recovery = TRUST_INIT_RECOVERY;
  try {
    const path = trustConfigPath(workspace);
    const { signers } = trustPairSigners(workspace, readFileSync(path), readFileSync(`${path}.sig`));
    if (signers.length > 0 && distrustedSigners(signers).length === 0) recovery = compromisedSigners(workspace, signers).length > 0 ? TRUST_COMPROMISED_RECOVERY : TRUST_RESIGN_RECOVERY;
  } catch { /* unreadable or unverifiable: only a new config recovers it */ }
  return { status: "refused", reason, recovery };
}

/**
 * Before `keyId` is revoked, under the pre-revocation trust state: a trust.yaml it signs that verifies is re-signed,
 * unchanged, by the current key; one that does not verify is left refused. A key-compromise revocation never re-signs:
 * the attacker holding the key may have signed that content. Its callers below never throw: whatever trust.yaml's
 * state, the revocation goes ahead.
 */
function trustRevocationPlan(workspace: string, keyId: string, revocationReason: string): TrustConfigRevocationOutcome | AcceptSigners {
  const path = trustConfigPath(workspace);
  if (!pathExists(path)) return { status: "absent" };
  const before = verifyTrustConfigPublication(workspace);
  if (!before.valid) return refusedTrust(workspace, before.reason ?? "signature verify failed");
  const signedBy = (signers: string[]) => signers.some(publicKeyPem => signingKeyId(publicKeyPem) === keyId);
  if (!signedBy(trustPairSigners(workspace, readFileSync(path), readFileSync(`${path}.sig`)).signers)) return { status: "unchanged" };
  if (revocationReason === "key-compromise") return { status: "refused", reason: "signer-compromised", recovery: TRUST_COMPROMISED_RECOVERY };
  // The captured pair is checked again: still the key just verified current, never whatever replaced it since.
  return signers => { if (!signedBy(signers)) throw new Error("trust.yaml changed: the key being revoked no longer signs it"); };
}
export async function resignTrustConfigForRevocation(workspace: string, keyId: string, revocationReason: string): Promise<TrustConfigRevocationOutcome> {
  try {
    const plan = trustRevocationPlan(workspace, keyId, revocationReason);
    if (typeof plan !== "function") return plan;
    (await captureTrustConfigOperation(workspace).publish(previous => acceptedTrustBytes(workspace, previous, plan))).assertCurrent();
    return { status: "resigned" };
  } catch (error) { return refusedTrust(workspace, String(error)); }
}
/** The synchronous owner API's variant: vault key only, as initTrustConfig signs. */
export function resignTrustConfigForRevocationSync(workspace: string, keyId: string, revocationReason: string): TrustConfigRevocationOutcome {
  try {
    const plan = trustRevocationPlan(workspace, keyId, revocationReason);
    if (typeof plan !== "function") return plan;
    if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing");
    withConfigSignaturePairLock(workspace, () => {
      const path = trustConfigPath(workspace), previous = captureOrgPairs([path]);
      const digest = sha256Hex(acceptedTrustBytes(workspace, previous, plan));
      const signed = signDigestWithVault({ workspace, kind: "BUNDLE", digestHex: digest });
      assertOrgPairsCurrent(previous);
      writeFileAtomic(`${path}.sig`, trustSidecar(signed), 0o644);
    });
    return { status: "resigned" };
  } catch (error) { return refusedTrust(workspace, String(error)); }
}
const trustSidecar = (signed: { digestSha256: string; signature: string; signedTs: number; envelope?: unknown }) =>
  Buffer.from(JSON.stringify({ digestSha256: signed.digestSha256, signature: signed.signature, signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope }, null, 2));

/** Direct initializer retains its original input copy before authority/predecessor capture. */
export async function publishTrustConfig(workspace: string, input: Uint8Array, beforePublish?: () => void) {
  const bytes = Buffer.from(input);
  return publishTrustConfigOperation(workspace, () => bytes, beforePublish);
}

interface NotaryTrustInputs {
  baseUrl: string; unixSocketPath: string | null; fingerprint: string;
  requiredAttestationLevel: "SOFTWARE" | "HARDWARE";
}
/** The captured old body supplies every retained field; only fixed drivers choose this recipe. */
function notaryTrustBytes(workspace: string, previous: OrgPairsSnapshot, params: NotaryTrustInputs): Buffer {
  const body = previous.members.find(member => member.path === trustConfigPath(workspace));
  if (body === undefined) throw new Error("trust predecessor was not captured");
  const current = body.bytes === null ? defaultTrustConfig() : trustConfigSchema.parse(YAML.parse(body.bytes.toString("utf8")) as unknown);
  const next = trustConfigSchema.parse({ trust: {
    ...current.trust, mode: "NOTARY", notary: {
      ...current.trust.notary, baseUrl: params.baseUrl, unixSocketPath: params.unixSocketPath,
      pinnedPubkeyFingerprint: params.fingerprint,
      auth: { secretRef: "vault:notary/auth", headerName: "x-amc-notary-auth", hmacAlg: "sha256" },
      requiredAttestationLevel: params.requiredAttestationLevel
    }
  } });
  return Buffer.from(YAML.stringify(next), "utf8");
}
/** Fixed bootstrap staging. No caller supplies an authority, predecessor or generic preparation callback. */
export function captureNotaryTrustConfig(workspace: string, beforePublish?: () => void) {
  const operation = captureTrustConfigOperation(workspace, beforePublish);
  return Object.freeze({ assertCurrent: operation.assertCurrent, publish(input: NotaryTrustInputs) {
    const params = { ...input };
    return operation.publish(previous => notaryTrustBytes(workspace, previous, params));
  } });
}
/** The unchanged initializer and fixed direct driver keep the same private Promise boundary. */
async function publishTrustConfigOperation(workspace: string, prepare: (previous: OrgPairsSnapshot) => Buffer, beforePublish?: () => void) {
  return captureTrustConfigOperation(workspace, beforePublish).publish(prepare);
}
function captureTrustConfigOperation(workspace: string, beforePublish?: () => void) {
  const actor = beforePublish, root = resolve(workspace);
  const realRoot = realpathSync(root), originalRoot = lstatSync(root);
  if (!originalRoot.isDirectory()) throw new Error("trust initialization root must be a directory");
  const enabled = () => { if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing"); };
  enabled();
  // Entry alone may unlock/migrate normally; later outer checks never refresh private material.
  const captured = capturePurposePublication(workspace, "artifact-seal"), originalMark = canonicalize(keysetCommittedMark(workspace));
  const bound = boundProviderKey(workspace, "artifact-seal"), binding = canonicalize(bound), holder = bound?.binding.provider ?? "file";
  const publicKeyPem = bound?.publicKeyPem ?? getSigningPublicKeyPem(workspace, "artifact-seal");
  const algorithm = canonicalSigningKey(publicKeyPem)?.algorithm, policy = canonicalize(keyPolicy(loadKeysConfig(workspace)));
  if (algorithm === undefined) throw new Error("original trust signing key is unsupported");
  const fileCurrent = holder === "file" ? captureVaultPurposeContinuity(workspace, "artifact-seal") : null;
  const path = trustConfigPath(workspace), sigPath = `${path}.sig`;
  const previous = withConfigSignaturePairLock(workspace, () => captureOrgPairs([path]));
  const expected = new Map(previous.members.map(member => [member.path, { ...member, bytes: member.bytes === null ? null : Buffer.from(member.bytes) }]));
  const expectedPair = (): OrgPairsSnapshot => ({ members: [...expected.values()] });
  let signatureCurrent: (() => void) | null = null, refused = false, firstRefusal: unknown;
  let started = false, failed = false, failure: unknown;
  const intrinsic = () => {
    enabled();
    const currentRoot = lstatSync(root), settings = keyPolicy(loadKeysConfig(workspace));
    if (resolve(workspace) !== root || realpathSync(root) !== realRoot || !currentRoot.isDirectory()
      || currentRoot.dev !== originalRoot.dev || currentRoot.ino !== originalRoot.ino) throw new Error("original trust initialization root changed");
    if (canonicalize(assertKeysetComplete(workspace)) !== captured.keyset || canonicalize(keysetCommittedMark(workspace)) !== originalMark
      || canonicalize(boundProviderKey(workspace, "artifact-seal")) !== binding || canonicalize(settings) !== policy
      || !settings.allowed.includes(algorithm) || (holder === "file" && settings.requireNonExportable)) {
      throw new Error("original trust signing authority changed or is refused");
    }
    if (fileCurrent !== null) {
      fileCurrent();
      if (!vaultStatus(workspace).unlocked) throw new Error("original trust signing vault is locked");
      assertVaultMaySign(workspace, "artifact-seal");
      if (getSigningPublicKeyPem(workspace, "artifact-seal") !== publicKeyPem) throw new Error("original trust signing public key changed");
    }
    assertSigningKeyUsable(workspace, "artifact-seal", publicKeyPem, holder);
    assertTrustKeyCurrent(workspace, publicKeyPem);
    signatureCurrent?.(); assertOrgPairsCurrent(expectedPair()); enabled();
  };
  const gate = () => {
    if (failed) throw failure;
    if (refused) throw firstRefusal;
    try { intrinsic(); actor?.(); intrinsic(); }
    catch (error) { if (!refused) { refused = true; firstRefusal = error; } throw firstRefusal; }
  };
  const published: string[] = []; let attempted = "";
  const fail = (cause: unknown): never => {
    failed = true; failure = cause;
    if (published.length === 0 && attempted === "") throw cause;
    throw new OrgPairsPublicationError(Object.freeze([...published]), attempted, cause);
  };
  return Object.freeze({ assertCurrent: gate, async publish(prepare: (previous: OrgPairsSnapshot) => Buffer) {
    if (failed) throw failure;
    if (refused) throw firstRefusal;
    if (started) throw new Error("trust publication was already attempted");
    started = true;
    try {
      const bytes = prepare(previous), digest = sha256Hex(bytes);
      gate();
      const signed = await signDigestWithPurpose({ workspace, kind: "BUNDLE", digestHex: digest, beforeSign: gate });
      signatureCurrent = () => {
        if (signed.digestSha256 !== digest || signed.signer !== "auditor" || signed.envelope === undefined
          || signed.envelope.signer.type !== "VAULT" || signed.envelope.alg !== algorithm || signed.signature !== signed.envelope.sigB64
          || !verifySignatureEnvelope(digest, signed.envelope, { trustedPublicKeys: [publicKeyPem], requireTrustedKey: true })) {
          throw new Error("prepared trust signature does not match its original direct signer");
        }
      };
      gate();
      const sidecar = trustSidecar(signed);
      withConfigSignaturePairLock(workspace, () => {
        gate();
        for (const member of [{ path, bytes }, { path: sigPath, bytes: sidecar }]) {
          gate(); attempted = relative(workspace, member.path);
          writeFileAtomic(member.path, member.bytes, 0o644); published.push(attempted);
          const actual = captureOrgFiles([member.path]).members[0];
          if (actual === undefined || actual.mode !== 0o644 || actual.bytes === null || !actual.bytes.equals(member.bytes)) {
            throw new Error("published trust member differs from its prepared bytes or mode");
          }
          expected.set(member.path, { ...actual, bytes: Buffer.from(actual.bytes) }); attempted = "";
        }
        gate();
      });
      gate();
    } catch (error) { return fail(error); }
    return Object.freeze({ path, sigPath, assertCurrent() {
      try { gate(); } catch (error) { fail(error); }
    } });
  } });
}
