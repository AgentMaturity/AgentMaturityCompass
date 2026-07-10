import { homedir } from "node:os";
import { readFileSync, readdirSync, realpathSync, unlinkSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { ensureSigningKeys } from "../crypto/keys.js";
import { signDigestWithPolicy } from "../crypto/signing/signer.js";
import { signatureEnvelopeSchema, verifySignatureEnvelope } from "../crypto/signing/signatureEnvelope.js";
import type { SignatureEnvelope } from "../crypto/signing/signerTypes.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export const SIGNED_CONTROL_JOURNAL_SCHEMA_VERSION = "2026-07-10" as const;

const controlKindSchema = z.enum(["guardrail-control", "runtime-firewall-policy"]);
export type SignedControlKind = z.infer<typeof controlKindSchema>;

const embeddedSignatureSchema = z.object({
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("auditor"),
  envelope: z.unknown().optional()
}).strict();

const journalEntrySchema = z.object({
  schemaVersion: z.literal(SIGNED_CONTROL_JOURNAL_SCHEMA_VERSION),
  controlKind: controlKindSchema,
  revision: z.number().int().positive(),
  payload: z.unknown(),
  payloadSha256: z.string().length(64),
  previousEntrySha256: z.string().length(64).nullable(),
  createdAt: z.iso.datetime(),
  metadata: z.unknown().optional(),
  signature: embeddedSignatureSchema
}).strict();

const checkpointSchema = z.object({
  schemaVersion: z.literal(SIGNED_CONTROL_JOURNAL_SCHEMA_VERSION),
  controlKind: controlKindSchema,
  workspacePathSha256: z.string().length(64),
  revision: z.number().int().positive(),
  entrySha256: z.string().length(64),
  previousCheckpointSha256: z.string().length(64).nullable(),
  updatedAt: z.iso.datetime(),
  signature: embeddedSignatureSchema
}).strict();

const trustPinSchema = z.object({
  schemaVersion: z.literal(SIGNED_CONTROL_JOURNAL_SCHEMA_VERSION),
  controlKind: controlKindSchema,
  workspacePathSha256: z.string().length(64),
  signerFingerprint: z.string().length(64),
  signerType: z.enum(["VAULT", "NOTARY"]),
  genesisCheckpointSha256: z.string().length(64),
  createdAt: z.iso.datetime()
}).strict();

type JournalEntryRecord = z.infer<typeof journalEntrySchema>;
type CheckpointRecord = z.infer<typeof checkpointSchema>;
type TrustPinRecord = z.infer<typeof trustPinSchema>;

export interface SignedControlJournalSnapshot<T> {
  integrity: "uninitialized" | "trusted";
  controlKind: SignedControlKind;
  revision: number;
  payload: T | null;
  entryPath: string | null;
  entrySha256: string | null;
  checkpointPath: string | null;
  checkpointSha256: string | null;
  metadata: unknown | null;
  reason: string;
}

export class SignedControlJournalError extends Error {
  readonly code = "INTEGRITY" as const;

  constructor(message: string) {
    super(message);
    this.name = "SignedControlJournalError";
  }
}

function resolvedWorkspacePath(workspace: string): string {
  const absolute = resolve(workspace);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}

function physicalPath(path: string): string {
  let cursor = resolve(path);
  const missingSegments: string[] = [];
  while (!pathExists(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) return resolve(path);
    missingSegments.unshift(basename(cursor));
    cursor = parent;
  }
  try {
    return join(realpathSync(cursor), ...missingSegments);
  } catch {
    return resolve(path);
  }
}

function workspacePathSha256(workspace: string): string {
  return sha256Hex(resolvedWorkspacePath(workspace));
}

export function controlCheckpointRoot(): string {
  const configured = process.env.AMC_CONTROL_CHECKPOINT_DIR?.trim();
  return physicalPath(configured || join(homedir(), ".amc", "control-checkpoints"));
}

export function controlCheckpointDir(workspace: string, controlKind: SignedControlKind): string {
  const root = controlCheckpointRoot();
  const relativeToWorkspace = relative(resolvedWorkspacePath(workspace), root);
  if (relativeToWorkspace === "" || (!relativeToWorkspace.startsWith("..") && !isAbsolute(relativeToWorkspace))) {
    throw new SignedControlJournalError("Control checkpoint root must be outside the governed workspace.");
  }
  return join(root, workspacePathSha256(workspace), controlKind);
}

export function signedControlJournalEntryPath(journalDir: string, revision: number): string {
  return join(journalDir, `${String(revision).padStart(12, "0")}.json`);
}

export function signedControlCheckpointPath(workspace: string, controlKind: SignedControlKind, revision: number): string {
  return join(controlCheckpointDir(workspace, controlKind), `${String(revision).padStart(12, "0")}.json`);
}

export function signedControlTrustPinPath(workspace: string, controlKind: SignedControlKind): string {
  return join(controlCheckpointDir(workspace, controlKind), "trust-pin.json");
}

export function signedControlPendingPath(workspace: string, controlKind: SignedControlKind): string {
  return join(controlCheckpointDir(workspace, controlKind), "pending.json");
}

function numberedJsonRevisions(dir: string): number[] {
  if (!pathExists(dir)) return [];
  return readdirSync(dir)
    .map((entry) => (/^(\d{12})\.json$/.test(entry) ? Number(entry.slice(0, 12)) : null))
    .filter((revision): revision is number => revision !== null)
    .sort((left, right) => left - right);
}

function assertContiguous(revisions: number[], label: string): void {
  for (let index = 0; index < revisions.length; index += 1) {
    if (revisions[index] !== index + 1) {
      throw new SignedControlJournalError(`${label} has a missing or reordered revision.`);
    }
  }
}

function entryUnsigned(entry: JournalEntryRecord): Omit<JournalEntryRecord, "signature"> {
  const { signature: _signature, ...unsigned } = entry;
  return unsigned;
}

function checkpointUnsigned(checkpoint: CheckpointRecord): Omit<CheckpointRecord, "signature"> {
  const { signature: _signature, ...unsigned } = checkpoint;
  return unsigned;
}

function signedDigest(domain: "ENTRY" | "CHECKPOINT", controlKind: SignedControlKind, unsigned: unknown): string {
  const contentSha256 = sha256Hex(canonicalize(unsigned));
  return sha256Hex(`AMC_SIGNED_CONTROL_${domain}_V1\0${controlKind}\0${contentSha256}`);
}

function embeddedSignature(workspace: string, digestHex: string): JournalEntryRecord["signature"] {
  ensureSigningKeys(workspace);
  const signed = signDigestWithPolicy({ workspace, kind: "OPS_POLICY", digestHex });
  return {
    signature: signed.signature,
    signedTs: signed.signedTs,
    signer: "auditor",
    envelope: signed.envelope
  };
}

function embeddedEnvelope(
  controlKind: SignedControlKind,
  signature: JournalEntryRecord["signature"]
): SignatureEnvelope {
  const parsed = signatureEnvelopeSchema.safeParse(signature.envelope);
  if (!parsed.success) {
    throw new SignedControlJournalError(`Signed ${controlKind} record lacks a valid signer envelope.`);
  }
  if (parsed.data.sigB64 !== signature.signature) {
    throw new SignedControlJournalError(`Signed ${controlKind} record signature envelope mismatch.`);
  }
  if (parsed.data.signedTs !== signature.signedTs) {
    throw new SignedControlJournalError(`Signed ${controlKind} record timestamp envelope mismatch.`);
  }
  return parsed.data;
}

function verifyEmbeddedSignature(
  controlKind: SignedControlKind,
  digestHex: string,
  signature: JournalEntryRecord["signature"],
  expectedSignerFingerprint: string,
  expectedSignerType: TrustPinRecord["signerType"]
): boolean {
  const envelope = embeddedEnvelope(controlKind, signature);
  if (envelope.fingerprint !== expectedSignerFingerprint) return false;
  if (envelope.signer.type !== expectedSignerType) return false;
  if (expectedSignerType === "NOTARY" && envelope.signer.notaryFingerprint !== expectedSignerFingerprint) return false;
  const publicKeyPem = Buffer.from(envelope.pubkeyB64, "base64").toString("utf8");
  return verifySignatureEnvelope(digestHex, envelope, {
    trustedPublicKeys: [publicKeyPem],
    requireTrustedKey: true
  });
}

function readTrustPin(workspace: string, controlKind: SignedControlKind): TrustPinRecord | null {
  const path = signedControlTrustPinPath(workspace, controlKind);
  if (!pathExists(path)) return null;
  try {
    const pin = trustPinSchema.parse(JSON.parse(readUtf8(path)) as unknown);
    if (pin.controlKind !== controlKind || pin.workspacePathSha256 !== workspacePathSha256(workspace)) {
      throw new SignedControlJournalError(`Signed ${controlKind} trust pin identity mismatch.`);
    }
    return pin;
  } catch (error) {
    if (error instanceof SignedControlJournalError) throw error;
    throw new SignedControlJournalError(`Signed ${controlKind} trust pin is malformed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseAndVerifyEntry(input: {
  controlKind: SignedControlKind;
  path: string;
  revision: number;
  previousEntrySha256: string | null;
  expectedSignerFingerprint: string;
  expectedSignerType: TrustPinRecord["signerType"];
}): JournalEntryRecord {
  let entry: JournalEntryRecord;
  try {
    entry = journalEntrySchema.parse(JSON.parse(readUtf8(input.path)) as unknown);
  } catch (error) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} revision ${input.revision} is malformed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (entry.controlKind !== input.controlKind || entry.revision !== input.revision) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} revision identity mismatch.`);
  }
  if (entry.payloadSha256 !== sha256Hex(canonicalize(entry.payload))) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} revision ${input.revision} payload digest mismatch.`);
  }
  if (entry.previousEntrySha256 !== input.previousEntrySha256) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} revision ${input.revision} chain mismatch.`);
  }
  if (!verifyEmbeddedSignature(
    input.controlKind,
    signedDigest("ENTRY", input.controlKind, entryUnsigned(entry)),
    entry.signature,
    input.expectedSignerFingerprint,
    input.expectedSignerType
  )) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} revision ${input.revision} signature verification failed.`);
  }
  return entry;
}

function parseAndVerifyCheckpoint(input: {
  workspace: string;
  controlKind: SignedControlKind;
  path: string;
  revision: number;
  previousCheckpointSha256: string | null;
  expectedSignerFingerprint: string;
  expectedSignerType: TrustPinRecord["signerType"];
}): CheckpointRecord {
  let checkpoint: CheckpointRecord;
  try {
    checkpoint = checkpointSchema.parse(JSON.parse(readUtf8(input.path)) as unknown);
  } catch (error) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} checkpoint ${input.revision} is malformed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (
    checkpoint.controlKind !== input.controlKind
    || checkpoint.revision !== input.revision
    || checkpoint.workspacePathSha256 !== workspacePathSha256(input.workspace)
  ) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} checkpoint identity mismatch.`);
  }
  if (checkpoint.previousCheckpointSha256 !== input.previousCheckpointSha256) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} checkpoint ${input.revision} chain mismatch.`);
  }
  if (!verifyEmbeddedSignature(
    input.controlKind,
    signedDigest("CHECKPOINT", input.controlKind, checkpointUnsigned(checkpoint)),
    checkpoint.signature,
    input.expectedSignerFingerprint,
    input.expectedSignerType
  )) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} checkpoint ${input.revision} signature verification failed.`);
  }
  return checkpoint;
}

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
    latestCheckpoint = parseAndVerifyCheckpoint({
      workspace: input.workspace,
      controlKind: input.controlKind,
      path,
      revision,
      previousCheckpointSha256,
      expectedSignerFingerprint: trustPin.signerFingerprint,
      expectedSignerType: trustPin.signerType
    });
    const checkpointSha256 = sha256Hex(readFileSync(path));
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
    latestEntry = parseAndVerifyEntry({
      controlKind: input.controlKind,
      path,
      revision,
      previousEntrySha256,
      expectedSignerFingerprint: trustPin.signerFingerprint,
      expectedSignerType: trustPin.signerType
    });
    previousEntrySha256 = sha256Hex(readFileSync(path));
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

  let pending: CheckpointRecord;
  try {
    pending = checkpointSchema.parse(JSON.parse(readUtf8(pendingPath)) as unknown);
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
    if (committed.revision !== pending.revision || sha256Hex(readFileSync(checkpointPath)) !== sha256Hex(readFileSync(pendingPath))) {
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
  parseAndVerifyEntry({
    controlKind: input.controlKind,
    path: entryPath,
    revision: pending.revision,
    previousEntrySha256: previous.entrySha256,
    expectedSignerFingerprint,
    expectedSignerType
  });
  const entrySha256 = sha256Hex(readFileSync(entryPath));
  if (entrySha256 !== pending.entrySha256) {
    throw new SignedControlJournalError(`Signed ${input.controlKind} pending publication entry digest mismatch.`);
  }

  const checkpointSha256 = sha256Hex(readFileSync(pendingPath));
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

  writeFileAtomic(checkpointPath, readFileSync(pendingPath), 0o600);
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

export function appendSignedControlJournal<T>(input: {
  workspace: string;
  controlKind: SignedControlKind;
  journalDir: string;
  previous: SignedControlJournalSnapshot<T>;
  payload: T;
  metadata?: unknown;
  afterPendingCommit?: () => void;
  beforeCheckpointCommit?: () => void;
  afterTrustPinCommit?: () => void;
  afterCheckpointCommit?: () => void;
}): SignedControlJournalSnapshot<T> {
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
  const checkpointBytes = Buffer.from(`${canonicalize(checkpoint)}\n`, "utf8");
  const checkpointSha256 = sha256Hex(checkpointBytes);

  ensureDir(input.journalDir);
  ensureDir(controlCheckpointDir(input.workspace, input.controlKind));
  writeFileAtomic(pendingPath, checkpointBytes, 0o600);
  input.afterPendingCommit?.();
  writeFileAtomic(entryPath, entryBytes, 0o600);
  parseAndVerifyEntry({
    controlKind: input.controlKind,
    path: entryPath,
    revision,
    previousEntrySha256: input.previous.entrySha256,
    expectedSignerFingerprint: entryEnvelope.fingerprint,
    expectedSignerType: entryEnvelope.signer.type
  });

  input.beforeCheckpointCommit?.();

  if (revision === 1) {
    if (trustPin) {
      throw new SignedControlJournalError(`Signed ${input.controlKind} trust pin already exists before genesis commit.`);
    }
    const pin = trustPinSchema.parse({
      schemaVersion: SIGNED_CONTROL_JOURNAL_SCHEMA_VERSION,
      controlKind: input.controlKind,
      workspacePathSha256: workspacePathSha256(input.workspace),
      signerFingerprint: checkpointEnvelope.fingerprint,
      signerType: checkpointEnvelope.signer.type,
      genesisCheckpointSha256: checkpointSha256,
      createdAt
    });
    writeFileAtomic(signedControlTrustPinPath(input.workspace, input.controlKind), `${canonicalize(pin)}\n`, 0o600);
    input.afterTrustPinCommit?.();
  }

  writeFileAtomic(checkpointPath, checkpointBytes, 0o600);
  parseAndVerifyCheckpoint({
    workspace: input.workspace,
    controlKind: input.controlKind,
    path: checkpointPath,
    revision,
    previousCheckpointSha256: input.previous.checkpointSha256,
    expectedSignerFingerprint: checkpointEnvelope.fingerprint,
    expectedSignerType: checkpointEnvelope.signer.type
  });
  input.afterCheckpointCommit?.();
  unlinkSync(pendingPath);

  return {
    integrity: "trusted",
    controlKind: input.controlKind,
    revision,
    payload: input.payload,
    entryPath,
    entrySha256,
    checkpointPath,
    checkpointSha256,
    metadata: input.metadata ?? null,
    reason: "Signed journal revision committed to the separate host-local checkpoint store."
  };
}
