import { lstatSync, readFileSync, type Stats } from "node:fs";
import { join } from "node:path";
import { signHexDigest } from "../crypto/keys.js";
import { getSigningKey, getSigningPublicKeyPem } from "../keys/signingKeys.js";
import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { signingKeyId } from "../keys/algorithmPolicy.js";
import { boundProviderKey } from "../keys/keyset.js";
import { signWithPurposeKey, type PurposeSignature } from "../keys/purposeProviders.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export interface HumanLogEntry {
  v: 1;
  ts: number;
  type: string;
  agentId: string | null;
  username: string | null;
  payload: Record<string, unknown>;
  prev: string | null;
  hash: string;
}
interface HumanSeal {
  v: 1;
  ts: number;
  lastHash: string | null;
  entryCount: number;
  signerFingerprint: string;
}
interface HumanSealSignature {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}
interface HumanEventInput {
  workspace: string;
  type: string;
  agentId?: string | null;
  username?: string | null;
  payload?: Record<string, unknown>;
}
type MemberName = "log" | "seal" | "signature";
interface Member { bytes: Buffer; stamp: string }
interface HumanState {
  workspace: string;
  paths: Record<MemberName, string>;
  members: Record<MemberName, Member | null>;
}
const memberNames: readonly MemberName[] = ["log", "seal", "signature"];

export class HumanLogPublicationError extends Error {
  readonly code = "HUMAN_LOG_PARTIAL" as const;
  constructor(
    readonly phase: MemberName,
    readonly completedMembers: readonly MemberName[],
    /** Candidate hash; only a returned log write establishes completed log publication. */
    readonly entryHash: string | null,
    options: { cause: unknown }
  ) {
    super("human audit publication failed during " + phase + "; completed: " + (completedMembers.join(", ") || "none"), options);
    this.name = "HumanLogPublicationError";
  }
}

function paths(workspace: string): Record<MemberName, string> {
  const dir = join(workspace, ".amc", "studio", "audit");
  return { log: join(dir, "human.log"), seal: join(dir, "human.seal.json"), signature: join(dir, "human.seal.sig") };
}
function stamp(value: Stats): string {
  return [value.dev, value.ino, value.mode, value.size, value.mtimeMs, value.ctimeMs].join(":");
}
function member(path: string): Member | null {
  let before: Stats;
  try { before = lstatSync(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  if (!before.isFile() || before.isSymbolicLink()) throw new Error("human audit member is not a regular file");
  const bytes = readFileSync(path), after = lstatSync(path);
  if (stamp(before) !== stamp(after)) throw new Error("human audit member changed while being read");
  return { bytes, stamp: stamp(after) };
}
function capture(workspace: string): HumanState {
  const target = paths(workspace);
  return { workspace, paths: target, members: { log: member(target.log), seal: member(target.seal), signature: member(target.signature) } };
}
function empty(state: HumanState): boolean { return memberNames.every(name => state.members[name] === null); }
function assertCurrent(state: HumanState): void {
  const current = capture(state.workspace);
  for (const name of memberNames) {
    const old = state.members[name], next = current.members[name];
    if ((old === null) !== (next === null) || (old !== null && next !== null && (old.stamp !== next.stamp || !old.bytes.equals(next.bytes)))) {
      throw new Error("human audit predecessor changed while signing was prepared");
    }
  }
}
function entriesOf(bytes: Buffer): HumanLogEntry[] {
  const text = bytes.toString("utf8").trim();
  return text.length === 0 ? [] : text.split(/\r?\n/).map(line => JSON.parse(line) as HumanLogEntry);
}
function verifyState(state: HumanState): { ok: boolean; errors: string[]; entryCount: number } {
  const errors: string[] = [];
  if (memberNames.some(name => state.members[name] === null)) return { ok: false, errors: ["seal or log member missing"], entryCount: 0 };
  let entries: HumanLogEntry[] = [];
  try {
    entries = entriesOf(state.members.log!.bytes);
    let previous: string | null = null;
    for (const [index, entry] of entries.entries()) {
      const expected = sha256Hex(canonicalize({ v: entry.v, ts: entry.ts, type: entry.type, agentId: entry.agentId,
        username: entry.username, payload: entry.payload, prev: entry.prev }));
      if (entry.hash !== expected) errors.push("entry " + index + " hash mismatch");
      if (entry.prev !== previous) errors.push("entry " + index + " prev mismatch");
      previous = entry.hash;
    }
    const parsed: unknown = JSON.parse(state.members.seal!.bytes.toString("utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid human audit seal");
    const seal = parsed as HumanSeal;
    const sidecar: unknown = JSON.parse(state.members.signature!.bytes.toString("utf8"));
    if (sidecar === null || typeof sidecar !== "object" || Array.isArray(sidecar)
      || Object.prototype.hasOwnProperty.call(sidecar, "envelope")) throw new Error("human audit signature must use its existing raw format");
    // Historical recipe signs the compact parsed representation, including ALL parsed fields, not pretty-file bytes.
    const compact = Buffer.from(JSON.stringify(parsed), "utf8");
    const verdict = verifyAuditorSignatureBytes(state.workspace, "BUNDLE", compact, state.members.signature!.bytes);
    if (!verdict.valid) errors.push("seal signature verification failed: " + (verdict.reason ?? "invalid signature"));
    if (seal.v !== 1 || !Number.isFinite(seal.ts) || typeof seal.signerFingerprint !== "string") errors.push("invalid seal fields");
    if ((seal.lastHash ?? null) !== previous) errors.push("seal lastHash mismatch");
    if (seal.entryCount !== entries.length) errors.push("seal entryCount mismatch");
  } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  return { ok: errors.length === 0, errors, entryCount: entries.length };
}
function predecessor(state: HumanState): HumanLogEntry[] {
  if (empty(state)) return [];
  const verdict = verifyState(state);
  if (!verdict.ok) throw new Error("human audit predecessor refused: " + verdict.errors.join("; "));
  return entriesOf(state.members.log!.bytes);
}
function copyInput(params: HumanEventInput): HumanEventInput {
  return { workspace: params.workspace, type: params.type, agentId: params.agentId ?? null, username: params.username ?? null,
    payload: JSON.parse(JSON.stringify(params.payload ?? {})) as Record<string, unknown> };
}
function nextEntry(params: HumanEventInput, entries: readonly HumanLogEntry[]): HumanLogEntry {
  const base = { v: 1 as const, ts: Date.now(), type: params.type, agentId: params.agentId ?? null,
    username: params.username ?? null, payload: params.payload ?? {}, prev: entries.at(-1)?.hash ?? null };
  return { ...base, hash: sha256Hex(canonicalize(base)) };
}
function logFor(state: HumanState, entry: HumanLogEntry | null, count: number): Buffer {
  const prefix = state.members.log?.bytes ?? Buffer.alloc(0);
  const separator = entry !== null && prefix.length > 0 && prefix.at(-1) !== 10 ? Buffer.from("\n") : Buffer.alloc(0);
  const bytes = Buffer.concat([prefix, separator, entry === null ? Buffer.alloc(0) : Buffer.from(JSON.stringify(entry) + "\n")]);
  const parsed = entriesOf(bytes);
  if (parsed.length !== count || (parsed.at(-1)?.hash ?? null) !== (entry?.hash ?? null)) throw new Error("human audit prefix cannot be extended without rewriting existing lines");
  return bytes;
}
function selectedPublicKey(workspace: string): string {
  return boundProviderKey(workspace, "artifact-seal")?.publicKeyPem ?? getSigningPublicKeyPem(workspace, "artifact-seal");
}
function sealFor(pem: string, entry: HumanLogEntry | null, count: number): HumanSeal {
  return { v: 1, ts: Date.now(), lastHash: entry?.hash ?? null, entryCount: count,
    signerFingerprint: sha256Hex(Buffer.from(pem, "utf8")) };
}
function prepared(
  state: HumanState, entry: HumanLogEntry | null, seal: HumanSeal, signed: PurposeSignature,
  authority: ReturnType<typeof capturePurposePublication>, log: Buffer
): { publish: (assertActorCurrent?: () => void) => HumanLogEntry | null } {
  if (signed.publicKeyPem !== selectedPublicKey(state.workspace)
    || sha256Hex(Buffer.from(signed.publicKeyPem, "utf8")) !== seal.signerFingerprint) {
    throw new Error("human audit signer changed while signing was prepared");
  }
  const digest = sha256Hex(Buffer.from(JSON.stringify(seal), "utf8"));
  const sidecar: HumanSealSignature = { digestSha256: digest, signature: signed.signature.toString("base64"), signedTs: Date.now(), signer: "auditor" };
  const values: Record<MemberName, Buffer> = {
    log,
    seal: Buffer.from(JSON.stringify(seal, null, 2)), signature: Buffer.from(JSON.stringify(sidecar, null, 2))
  };
  return { publish(assertActorCurrent) {
    return withControlFileLock({ root: join(state.workspace, ".amc"), name: "human-action-log", operation: () => {
      // Only the actual internal Studio caller supplies this throw-only local recheck. It cannot replace the gates below.
      assertActorCurrent?.();
      assertCurrent(state);
      assertPurposePublicationCurrent(state.workspace, authority, signed);
      if (signed.publicKeyPem !== selectedPublicKey(state.workspace)) throw new Error("human audit signer changed before publication");
      const completed: MemberName[] = [];
      let phase: MemberName = "log";
      try {
        for (const name of memberNames) {
          phase = name;
          writeFileAtomic(state.paths[name], values[name], 0o644);
          completed.push(name);
        }
      } catch (cause) { throw new HumanLogPublicationError(phase, [...completed], entry?.hash ?? null, { cause }); }
      return entry;
    } });
  } };
}
/** Internal actual Studio seam; no root SDK facade or public key/kind/auth option. */
export async function prepareHumanActionEvent(params: HumanEventInput): Promise<{ publish: (assertActorCurrent?: () => void) => HumanLogEntry }> {
  const input = copyInput(params), state = capture(input.workspace), entries = predecessor(state);
  const authority = capturePurposePublication(input.workspace, "artifact-seal"), pem = selectedPublicKey(input.workspace);
  const entry = nextEntry(input, entries), seal = sealFor(pem, entry, entries.length + 1), log = logFor(state, entry, entries.length + 1);
  const signed = await signWithPurposeKey(input.workspace, "artifact-seal", Buffer.from(sha256Hex(Buffer.from(JSON.stringify(seal))), "hex"));
  const plan = prepared(state, entry, seal, signed, authority, log);
  return { publish: assertActorCurrent => plan.publish(assertActorCurrent)! };
}
export async function appendHumanActionEventAsync(params: HumanEventInput): Promise<HumanLogEntry> {
  return (await prepareHumanActionEvent(params)).publish();
}
function prepareSync(state: HumanState, entry: HumanLogEntry | null, count: number) {
  const authority = capturePurposePublication(state.workspace, "artifact-seal");
  const pem = selectedPublicKey(state.workspace), seal = sealFor(pem, entry, count), log = logFor(state, entry, count);
  const privateKey = getSigningKey(state.workspace, "artifact-seal"), actual = publicKeyFromPrivate(privateKey);
  if (actual !== pem) throw new Error("human audit vault key does not match its committed purpose");
  const digest = sha256Hex(Buffer.from(JSON.stringify(seal), "utf8"));
  const signed: PurposeSignature = { provider: "file", algorithm: "ed25519", keyId: signingKeyId(actual)!,
    publicKeyPem: actual, signature: Buffer.from(signHexDigest(digest, privateKey), "base64") };
  return prepared(state, entry, seal, signed, authority, log);
}
export function appendHumanActionEvent(params: HumanEventInput): HumanLogEntry {
  const input = copyInput(params), state = capture(input.workspace), entries = predecessor(state), entry = nextEntry(input, entries);
  return prepareSync(state, entry, entries.length + 1).publish()!;
}
export function verifyHumanActionLog(workspace: string): { ok: boolean; errors: string[]; entryCount: number } {
  let state: HumanState;
  try { state = capture(workspace); }
  catch (error) { return { ok: false, errors: [error instanceof Error ? error.message : String(error)], entryCount: 0 }; }
  // Preserve ONLY the original all-absent lazy initialization. Its genuine failure still throws, with native cause/progress.
  // Complete reads never sign; partial state is not repaired.
  if (empty(state)) { prepareSync(state, null, 0).publish(); state = capture(workspace); }
  return verifyState(state);
}
