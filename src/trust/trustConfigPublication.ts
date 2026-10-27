/** Fixed direct trust-config operation. The configuration being replaced cannot select its own signer. */
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import YAML from "yaml";
import { relative, resolve } from "node:path";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { signDigestWithPurpose } from "../crypto/signing/signerPurpose.js";
import { verifySignatureEnvelope } from "../crypto/signing/signatureEnvelope.js";
import { withConfigSignaturePairLock } from "../config/configSignaturePair.js";
import { canonicalSigningKey, signingKeyId, verifyWithKey } from "../keys/algorithmPolicy.js";
import { assertKeyNotRevoked } from "../keys/keyRevocations.js";
import { assertKeysetComplete, boundProviderKey, keysetCommittedMark, keysetDeclared } from "../keys/keyset.js";
import { keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import { capturePurposePublication } from "../keys/purposePublication.js";
import { assertSigningKeyUsable, assertVaultMaySign, getPurposeKeyHistory, getSigningPublicKeyPem } from "../keys/signingKeys.js";
import { orgSignatureSchema } from "../org/orgSchema.js";
import { assertOrgPairsCurrent, captureOrgFiles, captureOrgPairs, OrgPairsPublicationError, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { distrustAt } from "./admissionRule.js";
import { loadTrustContext } from "./trustContext.js";
import { defaultTrustConfig, trustConfigPath, trustConfigSchema } from "./trustConfig.js";
import { pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
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

type TrustSignature = ReturnType<typeof orgSignatureSchema.parse>;
/** Keys whose signature trust.yaml carries: legacy auditor history first, then direct artifact-seal history. */
function trustSignatureMatches(workspace: string, signed: TrustSignature, digest: string): string[] {
  const matches = (keys: string[]) => keys.filter(publicKeyPem => signed.envelope === undefined
    ? verifyWithKey(Buffer.from(digest, "hex"), publicKeyPem, Buffer.from(signed.signature, "base64"))
    : signed.signature === signed.envelope.sigB64
      && verifySignatureEnvelope(digest, signed.envelope, { trustedPublicKeys: [publicKeyPem], requireTrustedKey: true }));
  const matching = matches(getPublicKeyHistory(workspace, "auditor"));
  // A refused legacy match cannot fall through to another purpose; NOTARY never selects a policy route here.
  return matching.length === 0 && signed.envelope?.signer.type !== "NOTARY" ? matches(getPurposeKeyHistory(workspace, "artifact-seal")) : matching;
}

/** Key ids trust.yaml's current signature verifies under, revocation not considered: revoking one would strand every policy signature. */
export function trustConfigSignerKeyIds(workspace: string): string[] {
  const path = trustConfigPath(workspace), sigPath = `${path}.sig`;
  if (!pathExists(path) || !pathExists(sigPath)) return [];
  const signed = orgSignatureSchema.parse(JSON.parse(readUtf8(sigPath)) as unknown), digest = sha256Hex(readFileSync(path));
  if (digest !== signed.digestSha256) return [];
  return trustSignatureMatches(workspace, signed, digest).flatMap(publicKeyPem => signingKeyId(publicKeyPem) ?? []);
}

/** Same captured body/signature bytes and old role precedence, with a direct purpose-only successor. */
export function verifyTrustConfigPublication(workspace: string) {
  const path = trustConfigPath(workspace), sigPath = `${path}.sig`;
  if (!pathExists(path)) return { valid: false, signatureExists: false, reason: "file missing", path, sigPath };
  if (!pathExists(sigPath)) return { valid: false, signatureExists: false, reason: "signature missing", path, sigPath };
  try {
    const signed = orgSignatureSchema.parse(JSON.parse(readUtf8(sigPath)) as unknown);
    const digest = sha256Hex(readFileSync(path));
    if (digest !== signed.digestSha256) return { valid: false, signatureExists: true, reason: "digest mismatch", path, sigPath };
    const matching = trustSignatureMatches(workspace, signed, digest);
    for (const publicKeyPem of matching) assertTrustKeyCurrent(workspace, publicKeyPem);
    const valid = matching.length > 0;
    return { valid, signatureExists: true, reason: valid ? null : "signature verify failed", path, sigPath };
  } catch (error) {
    return { valid: false, signatureExists: true, reason: String(error), path, sigPath };
  }
}

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
      const sidecar = Buffer.from(JSON.stringify({ digestSha256: digest, signature: signed.signature, signedTs: signed.signedTs,
        signer: "auditor", envelope: signed.envelope }, null, 2));
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
