/** Explicit owner transition only. Never called from getSigningKey or normal runtime provider selection. */
import { join } from "node:path";
import { sign } from "node:crypto";
import { buildKeyHistoryEntry } from "../crypto/keyHistoryChain.js";
import { publicKeyFromPrivate, sealKeyHistory } from "../crypto/keyHistoryEnvelope.js";
import { signingRoute } from "../crypto/signing/signer.js";
import { assertOwnerMode } from "../mode/mode.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { markWrittenHistories, purposeKeyPaths, unlockedPayloadForKeyChange, vaultPaths, vaultStatus } from "../vault/vault.js";
import { assertConfigPublicationCurrent, captureConfigPublication, configPairWrites, configSignatureBytes, MAX_CONFIG_BYTES } from "../config/configPublication.js";
import { withAmcConfigPublicationLock } from "../config/configPublicationLock.js";
import { logHistoryRevisions, preflightHistoryLog } from "./anchors.js";
import { SIGNING_ALGORITHMS } from "./algorithmPolicy.js";
import { boundProviderKey, commitKeyset, type ProviderBinding } from "./keyset.js";
import { configuredRef, keyPolicy, parseKeysSection, type KeysConfig } from "./keysConfig.js";
import { attempt, checkedDescription, KeyProviderError, signChecked, type KeyDescription, type KeyProvider, type KeyRef } from "./provider.js";
import { loadKeyProvider } from "./purposeProviders.js";
import { anchorProviderPurposeRotation, assertProviderPurposeRotationCurrent, popBytes, prepareProviderPurposeRotation } from "./purposeKeys.js";
import { assertKeyUsableNow, assertSigningKeyUsable, getSigningPublicKeyPem, readHistory } from "./signingKeys.js";
import type { RotationReason } from "./rotationStatement.js";

const PURPOSE = "config-signature";
export interface ConfigTransitionResult {
  purpose: typeof PURPOSE; generation: number; binding: ProviderBinding; signaturePath: string; statementPath: string | null;
}

/** The generation is already committed. A remote/postcommit log failure never means the backing-key change rolled back. */
export class ConfigTransitionAnchoringError extends Error {
  readonly code = "CONFIG_TRANSITION_ANCHOR_INCOMPLETE" as const;
  constructor(readonly committed: ConfigTransitionResult) {
    super(`config-signature transition committed generation ${committed.generation}; postcommit transparency anchoring is incomplete. `
      + "The committed config and key binding remain active. Keyset --resume/--restore repairs keyset files; it does not retry remote anchors.");
    this.name = "ConfigTransitionAnchoringError";
  }
}
const sameRef = (a: KeyRef, b: KeyRef) => a.provider === b.provider && a.id === b.id && a.version === b.version;
const bindingRef = (binding: ProviderBinding): KeyRef => ({ provider: binding.provider, id: binding.id,
  ...(binding.version === undefined ? {} : { version: binding.version }) });
function snapshotDescription(value: KeyDescription, config: KeysConfig): KeyDescription {
  return Object.freeze(checkedDescription({ ...value, ref: Object.freeze({ ...value.ref }) }, keyPolicy(config)));
}

/** Keep the existing vault transparency route usable under the candidate; notary routing retains its P1-08 contract. */
function assertCandidateAllowsAnchors(workspace: string, config: KeysConfig, provider: KeyRef["provider"]): void {
  if (signingRoute(workspace, "TRANSPARENCY_ROOT") !== "vault") return;
  if (config.requireNonExportable || !config.algorithmPolicy.allowed.includes("ed25519") || configuredRef(config, "artifact-seal") !== null) {
    throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", provider,
      "this transition needs the current vault artifact-seal transparency signer; use a config-signature purpose ref without changing its policy or backing key");
  }
}

/**
 * `amc keys rotate --purpose config-signature [--config-candidate <file>]`.
 * The owner supplies candidate bytes; only the currently committed holder endorses them. An unsigned ref, candidate
 * policy, or newly described key never supplies previous-key authority. A bound remote predecessor must actually sign:
 * its vault anchor remains only the history-admission key and can never substitute for that predecessor.
 */
export async function transitionConfigSignatureProvider(workspace: string, candidate: Uint8Array, opts: {
  passphrase: string; reason?: RotationReason; overlapDays?: number
}): Promise<ConfigTransitionResult> {
  const bytes = Buffer.from(candidate); // pin before the first await, including caller-owned Buffers
  if (bytes.length === 0 || bytes.length > MAX_CONFIG_BYTES) throw new Error("config candidate must contain at most 1 MiB of YAML");
  assertOwnerMode(workspace, "keys rotate");
  const config = parseKeysSection(bytes), selected = configuredRef(config, PURPOSE);
  if (selected === null || selected.provider === "file") throw new Error("config candidate must name a provider key in keys.refs.config-signature");
  const ref = Object.freeze({ ...selected });
  assertCandidateAllowsAnchors(workspace, config, ref.provider);
  const payload = unlockedPayloadForKeyChange(workspace, opts.passphrase);
  const captured = captureConfigPublication(workspace), existing = boundProviderKey(workspace, PURPOSE);
  const old = existing === null ? null : { binding: { ...existing.binding }, publicKeyPem: existing.publicKeyPem };
  const anchorPrivate = payload.keys[PURPOSE]!.privateKeyPem, anchor = publicKeyFromPrivate(anchorPrivate);
  if (getSigningPublicKeyPem(workspace, PURPOSE) !== anchor) throw new Error("the unlocked vault config key differs from the committed history anchor");
  assertSigningKeyUsable(workspace, PURPOSE, anchor, "file");
  const prior = readHistory(workspace, PURPOSE, anchor);
  if (prior === null) throw new Error("config-signature history is unauthenticated; explicitly migrate reviewed history before changing its backing key");
  preflightHistoryLog(workspace);
  const provider = loadKeyProvider(workspace, ref.provider);
  const next = snapshotDescription(await attempt(ref.provider, "describe", () => provider.describe({ ...ref })), config);
  if (!sameRef(next.ref, ref) || next.exportable) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", ref.provider, "the next provider key is exportable or does not name the candidate ref");
  assertKeyUsableNow(workspace, PURPOSE, next.keyId, ref.provider);
  const now = new Date();
  await signChecked(provider, next, popBytes({ keyId: next.keyId, purpose: PURPOSE, issuedAt: now.toISOString() }));

  let previous: { privateKeyPem: string } | { provider: KeyProvider; description: KeyDescription };
  let previousPublicKeyPem: string;
  if (old === null) {
    // Explicit owner authority over this transaction only. Normal getSigningKey continues to refuse an unbound ref.
    previous = { privateKeyPem: anchorPrivate }; previousPublicKeyPem = anchor;
  } else {
    const oldRef = Object.freeze(bindingRef(old.binding)), oldProvider = loadKeyProvider(workspace, oldRef.provider);
    const reported = await attempt(oldRef.provider, "describe", () => oldProvider.describe({ ...oldRef }));
    const oldDescription = Object.freeze(checkedDescription({ ...reported, ref: Object.freeze({ ...reported.ref }) },
      { allowed: SIGNING_ALGORITHMS, requireNonExportable: true }));
    if (!sameRef(oldDescription.ref, oldRef) || oldDescription.publicKeyPem !== old.publicKeyPem || oldDescription.keyId !== old.binding.keyId
      || oldDescription.algorithm !== old.binding.algorithm) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", oldRef.provider, "the predecessor provider no longer describes the committed config key");
    assertSigningKeyUsable(workspace, PURPOSE, oldDescription.publicKeyPem, oldRef.provider);
    previous = { provider: oldProvider, description: oldDescription }; previousPublicKeyPem = oldDescription.publicKeyPem;
  }
  const digest = sha256Hex(bytes), digestBytes = Buffer.from(digest, "hex");
  const signature = "privateKeyPem" in previous ? sign(null, digestBytes, previous.privateKeyPem)
    : await signChecked(previous.provider, previous.description, digestBytes);
  const plan = await prepareProviderPurposeRotation({ workspace, purpose: PURPOSE, previousPublicKeyPem, previous,
    next: { provider, description: next }, reason: opts.reason, overlapDays: opts.overlapDays, now });
  const entries = prior.entries.some(entry => entry.publicKeyPem === next.publicKeyPem) ? prior.entries
    : [...prior.entries, buildKeyHistoryEntry(next.publicKeyPem, prior.entries, "imported")];
  const envelope = sealKeyHistory(PURPOSE, entries, anchorPrivate, prior.revision + 1);
  const binding: ProviderBinding = { provider: ref.provider as ProviderBinding["provider"], id: ref.id,
    ...(ref.version === undefined ? {} : { version: ref.version }), keyId: next.keyId, algorithm: next.algorithm,
    protection: next.protection, protectionBasis: next.protectionBasis };
  const sidecar = configSignatureBytes(digest, signature);
  const writes = [...configPairWrites(workspace, bytes, sidecar),
    { path: join(vaultPaths(workspace).keysDir, `${PURPOSE}-provider.pub`), bytes: next.publicKeyPem, mode: 0o644 },
    { path: purposeKeyPaths(workspace, PURPOSE).historyFile, bytes: JSON.stringify(envelope, null, 2), mode: 0o600 },
    ...(plan === null ? [] : [{ path: plan.path, bytes: plan.bytes, mode: 0o644 }])];
  const result = withAmcConfigPublicationLock<ConfigTransitionResult>(workspace, () => {
    assertConfigPublicationCurrent(workspace, captured);
    assertOwnerMode(workspace, "keys rotate");
    if (!vaultStatus(workspace).unlocked) throw new Error("Vault locked while config transition was prepared");
    checkedDescription(next, keyPolicy(config)); assertCandidateAllowsAnchors(workspace, config, ref.provider);
    assertKeyUsableNow(workspace, PURPOSE, next.keyId, ref.provider);
    assertSigningKeyUsable(workspace, PURPOSE, anchor, "file");
    if (old !== null) assertSigningKeyUsable(workspace, PURPOSE, old.publicKeyPem, old.binding.provider);
    if (canonicalize(readHistory(workspace, PURPOSE, anchor)) !== canonicalize(prior)) {
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", ref.provider, "the authenticated config-purpose history changed while the transition was prepared");
    }
    if (plan !== null) assertProviderPurposeRotationCurrent(workspace, plan);
    const committed = commitKeyset(workspace, { expectedGeneration: captured.keyset.generation, keys: captured.keyset.keys, writes,
      providers: { ...captured.keyset.providers, [PURPOSE]: binding }, statements: plan === null ? [] : [plan.sha256] });
    return { purpose: PURPOSE, generation: committed.generation, binding, signaturePath: join(workspace, ".amc", "amc.config.yaml.sig"), statementPath: plan?.path ?? null };
  });
  // A synchronous notary bridge may run here. Publication is complete and its lock is already released.
  // Individual history/rotation anchors can partially succeed; never claim a remote atomic transaction or rollback.
  try {
    logHistoryRevisions(workspace, markWrittenHistories(workspace, writes));
    if (plan !== null) anchorProviderPurposeRotation(workspace, plan);
  } catch {
    // Fixed owner-facing state, without copying raw notary/remote messages or claiming that resume retries anchors.
    throw new ConfigTransitionAnchoringError(result);
  }
  return result;
}
