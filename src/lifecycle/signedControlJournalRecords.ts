import { homedir } from "node:os";
import { readFileSync, readdirSync, realpathSync, unlinkSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { z } from "zod";
import { ensureSigningKeys } from "../crypto/keys.js";
import { signDigestWithPolicy } from "../crypto/signing/signer.js";
import { signatureEnvelopeSchema, verifySignatureEnvelope, type VerifiableSignatureEnvelope } from "../crypto/signing/signatureEnvelope.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { isWithin } from "../utils/pathSafety.js";

export const SIGNED_CONTROL_JOURNAL_SCHEMA_VERSION = "2026-07-10" as const;

const controlKindSchema = z.enum(["guardrail-control", "runtime-firewall-policy", "compiled-control-plan", "legal-hold-head", "kill-switch"]);
export type SignedControlKind = z.infer<typeof controlKindSchema>;

const embeddedSignatureSchema = z.object({
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("auditor"),
  envelope: z.unknown().optional()
}).strict();

export const journalEntrySchema = z.object({
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

export const checkpointSchema = z.object({
  schemaVersion: z.literal(SIGNED_CONTROL_JOURNAL_SCHEMA_VERSION),
  controlKind: controlKindSchema,
  workspacePathSha256: z.string().length(64),
  revision: z.number().int().positive(),
  entrySha256: z.string().length(64),
  previousCheckpointSha256: z.string().length(64).nullable(),
  updatedAt: z.iso.datetime(),
  signature: embeddedSignatureSchema
}).strict();

export const trustPinSchema = z.object({
  schemaVersion: z.literal(SIGNED_CONTROL_JOURNAL_SCHEMA_VERSION),
  controlKind: controlKindSchema,
  workspacePathSha256: z.string().length(64),
  signerFingerprint: z.string().length(64),
  signerType: z.enum(["VAULT", "NOTARY"]),
  genesisCheckpointSha256: z.string().length(64),
  createdAt: z.iso.datetime()
}).strict();

export type JournalEntryRecord = z.infer<typeof journalEntrySchema>;
export type CheckpointRecord = z.infer<typeof checkpointSchema>;
export type TrustPinRecord = z.infer<typeof trustPinSchema>;

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

export function resolvedWorkspacePath(workspace: string): string {
  const absolute = resolve(workspace);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}

export function physicalPath(path: string): string {
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

export function workspacePathSha256(workspace: string): string {
  return sha256Hex(resolvedWorkspacePath(workspace));
}

function controlCheckpointRoot(): string {
  const configured = process.env.AMC_CONTROL_CHECKPOINT_DIR?.trim();
  return physicalPath(configured || join(homedir(), ".amc", "control-checkpoints"));
}

export function controlCheckpointDir(workspace: string, controlKind: SignedControlKind): string {
  const root = controlCheckpointRoot();
  const governed = resolvedWorkspacePath(workspace);
  // Segment-aware: a prefix test accepted `<workspace>/..cache` as outside (P0-27 F3).
  if (isWithin(governed, root)) {
    throw new SignedControlJournalError(
      `Control checkpoint root ${root} must be outside the governed workspace ${governed}. Set AMC_CONTROL_CHECKPOINT_DIR to a directory outside the workspace.`
    );
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

export function numberedJsonRevisions(dir: string): number[] {
  if (!pathExists(dir)) return [];
  return readdirSync(dir)
    .map((entry) => (/^(\d{12})\.json$/.test(entry) ? Number(entry.slice(0, 12)) : null))
    .filter((revision): revision is number => revision !== null)
    .sort((left, right) => left - right);
}

export function assertContiguous(revisions: number[], label: string): void {
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

export function signedControlDigestBytes(domain: "ENTRY" | "CHECKPOINT", controlKind: SignedControlKind, unsigned: unknown): Buffer {
  const contentSha256 = sha256Hex(canonicalize(unsigned));
  return Buffer.from(`AMC_SIGNED_CONTROL_${domain}_V1\0${controlKind}\0${contentSha256}`, "utf8");
}

export function signedDigest(domain: "ENTRY" | "CHECKPOINT", controlKind: SignedControlKind, unsigned: unknown): string {
  return sha256Hex(signedControlDigestBytes(domain, controlKind, unsigned));
}

export function embeddedSignature(workspace: string, digestHex: string): JournalEntryRecord["signature"] {
  ensureSigningKeys(workspace);
  const signed = signDigestWithPolicy({ workspace, kind: "OPS_POLICY", digestHex });
  return {
    signature: signed.signature,
    signedTs: signed.signedTs,
    signer: "auditor",
    envelope: signed.envelope
  };
}

export function embeddedEnvelope(
  controlKind: SignedControlKind,
  signature: JournalEntryRecord["signature"]
): VerifiableSignatureEnvelope {
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

export function readTrustPin(workspace: string, controlKind: SignedControlKind): TrustPinRecord | null {
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

export function parseAndVerifyEntry(input: {
  controlKind: SignedControlKind;
  path: string;
  revision: number;
  previousEntrySha256: string | null;
  expectedSignerFingerprint: string;
  expectedSignerType: TrustPinRecord["signerType"];
  bytes?: Uint8Array;
}): { record: JournalEntryRecord; bytes: Buffer; sha256: string } {
  let entry: JournalEntryRecord, bytes: Buffer;
  try {
    bytes = input.bytes === undefined ? readFileSync(input.path) : Buffer.from(input.bytes);
    entry = journalEntrySchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
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
  return { record: entry, bytes, sha256: sha256Hex(bytes) };
}

export function parseAndVerifyCheckpoint(input: {
  workspace: string;
  controlKind: SignedControlKind;
  path: string;
  revision: number;
  previousCheckpointSha256: string | null;
  expectedSignerFingerprint: string;
  expectedSignerType: TrustPinRecord["signerType"];
  bytes?: Uint8Array;
}): { record: CheckpointRecord; bytes: Buffer; sha256: string } {
  let checkpoint: CheckpointRecord, bytes: Buffer;
  try {
    bytes = input.bytes === undefined ? readFileSync(input.path) : Buffer.from(input.bytes);
    checkpoint = checkpointSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
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
  return { record: checkpoint, bytes, sha256: sha256Hex(bytes) };
}


/** Internal fixed-record publisher shared by the legacy signer and awaitable preparation. Not a root SDK API. */
export type SignedControlAppendInput<T> = {
  workspace: string; controlKind: SignedControlKind; journalDir: string;
  previous: SignedControlJournalSnapshot<T>; payload: T; metadata?: unknown;
  afterPendingCommit?: () => void; beforeCheckpointCommit?: () => void;
  afterTrustPinCommit?: () => void; afterCheckpointCommit?: () => void;
};

export function publishSignedControlRecords<T>(input: SignedControlAppendInput<T>, entry: JournalEntryRecord,
  checkpoint: CheckpointRecord, trustPin: TrustPinRecord | null): SignedControlJournalSnapshot<T> {
  const revision = entry.revision, createdAt = entry.createdAt;
  const entryEnvelope = embeddedEnvelope(input.controlKind, entry.signature);
  const checkpointEnvelope = embeddedEnvelope(input.controlKind, checkpoint.signature);
  const entryPath = signedControlJournalEntryPath(input.journalDir, revision);
  const checkpointPath = signedControlCheckpointPath(input.workspace, input.controlKind, revision);
  const pendingPath = signedControlPendingPath(input.workspace, input.controlKind);
  const entryBytes = Buffer.from(`${canonicalize(entry)}\n`, "utf8"), entrySha256 = sha256Hex(entryBytes);
  const checkpointBytes = Buffer.from(`${canonicalize(checkpoint)}\n`, "utf8"), checkpointSha256 = sha256Hex(checkpointBytes);
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
