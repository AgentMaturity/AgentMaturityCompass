/** Two explicit retention drivers; every preparation/final DB scope closes before any await. */
import { randomUUID } from "node:crypto";
import { lstatSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { openLedger } from "../../ledger/ledger.js";
import { runImmediateTransaction } from "../../ledger/ledgerSessionTransactions.js";
import { verifyEvidencePayload } from "../../ledger/retentionVerification.js";
import { getSigningKey } from "../../keys/signingKeys.js";
import { signWithPurposeKey, type PurposeSignature } from "../../keys/purposeProviders.js";
import { signHexDigest } from "../../crypto/keys.js";
import { assertOwnerMode } from "../../mode/mode.js";
import { appendTransparencyEntry } from "../../transparency/logChain.js";
import { appendTransparencyEntryAttemptAsync, captureWorkspaceLogAuthority } from "../../transparency/asyncWorkspaceAppend.js";
import { TransparencyMerkleLagError } from "../../transparency/merkleIndexState.js";
import { rebuildTransparencyMerkle } from "../../transparency/merkleIndexStore.js";
import { canonicalize } from "../../utils/json.js";
import { sha256Hex } from "../../utils/hash.js";
import { containedExists } from "../../utils/containedFs.js";
import { decodeBlobV1, decryptBlobV1 } from "../../storage/blobs/blobEncryptor.js";
import { readBlobKeyMaterial } from "../../storage/blobs/blobKeys.js";
import { withDeletionGate, DeletionDenied } from "../../residency/deletionGate.js";
import { opsPolicyPath, opsPolicySigPath, opsPolicySchema, verifyOpsPolicyBytes } from "../policy.js";
import { appendOpsAuditEvent } from "../audit.js";
import { pruneGuardEvents } from "../../enforce/evidenceEmitter.js";
import { captureRetentionProofs, verifyPrunedSnapshot } from "./retentionArchive.js";
import { retentionSegmentSignatureSchema, blobPrunedSealSchema } from "./retentionSchema.js";
import { captureRetentionFile, captureRetentionBlob, assertRetentionFilesCurrent, retentionHead, assertRetentionHeadCurrent, prepareRetentionSegment,
  assertRetentionSuccessor, publishRetentionSegment, withRetentionPublication, prunedFiles, preparePrunedPrefix, publishPrunedPrefix,
  type RetentionFile } from "./retentionPublication.js";
import { finishRetentionTail } from "./retentionTail.js";
import { captureRetentionAuthority, assertRetentionAuthorityCurrent } from "./retentionAuthority.js";
import type { RetentionRunResult } from "./retentionEngine.js";
import type { EvidenceEvent } from "../../types.js";

type Parameters = { workspace: string; dryRun: boolean };
type Writer = ReturnType<typeof openLedger>;
const DAY = 24 * 60 * 60 * 1000;
const conflict = () => new Error("retention selected state changed while signing; retry");
function withLedger<T>(workspace: string, operation: (ledger: Writer) => T, readonly = false): T {
  const ledger = openLedger(workspace, readonly ? { readonly: true } : undefined); let failed = false, primary: unknown;
  try { return operation(ledger); }
  catch (cause) { failed = true; primary = cause; throw cause; }
  finally { try { ledger.close(); } catch (cleanup) {
    if (failed) throw new AggregateError([primary, cleanup], "retention operation and ledger close failed", { cause: primary });
    throw cleanup;
  } }
}
function currentRows(ledger: Writer, ids: readonly string[]): EvidenceEvent[] {
  const query = ledger.db.prepare("SELECT * FROM evidence_events WHERE id = ?");
  return ids.map(id => query.get(id) as EvidenceEvent | undefined).filter((row): row is EvidenceEvent => row !== undefined);
}
function assertRows(ledger: Writer, expected: readonly EvidenceEvent[]): void {
  if (canonicalize(currentRows(ledger, expected.map(row => row.id))) !== canonicalize(expected)) throw conflict();
}
interface Progress {
  publishedPaths: string[]; attemptedPaths: string[]; archiveMarked: boolean; payloadPrunedIds: string[];
  removedBlobIds: string[]; auditEventIds: string[]; completedStages: string[]; attemptedStages: string[];
  confirmedSpillCount: number; guardResult: number | null; transparencyHash: string | null;
}
class RetentionPartialError extends Error {
  readonly code = "RETENTION_PARTIAL";
  readonly progress: Readonly<{ publishedPaths: readonly string[]; attemptedPaths: readonly string[]; archiveMarked: boolean;
    payloadPrunedIds: readonly string[]; removedBlobIds: readonly string[]; auditEventIds: readonly string[];
    completedStages: readonly string[]; attemptedStages: readonly string[]; confirmedSpillCount: number; guardResult: number | null; transparencyHash: string | null }>;
  constructor(readonly phase: string, progress: Progress, cause: unknown) {
    super("retention is incomplete; inspect the recorded effects before retrying", { cause });
    this.name = "RetentionPartialError";
    this.progress = Object.freeze({ ...progress, publishedPaths: Object.freeze([...progress.publishedPaths]),
      attemptedPaths: Object.freeze([...progress.attemptedPaths]), payloadPrunedIds: Object.freeze([...progress.payloadPrunedIds]),
      removedBlobIds: Object.freeze([...progress.removedBlobIds]), auditEventIds: Object.freeze([...progress.auditEventIds]),
      completedStages: Object.freeze([...progress.completedStages]), attemptedStages: Object.freeze([...progress.attemptedStages]) });
  }
}
function prepareRun(input: Parameters, asynchronous: boolean, caller?: () => void) {
  const workspace = resolve(input.workspace), dryRun = input.dryRun === true;
  assertOwnerMode(workspace, "retention run"); caller?.();
  if (asynchronous && process.env.AMC_NO_SIGN === "1") throw new Error("AMC_NO_SIGN refuses asynchronous retention publication");
  const policyFiles = [opsPolicyPath(workspace), opsPolicySigPath(workspace)].map(captureRetentionFile);
  const verdict = verifyOpsPolicyBytes(workspace, policyFiles[0]!.bytes, policyFiles[1]!.bytes);
  if (!verdict.valid) throw new Error(`ops policy invalid: ${verdict.reason ?? "unknown reason"}`);
  const policy = opsPolicySchema.parse(YAML.parse(policyFiles[0]!.bytes!.toString("utf8")) as unknown);
  const archiveBeforeTs = Date.now() - Math.max(1, policy.opsPolicy.retention.archivePayloadsAfterDays) * DAY;
  const pruneBeforeTs = Date.now() - Math.max(1, policy.opsPolicy.retention.prunePayloadsAfterDays) * DAY;
  const guardDays = policy.opsPolicy.retention.pruneGuardEventsAfterDays;
  const guardBeforeTs = guardDays === undefined ? null : Date.now() - Math.max(1, guardDays) * DAY;
  const selected = withLedger(workspace, ledger => ledger.getRetentionEligibleEvents({ archiveBeforeTs, pruneBeforeTs }));
  const archive = selected.archive, prune = selected.prune.filter(row => row.payload_path !== null || row.payload_inline !== null);
  const progress: Progress = { publishedPaths: [], attemptedPaths: [], archiveMarked: false, payloadPrunedIds: [], removedBlobIds: [],
    auditEventIds: [], completedStages: [], attemptedStages: [], confirmedSpillCount: 0, guardResult: null, transparencyHash: null };
  const result: RetentionRunResult = { dryRun, archivedEventCount: archive.length, prunedEventCount: dryRun ? prune.length : 0,
    prunedGuardEventCount: 0, prunedBlobCount: 0, prunedSpillCount: 0, segmentId: archive.length ? `seg_${randomUUID()}` : null,
    segmentPath: null, manifestPath: null, manifestSha256: null, auditEventIds: progress.auditEventIds, transparencyHash: null };
  const run = { workspace, dryRun, asynchronous, caller, policyFiles, policy, archiveBeforeTs, pruneBeforeTs, guardBeforeTs, archive, prune,
    progress, result, phase: "prepare", authority: null as ReturnType<typeof captureRetentionAuthority> | null,
    logAuthority: null as ReturnType<typeof captureWorkspaceLogAuthority> | null, archiveFiles: [] as RetentionFile[], prunedPrefix: [] as readonly RetentionFile[] };
  if (!dryRun && (archive.length > 0 || prune.length > 0 || withLedger(workspace, ledger => ledger.listBlobReferences()).length > 0))
    run.authority = captureRetentionAuthority(workspace, asynchronous);
  return run;
}
type Run = ReturnType<typeof prepareRun>;
function gate(run: Run, signed?: PurposeSignature): void {
  assertOwnerMode(run.workspace, "retention run"); run.caller?.();
  if (run.asynchronous && process.env.AMC_NO_SIGN === "1") throw new Error("AMC_NO_SIGN refuses asynchronous retention publication");
  assertRetentionFilesCurrent(run.policyFiles);
  // Existing explicit-kind verification is local: it uses authenticated history/current pinned metadata, no SDK probe.
  if (!verifyOpsPolicyBytes(run.workspace, run.policyFiles[0]!.bytes, run.policyFiles[1]!.bytes).valid)
    throw new Error("the captured ops policy no longer verifies under current authority");
  if (run.authority !== null) assertRetentionAuthorityCurrent(run.workspace, run.authority, signed);
  run.logAuthority?.assertCurrent();
  assertRetentionFilesCurrent(run.prunedPrefix);
}
function guarded<T>(run: Run, phase: string, operation: () => T): T {
  run.phase = phase;
  try { return operation(); }
  catch (error) {
    if (error instanceof RetentionPartialError) throw error;
    if (run.progress.attemptedStages.length > 0 || run.progress.publishedPaths.length > 0 || run.progress.removedBlobIds.length > 0)
      throw new RetentionPartialError(run.phase, run.progress, error);
    throw error;
  }
}
function segmentPlan(run: Run) {
  if (run.result.segmentId === null) return null;
  if (run.asynchronous && run.archive.some(row => row.archived !== 0 || row.payload_pruned !== 0 || row.payload_pruned_ts != null
    || row.archive_segment_id != null || row.archive_manifest_sha256 != null))
    throw new Error("retention archive requires the original pre-retention row state");
  const head = retentionHead(run.workspace);
  let proof: ReturnType<typeof captureRetentionProofs> | null = null;
  if (run.asynchronous && head.name !== null) {
    proof = captureRetentionProofs(run.workspace);
    if (!proof.index.ok) throw new Error("retention predecessor proof is invalid");
    assertRetentionFilesCurrent(head.files);
  }
  const plan = prepareRetentionSegment({ workspace: run.workspace, segmentId: run.result.segmentId,
    startTs: run.archive[0]!.ts, endTs: run.archive.at(-1)!.ts, eventLines: run.archive.map(row => JSON.stringify(row)),
    firstEventHash: run.archive[0]!.event_hash, lastEventHash: run.archive.at(-1)!.event_hash, prevSegmentLastEventHash: head.lastHash,
    prunePolicy: { archivePayloadsAfterDays: run.policy.opsPolicy.retention.archivePayloadsAfterDays,
      prunePayloadsAfterDays: run.policy.opsPolicy.retention.prunePayloadsAfterDays } });
  if (run.asynchronous) {
    assertRetentionSuccessor(plan, head);
    if (plan.targets.some(file => file.bytes !== null)) throw conflict();
  }
  return { head, plan, proof };
}
function commitSegment(run: Run, prepared: NonNullable<ReturnType<typeof segmentPlan>>, signature: string, signed?: PurposeSignature): void {
  run.phase = "archive-publish";
  const { plan, head } = prepared;
  const sidecar = JSON.stringify(retentionSegmentSignatureSchema.parse({ digestSha256: plan.digest, signature, signedTs: Date.now(), signer: "auditor" }), null, 2);
  gate(run, signed);
  withLedger(run.workspace, ledger => withRetentionPublication(run.workspace, () => {
    runImmediateTransaction(ledger.db, () => {
      gate(run, signed); assertRows(ledger, run.archive);
      if (run.asynchronous) segmentProofGate(run, prepared);
      assertRetentionHeadCurrent(run.workspace, head); assertRetentionFilesCurrent(plan.targets);
      run.progress.attemptedStages.push("archive-files-and-mark");
      publishRetentionSegment(plan, sidecar, run.progress.publishedPaths, run.progress.attemptedPaths);
      ledger.markEventsArchived(run.archive.map(row => row.id), run.result.segmentId!, plan.digest);
    });
    // Async progress acknowledges the returned COMMIT even if subsequent lock/ledger cleanup fails.
    if (run.asynchronous) { run.progress.archiveMarked = true; run.progress.completedStages.push("archive-files-and-mark"); }
  }));
  if (!run.asynchronous) { run.progress.archiveMarked = true; run.progress.completedStages.push("archive-files-and-mark"); }
  run.result.segmentPath = plan.segmentPath; run.result.manifestPath = plan.manifestPath; run.result.manifestSha256 = plan.digest;
  run.archiveFiles = [plan.segmentPath, plan.manifestPath, plan.sigPath].map(captureRetentionFile);
  const expected = [plan.compressed, plan.manifestBytes, Buffer.from(sidecar)];
  if (run.archiveFiles.some((file, index) => file.bytes === null || !file.bytes.equals(expected[index]!)))
    throw new Error("the published retention archive no longer has the prepared bytes");
}
function prunePayloads(run: Run): void {
  if (run.prune.length === 0) return;
  const selected = withLedger(run.workspace, ledger => currentRows(ledger, run.prune.map(row => row.id)));
  // Only this run's confirmed archive transition may differ from its original selected rows.
  const expected = run.prune.map(row => run.archive.some(item => item.id === row.id) && run.progress.archiveMarked
    ? { ...row, archived: 1, archive_segment_id: run.result.segmentId, archive_manifest_sha256: run.result.manifestSha256 } : row);
  if (canonicalize(selected) !== canonicalize(expected)) throw conflict();
  const proof = run.asynchronous ? captureRetentionProofs(run.workspace) : null;
  const payloadFiles = run.asynchronous ? [...new Set(selected.filter(row => row.payload_inline === null)
    .map(row => row.payload_path ?? row.canonical_payload_path).filter((path): path is string => Boolean(path)))].map(path => captureRetentionFile(join(run.workspace, path))) : [];
  const errors: string[] = [...(proof?.index.errors ?? [])];
  for (const row of selected) {
    if (run.asynchronous) {
      if (row.archived !== 1) errors.push("retention payload requires an existing signed archive proof");
      verifyEvidencePayload(row, run.workspace, errors, undefined, proof!.index);
    }
  }
  assertRetentionFilesCurrent(payloadFiles);
  if (errors.length > 0) throw new Error("retention payload archive proof is invalid or missing");
  const bySession = new Map<string, EvidenceEvent[]>();
  for (const row of selected) { const group = bySession.get(row.session_id) ?? []; group.push(row); bySession.set(row.session_id, group); }
  for (const [sessionId, group] of bySession) {
    const paths = new Set(group.filter(row => row.payload_inline === null).map(row => join(run.workspace, row.payload_path ?? row.canonical_payload_path ?? "")));
    const groupPayloadFiles = payloadFiles.filter(file => paths.has(file.path));
    gate(run);
    withLedger(run.workspace, ledger => {
      try {
        run.progress.attemptedStages.push("payload-hold-admission");
        withDeletionGate({ workspace: run.workspace, executor: "retention.payload-prune", target: { kind: "evidence-payloads",
          sessionHashes: [sha256Hex(Buffer.from(sessionId))], before: new Date(run.pruneBeforeTs).toISOString() } }, () =>
          withRetentionPublication(run.workspace, () => runImmediateTransaction(ledger.db, () => {
            gate(run); assertRows(ledger, group);
            if (proof !== null) assertRetentionFilesCurrent([...proof.files, ...groupPayloadFiles]);
            run.progress.attemptedStages.push("payload-prune"); ledger.pruneEventPayloadColumns(group.map(row => row.id), Date.now());
          })));
        run.progress.payloadPrunedIds.push(...group.map(row => row.id));
      } catch (error) { if (!(error instanceof DeletionDenied)) throw error; }
    });
  }
  run.result.prunedEventCount = run.progress.payloadPrunedIds.length;
}
const referenceSql = `SELECT id, session_id, ts, event_hash, writer_sig, blob_ref, canonical_payload_path, payload_sha256,
  payload_pruned, payload_pruned_ts FROM evidence_events WHERE blob_ref = ? ORDER BY id ASC`;
type Reference = Pick<EvidenceEvent, "id" | "session_id" | "ts" | "event_hash" | "writer_sig" | "blob_ref" | "canonical_payload_path" | "payload_sha256" | "payload_pruned" | "payload_pruned_ts">;
function blobIds(run: Run): string[] {
  return withLedger(run.workspace, ledger => [...new Set(ledger.listBlobReferences().map(row => row.blob_ref).filter((id): id is string => Boolean(id)))]);
}
function blobPlan(run: Run, blobId: string) {
  const references = withLedger(run.workspace, ledger => ledger.db.prepare(referenceSql).all(blobId) as Reference[]);
  if (!references.length || !references.every(row => row.payload_pruned === 1 && row.ts < run.pruneBeforeTs)) return null;
  const file = captureRetentionBlob(run.workspace, blobId);
  if (file.bytes === null) return null;
  if (run.asynchronous) {
    // Reuse the existing exact blob primitives on this captured buffer; do not reread a path after admission.
    let envelope: ReturnType<typeof decodeBlobV1> | null = null;
    try { envelope = decodeBlobV1(file.bytes, blobId); } catch { /* Existing raw legacy blobs remain raw bytes. */ }
    let plaintextDigest = sha256Hex(file.bytes);
    if (envelope !== null) {
      try {
        const plaintext = decryptBlobV1({ blobId, envelope, key: readBlobKeyMaterial(run.workspace, envelope.keyVersion) });
        plaintextDigest = sha256Hex(plaintext);
        if (envelope.payloadSha256 !== plaintextDigest) throw conflict();
      } catch { throw new Error("retention selected stored blob does not authenticate"); }
    }
    if (references.some(row => row.payload_sha256 !== plaintextDigest)) throw new Error("retention selected blob does not match its current references");
  }
  const previous = prunedFiles(run.workspace), verified = verifyPrunedSnapshot(run.workspace, previous);
  if (run.asynchronous && !verified.ok) throw new Error("retention prune prefix is invalid");
  const plan = preparePrunedPrefix(run.workspace, blobId, sha256Hex(file.bytes), previous);
  return { plan, file, references };
}
function commitBlob(run: Run, prepared: NonNullable<ReturnType<typeof blobPlan>>, signature: string, signed?: PurposeSignature): void {
  run.phase = "blob-publish";
  const { plan, file, references } = prepared;
  const seal = JSON.stringify(blobPrunedSealSchema.parse({ v: 1, ts: plan.sealTs, lastHash: plan.row.hash, digestSha256: plan.digest,
    signature, signer: "auditor" }), null, 2);
  let outcome: "removed" | "references_changed" | "references_ineligible" | "file_missing";
  gate(run, signed);
  try {
    run.progress.attemptedStages.push("blob-hold-admission");
    outcome = withLedger(run.workspace, ledger => withDeletionGate({ workspace: run.workspace, executor: "retention.blob-unlink",
      target: { kind: "blobs", sessionHashes: [...new Set(references.map(row => sha256Hex(Buffer.from(row.session_id))))],
        before: new Date(run.pruneBeforeTs).toISOString() } }, () => withRetentionPublication(run.workspace, () => runImmediateTransaction(ledger.db, () => {
      gate(run, signed);
      const current = ledger.db.prepare(referenceSql).all(plan.row.blobId) as Reference[];
      if (canonicalize(current) !== canonicalize(references)) return "references_changed" as const;
      if (!current.length || !current.every(row => row.payload_pruned === 1 && row.ts < run.pruneBeforeTs)) return "references_ineligible" as const;
      const currentFile = captureRetentionBlob(run.workspace, plan.row.blobId);
      if (currentFile.bytes === null) return "file_missing" as const;
      if (file.identity !== currentFile.identity || !file.bytes!.equals(currentFile.bytes)) throw conflict();
      assertRetentionFilesCurrent(plan.previous);
      if (run.asynchronous) {
        if (!verifyPrunedSnapshot(run.workspace, plan.previous).ok) throw new Error("retention selected prune prefix is no longer admitted");
        assertRetentionFilesCurrent(plan.previous);
      }
      if (!containedExists(run.workspace, file.relativePath)) return "file_missing" as const;
      run.progress.attemptedStages.push("blob-unlink-and-prune-seal");
      unlinkSync(file.path); run.progress.removedBlobIds.push(plan.row.blobId); run.result.prunedBlobCount += 1;
      publishPrunedPrefix(plan, seal, run.progress.publishedPaths, run.progress.attemptedPaths);
      if (run.asynchronous) {
        // Retain only this returned prefix's exact prepared body/seal and native modes, inside the existing lock.
        const own = prunedFiles(run.workspace), expected = [plan.bytes, Buffer.from(seal)];
        if (own.some((row, index) => row.bytes === null || !row.bytes.equals(expected[index]!) || (lstatSync(row.path).mode & 0o777) !== 0o644))
          throw new Error("published retention prune prefix differs from the prepared bytes or mode");
        assertRetentionFilesCurrent(own); run.prunedPrefix = own;
      }
      return "removed" as const;
    })))));
  } catch (error) { if (error instanceof DeletionDenied) return; throw error; }
  if (outcome !== "removed") {
    run.progress.attemptedStages.push("blob-skip-audit");
    const audit = appendOpsAuditEvent({ workspace: run.workspace, auditType: "RETENTION_BLOB_DELETE_SKIPPED",
      payload: { blobId: plan.row.blobId, executor: "retention.blob-unlink", admittedReferenceSha256: sha256Hex(canonicalize(references)), removed: false, reason: outcome } });
    if (!audit.eventId || !/^[a-f0-9]{64}$/.test(audit.eventHash)) throw new Error("retention_blob_delete_skipped_audit_unacknowledged");
    run.progress.auditEventIds.push(audit.eventId);
  }
}
function dry(run: Run): RetentionRunResult {
  run.phase = "dry-run-audit";
  gate(run); run.progress.attemptedStages.push("dry-run-audit");
  const audit = appendOpsAuditEvent({ workspace: run.workspace, auditType: "RETENTION_DRY_RUN", payload: {
    archiveCandidates: run.archive.length, pruneCandidates: run.prune.length, segmentId: run.result.segmentId } });
  run.progress.auditEventIds.push(audit.eventId); return run.result;
}
function guardRows(run: Run): void {
  if (run.guardBeforeTs === null) return;
  run.phase = "guard-prune";
  gate(run); run.progress.attemptedStages.push("guard-prune");
  run.result.prunedGuardEventCount = pruneGuardEvents(run.workspace, new Date(run.guardBeforeTs).toISOString());
  run.progress.guardResult = run.result.prunedGuardEventCount;
}
function finish(run: Run): void {
  gate(run);
  try { finishRetentionTail({ workspace: run.workspace, policy: run.policy, pruneBeforeTs: run.pruneBeforeTs, result: run.result,
    gate: () => gate(run), before: stage => { run.phase = stage; run.progress.attemptedStages.push(stage); },
    completed: stage => run.progress.completedStages.push(stage) });
  } finally { run.progress.confirmedSpillCount = run.result.prunedSpillCount; }
}
function logInput(run: Run) {
  return { workspace: run.workspace, type: "RETENTION_SEGMENT_CREATED" as const, agentId: "system",
    artifact: { kind: "policy" as const, id: run.result.segmentId!, sha256: run.result.manifestSha256! } };
}
function logGate(run: Run): void { gate(run); assertRetentionFilesCurrent(run.archiveFiles); }
function segmentProofGate(run: Run, prepared: NonNullable<ReturnType<typeof segmentPlan>>): void {
  if (prepared.proof !== null) {
    assertRetentionFilesCurrent(prepared.proof.files);
    const current = captureRetentionProofs(run.workspace);
    if (!current.index.ok || canonicalize(current.files.map(file => file.path)) !== canonicalize(prepared.proof.files.map(file => file.path)))
      throw new Error("retention selected predecessor proof is no longer admitted");
    assertRetentionFilesCurrent(prepared.proof.files);
  }
}
/** Old selected proof/row/target negatives apply only until this segment's own commit. */
function segmentSigningGate(run: Run, prepared: NonNullable<ReturnType<typeof segmentPlan>>, signed?: PurposeSignature): void {
  gate(run, signed); assertRetentionFilesCurrent(run.archiveFiles);
  withLedger(run.workspace, ledger => assertRows(ledger, run.archive), true);
  segmentProofGate(run, prepared);
  assertRetentionHeadCurrent(run.workspace, prepared.head); assertRetentionFilesCurrent(prepared.plan.targets);
}
/** This blob's old references/bytes/prefix are preparation-only, never replayed after its own unlink or seal. */
function blobSigningGate(run: Run, prepared: NonNullable<ReturnType<typeof blobPlan>>, signed?: PurposeSignature): void {
  gate(run, signed); assertRetentionFilesCurrent(run.archiveFiles);
  const { plan, file, references } = prepared;
  const current = withLedger(run.workspace, ledger => ledger.db.prepare(referenceSql).all(plan.row.blobId) as Reference[], true);
  if (canonicalize(current) !== canonicalize(references)) throw conflict();
  const selected = captureRetentionBlob(run.workspace, plan.row.blobId);
  if (file.identity !== selected.identity || selected.bytes === null || file.bytes === null || !file.bytes.equals(selected.bytes)) throw conflict();
  assertRetentionFilesCurrent(plan.previous);
  if (!verifyPrunedSnapshot(run.workspace, plan.previous).ok) throw new Error("retention selected prune prefix is no longer admitted");
  assertRetentionFilesCurrent(plan.previous);
}
/** Retained synchronous SDK: all real signatures finish outside hold/publication/SQL locks. */
export function runRetentionSync(input: Parameters): RetentionRunResult {
  const run = prepareRun({ ...input }, false);
  return guarded(run, "prepare", () => {
    if (run.dryRun) return dry(run);
    const segment = segmentPlan(run);
    if (segment) { run.phase = "archive-sign"; commitSegment(run, segment, signHexDigest(segment.plan.digest, getSigningKey(run.workspace, "artifact-seal"))); }
    guarded(run, "payload-prune", () => prunePayloads(run)); guardRows(run);
    for (const blobId of blobIds(run)) {
      const plan = guarded(run, "blob-prepare", () => blobPlan(run, blobId));
      if (plan) guarded(run, "blob-sign-and-publish", () => commitBlob(run, plan, signHexDigest(plan.plan.digest, getSigningKey(run.workspace, "artifact-seal"))));
    }
    finish(run);
    if (run.result.manifestSha256 && run.result.segmentId) {
      run.phase = "workspace-log"; logGate(run); run.progress.attemptedStages.push("workspace-log");
      const entry = appendTransparencyEntry(logInput(run));
      run.result.transparencyHash = run.progress.transparencyHash = entry.hash; run.progress.completedStages.push("workspace-log");
      run.phase = "workspace-merkle-rebuild"; run.progress.attemptedStages.push("workspace-merkle-rebuild");
      rebuildTransparencyMerkle(run.workspace);
      run.progress.completedStages.push("workspace-merkle-rebuild");
    }
    return run.result;
  });
}
async function runAsync(input: Parameters, caller?: () => void): Promise<RetentionRunResult> {
  const run = prepareRun({ ...input }, true, caller);
  try {
    if (run.dryRun) return dry(run);
    const segment = segmentPlan(run);
    if (segment) {
      // Only this path later logs. Capture original TR/Merkle authority before its first await or retention effect.
      run.logAuthority = captureWorkspaceLogAuthority(run.workspace);
      run.phase = "archive-sign";
      const beforeSign = () => segmentSigningGate(run, segment); beforeSign();
      const signed = await signWithPurposeKey(run.workspace, "artifact-seal", Buffer.from(segment.plan.digest, "hex"), { beforeSign });
      segmentSigningGate(run, segment, signed);
      run.phase = "archive-publish"; commitSegment(run, segment, signed.signature.toString("base64"), signed);
    }
    run.phase = "payload-prune"; prunePayloads(run); run.phase = "guard-prune"; guardRows(run);
    for (const blobId of blobIds(run)) {
      run.phase = "blob-prepare"; const plan = blobPlan(run, blobId);
      if (plan === null) continue;
      run.phase = "blob-sign";
      const beforeSign = () => blobSigningGate(run, plan); beforeSign();
      const signed = await signWithPurposeKey(run.workspace, "artifact-seal", Buffer.from(plan.plan.digest, "hex"), { beforeSign });
      blobSigningGate(run, plan, signed);
      run.phase = "blob-publish"; commitBlob(run, plan, signed.signature.toString("base64"), signed);
    }
    finish(run);
    if (run.result.manifestSha256 && run.result.segmentId) {
      run.phase = "workspace-log"; logGate(run); run.progress.attemptedStages.push("workspace-log");
      const attempt = await appendTransparencyEntryAttemptAsync(logInput(run), { beforeCommit: () => logGate(run), beforeMember: () => logGate(run) });
      run.result.transparencyHash = run.progress.transparencyHash = attempt.entry.hash; run.progress.completedStages.push("workspace-log");
      logGate(run); attempt.assertCurrent();
    } else logGate(run);
    return run.result;
  } catch (error) {
    if (run.phase === "workspace-log" && error instanceof TransparencyMerkleLagError)
      run.result.transparencyHash = run.progress.transparencyHash = error.entryHash;
    if (error instanceof RetentionPartialError) throw error;
    if (run.progress.attemptedStages.length > 0 || run.progress.publishedPaths.length > 0 || run.progress.removedBlobIds.length > 0)
      throw new RetentionPartialError(run.phase, run.progress, error);
    throw error;
  }
}
export function runRetentionAsync(input: Parameters): Promise<RetentionRunResult> { return runAsync(input); }
/** Internal Studio handoff only; the callback adds refusal and cannot replace original run gates. */
export function runRetentionForStudioAsync(input: Parameters, beforePublish: () => void): Promise<RetentionRunResult> { return runAsync(input, beforePublish); }
