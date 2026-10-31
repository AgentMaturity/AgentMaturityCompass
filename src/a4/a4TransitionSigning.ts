import { resolve } from "node:path";
import { assertPolicySignerCurrent, describePolicySigner, signDigestWithPolicyAsync } from "../crypto/signing/signer.js";
import { verifySignatureEnvelope } from "../crypto/signing/signatureEnvelope.js";
import { assertKeysetComplete, boundProviderKey, keysetCommittedMark } from "../keys/keyset.js";
import { configuredRef, keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import { KeyRevokedError } from "../keys/keyRevocations.js";
import { KeyProviderError } from "../keys/provider.js";
import { prepareReceiptWriter } from "../keys/receiptWriter.js";
import { assertSigningKeyUsable, assertVaultMaySign, getSigningKey, getSigningPublicKeyPem } from "../keys/signingKeys.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { canonicalize } from "../utils/json.js";
import { vaultStatus } from "../vault/vault.js";
import { resolveA4Principal } from "./a4Identity.js";
import type { A4Route } from "./a4Router.js";
import { A4StoreError, readOnlyNow } from "./a4Store.js";
import type { A4TransitionResult } from "./a4TransitionRecords.js";

function signingEnabled(): void {
  if (process.env.AMC_NO_SIGN === "1") throw new A4StoreError(503, "UNSIGNED_STORE", "AMC_NO_SIGN=1: an unsigned A4 record attests to nothing");
  if (process.env.AMC_EVALUATED_AGENT === "1") throw new A4StoreError(403, "EVALUATED_AGENT", "an evaluated agent process cannot write A4 records");
}
const changed = () => new A4StoreError(409, "A4_STALE_HEAD", "Original A4 signing authority changed; reload and retry.");

/** Fixed A4_RECORD public negative. No private probe, provider call or unlock at capture.
 * Authenticated public reads may record high-water/adoption state.
 */
export function captureA4RecordSigner(workspace: string) {
  signingEnabled();
  const spelling = workspace, root = resolve(workspace), descriptor = describePolicySigner(root, "A4_RECORD");
  const selectedTrust = loadTrustConfig(root), trust = canonicalize(selectedTrust);
  const notarySkewMs = selectedTrust.trust.enforcement.notaryMaxClockSkewSeconds * 1000;
  const mark = descriptor.mode === "VAULT" ? canonicalize(keysetCommittedMark(root)) : null;
  const keyset = descriptor.mode === "VAULT" ? canonicalize(assertKeysetComplete(root)) : null;
  const binding = descriptor.mode === "VAULT" ? boundProviderKey(root, "artifact-seal") : null;
  const bound = canonicalize(binding), holder = binding?.binding.provider ?? "file";
  const settings = descriptor.mode === "VAULT" ? loadKeysConfig(root) : null;
  const policy = settings === null ? null : canonicalize(keyPolicy(settings));
  if (settings !== null) {
    const selected = keyPolicy(settings);
    if (keyset === "null" || !selected.allowed.includes(descriptor.algorithm) || (holder === "file" && selected.requireNonExportable))
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the original A4 record policy refuses signing");
    if (binding === null) {
      const ref = configuredRef(settings, "artifact-seal");
      if (ref !== null) throw new KeyProviderError("KEY_PROVIDER_HELD", ref.provider, "the original artifact purpose has no committed provider binding");
    }
  }
  const assertCurrent = () => {
    signingEnabled();
    if (resolve(spelling) !== root || canonicalize(loadTrustConfig(root)) !== trust) throw changed();
    assertPolicySignerCurrent(root, descriptor);
    if (descriptor.mode === "VAULT") {
      if (canonicalize(keysetCommittedMark(root)) !== mark || canonicalize(assertKeysetComplete(root)) !== keyset
        || canonicalize(boundProviderKey(root, "artifact-seal")) !== bound || canonicalize(keyPolicy(loadKeysConfig(root))) !== policy) throw changed();
      assertSigningKeyUsable(root, "artifact-seal", descriptor.publicKeyPem, holder);
      if (holder === "file") {
        assertVaultMaySign(root, "artifact-seal");
        if (getSigningPublicKeyPem(root, "artifact-seal") !== descriptor.publicKeyPem) throw changed();
      }
    }
    signingEnabled();
  };
  assertCurrent();
  return Object.freeze({ assertCurrent, async sign(digestHex: string, beforeSign: () => void) {
    let refused = false, refusal: unknown;
    const current = () => {
      if (refused) throw refusal;
      try { assertCurrent(); beforeSign(); assertCurrent(); }
      catch (cause) { refused = true; refusal = cause; throw cause; }
    };
    current();
    let signed;
    try { signed = await signDigestWithPolicyAsync({ workspace: root, kind: "A4_RECORD", digestHex, expectedSigner: descriptor, beforeSign: current }); }
    catch (cause) {
      if (refused) throw refusal;
      if (cause instanceof A4StoreError || cause instanceof KeyProviderError || cause instanceof KeyRevokedError) throw cause;
      if (/vault locked/i.test(cause instanceof Error ? cause.message : String(cause))) {
        const error = new A4StoreError(423, "A4_VAULT_LOCKED", "Unlock the vault to record this.");
        Object.defineProperty(error, "cause", { value: cause }); throw error;
      }
      const error = new A4StoreError(503, "A4_SIGNING_UNAVAILABLE", "The A4 policy signer could not sign this record.");
      Object.defineProperty(error, "cause", { value: cause }); throw error;
    }
    const original = structuredClone(signed);
    const assertSignatureCurrent = () => {
      assertCurrent();
      if (original.digestSha256 !== digestHex || original.envelope === undefined || original.signature !== original.envelope.sigB64
        || !verifySignatureEnvelope(digestHex, original.envelope, { trustedPublicKeys: [descriptor.publicKeyPem], requireTrustedKey: true,
          ...(descriptor.mode === "NOTARY" ? { maxSignedTsSkewMs: notarySkewMs } : {}) })) throw changed();
    };
    assertSignatureCurrent();
    return Object.freeze({ signed: structuredClone(original), assertCurrent: assertSignatureCurrent });
  } });
}

/** Observe the first public refusal without overtaking the route's body/replay error. Never recapture on success. */
function observeA4RecordAuthority(workspace: string): () => void {
  let refused = false, cause: unknown, original: ReturnType<typeof captureA4RecordSigner> | undefined;
  try { original = captureA4RecordSigner(workspace); } catch (error) { refused = true; cause = error; }
  const refuse = (): never => {
    if (cause instanceof KeyRevokedError) {
      const error = new A4StoreError(409, "KEY_REVOKED", "The A4 signing key is revoked.");
      Object.defineProperty(error, "cause", { value: cause }); throw error;
    }
    throw cause;
  };
  return () => {
    if (refused) refuse();
    try { original!.assertCurrent(); } catch (error) { refused = true; cause = error; refuse(); }
  };
}

/** Real hot local writer prerequisites at the old preflight/fact slot, after the actual actor. */
export function assertA4HotWriters(workspace: string): void {
  signingEnabled();
  try {
    getSigningKey(workspace, "ledger-row");
    if (prepareReceiptWriter(workspace) === null) getSigningKey(workspace, "receipt");
  } catch (cause) {
    if (cause instanceof KeyProviderError || cause instanceof KeyRevokedError) throw cause;
    if (!vaultStatus(workspace).unlocked) throw new A4StoreError(423, "A4_VAULT_LOCKED", "Unlock the vault to append A4 audit rows.");
    throw cause;
  }
}
export function a4RecordAvailable(workspace: string): boolean | null {
  try { captureA4RecordSigner(workspace).assertCurrent(); assertA4HotWriters(workspace); return true; }
  catch { return vaultStatus(workspace).unlocked ? null : false; }
}

export interface A4TransitionProgress {
  signCalls: number; signatures: number; lockAttempts: number; lockEntered: number; lockReturned: number;
  nativeEntered: number; nativeReturned: number;
}
export interface A4TransitionAttempt { readonly result: A4TransitionResult; assertCurrent(): void }
/** Internal negative-only observation, private to one actual Store attempt. A thrown undefined is still a refusal. */
export function createA4CurrentLatch(): (check: () => void) => void {
  let refused = false, cause: unknown;
  return check => {
    if (refused) throw cause;
    try { check(); }
    catch (error) { refused = true; cause = error; throw error; }
  };
}
/** Actual progress and cause survive failures after Sign/native commit; public errors contain no provider text. */
export class A4TransitionPublicationError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: { progress: Readonly<A4TransitionProgress>; completed: boolean };
  readonly completed: A4TransitionResult | null;
  constructor(progress: A4TransitionProgress, cause: unknown, completed: A4TransitionResult | null = null) {
    const known = cause instanceof A4StoreError, provider = cause instanceof KeyProviderError, revoked = cause instanceof KeyRevokedError;
    super(known ? cause.message : provider ? "The key provider refused A4 record publication." : revoked ? "The A4 signing key is revoked." : "A4 record publication failed.", { cause });
    this.name = "A4TransitionPublicationError";
    this.status = known || provider ? cause.status : revoked ? 409 : 500;
    this.code = known || provider ? cause.code : revoked ? "KEY_REVOKED" : "A4_PUBLICATION_FAILED";
    this.detail = Object.freeze({ progress: Object.freeze({ ...progress }), completed: completed !== null });
    this.completed = completed === null ? null : structuredClone(completed);
  }
}

const identity = (principal: NonNullable<A4Route["principal"]>) => canonicalize({
  key: principal.key, authSource: principal.authSource, userId: principal.userId, username: principal.username,
  admission: principal.admission, identityCheck: principal.identityCheck, roles: [...principal.roles].sort()
});
/** Selected request routes retain original public state before readJson's first wait; this only adds refusal. */
export function captureA4RequestActor(route: Omit<A4Route, "store">): () => void {
  const original = observeA4RecordAuthority(route.workspace), spelling = route.workspace, root = resolve(spelling);
  const pathname = route.pathname, method = route.method, principal = route.principal === null ? null : identity(route.principal);
  const admission = route.native === undefined ? null : canonicalize({
    principalId: route.native.principalId, demo: route.native.demo, nativeCsrfToken: route.native.nativeCsrfToken, admissionActor: route.native.admissionActor
  });
  const actor = route.assertAuthority, executionAllowed = route.native?.executionAllowed;
  return () => {
    original();
    if (resolve(spelling) !== root || route.workspace !== spelling || route.pathname !== pathname || route.method !== method
      || route.principal === null || principal !== identity(route.principal) || actor === undefined) throw changed();
    actor();
    original();
    if (readOnlyNow(root) !== false) throw new A4StoreError(403, "NATIVE_READ_ONLY", "The workspace is read-only until its users and trust signatures verify.");
    if (route.native !== undefined) {
      if (route.native.executionAllowed !== executionAllowed || canonicalize({ principalId: route.native.principalId, demo: route.native.demo, nativeCsrfToken: route.native.nativeCsrfToken,
        admissionActor: route.native.admissionActor }) !== admission) throw changed();
      const live = resolveA4Principal({ workspace: spelling, nativeTasks: route.native, pathname, method });
      if (!live.ok) throw new A4StoreError(live.status, live.code, live.message);
      if (live.principal === null || identity(live.principal) !== principal) throw changed();
    } else if (admission !== null) throw changed();
    original();
  };
}

/** Only serveA4 constructs this original negative. Direct selected dispatch without it refuses, never falls back. */
export function gateRequestActor(route: A4Route): () => void {
  if (route.assertGateRequestCurrent === undefined) throw new A4StoreError(401, "A4_AUTH_REQUIRED", "The current A4 request admission is unavailable.");
  return route.assertGateRequestCurrent;
}
