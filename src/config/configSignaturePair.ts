import { join } from "node:path";
import { getSigningKey, signHexDigest } from "../crypto/keys.js";
import { canonicalSigningKey, verifyWithKey } from "../keys/algorithmPolicy.js";
import { assertKeysetComplete, boundProviderKey, keysetCommittedMark } from "../keys/keyset.js";
import { configuredRef, keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import { KeyProviderError } from "../keys/provider.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { assertPurposePublicationCurrent, capturePurposePublication } from "../keys/purposePublication.js";
import { assertSigningKeyUsable, assertVaultMaySign, getSigningPublicKeyPem } from "../keys/signingKeys.js";
import { verifyCurrentPurposeCredentialSignature } from "../keys/purposeCredentialSignature.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { assertOrgPairsCurrent, captureOrgFiles, captureOrgPairs, orgPairBytes, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { vaultStatus } from "../vault/vault.js";

function signingEnabled() { if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing"); }

/** Actual original public config-purpose negative. No private probe, unlock, migration, Describe or Sign.
 * Authenticated keyset/revocation reads can record high-water/adoption state; this capture is not globally pure.
 */
function capturePublicConfigAuthority(workspace: string): () => void {
  signingEnabled();
  const committedMark = () => {
    const mark = keysetCommittedMark(workspace);
    return canonicalize(mark === null ? null : { sequence: mark.sequence, sha256: mark.sha256 });
  };
  const originalMark = committedMark(), selectedKeyset = assertKeysetComplete(workspace);
  if (selectedKeyset === null) throw new Error("original config-signature public authority needs an existing complete key set");
  const keyset = canonicalize(selectedKeyset), bound = boundProviderKey(workspace, "config-signature"), binding = canonicalize(bound);
  const holder = bound?.binding.provider ?? "file", publicKeyPem = bound?.publicKeyPem ?? getSigningPublicKeyPem(workspace, "config-signature");
  const algorithm = canonicalSigningKey(publicKeyPem)?.algorithm, settings = loadKeysConfig(workspace), selectedPolicy = keyPolicy(settings);
  const policy = canonicalize(selectedPolicy);
  if (algorithm === undefined) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the original public config signer is unsupported");
  if (!selectedPolicy.allowed.includes(algorithm) || (holder === "file" && selectedPolicy.requireNonExportable))
    throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the original public config policy refuses signing");
  // A bound ref comes from the committed binding. Only an unbound file signer consults an editable configured ref.
  if (bound === null) {
    const ref = configuredRef(settings, "config-signature");
    if (ref !== null) throw new KeyProviderError("KEY_PROVIDER_HELD", ref.provider, "the original config purpose is configured to an unbound provider key");
  }
  const assertCurrent = () => {
    signingEnabled();
    if (committedMark() !== originalMark || canonicalize(assertKeysetComplete(workspace)) !== keyset
      || canonicalize(keyPolicy(loadKeysConfig(workspace))) !== policy || canonicalize(boundProviderKey(workspace, "config-signature")) !== binding)
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the original public config authority changed before signing");
    assertSigningKeyUsable(workspace, "config-signature", publicKeyPem, holder);
    if (holder === "file") {
      assertVaultMaySign(workspace, "config-signature");
      if (getSigningPublicKeyPem(workspace, "config-signature") !== publicKeyPem)
        throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the original public config key changed before signing");
    }
    signingEnabled();
  };
  assertCurrent(); return assertCurrent;
}

/** Private compatibility core for the retained synchronous pair methods. */
function captureCompatibilityAuthority(workspace: string, beforePublish?: () => void) {
  const caller = beforePublish; caller?.();
  const captured = capturePurposePublication(workspace, "config-signature"), bound = boundProviderKey(workspace, "config-signature");
  const holder = bound?.binding.provider ?? "file", publicKeyPem = bound?.publicKeyPem ?? getSigningPublicKeyPem(workspace, "config-signature");
  const algorithm = canonicalSigningKey(publicKeyPem)?.algorithm, originalPolicy = canonicalize(keyPolicy(loadKeysConfig(workspace)));
  if (algorithm === undefined) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the original config signer is unsupported");
  const assertCurrent = () => {
    caller?.();
    const policy = keyPolicy(loadKeysConfig(workspace));
    if (canonicalize(assertKeysetComplete(workspace)) !== captured.keyset || canonicalize(policy) !== originalPolicy
      || !policy.allowed.includes(algorithm) || (holder === "file" && policy.requireNonExportable))
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the original config authority changed or is refused");
    assertSigningKeyUsable(workspace, "config-signature", publicKeyPem, holder);
    if (holder === "file") {
      if (!vaultStatus(workspace).unlocked) throw new Error("original config vault is locked; unlock before signing");
      assertVaultMaySign(workspace, "config-signature");
    }
  };
  assertCurrent(); return Object.freeze({ captured, publicKeyPem, assertCurrent });
}

/** Fixed signed-async authority; callbacks can only add refusal. No kind, key or provider override. */
export function captureConfigSignatureAuthority(workspace: string, beforePublish?: () => void) {
  const publicCurrent = capturePublicConfigAuthority(workspace), caller = beforePublish;
  const actual = captureCompatibilityAuthority(workspace, () => {
    signingEnabled(); publicCurrent(); caller?.(); signingEnabled(); publicCurrent();
  });
  // Normal local warming remains after the actor; its generation change cannot become a fresh original.
  publicCurrent(); return actual;
}

/** Exact config-purpose/current-refusal rule; the unlabelled wire is verified in each key's canonical algorithm. */
export function verifyRawConfigSignature(workspace: string, digest: string, signature: string): boolean {
  try {
    assertKeysetComplete(workspace);
    return verifyCurrentPurposeCredentialSignature(workspace, "config-signature", Buffer.from(digest, "hex"), Buffer.from(signature, "base64"));
  } catch { return false; }
}

export function withConfigSignaturePairLock<T>(workspace: string, operation: () => T): T {
  return withControlFileLock({ root: join(workspace, ".amc"), name: "org-auditor-pairs", operation });
}
export interface ConfigSignaturePairOptions {
  beforePublish?: () => void;
  previous?: OrgPairsSnapshot;
}
export class ConfigSignaturePublicationError extends Error {
  readonly code = "CONFIG_SIGNATURE_PARTIAL";
  constructor(readonly publishedPaths: readonly string[], readonly attemptedPath: string | null, cause: unknown) {
    super("config pair publication is incomplete; earlier members remain committed", { cause }); this.name = "ConfigSignaturePublicationError";
  }
}
function capture(workspace: string, file: string, field: "configSha256" | "digestSha256", replacement?: Uint8Array,
  options: ConfigSignaturePairOptions = {}, publicCurrent?: () => void) {
  let refusedNoSign = process.env.AMC_NO_SIGN === "1";
  const caller = options.beforePublish, copy = replacement === undefined ? undefined : Buffer.from(replacement);
  // Retained mixed entries record negatives without new public reads; only the source-fixed async entry supplies publicCurrent.
  const beforePublish = () => {
    if (process.env.AMC_NO_SIGN === "1") refusedNoSign = true;
    if (publicCurrent !== undefined) { signingEnabled(); publicCurrent(); }
    caller?.();
    if (process.env.AMC_NO_SIGN === "1") refusedNoSign = true;
    if (publicCurrent !== undefined) { signingEnabled(); publicCurrent(); }
  };
  const assertAsyncSigning = () => {
    if (refusedNoSign) throw new Error("no-sign mode does not authorize policy signing");
    signingEnabled();
  };
  const beforeAsyncPublish = () => { assertAsyncSigning(); beforePublish(); assertAsyncSigning(); };
  beforePublish();
  const selected = options.previous ?? withConfigSignaturePairLock(workspace, () => captureOrgPairs([file]));
  const previous: OrgPairsSnapshot = { members: selected.members.filter(row => row.path === file || row.path === `${file}.sig`).map(row => ({ ...row, bytes: row.bytes === null ? null : Buffer.from(row.bytes) })) };
  const bytes = copy ?? orgPairBytes(previous, file);
  if (bytes === null) throw new Error("config file missing: " + file);
  orgPairBytes(previous, `${file}.sig`); // Both actual destinations must belong to the captured pair.
  const original = captureCompatibilityAuthority(workspace);
  publicCurrent?.(); // Refuse a changed generation after the actual existing private warm, before another actor or await.
  const digestSha256 = sha256Hex(bytes);
  const beforeSign = () => { beforePublish(); original.assertCurrent(); assertOrgPairsCurrent(previous); };
  const beforeAsyncSign = () => { beforeAsyncPublish(); original.assertCurrent(); assertOrgPairsCurrent(previous); };
  beforeSign();
  function complete(signature: string, checkedCurrent?: () => void) {
    // Only the actual private async prepare call below supplies its genuine response-currentness gate.
    const actor = checkedCurrent === undefined ? beforePublish : beforeAsyncPublish;
    let published: OrgPairsSnapshot | null = null;
    const assertSignatureCurrent = () => {
      if (checkedCurrent !== undefined) assertAsyncSigning();
      publicCurrent?.(); original.assertCurrent(); checkedCurrent?.(); publicCurrent?.();
      if (!verifyWithKey(Buffer.from(digestSha256, "hex"), original.publicKeyPem, Buffer.from(signature, "base64")))
        throw new Error("prepared config signature does not match the original actual signer");
    };
    const assertCurrent = () => { actor(); assertSignatureCurrent(); assertOrgPairsCurrent(published ?? previous); };
    assertCurrent();
    return Object.freeze({ bytes: Buffer.from(bytes), digestSha256, assertCurrent, assertSignatureCurrent, publish() {
      return withConfigSignaturePairLock(workspace, () => {
        const signatureBytes = Buffer.from(JSON.stringify({ [field]: digestSha256, signature, signedTs: Date.now(), signer: "auditor" }, null, 2));
        const expected = new Map(previous.members.map(row => [row.path, row]));
        const currentExpected = (): OrgPairsSnapshot => ({ members: [...expected.values()] });
        const beforeMember = () => { actor(); assertSignatureCurrent(); assertOrgPairsCurrent(currentExpected()); };
        const acknowledge = (path: string, intended: Buffer) => {
          const row = captureOrgFiles([path]).members[0];
          if (row === undefined || row.mode !== 0o644 || row.bytes === null || !row.bytes.equals(intended))
            throw new Error("published config member differs from its actual prepared bytes");
          expected.set(path, row);
        };
        const paths: string[] = []; let attemptedPath: string | null = null;
        try {
          if (copy !== undefined) {
            beforeMember(); attemptedPath = file;
            writeFileAtomic(file, bytes, 0o644); paths.push(file); acknowledge(file, bytes); attemptedPath = null;
          }
          beforeMember(); attemptedPath = `${file}.sig`;
          writeFileAtomic(attemptedPath, signatureBytes, 0o644); paths.push(attemptedPath); acknowledge(attemptedPath, signatureBytes); attemptedPath = null;
          beforeMember(); published = currentExpected();
        } catch (cause) {
          if (paths.length === 0 && attemptedPath === null) throw cause;
          throw new ConfigSignaturePublicationError(Object.freeze([...paths]), attemptedPath, cause);
        }
        return { path: file, sigPath: `${file}.sig` };
      });
    } });
  }
  const prepareSync = () => { beforeSign(); return complete(signHexDigest(digestSha256, getSigningKey(workspace, "config-signature"))); };
  return Object.freeze({ bytes: Buffer.from(bytes), digestSha256, assertInputsCurrent: beforeAsyncSign, prepareSync,
    publishSync() { return prepareSync().publish(); },
    async prepare() {
      assertAsyncSigning();
      const signed = await signWithPurposeKey(workspace, "config-signature", Buffer.from(digestSha256, "hex"), { beforeSign: beforeAsyncSign });
      beforeAsyncSign();
      return complete(signed.signature.toString("base64"), () => assertPurposePublicationCurrent(workspace, original.captured, signed));
    }
  });
}
/** Actual gateway wire: configSha256 and the existing four raw-signature fields. */
export function captureGatewayConfigPair(workspace: string, file: string, replacement?: Uint8Array, options: ConfigSignaturePairOptions = {}) {
  return capture(workspace, file, "configSha256", replacement, options);
}
/** Fixed raw config wire used by actual fleet/agent publishers: digestSha256 and four existing fields. */
export function captureRawConfigPair(workspace: string, file: string, replacement?: Uint8Array, options: ConfigSignaturePairOptions = {}) {
  return capture(workspace, file, "digestSha256", replacement, options);
}

/** Source-fixed async entry. The private negative comes only from its real public constructor above. */
function captureForAsync(workspace: string, file: string, field: "configSha256" | "digestSha256", replacement: Uint8Array | undefined,
  options: ConfigSignaturePairOptions) {
  const publicCurrent = capturePublicConfigAuthority(workspace), actual = capture(workspace, file, field, replacement, options, publicCurrent);
  return Object.freeze({ bytes: Buffer.from(actual.bytes), digestSha256: actual.digestSha256,
    assertInputsCurrent: actual.assertInputsCurrent, prepare: actual.prepare });
}
/** Internal maintained signed-async gateway capture; retained mixed/sync exports above keep their existing recipe. */
export function captureGatewayConfigPairForAsync(workspace: string, file: string, replacement?: Uint8Array, options: ConfigSignaturePairOptions = {}) {
  return captureForAsync(workspace, file, "configSha256", replacement, options);
}
/** Internal maintained signed-async raw capture. No sync method or caller mode/purpose/provider choice is exposed. */
export function captureRawConfigPairForAsync(workspace: string, file: string, replacement?: Uint8Array, options: ConfigSignaturePairOptions = {}) {
  return captureForAsync(workspace, file, "digestSha256", replacement, options);
}
