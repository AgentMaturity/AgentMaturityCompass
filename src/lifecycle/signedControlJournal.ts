import { readFileSync, unlinkSync } from "node:fs";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  SIGNED_CONTROL_JOURNAL_SCHEMA_VERSION, SignedControlJournalError, checkpointSchema, journalEntrySchema, trustPinSchema,
  workspacePathSha256, controlCheckpointDir, signedControlJournalEntryPath, signedControlCheckpointPath,
  signedControlTrustPinPath, signedControlPendingPath, numberedJsonRevisions, assertContiguous,
  signedDigest, embeddedSignature, embeddedEnvelope, readTrustPin, parseAndVerifyEntry, parseAndVerifyCheckpoint,
  publishSignedControlRecords, type SignedControlAppendInput, type SignedControlKind,
  type SignedControlJournalSnapshot, type JournalEntryRecord, type CheckpointRecord
} from "./signedControlJournalRecords.js";
export { SIGNED_CONTROL_JOURNAL_SCHEMA_VERSION, SignedControlJournalError, controlCheckpointDir,
  signedControlTrustPinPath, signedControlPendingPath } from "./signedControlJournalRecords.js";
export type { SignedControlKind, SignedControlJournalSnapshot } from "./signedControlJournalRecords.js";

function readSignedControlJournalCore<T>(input: {
  workspace: string;
  controlKind: SignedControlKind;
  journalDir: string;
  parsePayload: (payload: unknown) => T;
  allowUncommittedTail?: boolean;
}): SignedControlJournalSnapshot<T> {
  const checkpointDir = controlCheckpointDir(input.workspace, input.controlKind);
  const checkpointRevisions = numberedJsonRevisions(checkpointDir);
  const localRevisionCandidates = numberedJsonRevisions(input.journalDir);
  const trustPin = readTrustPin(input.workspace, input.controlKind);
  if (checkpointRevisions.length === 0) {
    if (trustPin) {
      throw new SignedControlJournalError(`Signed ${input.controlKind} checkpoint chain is missing behind its trust pin.`);
    }
    if (localRevisionCandidates.length > 0 && !input.allowUncommittedTail) {
      throw new SignedControlJournalError(`Signed ${input.controlKind} uncommitted journal revision ${localRevisionCandidates[0]} exists without a checkpoint.`);
    }
    return {
      integrity: "uninitialized",
      controlKind: input.controlKind,
      revision: 0,
      payload: null,
      entryPath: null,
      entrySha256: null,
      checkpointPath: null,
      checkpointSha256: null,
      metadata: null,
      reason: "No signed host-local checkpoint has been committed."
    };
  }
  if (!trustPin) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} checkpoint trust pin is missing.`);
  }
  assertContiguous(checkpointRevisions, `Signed ${input.controlKind} checkpoint chain`);

  let previousCheckpointSha256: string | null = null;
  let latestCheckpoint: CheckpointRecord | null = null;
  let latestCheckpointPath: string | null = null;
  for (const revision of checkpointRevisions) {
    const path = signedControlCheckpointPath(input.workspace, input.controlKind, revision);
    const verified = parseAndVerifyCheckpoint({
      workspace: input.workspace,
      controlKind: input.controlKind,
      path,
      revision,
      previousCheckpointSha256,
      expectedSignerFingerprint: trustPin.signerFingerprint,
      expectedSignerType: trustPin.signerType
    });
    latestCheckpoint = verified.record;
    const checkpointSha256 = verified.sha256;
    if (revision === 1 && checkpointSha256 !== trustPin.genesisCheckpointSha256) {
      throw new SignedControlJournalError(`Signed ${input.controlKind} genesis checkpoint does not match its trust pin.`);
    }
    previousCheckpointSha256 = checkpointSha256;
    latestCheckpointPath = path;
  }

  const committedRevision = latestCheckpoint!.revision;
  const uncommittedRevisions = localRevisionCandidates.filter((revision) => revision > committedRevision);
  if (uncommittedRevisions.length > 0 && !input.allowUncommittedTail) {
    throw new SignedControlJournalError(
      `Signed ${input.controlKind} uncommitted journal revision ${uncommittedRevisions[0]} exists beyond checkpoint revision ${committedRevision}.`
    );
  }
  const localRevisions = localRevisionCandidates.filter((revision) => revision <= committedRevision);
  assertContiguous(localRevisions, `Signed ${input.controlKind} journal`);
  if (localRevisions.length !== committedRevision) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} journal was truncated behind checkpoint revision ${committedRevision}.`);
  }

  let previousEntrySha256: string | null = null;
  let latestEntry: JournalEntryRecord | null = null;
  let latestEntryPath: string | null = null;
  for (const revision of localRevisions) {
    const path = signedControlJournalEntryPath(input.journalDir, revision);
    const verified = parseAndVerifyEntry({
      controlKind: input.controlKind,
      path,
      revision,
      previousEntrySha256,
      expectedSignerFingerprint: trustPin.signerFingerprint,
      expectedSignerType: trustPin.signerType
    });
    latestEntry = verified.record;
    previousEntrySha256 = verified.sha256;
    latestEntryPath = path;
  }
  if (previousEntrySha256 !== latestCheckpoint!.entrySha256) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} journal does not match its host-local checkpoint.`);
  }

  let payload: T;
  try {
    payload = input.parsePayload(latestEntry!.payload);
  } catch (error) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} payload is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    integrity: "trusted",
    controlKind: input.controlKind,
    revision: committedRevision,
    payload,
    entryPath: latestEntryPath,
    entrySha256: previousEntrySha256,
    checkpointPath: latestCheckpointPath,
    checkpointSha256: previousCheckpointSha256,
    metadata: latestEntry!.metadata ?? null,
    reason: "Signed journal, host-local checkpoint, and external signer pin are valid."
  };
}

function uninitializedSnapshot<T>(controlKind: SignedControlKind): SignedControlJournalSnapshot<T> {
  return {
    integrity: "uninitialized",
    controlKind,
    revision: 0,
    payload: null,
    entryPath: null,
    entrySha256: null,
    checkpointPath: null,
    checkpointSha256: null,
    metadata: null,
    reason: "No signed host-local checkpoint has been committed."
  };
}

function recoverPendingPublication<T>(input: {
  workspace: string;
  controlKind: SignedControlKind;
  journalDir: string;
  parsePayload: (payload: unknown) => T;
}): void {
  const pendingPath = signedControlPendingPath(input.workspace, input.controlKind);
  if (!pathExists(pendingPath)) return;

  let pending: CheckpointRecord, pendingBytes: Buffer;
  try {
    pendingBytes = readFileSync(pendingPath);
    pending = checkpointSchema.parse(JSON.parse(pendingBytes.toString("utf8")) as unknown);
  } catch (error) {
    throw new SignedControlJournalError(
      `Signed ${input.controlKind} pending publication is malformed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (pending.controlKind !== input.controlKind || pending.workspacePathSha256 !== workspacePathSha256(input.workspace)) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} pending publication identity mismatch.`);
  }

  const checkpointPath = signedControlCheckpointPath(input.workspace, input.controlKind, pending.revision);
  if (pathExists(checkpointPath)) {
    const committed = readSignedControlJournalCore(input);
    if (committed.revision !== pending.revision || committed.checkpointSha256 !== sha256Hex(pendingBytes)) {
      throw new SignedControlJournalError(`Signed ${input.controlKind} pending publication does not match its committed checkpoint.`);
    }
    unlinkSync(pendingPath);
    return;
  }

  const trustPin = readTrustPin(input.workspace, input.controlKind);
  let previous: SignedControlJournalSnapshot<T>;
  if (pending.revision === 1) {
    const checkpointRevisions = numberedJsonRevisions(controlCheckpointDir(input.workspace, input.controlKind));
    if (checkpointRevisions.length !== 0) {
      throw new SignedControlJournalError(`Signed ${input.controlKind} pending genesis conflicts with existing checkpoints.`);
    }
    previous = uninitializedSnapshot(input.controlKind);
  } else {
    if (!trustPin) {
      throw new SignedControlJournalError(`Signed ${input.controlKind} pending publication lacks its pinned genesis signer.`);
    }
    previous = readSignedControlJournalCore({ ...input, allowUncommittedTail: true });
  }
  if (pending.revision !== previous.revision + 1) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} pending publication revision is not the next committed revision.`);
  }

  const pendingEnvelope = embeddedEnvelope(input.controlKind, pending.signature);
  const expectedSignerFingerprint = trustPin?.signerFingerprint ?? pendingEnvelope.fingerprint;
  const expectedSignerType = trustPin?.signerType ?? pendingEnvelope.signer.type;
  parseAndVerifyCheckpoint({
    workspace: input.workspace,
    controlKind: input.controlKind,
    path: pendingPath,
    bytes: pendingBytes,
    revision: pending.revision,
    previousCheckpointSha256: previous.checkpointSha256,
    expectedSignerFingerprint,
    expectedSignerType
  });

  const entryPath = signedControlJournalEntryPath(input.journalDir, pending.revision);
  if (!pathExists(entryPath)) {
    if (pending.revision === 1 && trustPin) {
      throw new SignedControlJournalError(`Signed ${input.controlKind} genesis trust pin exists without its pending journal entry.`);
    }
    const localRevisions = numberedJsonRevisions(input.journalDir);
    if (localRevisions.some((revision) => revision > previous.revision)) {
      throw new SignedControlJournalError(`Signed ${input.controlKind} pending publication is missing its planned journal entry.`);
    }
    unlinkSync(pendingPath);
    return;
  }

  const localRevisions = numberedJsonRevisions(input.journalDir);
  if (localRevisions.length !== pending.revision || localRevisions.at(-1) !== pending.revision) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} pending publication has an unexpected local journal tail.`);
  }
  const verifiedEntry = parseAndVerifyEntry({
    controlKind: input.controlKind,
    path: entryPath,
    revision: pending.revision,
    previousEntrySha256: previous.entrySha256,
    expectedSignerFingerprint,
    expectedSignerType
  });
  const entrySha256 = verifiedEntry.sha256;
  if (entrySha256 !== pending.entrySha256) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} pending publication entry digest mismatch.`);
  }

  const checkpointSha256 = sha256Hex(pendingBytes);
  if (pending.revision === 1) {
    const pin = trustPinSchema.parse({
      schemaVersion: SIGNED_CONTROL_JOURNAL_SCHEMA_VERSION,
      controlKind: input.controlKind,
      workspacePathSha256: workspacePathSha256(input.workspace),
      signerFingerprint: pendingEnvelope.fingerprint,
      signerType: pendingEnvelope.signer.type,
      genesisCheckpointSha256: checkpointSha256,
      createdAt: pending.updatedAt
    });
    if (trustPin) {
      if (canonicalize(trustPin) !== canonicalize(pin)) {
        throw new SignedControlJournalError(`Signed ${input.controlKind} pending genesis does not match its trust pin.`);
      }
    } else {
      writeFileAtomic(signedControlTrustPinPath(input.workspace, input.controlKind), `${canonicalize(pin)}\n`, 0o600);
    }
  }

  writeFileAtomic(checkpointPath, pendingBytes, 0o600);
  parseAndVerifyCheckpoint({
    workspace: input.workspace,
    controlKind: input.controlKind,
    path: checkpointPath,
    revision: pending.revision,
    previousCheckpointSha256: previous.checkpointSha256,
    expectedSignerFingerprint,
    expectedSignerType
  });
  unlinkSync(pendingPath);
}

export function readSignedControlJournal<T>(input: {
  workspace: string;
  controlKind: SignedControlKind;
  journalDir: string;
  parsePayload: (payload: unknown) => T;
  recoverPendingPublication?: boolean;
}): SignedControlJournalSnapshot<T> {
  const pendingPath = signedControlPendingPath(input.workspace, input.controlKind);
  if (pathExists(pendingPath)) {
    if (!input.recoverPendingPublication) {
      throw new SignedControlJournalError(
        `Signed ${input.controlKind} publication is pending authenticated recovery in the host-local checkpoint store.`
      );
    }
    recoverPendingPublication(input);
  }
  return readSignedControlJournalCore(input);
}

export function appendSignedControlJournal<T>(input: SignedControlAppendInput<T>): SignedControlJournalSnapshot<T> {
  if (input.previous.controlKind !== input.controlKind) {
    throw new SignedControlJournalError("Signed control journal snapshot kind mismatch.");
  }
  const revision = input.previous.revision + 1;
  const createdAt = new Date().toISOString();
  const unsignedEntry = {
    schemaVersion: SIGNED_CONTROL_JOURNAL_SCHEMA_VERSION,
    controlKind: input.controlKind,
    revision,
    payload: input.payload,
    payloadSha256: sha256Hex(canonicalize(input.payload)),
    previousEntrySha256: input.previous.entrySha256,
    createdAt,
    ...(input.metadata === undefined ? {} : { metadata: input.metadata })
  } as const;
  const entry = journalEntrySchema.parse({
    ...unsignedEntry,
    signature: embeddedSignature(input.workspace, signedDigest("ENTRY", input.controlKind, unsignedEntry))
  });
  const entryEnvelope = embeddedEnvelope(input.controlKind, entry.signature);
  const trustPin = readTrustPin(input.workspace, input.controlKind);
  if (revision > 1 && !trustPin) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} checkpoint trust pin is missing.`);
  }
  if (trustPin && entryEnvelope.fingerprint !== trustPin.signerFingerprint) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} signer differs from its pinned genesis signer.`);
  }
  const entryPath = signedControlJournalEntryPath(input.journalDir, revision);
  if (pathExists(entryPath)) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} journal revision ${revision} already exists.`);
  }
  const entryBytes = Buffer.from(`${canonicalize(entry)}\n`, "utf8");
  const entrySha256 = sha256Hex(entryBytes);

  const unsignedCheckpoint = {
    schemaVersion: SIGNED_CONTROL_JOURNAL_SCHEMA_VERSION,
    controlKind: input.controlKind,
    workspacePathSha256: workspacePathSha256(input.workspace),
    revision,
    entrySha256,
    previousCheckpointSha256: input.previous.checkpointSha256,
    updatedAt: createdAt
  } as const;
  const checkpoint = checkpointSchema.parse({
    ...unsignedCheckpoint,
    signature: embeddedSignature(input.workspace, signedDigest("CHECKPOINT", input.controlKind, unsignedCheckpoint))
  });
  const checkpointEnvelope = embeddedEnvelope(input.controlKind, checkpoint.signature);
  if (checkpointEnvelope.fingerprint !== entryEnvelope.fingerprint) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} entry and checkpoint signer mismatch.`);
  }
  const checkpointPath = signedControlCheckpointPath(input.workspace, input.controlKind, revision);
  if (pathExists(checkpointPath)) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} checkpoint revision ${revision} already exists.`);
  }
  const pendingPath = signedControlPendingPath(input.workspace, input.controlKind);
  if (pathExists(pendingPath)) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} has an unresolved pending publication.`);
  }
  return publishSignedControlRecords(input, entry, checkpoint, trustPin);
}
