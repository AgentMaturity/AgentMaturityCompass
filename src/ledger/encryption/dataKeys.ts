/**
 * Ledger data keys (P2-09, ADR 018). Inline evidence payloads are encrypted under a 256-bit data key; the data key is
 * stored only wrapped by a P2-08 KeyProvider key, in `.amc/keys/ledger-dek.json`, signed with the config-signature key
 * the way blob key metadata is signed (src/storage/blobs/blobKeys.ts). Plaintext keys live only in this process's
 * memory and are zeroized by `closeLedgerDataKeys` (best effort: Node may have copied a Buffer before).
 *
 * The ledger's write path is synchronous, and a KeyProvider is asynchronous. `getActiveDataKey` primes the cache with
 * an await; `dataKeySync` serves the ledger from that cache and, when cold, unwraps synchronously: the file provider
 * through the vault, any other provider through the P2-08 provider bridge (one child process per key version per
 * process). Any failure is a KeyProviderError, so an append is denied with the reason and no row is written.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { getPublicKeyHistory, getSigningKey, signHexDigest, verifyHexDigestAny } from "../../crypto/keys.js";
import { assertOwnerMode } from "../../mode/mode.js";
import { KEY_PROVIDER_IDS, KeyProviderError, type KeyProvider, type KeyProviderId, type KeyRef } from "../../keys/provider.js";
import { unwrapKeySync } from "./syncUnwrap.js";
import { unwrapFileKeySync } from "../../keys/providers/file.js";
import { loadKeyProvider } from "../../keys/purposeProviders.js";
import { statStamp } from "../../utils/containedFs.js";
import { ensureDir, pathExists, writeFileAtomic } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";

export interface WrappedDataKey { v: 1; keyVersion: number; providerId: KeyProviderId; keyRef: string; wrapped: string; createdTs: number }

const wrappedDataKeySchema = z.strictObject({
  v: z.literal(1), keyVersion: z.number().int().min(1), providerId: z.enum(KEY_PROVIDER_IDS), keyRef: z.string().min(1).max(2048),
  wrapped: z.string().min(1), createdTs: z.number().int()
});
const dekFileSchema = z.strictObject({ v: z.literal(1), activeVersion: z.number().int().min(1), keys: z.array(wrappedDataKeySchema).min(1) });
const dekSigSchema = z.strictObject({ digestSha256: z.string().length(64), signature: z.string().min(1), signedTs: z.number().int() });
type DekFile = z.infer<typeof dekFileSchema>;

/** The wrapping key used when none is named: a vault-held AES key (file provider), for development. */
const DEFAULT_LEDGER_WRAP_REF: KeyRef = { provider: "file", id: "ledger-dek" };

export function ledgerDekPath(workspace: string): string {
  return join(workspace, ".amc", "keys", "ledger-dek.json");
}
const sigPath = (workspace: string) => `${ledgerDekPath(workspace)}.sig`;

const keys = new Map<string, Map<number, Buffer>>();
const files = new Map<string, { stamp: string; file: DekFile }>();

function cacheFor(workspace: string): Map<number, Buffer> {
  workspace = resolve(workspace);
  const found = keys.get(workspace) ?? new Map<number, Buffer>();
  keys.set(workspace, found);
  return found;
}

/** The signed key file, re-read and re-verified only after it changed. Unsigned or altered: refused. */
export function readDataKeyFile(workspace: string): DekFile | null {
  const path = ledgerDekPath(workspace);
  if (!pathExists(path)) return null;
  const stamp = statStamp([path, sigPath(workspace)]);
  const cached = files.get(resolve(workspace));
  if (cached?.stamp === stamp) return cached.file;
  const bytes = readFileSync(path);
  const digest = sha256Hex(bytes);
  let sig: z.infer<typeof dekSigSchema>;
  try {
    sig = dekSigSchema.parse(JSON.parse(readFileSync(sigPath(workspace), "utf8")));
  } catch {
    throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "ledger data key file signature missing or malformed");
  }
  if (sig.digestSha256 !== digest || !verifyHexDigestAny(digest, sig.signature, getPublicKeyHistory(workspace, "auditor"))) {
    throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "ledger data key file signature does not verify");
  }
  const file = dekFileSchema.parse(JSON.parse(bytes.toString("utf8")));
  if (!file.keys.some(key => key.keyVersion === file.activeVersion)) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "ledger data key file names no active key");
  files.set(resolve(workspace), { stamp, file });
  return file;
}

function writeDataKeyFile(workspace: string, file: DekFile): void {
  ensureDir(join(workspace, ".amc", "keys"));
  const bytes = Buffer.from(JSON.stringify(dekFileSchema.parse(file), null, 2));
  writeFileAtomic(ledgerDekPath(workspace), bytes, 0o644);
  const digest = sha256Hex(bytes);
  const signature = signHexDigest(digest, getSigningKey(workspace, "config-signature"));
  writeFileAtomic(sigPath(workspace), JSON.stringify({ digestSha256: digest, signature, signedTs: Date.now() }, null, 2), 0o644);
  files.delete(resolve(workspace));
}

const refOf = (key: WrappedDataKey): KeyRef => ({ provider: key.providerId, id: key.keyRef });

function entry(workspace: string, version?: number): WrappedDataKey {
  const file = readDataKeyFile(workspace);
  if (file === null) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "ledger encryption is on but no ledger data key exists; run `amc evidence-stores encrypt`");
  const wanted = version ?? file.activeVersion;
  const found = file.keys.find(key => key.keyVersion === wanted);
  if (!found) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", `ledger data key version ${wanted} is not in the key file`);
  return found;
}

function checkedKey(key: Uint8Array, provider: KeyProviderId): Buffer {
  if (key.byteLength !== 32) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", provider, "the unwrapped ledger data key is not 256 bits");
  return Buffer.from(key);
}

/** The plaintext data key of `version` (default: active), synchronously. Throws KeyProviderError when unavailable. */
export function dataKeySync(workspace: string, version?: number): { keyVersion: number; key: Buffer } {
  const wrapped = entry(workspace, version);
  const cache = cacheFor(workspace);
  const cached = cache.get(wrapped.keyVersion);
  if (cached) return { keyVersion: wrapped.keyVersion, key: cached };
  const bytes = Buffer.from(wrapped.wrapped, "base64");
  let unwrapped: Uint8Array;
  try {
    unwrapped = wrapped.providerId === "file" ? unwrapFileKeySync(workspace, refOf(wrapped), bytes) : unwrapKeySync(refOf(wrapped), bytes);
  } catch (error) {
    if (error instanceof KeyProviderError) throw error;
    // The vault's own errors (locked, no passphrase) become the provider-unavailable code, with a fixed message.
    throw new KeyProviderError("KEY_PROVIDER_UNAVAILABLE", "file", "the vault holding the ledger wrap key is locked or unreadable");
  }
  const key = checkedKey(unwrapped, wrapped.providerId);
  cache.set(wrapped.keyVersion, key);
  return { keyVersion: wrapped.keyVersion, key };
}

interface ProviderOptions { provider?: KeyProvider }

async function unwrapWith(workspace: string, wrapped: WrappedDataKey, opts: ProviderOptions): Promise<Buffer> {
  const provider = opts.provider ?? loadKeyProvider(workspace, wrapped.providerId);
  if (!provider.unwrapKey) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", wrapped.providerId, "this provider does not unwrap keys");
  return checkedKey(await provider.unwrapKey(refOf(wrapped), Buffer.from(wrapped.wrapped, "base64")), wrapped.providerId);
}

/** The active data key, unwrapped through the KeyProvider (awaited) and cached in memory. */
export async function getActiveDataKey(workspace: string, opts: ProviderOptions = {}): Promise<{ keyVersion: number; key: Buffer }> {
  const wrapped = entry(workspace);
  const cache = cacheFor(workspace);
  const key = cache.get(wrapped.keyVersion) ?? await unwrapWith(workspace, wrapped, opts);
  cache.set(wrapped.keyVersion, key);
  return { keyVersion: wrapped.keyVersion, key };
}

async function wrapWith(workspace: string, ref: KeyRef, key: Buffer, opts: ProviderOptions): Promise<string> {
  const provider = opts.provider ?? loadKeyProvider(workspace, ref.provider);
  if (!provider.wrapKey) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", ref.provider, "this provider does not wrap keys");
  return Buffer.from(await provider.wrapKey(ref, key)).toString("base64");
}

/**
 * Adds a data key version and makes it active (creating version 1 when there is none). New rows use it; old rows keep
 * theirs. `ref` names the wrapping key; absent, the active version's wrapping key, else DEFAULT_LEDGER_WRAP_REF.
 */
export async function rotateDataKey(workspace: string, opts: ProviderOptions & { ref?: KeyRef } = {}): Promise<WrappedDataKey> {
  assertOwnerMode(workspace, "keys rotate");
  const file = readDataKeyFile(workspace);
  const active = file?.keys.find(key => key.keyVersion === file.activeVersion);
  const ref = opts.ref ?? (active ? refOf(active) : DEFAULT_LEDGER_WRAP_REF);
  const keyVersion = Math.max(0, ...(file?.keys ?? []).map(key => key.keyVersion)) + 1;
  const key = randomBytes(32);
  const added: WrappedDataKey = { v: 1, keyVersion, providerId: ref.provider, keyRef: ref.id, wrapped: await wrapWith(workspace, ref, key, opts), createdTs: Date.now() };
  writeDataKeyFile(workspace, { v: 1, activeVersion: keyVersion, keys: [...(file?.keys ?? []), added] });
  cacheFor(workspace).set(keyVersion, key);
  return added;
}

/** Re-wraps every data key version (optionally under a new wrapping key) without touching any ciphertext. */
export async function rewrapDataKeys(workspace: string, opts: ProviderOptions & { ref?: KeyRef } = {}): Promise<WrappedDataKey[]> {
  assertOwnerMode(workspace, "keys rotate");
  const file = readDataKeyFile(workspace);
  if (file === null) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "no ledger data key to re-wrap");
  const rewrapped: WrappedDataKey[] = [];
  for (const old of file.keys) {
    const ref = opts.ref ?? refOf(old);
    const key = await unwrapWith(workspace, old, opts);
    rewrapped.push({ ...old, providerId: ref.provider, keyRef: ref.id, wrapped: await wrapWith(workspace, ref, key, opts) });
    key.fill(0);
  }
  writeDataKeyFile(workspace, { ...file, keys: rewrapped });
  return rewrapped;
}

/** Zeroizes and forgets cached plaintext keys (one workspace, or all). */
export function closeLedgerDataKeys(workspace?: string): void {
  const only = workspace === undefined ? undefined : resolve(workspace);
  for (const [name, cache] of keys) {
    if (only !== undefined && name !== only) continue;
    for (const key of cache.values()) key.fill(0);
    keys.delete(name);
  }
  if (only === undefined) files.clear();
  else files.delete(only);
}
process.once("exit", () => closeLedgerDataKeys());
