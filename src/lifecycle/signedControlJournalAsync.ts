import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { prepareFileSignatureWithAuditor } from "../org/orgSigner.js";
import { pathExists } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { readSignedControlJournal } from "./signedControlJournal.js";
import {
  SIGNED_CONTROL_JOURNAL_SCHEMA_VERSION, SignedControlJournalError, journalEntrySchema, checkpointSchema,
  workspacePathSha256, resolvedWorkspacePath, physicalPath, controlCheckpointDir, readTrustPin,
  signedControlPendingPath, embeddedEnvelope,
  publishSignedControlRecords, signedControlDigestBytes, type SignedControlAppendInput, type SignedControlJournalSnapshot
} from "./signedControlJournalRecords.js";

export class ControlMutationAuthorityError extends Error {
  readonly code = "AUTHORIZATION" as const;
  constructor() { super("Current control mutation authority refused."); this.name = "ControlMutationAuthorityError"; }
}

/** The captured predecessor moved before publication; no record was written, so a fresh attempt is safe. */
class SignedControlJournalConflictError extends SignedControlJournalError {}

const CONFLICT_ATTEMPTS = 8; // ponytail: fixed bound; contention beyond 8 concurrent writers still refuses.
/** Re-run a whole capture → prepare → publish attempt from the fresh head when only its predecessor moved. */
export async function retryOnControlJournalConflict<T>(attempt: () => Promise<T>): Promise<T> {
  for (let tries = 1; ; tries++) {
    try { return await attempt(); } catch (error) {
      if (!(error instanceof SignedControlJournalConflictError) || tries >= CONFLICT_ATTEMPTS) throw error;
    }
  }
}

type OwnedKind = "guardrail-control" | "runtime-firewall-policy";
type Phase = "pending" | "entry" | "genesis-pin-or-checkpoint" | "checkpoint" | "pending-cleanup";

class ControlJournalPublicationError extends Error {
  readonly code = "PUBLICATION" as const;
  constructor(readonly controlKind: OwnedKind, readonly revision: number, readonly phase: Phase,
    readonly pendingPath: string, options: { cause: unknown }) {
    super("Signed " + controlKind + " revision " + revision + " publication failed during " + phase
      + "; authenticated pending recovery may be required.", options);
    this.name = "ControlJournalPublicationError";
  }
}

function inventory(directory: string, checkpoints: boolean): unknown {
  const names = pathExists(directory) ? readdirSync(directory).filter(name =>
    /^\d{12}\.json$/.test(name) || (checkpoints && (name === "trust-pin.json" || name === "pending.json"))).sort() : [];
  return { physical: physicalPath(directory), files: names.map(name => {
    const path = join(directory, name);
    try {
      const bytes = readFileSync(path);
      return { name, physical: physicalPath(path), mode: statSync(path).mode & 0o777, sha256: sha256Hex(bytes) };
    } catch (error) {
      // A listed file vanished: a concurrent publication (e.g. its pending.json cleanup) moved the predecessor.
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new SignedControlJournalConflictError("Signed control journal changed during inventory.");
      throw error;
    }
  }) };
}

function prefix(workspace: string, kind: OwnedKind, journalDir: string): string {
  return canonicalize({ workspace: resolvedWorkspacePath(workspace), checkpointDir: controlCheckpointDir(workspace, kind),
    journal: inventory(journalDir, false), checkpoints: inventory(controlCheckpointDir(workspace, kind), true) });
}

/** Capture under the actual family lock; call prepare only after releasing it. No root SDK export. */
export function captureSignedControlJournalAppend<T>(input: SignedControlAppendInput<T> & {
  controlKind: OwnedKind; parsePayload(payload: unknown): T;
}) {
  const fixed = { ...input, workspace: resolve(input.workspace), journalDir: resolve(input.journalDir),
    previous: JSON.parse(JSON.stringify(input.previous)) as SignedControlJournalSnapshot<T>,
    payload: JSON.parse(canonicalize(input.payload)) as T,
    ...(input.metadata === undefined ? {} : { metadata: JSON.parse(canonicalize(input.metadata)) as unknown }) };
  if (fixed.previous.controlKind !== fixed.controlKind) throw new SignedControlJournalError("Signed control journal snapshot kind mismatch.");
  const original = prefix(fixed.workspace, fixed.controlKind, fixed.journalDir);
  const verified = readSignedControlJournal({ ...fixed, recoverPendingPublication: false });
  if (verified.revision !== fixed.previous.revision || verified.entrySha256 !== fixed.previous.entrySha256
    || verified.checkpointSha256 !== fixed.previous.checkpointSha256
    || prefix(fixed.workspace, fixed.controlKind, fixed.journalDir) !== original) {
    throw new SignedControlJournalConflictError("Signed control journal changed before preparation.");
  }
  const revision = verified.revision + 1, createdAt = new Date().toISOString();
  const unsignedEntry = { schemaVersion: SIGNED_CONTROL_JOURNAL_SCHEMA_VERSION, controlKind: fixed.controlKind,
    revision, payload: fixed.payload, payloadSha256: sha256Hex(canonicalize(fixed.payload)),
    previousEntrySha256: verified.entrySha256, createdAt,
    ...(fixed.metadata === undefined ? {} : { metadata: fixed.metadata }) };
  const embedded = (signatureBytes: string) => {
    const value = JSON.parse(signatureBytes) as { signature: string; signedTs: number; envelope?: unknown };
    return { signature: value.signature, signedTs: value.signedTs, signer: "auditor" as const, envelope: value.envelope };
  };
  return Object.freeze({ async prepare(beforeSign?: () => void) {
    const assertBeforeSign = () => {
      beforeSign?.();
      if (prefix(fixed.workspace, fixed.controlKind, fixed.journalDir) !== original)
        throw new SignedControlJournalConflictError("Signed " + fixed.controlKind + " journal changed before signing.");
    };
    const first = await prepareFileSignatureWithAuditor(fixed.workspace, fixed.journalDir,
      signedControlDigestBytes("ENTRY", fixed.controlKind, unsignedEntry), "OPS_POLICY", assertBeforeSign);
    const entry = journalEntrySchema.parse({ ...unsignedEntry, signature: embedded(first.signatureBytes) });
    const firstEnvelope = embeddedEnvelope(fixed.controlKind, entry.signature), pin = readTrustPin(fixed.workspace, fixed.controlKind);
    if ((revision > 1 && pin === null) || (pin !== null
      && (pin.signerFingerprint !== firstEnvelope.fingerprint || pin.signerType !== firstEnvelope.signer.type))) {
      throw new SignedControlJournalError("Signed " + fixed.controlKind + " signer differs from its pinned genesis signer.");
    }
    const unsignedCheckpoint = { schemaVersion: SIGNED_CONTROL_JOURNAL_SCHEMA_VERSION, controlKind: fixed.controlKind,
      workspacePathSha256: workspacePathSha256(fixed.workspace), revision,
      entrySha256: sha256Hex(canonicalize(entry) + "\n"), previousCheckpointSha256: verified.checkpointSha256, updatedAt: createdAt };
    const assertBeforeSecondSign = () => { assertBeforeSign(); first.assertCurrent(); };
    assertBeforeSecondSign(); // Retain the real first purpose before the second preparation can capture authority.
    const second = await prepareFileSignatureWithAuditor(fixed.workspace, fixed.journalDir,
      signedControlDigestBytes("CHECKPOINT", fixed.controlKind, unsignedCheckpoint), "OPS_POLICY", assertBeforeSecondSign);
    const checkpoint = checkpointSchema.parse({ ...unsignedCheckpoint, signature: embedded(second.signatureBytes) });
    const secondEnvelope = embeddedEnvelope(fixed.controlKind, checkpoint.signature);
    if (secondEnvelope.fingerprint !== firstEnvelope.fingerprint || secondEnvelope.signer.type !== firstEnvelope.signer.type) {
      throw new SignedControlJournalError("Signed " + fixed.controlKind + " entry and checkpoint signer mismatch.");
    }
    return Object.freeze({ publish(): SignedControlJournalSnapshot<T> {
      beforeSign?.();
      first.assertCurrent();
      second.assertCurrent();
      if (prefix(fixed.workspace, fixed.controlKind, fixed.journalDir) !== original) {
        throw new SignedControlJournalConflictError("Signed " + fixed.controlKind + " journal publication predecessor changed.");
      }
      let phase: Phase = "pending";
      try {
        return publishSignedControlRecords({ ...fixed,
          afterPendingCommit() { phase = "entry"; fixed.afterPendingCommit?.(); },
          beforeCheckpointCommit() { phase = "genesis-pin-or-checkpoint"; fixed.beforeCheckpointCommit?.(); },
          afterTrustPinCommit() { phase = "checkpoint"; fixed.afterTrustPinCommit?.(); },
          afterCheckpointCommit() { phase = "pending-cleanup"; fixed.afterCheckpointCommit?.(); }
        }, entry, checkpoint, pin);
      } catch (cause) {
        throw new ControlJournalPublicationError(fixed.controlKind, revision, phase,
          signedControlPendingPath(fixed.workspace, fixed.controlKind), { cause });
      }
    } });
  } });
}
