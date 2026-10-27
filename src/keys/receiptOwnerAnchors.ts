/** Hardcoded receipt owner transition. Its log authority remains the current artifact policy signer. */
import { join, relative, resolve, sep } from "node:path";
import { publicKeyFromPrivate, verifyKeyHistoryEnvelope } from "../crypto/keyHistoryEnvelope.js";
import { describePolicySigner, assertPolicySignerCurrent } from "../crypto/signing/signer.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { assertOwnerMode } from "../mode/mode.js";
import { getVaultPurposeKeyPem, markWrittenHistories, vaultStatus } from "../vault/vault.js";
import { readContainedOrNull } from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { appendTransparencyEntryAsync, captureReceiptOwnerPredecessor } from "../transparency/asyncWorkspaceAppend.js";
import { publishTransparencyState, stateBytes, workspaceLogPath } from "../transparency/workspacePublication.js";
import { TransparencyMerkleLagError } from "../transparency/merkleIndexState.js";
import { anchorArtifact, markSequence, type AnchorTarget } from "./anchors.js";
import { assertKeysetComplete, boundProviderKey, keysetCommittedMark, keysetFileRel, type Keyset, type KeysetWrite } from "./keyset.js";
import { keyRevocationLocation } from "./keyRevocations.js";
import { encodeSignedRevocationList, readAnchoredRevocationList, readStagedRevocationList } from "./revocationList.js";
import { getSigningPublicKeyPem } from "./signingKeys.js";
import { readReceiptAuthorityState } from "./receiptAuthorityState.js";
import { parseRotationStatement } from "./rotationStatement.js";
import type { ProviderPurposeRotationPlan } from "./purposeKeys.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";

const HISTORY = "keys/receipt_history.json";
type Snapshot = ReturnType<typeof captureReceiptOwnerPredecessor>;
type Commit = { generation: number; keyset: Keyset };
declare const receiptBoundaryBrand: unique symbol;
export interface ReceiptOwnerBoundary {
  readonly [receiptBoundaryBrand]: true;
  assertPreparedCurrent(): void;
  withAnchorBoundary<T>(operation: () => T): T;
  complete(input: Commit & { rotation: ProviderPurposeRotationPlan | null; historyWrites: readonly KeysetWrite[] }): Promise<void>;
}
const boundaries = new WeakMap<object, { workspace: string; previous: string; assertCurrent: () => void }>();
export class ReceiptAuthorityCommittedError extends Error {
  readonly committed = true;
  readonly code = "RECEIPT_AUTHORITY_INCOMPLETE";
  readonly entryHash: string | undefined;
  readonly pendingRecorded: boolean | undefined;
  constructor(readonly generation: number, readonly phase: string, cause: unknown) {
    super("receipt authority committed but finalization did not complete; inspect the committed generation before retrying", { cause });
    this.name = "ReceiptAuthorityCommittedError";
    this.entryHash = cause instanceof TransparencyMerkleLagError ? cause.entryHash : undefined;
    this.pendingRecorded = cause instanceof TransparencyMerkleLagError ? cause.pendingRecorded : undefined;
  }
}
function snapshot(workspace: string): Snapshot {
  const value = captureReceiptOwnerPredecessor(workspace);
  if (value.signedRootLeafCount !== value.entries.length) throw new Error("REPAIR_REQUIRED: receipt owner needs complete signed workspace coverage");
  return value;
}
function ownerInputs(workspace: string): string {
  const location = keyRevocationLocation(workspace), list = readAnchoredRevocationList(location), pending = readStagedRevocationList(location);
  if (list === null) throw new Error("receipt owner requires the signed key revocation list");
  const digest = (path: string) => { const bytes = readContainedOrNull(workspace, path, 256 * 1024 * 1024); return bytes === null ? null : sha256Hex(bytes); };
  return canonicalize({ vault: digest(".amc/vault.amcvault"), config: digest(".amc/amc.config.yaml"), signature: digest(".amc/amc.config.yaml.sig"), revocations: sha256Hex(encodeSignedRevocationList(list)), pending: pending === null ? null : sha256Hex(encodeSignedRevocationList(pending)) });
}
const descriptors = (workspace: string) => [describePolicySigner(workspace, "TRANSPARENCY_ROOT"), describePolicySigner(workspace, "MERKLE_ROOT")];
function assertCommit(workspace: string, expected: Keyset): void {
  const keyset = assertKeysetComplete(workspace), mark = keysetCommittedMark(workspace);
  if (keyset === null || canonicalize(keyset) !== canonicalize(expected) || mark?.sequence !== expected.generation || mark.sha256 !== sha256Hex(canonicalize(expected))) throw new Error("receipt anchors require the exact locally committed generation");
}
function pinned(workspace: string, keyset: Keyset, rel: string): Buffer {
  const bytes = readContainedOrNull(workspace, keysetFileRel(rel), 256 * 1024 * 1024);
  if (bytes === null || keyset.files[rel] !== sha256Hex(bytes)) throw new Error("receipt anchor target is missing or unpinned"); return bytes;
}
function targets(workspace: string, keyset: Keyset) {
  const binding = boundProviderKey(workspace, "receipt");
  if (binding?.binding.receiptAuthoritySha256 === undefined) throw new Error("receipt recovery requires its committed token authority");
  const history = pinned(workspace, keyset, HISTORY), anchor = getSigningPublicKeyPem(workspace, "receipt");
  const envelope = verifyKeyHistoryEnvelope(JSON.parse(history.toString("utf8")), "receipt", anchor).envelope;
  if (envelope === null || !envelope.entries.some(entry => entry.publicKeyPem === binding.publicKeyPem)) throw new Error("receipt exact history omits its issuer");
  const output: Array<Omit<AnchorTarget, "fileSha256" | "entryHash">> = [];
  const path = Object.keys(keyset.files).filter(rel => /^keys\/statements\/receipt\/[1-9][0-9]{0,15}\.json$/.test(rel))
    .sort((a, b) => Number(a.split("/").at(-1)!.slice(0, -5)) - Number(b.split("/").at(-1)!.slice(0, -5))).at(-1);
  if (path) {
    const bytes = pinned(workspace, keyset, path), signed = parseRotationStatement(bytes);
    if (signed.statement.purpose !== "receipt" || signed.statement.nextKeyId !== binding.binding.keyId || signed.statement.workspaceId !== workspaceIdFromDirectory(workspace)) throw new Error("receipt rotation target differs from its actual issuer");
    output.push({ workspace, type: "KEY_ROTATION", id: `${workspaceIdFromDirectory(workspace)}:receipt`, sequence: signed.statement.sequence, sha256: sha256Hex(bytes) });
  }
  output.push({ workspace, type: "KEY_HISTORY_REVISION", id: `${workspaceIdFromDirectory(workspace)}:receipt`, sequence: envelope.revision, sha256: sha256Hex(canonicalize(envelope)) });
  return { output, history };
}
function targetComplete(before: Snapshot, target: Omit<AnchorTarget, "fileSha256" | "entryHash">): boolean {
  const artifact = anchorArtifact(target); let found = false;
  for (const entry of before.entries) {
    if (entry.type !== target.type || entry.artifact.kind !== artifact.kind || !entry.artifact.id?.startsWith(`${target.id}#`)) continue;
    const sequence = Number(entry.artifact.id.slice(target.id.length + 1));
    if (sequence > target.sequence || (sequence === target.sequence && entry.artifact.sha256 !== target.sha256)) throw new Error("receipt anchor forks or is behind its recorded target");
    if (entry.artifact.id === artifact.id && entry.artifact.sha256 === artifact.sha256) found = true;
  }
  return found;
}
async function anchor(workspace: string, keyset: Keyset, gate: () => void): Promise<void> {
  let phase = "predecessor";
  try {
    const rows = targets(workspace, keyset);
    for (const target of rows.output) {
      phase = "predecessor"; gate(); const before = snapshot(workspace), artifact = anchorArtifact(target);
      const found = targetComplete(before, target);
      phase = target.type === "KEY_ROTATION" ? "rotation-log" : "history-log";
      if (!found) await appendTransparencyEntryAsync({ workspace, type: target.type, agentId: "workspace", artifact }, { beforeCommit: gate });
      gate(); phase = target.type === "KEY_ROTATION" ? "rotation-mark" : "history-mark";
      if (target.type === "KEY_ROTATION") markSequence(target);
      else markWrittenHistories(workspace, [{ path: join(workspace, ".amc", HISTORY), bytes: rows.history, mode: 0o600 }]);
    }
  } catch (cause) { throw new ReceiptAuthorityCommittedError(keyset.generation, phase, cause); }
}
/** Capture current ordinary artifact policy/coverage, not artifact prospective-binding admission. */
export function captureReceiptOwnerBoundary(workspace: string): ReceiptOwnerBoundary {
  const root = resolve(workspace); assertOwnerMode(root, "keys rotate");
  if (process.env.AMC_NO_SIGN === "1" || !vaultStatus(root).unlocked) throw new Error("receipt owner requires the unlocked signing vault");
  const ownerPem = publicKeyFromPrivate(getVaultPurposeKeyPem(root, "receipt")), keyset = assertKeysetComplete(root);
  if (keyset === null || ownerPem !== getSigningPublicKeyPem(root, "receipt")) throw new Error("receipt owner differs from its committed local public key");
  const inputs = ownerInputs(root), policy = JSON.stringify(loadTrustConfig(root)), selected = descriptors(root), before = snapshot(root);
  const prefix = stateBytes(before.state, workspaceLogPath(root));
  if (boundProviderKey(root, "receipt") !== null && targets(root, keyset).output.some(target => !targetComplete(before, target))) throw new Error("receipt prior anchors are incomplete; recover before another owner transition");
  const ownerGate = () => {
    assertOwnerMode(root, "keys rotate");
    if (process.env.AMC_NO_SIGN === "1" || !vaultStatus(root).unlocked || publicKeyFromPrivate(getVaultPurposeKeyPem(root, "receipt")) !== ownerPem || ownerInputs(root) !== inputs) throw new Error("receipt owner inputs changed while signing");
    if (JSON.stringify(loadTrustConfig(root)) !== policy) throw new Error("receipt owner signing policy changed while signing");
    for (const descriptor of selected) assertPolicySignerCurrent(root, descriptor);
  };
  const assertCurrent = () => { ownerGate(); if (canonicalize(assertKeysetComplete(root)) !== canonicalize(keyset)) throw new Error("receipt original generation changed while preparing"); };
  const boundary = {
    assertPreparedCurrent: assertCurrent,
    withAnchorBoundary<T>(operation: () => T): T { return publishTransparencyState(root, before.state, () => { assertCurrent(); return operation(); }); },
    async complete(input: Commit & { rotation: ProviderPurposeRotationPlan | null; historyWrites: readonly KeysetWrite[] }): Promise<void> {
      const committed = JSON.parse(canonicalize(input.keyset)) as Keyset;
      if (input.generation !== committed.generation || committed.generation !== keyset.generation + 1) throw new Error("receipt owner requires its actual next committed generation");
      assertCommit(root, committed);
      if (input.historyWrites.length !== 1) throw new Error("receipt owner requires its exact prepared history");
      const history = input.historyWrites[0]!, rel = relative(join(root, ".amc"), history.path).split(sep).join("/");
      if (rel !== HISTORY || !pinned(root, committed, rel).equals(Buffer.from(history.bytes))) throw new Error("receipt committed history differs from prepared bytes");
      if (input.rotation && (input.rotation.purpose !== "receipt" || !pinned(root, committed, relative(join(root, ".amc"), input.rotation.path).split(sep).join("/")).equals(input.rotation.bytes))) throw new Error("receipt committed rotation differs from prepared bytes");
      const gate = () => {
        ownerGate(); assertCommit(root, committed);
        const now = stateBytes(snapshot(root).state, workspaceLogPath(root));
        if (prefix !== null && (now === null || now.length < prefix.length || !now.subarray(0, prefix.length).equals(prefix))) throw new Error("receipt original workspace prefix changed after commit");
      };
      await anchor(root, committed, gate);
    }
  } as ReceiptOwnerBoundary;
  boundaries.set(boundary, { workspace: root, previous: boundProviderKey(root, "receipt")?.publicKeyPem ?? ownerPem, assertCurrent });
  return Object.freeze(boundary);
}
export function assertReceiptOwnerBoundary(workspace: string, boundary: ReceiptOwnerBoundary, previous: string): void {
  const captured = boundaries.get(boundary);
  if (captured === undefined || captured.workspace !== resolve(workspace) || captured.previous !== previous) throw new Error("receipt rotation requires its actual owner boundary and prior issuer"); captured.assertCurrent();
}
/** Internal current-state recovery. No arbitrary generation/target or normal binding/CLI route. */
export async function resumeReceiptAuthorityAnchors(workspace: string): Promise<void> {
  const root = resolve(workspace), keyset = assertKeysetComplete(root);
  if (keyset === null) throw new Error("receipt recovery requires its committed generation");
  if (readReceiptAuthorityState(root) === null) throw new Error("receipt recovery requires its actual committed token authority");
  const inputs = ownerInputs(root), policy = JSON.stringify(loadTrustConfig(root)), selected = descriptors(root);
  const gate = () => { assertOwnerMode(root, "keys resume"); if (process.env.AMC_NO_SIGN === "1" || !vaultStatus(root).unlocked || ownerInputs(root) !== inputs || JSON.stringify(loadTrustConfig(root)) !== policy) throw new Error("receipt recovery owner changed"); assertCommit(root, keyset); for (const descriptor of selected) assertPolicySignerCurrent(root, descriptor); };
  gate(); await anchor(root, keyset, gate);
}
