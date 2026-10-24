import { captureRunHashAuthority } from "../ledger/runHashSignature.js";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { assertKeysetComplete, boundProviderKey } from "../keys/keyset.js";
import { loadKeysConfig } from "../keys/keysConfig.js";
import { KeyProviderError } from "../keys/provider.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { assertVaultMaySign, getSigningKey } from "../keys/signingKeys.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { withDeletionGate } from "../residency/deletionGate.js";
import { writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { vaultStatus } from "../vault/vault.js";

export const CONSOLE_SNAPSHOT_UNAVAILABLE = "CONSOLE_SNAPSHOT_UNAVAILABLE";
export class ConsoleSnapshotPublicationError extends Error {
  readonly code = CONSOLE_SNAPSHOT_UNAVAILABLE;
  constructor(readonly phase: "predecessor" | "signature-removal" | "body" | "signature", readonly bodyWritten: boolean,
    readonly signatureRemoved: boolean, cause: unknown) {
    super("Console snapshot publication did not complete", { cause }); this.name = "ConsoleSnapshotPublicationError";
  }
}
export function consoleSnapshotErrorStatus(error: unknown): number {
  return error instanceof KeyProviderError ? error.status : 503;
}
/** The cache pruner takes the deletion/hold gate before this lock too. No signing or await inside it. */
export function withConsoleSnapshotLock<T>(workspace: string, operation: () => T): T {
  return withControlFileLock({ root: join(workspace, ".amc", "studio"), name: "console-snapshot", operation });
}
const bytes = (path: string): Buffer | null => existsSync(path) ? readFileSync(path) : null;
const same = (a: Buffer | null, b: Buffer | null) => a === null ? b === null : b !== null && a.equals(b);
const LOCKED = "🔐 Vault locked. Run `amc vault unlock` first, or `amc setup` for first-time setup. Use --no-sign to skip signing where supported.";

/** Only a genuine unavailable local, unbound preflight is optional. A checked attempt never becomes unsigned. */
function localUnsignedPreflight(workspace: string): string | null {
  assertVaultMaySign(workspace, "artifact-seal");
  try { getSigningKey(workspace, "artifact-seal"); }
  catch (error) { if (!(error instanceof Error) || error.message !== LOCKED) throw error; }
  if (vaultStatus(workspace).unlocked) return null;
  return canonicalize({ keyset: assertKeysetComplete(workspace), policy: loadKeysConfig(workspace) });
}

/** Compact payload digest and pretty disk body/legacy sidecar deliberately preserve the original console wire. */
export async function publishConsoleSnapshotAsync(workspace: string, supplied: Record<string, unknown>, beforePublish?: () => void): Promise<{
  path: string; sigPath: string | null; payload: Record<string, unknown>;
}> {
  beforePublish?.();
  const payload = structuredClone(supplied), path = join(workspace, ".amc", "studio", "console-snapshot.json"), sigPath = path + ".sig";
  const body = JSON.stringify(payload, null, 2), digest = sha256Hex(Buffer.from(JSON.stringify(payload), "utf8"));
  const before = { body: bytes(path), signature: bytes(sigPath) };
  // A bound provider is a checked path; assertVaultMaySign would correctly refuse its private-key API.
  let unsigned: string | null = null;
  if (boundProviderKey(workspace, "artifact-seal") === null) unsigned = localUnsignedPreflight(workspace);
  const captured = unsigned === null ? capturePurposePublication(workspace, "artifact-seal") : null;
  const original = captured === null ? null : captureRunHashAuthority(workspace, false);
  const assertPredecessor = () => {
    if (!same(bytes(path), before.body) || !same(bytes(sigPath), before.signature))
      throw new ConsoleSnapshotPublicationError("predecessor", false, false, undefined);
  };
  const beforeSign = () => withConsoleSnapshotLock(workspace, () => {
    beforePublish?.(); original?.(); assertPredecessor();
  });
  const signed = captured === null ? null : await signWithPurposeKey(workspace, "artifact-seal", Buffer.from(digest, "hex"), { beforeSign });
  const sidecar = signed === null ? null : JSON.stringify({ digestSha256: digest, signature: signed.signature.toString("base64"), signedTs: Date.now(), signer: "auditor" }, null, 2);
  let bodyWritten = false, signatureRemoved = false, phase: ConsoleSnapshotPublicationError["phase"] = "predecessor";
  const publish = () => withConsoleSnapshotLock(workspace, () => {
    beforePublish?.();
    if (captured !== null && signed !== null) { original!(); assertPurposePublicationCurrent(workspace, captured, signed); }
    else {
      assertVaultMaySign(workspace, "artifact-seal");
      if (canonicalize({ keyset: assertKeysetComplete(workspace), policy: loadKeysConfig(workspace) }) !== unsigned)
        throw new ConsoleSnapshotPublicationError("predecessor", false, false, undefined);
    }
    assertPredecessor();
    try {
      if (sidecar === null && before.signature !== null) { phase = "signature-removal"; unlinkSync(sigPath); signatureRemoved = true; }
      phase = "body"; writeFileAtomic(path, body, 0o644); bodyWritten = true;
      if (sidecar !== null) { phase = "signature"; writeFileAtomic(sigPath, sidecar, 0o644); }
    } catch (cause) { throw new ConsoleSnapshotPublicationError(phase, bodyWritten, signatureRemoved, cause); }
    return { path, sigPath: sidecar === null ? null : sigPath, payload };
  });
  // The same actual deletion gate as cache pruning; the hold lock always precedes the console lock.
  return sidecar === null && before.signature !== null ? withDeletionGate({ workspace, executor: "maintenance.cache-unlink",
    target: { kind: "caches", before: new Date().toISOString() } }, publish) : publish();
}
