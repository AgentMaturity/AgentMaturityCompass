/**
 * Reading purpose keys (P1-08): the private key a signing call site uses and the public keys and history a verifier
 * admits. Kept apart from src/keys/purposeKeys.ts (rotation, revocation, export), which writes the transparency log, so
 * that src/crypto/keys.ts and the trust context load no log writer.
 */
import { verifyKeyHistoryEnvelope, type KeyHistoryEnvelope, type KeyHistorySubject } from "../crypto/keyHistoryEnvelope.js";
import type { KeyPurpose } from "../trust/keyPurposes.js";
import { join } from "node:path";
import { readContainedOrNull, statStamp } from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { getVaultPurposeKeyPem, purposeKeyPaths, vaultPaths } from "../vault/vault.js";
import { isLocalPurpose, roleOfPurpose, type LocalPurpose } from "../vault/vaultPayload.js";
import { historyLogId, loggedAnchor } from "./anchors.js";
import { checkHighWater, compareHighWater, keyHistoryMarkKey } from "./highWater.js";
import { assertBoundPublicKey, assertNoPendingKeyset, boundProviderKey, keysetDeclared, keysetFileRel } from "./keyset.js";
import { verifyDelegation } from "./delegation.js";
import { configuredRef, loadKeysConfig } from "./keysConfig.js";
import { KeyProviderError, type KeyProviderId } from "./provider.js";

export function assertLocal(purpose: KeyPurpose): LocalPurpose {
  if (!isLocalPurpose(purpose)) throw new Error(`${purpose} keys never live in a workspace vault; sign with the key its owner holds`);
  return purpose;
}

/**
 * The private key for one signing purpose. Refused while the key set is incomplete or the vault is locked, and (P2-08)
 * whenever the purpose's key is held by a provider: the vault never stands in for it. The one exception is the
 * ledger-row delegate, a vault key served only while a provider-signed delegation for it is current.
 */
export function getSigningKey(workspace: string, purpose: KeyPurpose): string {
  const local = assertLocal(purpose);
  // The vault first, so a locked vault or a revoked vault key is reported exactly as before.
  const privateKeyPem = getVaultPurposeKeyPem(workspace, local);
  assertVaultMaySign(workspace, local);
  return privateKeyPem;
}

/** Refuses a purpose that keys config or the committed key set gives to a provider, and the vault under requireNonExportable. */
export function assertVaultMaySign(workspace: string, purpose: LocalPurpose): void {
  const config = loadKeysConfig(workspace);
  const bound = boundProviderKey(workspace, purpose);
  const ref = configuredRef(config, purpose);
  if (bound === null && ref === null) {
    if (config.requireNonExportable) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", `keys.requireNonExportable refuses the vault's ${purpose} key`);
    return;
  }
  if (purpose === "ledger-row" && bound !== null) return assertCurrentDelegation(workspace, bound.publicKeyPem, bound.binding.provider);
  throw new KeyProviderError("KEY_PROVIDER_HELD", bound?.binding.provider ?? ref!.provider, bound === null
    ? `the ${purpose} key is configured to a provider key that the key set does not bind yet; run amc keys rotate --purpose ${purpose}`
    : `the ${purpose} key never leaves the provider; this signer needs a vault key and cannot use it`);
}

export const DELEGATION_REL = ".amc/keys/delegations/ledger-row.json";
const delegationMemo = new Map<string, { stamp: string; notBefore: number; notAfter: number }>();

/** The vault's ledger-row key is the delegate: a delegation from the bound provider key must name it and cover now. */
function assertCurrentDelegation(workspace: string, issuerPublicKeyPem: string, provider: KeyProviderId): void {
  const now = new Date();
  const stamp = statStamp([join(workspace, DELEGATION_REL), join(workspace, keysetFileRel("keys/ledger-row.pub")), join(workspace, keysetFileRel("keys/ledger-row-provider.pub"))]);
  let window = delegationMemo.get(workspace);
  if (window?.stamp !== stamp) {
    const bytes = readContainedOrNull(workspace, DELEGATION_REL, 64 * 1024);
    if (bytes === null) throw new KeyProviderError("KEY_DELEGATION_INVALID", provider, "the ledger-row delegate has no delegation; renew it with amc keys rotate --purpose ledger-row");
    const verdict = verifyDelegation(bytes, { issuerPublicKeyPems: [issuerPublicKeyPem], at: now });
    const delegate = getSigningPublicKeyPem(workspace, "ledger-row");
    if (verdict.valid && verdict.delegation.delegatePublicKeyPem !== delegate) throw new KeyProviderError("KEY_DELEGATION_INVALID", provider, "the delegation names another ledger-row key");
    if (!verdict.valid) throw new KeyProviderError("KEY_DELEGATION_INVALID", provider, `${verdict.reason}; renew it with amc keys rotate --purpose ledger-row`);
    window = { stamp, notBefore: Date.parse(verdict.delegation.notBefore), notAfter: Date.parse(verdict.delegation.notAfter) };
    delegationMemo.set(workspace, window);
  }
  if (now.getTime() < window.notBefore || now.getTime() > window.notAfter) {
    throw new KeyProviderError("KEY_DELEGATION_INVALID", provider, "the ledger-row delegation is outside its window; renew it with amc keys rotate --purpose ledger-row");
  }
}

const KEY_FILE_BYTES = 1024 * 1024;
/** A key file under `.amc/keys`, read through src/utils/containedFs.ts (no symlink, special file or hard link). */
export const keyFile = (workspace: string, name: string): string | null => readContainedOrNull(workspace, keysetFileRel(`keys/${name}`), KEY_FILE_BYTES)?.toString("utf8") ?? null;

/** The purpose's current public key: `<purpose>.pub`, or its role's key in a workspace not yet migrated. */
export function getSigningPublicKeyPem(workspace: string, purpose: KeyPurpose): string {
  const local = assertLocal(purpose);
  assertNoPendingKeyset(workspace);
  const own = keyFile(workspace, `${local}.pub`);
  if (own !== null) {
    assertBoundPublicKey(workspace, local, own);
    return own;
  }
  // A workspace with a key set always has purpose files: never fall back to the wider role key there.
  if (keysetDeclared(workspace)) throw new Error(`${purposeKeyPaths(workspace, local).publicFile} is missing from a workspace with a key set; refusing to fall back to the ${roleOfPurpose(local)} role key`);
  const role = keyFile(workspace, `${roleOfPurpose(local)}_ed25519.pub`);
  if (role === null) throw new Error(`Missing public key: ${vaultPaths(workspace)[`${roleOfPurpose(local)}Public`]}`);
  return role;
}

export function readHistory(workspace: string, subject: KeyHistorySubject, currentPublicPem: string): KeyHistoryEnvelope | null {
  try {
    const raw = keyFile(workspace, `${subject}_history.json`);
    if (raw === null) return null;
    const envelope = verifyKeyHistoryEnvelope(JSON.parse(raw), subject, currentPublicPem).envelope;
    if (envelope) {
      const sha256 = sha256Hex(canonicalize(envelope));
      const marked = checkHighWater(keyHistoryMarkKey(workspace, subject), envelope.revision, sha256);
      // Without this machine's mark at this revision (a fresh verifier, a lost AMC home), the workspace log is the floor.
      if (marked?.sequence !== envelope.revision) {
        compareHighWater(`${subject} key history in the workspace transparency log`, loggedAnchor(workspace, "KEY_HISTORY_REVISION", historyLogId(workspace, subject)), envelope.revision, sha256);
      }
    }
    return envelope;
  } catch {
    return null; // an unreadable, unauthenticated or rolled-back history admits no older key (fail closed)
  }
}

/** Every key admitted for `purpose` by its authenticated history, current key last; the role's view before migration. */
export function getPurposeKeyHistory(workspace: string, purpose: KeyPurpose): string[] {
  const local = assertLocal(purpose);
  const current = getSigningPublicKeyPem(workspace, local);
  const role = roleOfPurpose(local);
  const own = keyFile(workspace, `${local}.pub`) !== null && local !== "lease" && local !== "session";
  const history = own ? readHistory(workspace, local, current) : readHistory(workspace, role, keyFile(workspace, `${role}_ed25519.pub`) ?? current);
  // P2-08: a provider key the key set binds to this purpose signs for it too.
  const provider = boundProviderKey(workspace, local)?.publicKeyPem;
  return [...new Set([...(history?.entries.map(entry => entry.publicKeyPem) ?? []), current, ...(provider === undefined ? [] : [provider])])];
}
