/**
 * Handoff Packet Schema
 *
 * Signed handoff packets for agent-to-agent delegation.
 * Receiving agents must verify the packet before acting.
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { constants, closeSync, fstatSync, lstatSync, openSync, readdirSync, rmSync, readFileSync } from "node:fs";
import { z } from "zod";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { getSigningKey, getPublicKeyPem, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { assertKeysetComplete, boundProviderKey, keysetDeclared } from "../keys/keyset.js";
import { getPurposeKeyHistory, readHistory } from "../keys/signingKeys.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { fleetRoot } from "./paths.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const handoffPacketSchema = z.object({
  packetId: z.string().min(1),
  fromAgentId: z.string().min(1),
  toAgentId: z.string().min(1),
  goal: z.string().min(1),
  currentState: z.string(),
  nextAction: z.string(),
  constraints: z.array(z.string()),
  knownUnknowns: z.array(z.string()),
  artifactPaths: z.array(z.string()),
  stopConditions: z.array(z.string()),
  contextHash: z.string(),
  evidenceSnapshot: z.array(z.string()),
  // Nullable, and null is the honest default. Nothing in AMC computes a trust
  // state for a handoff, and the previous default -- a zero-filled object --
  // was rendered under a `## Trust State` heading as `- Integrity Index: 0`,
  // which reads as a measured score of zero rather than as no measurement.
  // Older packets carrying the zero object still parse.
  trustState: z
    .object({
      level: z.number(),
      confidence: z.number(),
      integrityIndex: z.number(),
    })
    .nullable(),
  delegationScope: z.array(z.string()),
  ownershipTransfer: z.object({
    fromOwnerAgentId: z.string().min(1),
    toOwnerAgentId: z.string().min(1),
    scope: z.array(z.string().min(1)).default([]),
    status: z.enum(["offered", "accepted", "refused"]).default("offered"),
    transferReceiptId: z.string().min(1).nullable().default(null),
    refusalReason: z.string().min(1).nullable().default(null),
    evidenceRefs: z.array(z.string().min(1)).default([])
  }).nullable().default(null),
  dependencyStatuses: z.array(z.object({
    dependencyId: z.string().min(1),
    ownerAgentId: z.string().min(1).nullable().default(null),
    status: z.enum(["satisfied", "pending", "blocked", "refused"]),
    required: z.boolean().default(true),
    evidenceRefs: z.array(z.string().min(1)).default([]),
    refusalReason: z.string().min(1).nullable().default(null)
  })).default([]),
  refusalReasons: z.array(z.object({
    agentId: z.string().min(1),
    reason: z.string().min(1),
    refusedAt: z.string().min(1),
    evidenceRefs: z.array(z.string().min(1)).default([])
  })).default([]),
  createdTs: z.number(),
  expiryTs: z.number(),
  senderReceipt: z.object({
    role: z.literal("sender"),
    receiptId: z.string().min(1),
    packetId: z.string().min(1),
    agentId: z.string().min(1),
    createdTs: z.number(),
    payloadHash: z.string().min(1),
    signature: z.string().min(1)
  }).nullable().default(null),
  signature: z.string(),
});

export type HandoffPacket = z.infer<typeof handoffPacketSchema>;
export type HandoffDependencyStatus = HandoffPacket["dependencyStatuses"][number];
export type HandoffOwnershipTransfer = NonNullable<HandoffPacket["ownershipTransfer"]>;
export type HandoffRefusalReason = HandoffPacket["refusalReasons"][number];
export type HandoffSenderReceipt = NonNullable<HandoffPacket["senderReceipt"]>;

export const handoffReceiverReceiptSchema = z.object({
  role: z.literal("receiver"),
  receiptId: z.string().min(1),
  packetId: z.string().min(1),
  receiverAgentId: z.string().min(1),
  accepted: z.boolean(),
  ownershipAccepted: z.boolean(),
  receivedTs: z.number(),
  dependencyStatuses: handoffPacketSchema.shape.dependencyStatuses,
  unresolvedDependencies: handoffPacketSchema.shape.dependencyStatuses,
  refusalReasons: handoffPacketSchema.shape.refusalReasons,
  payloadHash: z.string().min(1),
  signature: z.string().min(1)
});

export type HandoffReceiverReceipt = z.infer<typeof handoffReceiverReceiptSchema>;

export const handoffUnresolvedDependencyLogSchema = z.object({
  packetId: z.string().min(1),
  loggedAt: z.string().min(1),
  dependencies: handoffPacketSchema.shape.dependencyStatuses,
  refusalReasons: handoffPacketSchema.shape.refusalReasons
});

export type HandoffUnresolvedDependencyLog = z.infer<typeof handoffUnresolvedDependencyLogSchema>;

export interface HandoffVerificationResult {
  valid: boolean;
  expired: boolean;
  signatureValid: boolean;
  senderReceiptValid: boolean;
  errors: string[];
  packet: HandoffPacket | null;
}

export interface HandoffContractVerificationResult {
  valid: boolean;
  packetValid: boolean;
  senderReceiptValid: boolean;
  receiverReceiptValid: boolean;
  ownershipAccepted: boolean;
  unresolvedDependencies: HandoffDependencyStatus[];
  errors: string[];
  packet: HandoffPacket | null;
  receiverReceipt: HandoffReceiverReceipt | null;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function handoffDir(workspace: string): string {
  return join(fleetRoot(workspace), "handoffs");
}

export function handoffFilePath(workspace: string, packetId: string): string {
  return join(handoffDir(workspace), `${packetId}.json`);
}

function handoffReceiptDir(workspace: string): string {
  return join(handoffDir(workspace), "receipts");
}

function handoffReceiverReceiptPath(workspace: string, packetId: string): string {
  return join(handoffReceiptDir(workspace), `${packetId}.receiver.json`);
}

function handoffUnresolvedDependencyPath(workspace: string, packetId: string): string {
  return join(handoffReceiptDir(workspace), `${packetId}.unresolved.json`);
}

function signCanonicalBody(workspace: string, body: unknown): string {
  const digest = sha256Hex(Buffer.from(canonicalize(body), "utf8"));
  try {
    return signHexDigest(digest, getSigningKey(workspace, "artifact-seal"));
  } catch {
    return "unsigned";
  }
}

function verifyCanonicalBodySignature(workspace: string, body: unknown, signature: string): boolean {
  if (signature === "unsigned") return false;
  const digest = sha256Hex(Buffer.from(canonicalize(body), "utf8"));
  try {
    assertKeysetComplete(workspace);
    const keys = getPurposeKeyHistory(workspace, "artifact-seal");
    if (keysetDeclared(workspace) && boundProviderKey(workspace, "artifact-seal") === null) {
      const history = readHistory(workspace, "auditor", getPublicKeyPem(workspace, "auditor"));
      keys.push(...(history?.entries.filter(entry => entry.source === "imported").map(entry => entry.publicKeyPem) ?? []));
    }
    return verifyHexDigestAny(digest, signature, keys);
  } catch {
    return false;
  }
}

function packetBaseBody(packet: HandoffPacket): Omit<HandoffPacket, "senderReceipt" | "signature"> {
  const { senderReceipt: _senderReceipt, signature: _signature, ...body } = packet;
  return body;
}

function senderReceiptBody(receipt: HandoffSenderReceipt): Omit<HandoffSenderReceipt, "signature"> {
  const { signature: _signature, ...body } = receipt;
  return body;
}

function receiverReceiptPayloadBody(receipt: Omit<HandoffReceiverReceipt, "payloadHash" | "signature">): Omit<HandoffReceiverReceipt, "payloadHash" | "signature"> {
  return receipt;
}

function receiverReceiptBody(receipt: HandoffReceiverReceipt): Omit<HandoffReceiverReceipt, "signature"> {
  const { signature: _signature, ...body } = receipt;
  return body;
}

function mergeDependencyStatuses(
  base: HandoffDependencyStatus[],
  updates: HandoffDependencyStatus[] = []
): HandoffDependencyStatus[] {
  const byId = new Map(base.map((dependency) => [dependency.dependencyId, dependency]));
  for (const update of updates) {
    byId.set(update.dependencyId, { ...byId.get(update.dependencyId), ...update });
  }
  return [...byId.values()].sort((a, b) => a.dependencyId.localeCompare(b.dependencyId));
}

function unresolvedDependencies(dependencies: HandoffDependencyStatus[]): HandoffDependencyStatus[] {
  return dependencies
    .filter((dependency) => dependency.required && dependency.status !== "satisfied")
    .sort((a, b) => a.dependencyId.localeCompare(b.dependencyId));
}

/** Internal prepared-publication helpers; only the maintained producers use them. */
export type HandoffFile = { path: string; state: { bytes: Buffer; mode: number } | null };
function readHandoffFile(path: string): HandoffFile["state"] {
  let fd: number;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) throw new Error("handoff predecessor is not a regular single-link file");
    const bytes = readFileSync(fd), openedAfter = fstatSync(fd), after = lstatSync(path);
    if (openedAfter.ctimeMs !== stat.ctimeMs || openedAfter.size !== stat.size || after.dev !== stat.dev || after.ino !== stat.ino || after.mode !== stat.mode) throw new Error("handoff predecessor changed during read");
    return { bytes, mode: stat.mode & 0o777 };
  } finally { closeSync(fd); }
}
export function captureHandoffFiles(paths: string[]): HandoffFile[] {
  try { return paths.map(path => ({ path, state: readHandoffFile(path) })); }
  catch (cause) { throw Object.assign(new Error("Cannot read .amc/handoffs publication preimage", { cause }), { code: "HANDOFF_PREPARATION_FAILED" }); }
}
export function assertHandoffFilesCurrent(files: readonly HandoffFile[]): void {
  for (const file of files) {
    const current = captureHandoffFiles([file.path])[0]!.state;
    if (current === null ? file.state !== null : file.state === null || current.mode !== file.state.mode || !current.bytes.equals(file.state.bytes)) {
      throw new Error("handoff packet or output changed while preparing publication");
    }
  }
}
function withHandoffPublicationLock<T>(workspace: string, operation: () => T): T {
  return withControlFileLock({ root: fleetRoot(workspace), name: "handoff-publication", operation });
}
class HandoffPublicationError extends Error {
  readonly code = "HANDOFF_PUBLICATION_PARTIAL" as const;
  readonly attemptedMemberMayExist = true;
  constructor(readonly phase: "packet" | "packet-cleanup" | "receiver-receipt" | "unresolved-log", readonly published: readonly string[], cause: unknown) {
    super(`Handoff publication failed during ${phase}; ${published.length} earlier member(s) completed; attempted member state may have changed`, { cause });
    this.name = "HandoffPublicationError";
  }
}
export function publishHandoffPacket(workspace: string, packet: HandoffPacket, files: readonly HandoffFile[], beforeWrite: () => void = () => {}): void {
  withHandoffPublicationLock(workspace, () => {
    beforeWrite(); assertHandoffFilesCurrent(files);
    try { ensureDir(handoffDir(workspace)); writeFileAtomic(handoffFilePath(workspace, packet.packetId), JSON.stringify(packet, null, 2), 0o644); }
    catch (cause) { throw new HandoffPublicationError("packet", [], cause); }
  });
}
export function publishHandoffAcceptance(workspace: string, prepared: ReturnType<typeof prepareHandoffAcceptance>, receipt: HandoffReceiverReceipt, beforeWrite: () => void = () => {}): void {
  withHandoffPublicationLock(workspace, () => {
    beforeWrite();
    if (Date.now() > prepared.packet.expiryTs) throw new Error("Cannot accept an expired handoff packet");
    assertHandoffFilesCurrent(prepared.files);
    try { ensureDir(handoffReceiptDir(workspace)); writeFileAtomic(handoffReceiverReceiptPath(workspace, receipt.packetId), JSON.stringify(receipt, null, 2), 0o644); }
    catch (cause) { throw new HandoffPublicationError("receiver-receipt", [], cause); }
    try { writeFileAtomic(handoffUnresolvedDependencyPath(workspace, receipt.packetId), JSON.stringify(prepared.unresolvedLog, null, 2), 0o644); }
    catch (cause) { throw new HandoffPublicationError("unresolved-log", [`.amc/handoffs/receipts/${receipt.packetId}.receiver.json`], cause); }
  });
}
export function removeHandoffPacketIfCurrent(workspace: string, packet: HandoffPacket): void {
  try {
    withHandoffPublicationLock(workspace, () => {
      const state = captureHandoffFiles([handoffFilePath(workspace, packet.packetId)])[0]!.state;
      if (state?.mode === 0o644 && state.bytes.equals(Buffer.from(JSON.stringify(packet, null, 2)))) rmSync(handoffFilePath(workspace, packet.packetId));
    });
  } catch (cause) { throw new HandoffPublicationError("packet-cleanup", [], cause); }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type HandoffCreateParams = {
    fromAgentId: string;
    toAgentId: string;
    goal: string;
    currentState?: string;
    nextAction?: string;
    constraints?: string[];
    knownUnknowns?: string[];
    artifactPaths?: string[];
    stopConditions?: string[];
    contextHash?: string;
    evidenceSnapshot?: string[];
    trustState?: { level: number; confidence: number; integrityIndex: number };
    delegationScope?: string[];
    ownershipTransfer?: Partial<HandoffOwnershipTransfer>;
    dependencyStatuses?: HandoffDependencyStatus[];
    refusalReasons?: Array<Omit<HandoffRefusalReason, "refusedAt"> & { refusedAt?: string }>;
    ttlMs?: number;
  };

export function prepareHandoffPacket(params: HandoffCreateParams) {
  const captured = structuredClone(params);
  const packetId = `handoff_${randomUUID().slice(0, 12)}`;
  const now = Date.now();
  const ttl = captured.ttlMs ?? 3600_000; // 1 hour default
  const delegationScope = captured.delegationScope ?? [];
  const dependencyStatuses = handoffPacketSchema.shape.dependencyStatuses.parse(captured.dependencyStatuses ?? []);
  const refusalReasons = handoffPacketSchema.shape.refusalReasons.parse((captured.refusalReasons ?? []).map((reason) => ({
    ...reason,
    refusedAt: reason.refusedAt ?? new Date(now).toISOString()
  })));
  const ownershipTransfer = handoffPacketSchema.shape.ownershipTransfer.parse({
    fromOwnerAgentId: captured.ownershipTransfer?.fromOwnerAgentId ?? captured.fromAgentId,
    toOwnerAgentId: captured.ownershipTransfer?.toOwnerAgentId ?? captured.toAgentId,
    scope: captured.ownershipTransfer?.scope ?? delegationScope,
    status: captured.ownershipTransfer?.status ?? "offered",
    transferReceiptId: captured.ownershipTransfer?.transferReceiptId ?? null,
    refusalReason: captured.ownershipTransfer?.refusalReason ?? null,
    evidenceRefs: captured.ownershipTransfer?.evidenceRefs ?? []
  });

  const baseBody = {
    packetId,
    fromAgentId: captured.fromAgentId,
    toAgentId: captured.toAgentId,
    goal: captured.goal,
    currentState: captured.currentState ?? "",
    nextAction: captured.nextAction ?? "",
    constraints: captured.constraints ?? [],
    knownUnknowns: captured.knownUnknowns ?? [],
    artifactPaths: captured.artifactPaths ?? [],
    stopConditions: captured.stopConditions ?? [],
    contextHash: captured.contextHash ?? sha256Hex(Buffer.from(captured.goal, "utf8")),
    evidenceSnapshot: captured.evidenceSnapshot ?? [],
    trustState: captured.trustState ?? null,
    delegationScope,
    ownershipTransfer,
    dependencyStatuses,
    refusalReasons,
    createdTs: now,
    expiryTs: now + ttl,
  };
  const payloadHash = sha256Hex(Buffer.from(canonicalize(baseBody), "utf8"));
  const senderReceiptWithoutSignature: Omit<HandoffSenderReceipt, "signature"> = {
    role: "sender",
    receiptId: `handoff_sender_${randomUUID().slice(0, 12)}`,
    packetId,
    agentId: captured.fromAgentId,
    createdTs: now,
    payloadHash
  };
  return { baseBody, senderReceiptWithoutSignature };
}

export function createHandoffPacket(workspace: string, params: HandoffCreateParams): HandoffPacket {
  const { baseBody, senderReceiptWithoutSignature } = prepareHandoffPacket(params);
  const files = captureHandoffFiles([handoffFilePath(workspace, baseBody.packetId)]);
  const senderReceipt = handoffPacketSchema.shape.senderReceipt.parse({
    ...senderReceiptWithoutSignature, signature: signCanonicalBody(workspace, senderReceiptWithoutSignature)
  });
  const body = { ...baseBody, senderReceipt };
  const packet = handoffPacketSchema.parse({ ...body, signature: signCanonicalBody(workspace, body) });
  publishHandoffPacket(workspace, packet, files);
  return packet;
}

// ---------------------------------------------------------------------------
// Load & List
// ---------------------------------------------------------------------------

export function loadHandoffPacket(workspace: string, packetId: string): HandoffPacket {
  const file = handoffFilePath(workspace, packetId);
  if (!pathExists(file)) {
    throw new Error(`Handoff packet not found: ${packetId}`);
  }
  return handoffPacketSchema.parse(JSON.parse(readFileSync(file, "utf8")) as unknown);
}

/**
 * Delete one packet file.
 *
 * Exported so a caller that must NOT leave an unsigned packet behind can undo
 * its own write without re-deriving the on-disk layout. A duplicated path is a
 * latent bug the moment either copy moves — and a stale copy here would leave
 * exactly the orphan the caller is trying to prevent.
 */
export function removeHandoffPacket(workspace: string, packetId: string): void {
  withHandoffPublicationLock(workspace, () => rmSync(handoffFilePath(workspace, packetId), { force: true }));
}

export function listHandoffPackets(workspace: string): string[] {
  const dir = handoffDir(workspace);
  if (!pathExists(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
    .sort();
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

export function verifyHandoffPacket(workspace: string, packetId: string): HandoffVerificationResult {
  try { return verifyHandoffPacketBody(workspace, loadHandoffPacket(workspace, packetId)); }
  catch (e) { return { valid: false, expired: false, signatureValid: false, senderReceiptValid: false, errors: [String(e)], packet: null }; }
}

/** Same already-read packet for the public reader and both receiver producers. */
function verifyHandoffPacketBody(workspace: string, packet: HandoffPacket): HandoffVerificationResult {
  const errors: string[] = [];
  const expired = Date.now() > packet.expiryTs;
  if (expired) {
    errors.push(`Packet expired at ${new Date(packet.expiryTs).toISOString()}`);
  }

  const { signature, ...body } = packet;
  let signatureValid = false;

  if (signature === "unsigned") {
    errors.push("Packet is unsigned");
  } else {
    try {
      signatureValid = verifyCanonicalBodySignature(workspace, body, signature);
      if (!signatureValid) {
        errors.push("Signature verification failed");
      }
    } catch (e) {
      errors.push(`Signature check error: ${String(e)}`);
    }
  }

  let senderReceiptValid = false;
  if (!packet.senderReceipt) {
    errors.push("Sender receipt is missing");
  } else {
    const expectedPayloadHash = sha256Hex(Buffer.from(canonicalize(packetBaseBody(packet)), "utf8"));
    if (packet.senderReceipt.payloadHash !== expectedPayloadHash) {
      errors.push("Sender receipt payload hash mismatch");
    }
    senderReceiptValid = verifyCanonicalBodySignature(workspace, senderReceiptBody(packet.senderReceipt), packet.senderReceipt.signature);
    if (!senderReceiptValid) {
      errors.push("Sender receipt signature verification failed");
    }
  }

  return {
    valid: errors.length === 0,
    expired,
    signatureValid,
    senderReceiptValid,
    errors,
    packet,
  };
}

export function loadHandoffReceiverReceipt(workspace: string, packetId: string): HandoffReceiverReceipt | null {
  const file = handoffReceiverReceiptPath(workspace, packetId);
  if (!pathExists(file)) return null;
  return handoffReceiverReceiptSchema.parse(JSON.parse(readFileSync(file, "utf8")) as unknown);
}

export function loadHandoffUnresolvedDependencyLog(workspace: string, packetId: string): HandoffUnresolvedDependencyLog | null {
  const file = handoffUnresolvedDependencyPath(workspace, packetId);
  if (!pathExists(file)) return null;
  return handoffUnresolvedDependencyLogSchema.parse(JSON.parse(readFileSync(file, "utf8")) as unknown);
}

export type HandoffAcceptParams = {
    receiverAgentId?: string;
    accepted?: boolean;
    dependencyStatuses?: HandoffDependencyStatus[];
    refusalReason?: string;
    refusalReasons?: Array<Omit<HandoffRefusalReason, "refusedAt"> & { refusedAt?: string }>;
    evidenceRefs?: string[];
  };

export function prepareHandoffAcceptance(workspace: string, packetId: string, params: HandoffAcceptParams) {
  const captured = structuredClone(params);
  const files = captureHandoffFiles([handoffFilePath(workspace, packetId),
    handoffReceiverReceiptPath(workspace, packetId), handoffUnresolvedDependencyPath(workspace, packetId)]);
  const bytes = files[0]!.state?.bytes;
  if (bytes === undefined) throw new Error(`Handoff packet not found: ${packetId}`);
  const packetResult = verifyHandoffPacketBody(workspace, handoffPacketSchema.parse(JSON.parse(bytes.toString("utf8"))));
  if (!packetResult.packet || !packetResult.valid) {
    throw new Error(`Cannot accept invalid handoff packet ${packetId}: ${packetResult.errors.join("; ")}`);
  }
  const packet = packetResult.packet;
  const receiverAgentId = captured.receiverAgentId ?? packet.toAgentId;
  const dependencyStatuses = mergeDependencyStatuses(
    packet.dependencyStatuses,
    handoffPacketSchema.shape.dependencyStatuses.parse(captured.dependencyStatuses ?? [])
  );
  const unresolved = unresolvedDependencies(dependencyStatuses);
  const receivedTs = Date.now();
  const refusalReasons = handoffPacketSchema.shape.refusalReasons.parse([
    ...packet.refusalReasons,
    ...(captured.refusalReasons ?? []).map((reason) => ({
      ...reason,
      refusedAt: reason.refusedAt ?? new Date(receivedTs).toISOString()
    })),
    ...(captured.refusalReason ? [{
      agentId: receiverAgentId,
      reason: captured.refusalReason,
      refusedAt: new Date(receivedTs).toISOString(),
      evidenceRefs: captured.evidenceRefs ?? []
    }] : [])
  ]);
  const accepted = captured.accepted ?? (unresolved.length === 0 && refusalReasons.length === 0);
  const ownershipAccepted = Boolean(
    accepted &&
    unresolved.length === 0 &&
    packet.ownershipTransfer &&
    packet.ownershipTransfer.toOwnerAgentId === receiverAgentId
  );
  const receiptWithoutPayload: Omit<HandoffReceiverReceipt, "payloadHash" | "signature"> = {
    role: "receiver",
    receiptId: `handoff_receiver_${randomUUID().slice(0, 12)}`,
    packetId,
    receiverAgentId,
    accepted,
    ownershipAccepted,
    receivedTs,
    dependencyStatuses,
    unresolvedDependencies: unresolved,
    refusalReasons
  };
  const payloadHash = sha256Hex(Buffer.from(canonicalize(receiverReceiptPayloadBody(receiptWithoutPayload)), "utf8"));
  const receiptWithoutSignature: Omit<HandoffReceiverReceipt, "signature"> = {
    ...receiptWithoutPayload,
    payloadHash
  };
  return { packet, files, receiptWithoutSignature, unresolvedLog: {
    packetId, loggedAt: new Date(receivedTs).toISOString(), dependencies: unresolved, refusalReasons
  } satisfies HandoffUnresolvedDependencyLog };
}

export function acceptHandoffPacket(workspace: string, packetId: string, params: HandoffAcceptParams = {}): HandoffReceiverReceipt {
  const prepared = prepareHandoffAcceptance(workspace, packetId, params);
  const receipt = handoffReceiverReceiptSchema.parse({ ...prepared.receiptWithoutSignature,
    signature: signCanonicalBody(workspace, prepared.receiptWithoutSignature) });
  publishHandoffAcceptance(workspace, prepared, receipt);
  return receipt;
}

function verifyReceiverReceipt(workspace: string, receipt: HandoffReceiverReceipt): boolean {
  const expectedPayloadHash = sha256Hex(Buffer.from(canonicalize(receiverReceiptPayloadBody({
    role: receipt.role,
    receiptId: receipt.receiptId,
    packetId: receipt.packetId,
    receiverAgentId: receipt.receiverAgentId,
    accepted: receipt.accepted,
    ownershipAccepted: receipt.ownershipAccepted,
    receivedTs: receipt.receivedTs,
    dependencyStatuses: receipt.dependencyStatuses,
    unresolvedDependencies: receipt.unresolvedDependencies,
    refusalReasons: receipt.refusalReasons
  })), "utf8"));
  if (receipt.payloadHash !== expectedPayloadHash) return false;
  return verifyCanonicalBodySignature(workspace, receiverReceiptBody(receipt), receipt.signature);
}

export function verifyHandoffContract(workspace: string, packetId: string): HandoffContractVerificationResult {
  const packetVerification = verifyHandoffPacket(workspace, packetId);
  const errors: string[] = [];
  if (!packetVerification.valid) {
    errors.push("handoff-contract:packet:invalid");
  }
  if (!packetVerification.senderReceiptValid) {
    errors.push("handoff-contract:sender-receipt:invalid");
  }
  const packet = packetVerification.packet;
  const receiverReceipt = loadHandoffReceiverReceipt(workspace, packetId);
  let receiverReceiptValid = false;
  if (!receiverReceipt) {
    errors.push("handoff-contract:receiver-receipt:missing");
  } else {
    receiverReceiptValid = verifyReceiverReceipt(workspace, receiverReceipt);
    if (!receiverReceiptValid) {
      errors.push("handoff-contract:receiver-receipt:invalid");
    }
    if (!receiverReceipt.accepted || receiverReceipt.refusalReasons.length > 0) {
      errors.push("handoff-contract:receiver-refusal:present");
    }
  }

  const dependencies = receiverReceipt?.dependencyStatuses ?? packet?.dependencyStatuses ?? [];
  const unresolved = unresolvedDependencies(dependencies);
  for (const dependency of unresolved) {
    errors.push(`handoff-contract:dependency:${dependency.dependencyId}:unresolved`);
    if ((dependency.status === "blocked" || dependency.status === "refused") && !dependency.refusalReason) {
      errors.push(`handoff-contract:dependency:${dependency.dependencyId}:refusal-reason:missing`);
    }
  }

  const ownershipAccepted = Boolean(receiverReceipt?.ownershipAccepted);
  if (!packet?.ownershipTransfer || !ownershipAccepted) {
    errors.push("handoff-contract:ownership-transfer:not-accepted");
  }

  const unique = [...new Set(errors)];
  return {
    valid: unique.length === 0,
    packetValid: packetVerification.valid,
    senderReceiptValid: packetVerification.senderReceiptValid,
    receiverReceiptValid,
    ownershipAccepted,
    unresolvedDependencies: unresolved,
    errors: unique,
    packet,
    receiverReceipt
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function renderHandoffPacketMarkdown(packet: HandoffPacket): string {
  const lines = [
    "# Handoff Packet",
    "",
    `- Packet ID: ${packet.packetId}`,
    `- From: ${packet.fromAgentId}`,
    `- To: ${packet.toAgentId}`,
    `- Goal: ${packet.goal}`,
    `- Created: ${new Date(packet.createdTs).toISOString()}`,
    `- Expires: ${new Date(packet.expiryTs).toISOString()}`,
    `- Context Hash: ${packet.contextHash}`,
    "",
    `## Current State`,
    packet.currentState || "(none)",
    "",
    `## Next Action`,
    packet.nextAction || "(none)",
    "",
    `## Trust State`,
    ...(packet.trustState === null
      ? ["- not measured (no AMC path computes a trust state for a handoff)"]
      : [
          `- Level: ${packet.trustState.level}`,
          `- Confidence: ${packet.trustState.confidence}`,
          `- Integrity Index: ${packet.trustState.integrityIndex}`,
        ]),
    "",
  ];

  if (packet.constraints.length > 0) {
    lines.push("## Constraints");
    for (const c of packet.constraints) lines.push(`- ${c}`);
    lines.push("");
  }

  if (packet.delegationScope.length > 0) {
    lines.push("## Delegation Scope");
    for (const s of packet.delegationScope) lines.push(`- ${s}`);
    lines.push("");
  }

  if (packet.ownershipTransfer) {
    lines.push("## Ownership Transfer");
    lines.push(`- From owner: ${packet.ownershipTransfer.fromOwnerAgentId}`);
    lines.push(`- To owner: ${packet.ownershipTransfer.toOwnerAgentId}`);
    lines.push(`- Status: ${packet.ownershipTransfer.status}`);
    if (packet.ownershipTransfer.scope.length > 0) {
      lines.push(`- Scope: ${packet.ownershipTransfer.scope.join(", ")}`);
    }
    if (packet.ownershipTransfer.transferReceiptId) {
      lines.push(`- Transfer receipt: ${packet.ownershipTransfer.transferReceiptId}`);
    }
    if (packet.ownershipTransfer.refusalReason) {
      lines.push(`- Refusal reason: ${packet.ownershipTransfer.refusalReason}`);
    }
    lines.push("");
  }

  if (packet.dependencyStatuses.length > 0) {
    lines.push("## Dependency Status");
    for (const dependency of packet.dependencyStatuses) {
      const owner = dependency.ownerAgentId ? ` owner=${dependency.ownerAgentId}` : "";
      const required = dependency.required ? " required" : " optional";
      lines.push(`- ${dependency.dependencyId}: ${dependency.status}${required}${owner}`);
      if (dependency.refusalReason) {
        lines.push(`  - Refusal reason: ${dependency.refusalReason}`);
      }
      if (dependency.evidenceRefs.length > 0) {
        lines.push(`  - Evidence: ${dependency.evidenceRefs.join(", ")}`);
      }
    }
    lines.push("");
  }

  if (packet.refusalReasons.length > 0) {
    lines.push("## Refusal Reasons");
    for (const refusal of packet.refusalReasons) {
      lines.push(`- ${refusal.agentId} at ${refusal.refusedAt}: ${refusal.reason}`);
    }
    lines.push("");
  }

  if (packet.senderReceipt) {
    lines.push("## Sender Receipt");
    lines.push(`- Receipt ID: ${packet.senderReceipt.receiptId}`);
    lines.push(`- Agent: ${packet.senderReceipt.agentId}`);
    lines.push(`- Payload hash: ${packet.senderReceipt.payloadHash}`);
    lines.push("");
  }

  if (packet.stopConditions.length > 0) {
    lines.push("## Stop Conditions");
    for (const s of packet.stopConditions) lines.push(`- ${s}`);
    lines.push("");
  }

  return lines.join("\n");
}
