/**
 * Handoff Packet Schema
 *
 * Signed handoff packets for agent-to-agent delegation.
 * Receiving agents must verify the packet before acting.
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readdirSync, readFileSync } from "node:fs";
import { z } from "zod";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
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
  trustState: z.object({
    level: z.number(),
    confidence: z.number(),
    integrityIndex: z.number(),
  }),
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

function handoffFilePath(workspace: string, packetId: string): string {
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
    return signHexDigest(digest, getPrivateKeyPem(workspace, "auditor"));
  } catch {
    return "unsigned";
  }
}

function verifyCanonicalBodySignature(workspace: string, body: unknown, signature: string): boolean {
  if (signature === "unsigned") return false;
  const digest = sha256Hex(Buffer.from(canonicalize(body), "utf8"));
  try {
    return verifyHexDigestAny(digest, signature, getPublicKeyHistory(workspace, "auditor"));
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

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export function createHandoffPacket(
  workspace: string,
  params: {
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
  },
): HandoffPacket {
  ensureDir(handoffDir(workspace));

  const packetId = `handoff_${randomUUID().slice(0, 12)}`;
  const now = Date.now();
  const ttl = params.ttlMs ?? 3600_000; // 1 hour default
  const delegationScope = params.delegationScope ?? [];
  const dependencyStatuses = handoffPacketSchema.shape.dependencyStatuses.parse(params.dependencyStatuses ?? []);
  const refusalReasons = handoffPacketSchema.shape.refusalReasons.parse((params.refusalReasons ?? []).map((reason) => ({
    ...reason,
    refusedAt: reason.refusedAt ?? new Date(now).toISOString()
  })));
  const ownershipTransfer = handoffPacketSchema.shape.ownershipTransfer.parse({
    fromOwnerAgentId: params.ownershipTransfer?.fromOwnerAgentId ?? params.fromAgentId,
    toOwnerAgentId: params.ownershipTransfer?.toOwnerAgentId ?? params.toAgentId,
    scope: params.ownershipTransfer?.scope ?? delegationScope,
    status: params.ownershipTransfer?.status ?? "offered",
    transferReceiptId: params.ownershipTransfer?.transferReceiptId ?? null,
    refusalReason: params.ownershipTransfer?.refusalReason ?? null,
    evidenceRefs: params.ownershipTransfer?.evidenceRefs ?? []
  });

  const baseBody = {
    packetId,
    fromAgentId: params.fromAgentId,
    toAgentId: params.toAgentId,
    goal: params.goal,
    currentState: params.currentState ?? "",
    nextAction: params.nextAction ?? "",
    constraints: params.constraints ?? [],
    knownUnknowns: params.knownUnknowns ?? [],
    artifactPaths: params.artifactPaths ?? [],
    stopConditions: params.stopConditions ?? [],
    contextHash: params.contextHash ?? sha256Hex(Buffer.from(params.goal, "utf8")),
    evidenceSnapshot: params.evidenceSnapshot ?? [],
    trustState: params.trustState ?? { level: 0, confidence: 0, integrityIndex: 0 },
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
    agentId: params.fromAgentId,
    createdTs: now,
    payloadHash
  };
  const senderReceipt = handoffPacketSchema.shape.senderReceipt.parse({
    ...senderReceiptWithoutSignature,
    signature: signCanonicalBody(workspace, senderReceiptWithoutSignature)
  });
  const body = { ...baseBody, senderReceipt };

  const digest = sha256Hex(Buffer.from(canonicalize(body), "utf8"));
  let signature = "unsigned";
  try {
    signature = signHexDigest(digest, getPrivateKeyPem(workspace, "auditor"));
  } catch { /* unsigned */ }

  const packet = handoffPacketSchema.parse({ ...body, signature });
  writeFileAtomic(handoffFilePath(workspace, packetId), JSON.stringify(packet, null, 2), 0o644);
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
  const errors: string[] = [];

  let packet: HandoffPacket;
  try {
    packet = loadHandoffPacket(workspace, packetId);
  } catch (e) {
    return { valid: false, expired: false, signatureValid: false, senderReceiptValid: false, errors: [String(e)], packet: null };
  }

  const expired = Date.now() > packet.expiryTs;
  if (expired) {
    errors.push(`Packet expired at ${new Date(packet.expiryTs).toISOString()}`);
  }

  const { signature, ...body } = packet;
  const digest = sha256Hex(Buffer.from(canonicalize(body), "utf8"));
  let signatureValid = false;

  if (signature === "unsigned") {
    errors.push("Packet is unsigned");
  } else {
    try {
      const keys = getPublicKeyHistory(workspace, "auditor");
      signatureValid = verifyHexDigestAny(digest, signature, keys);
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

export function acceptHandoffPacket(
  workspace: string,
  packetId: string,
  params: {
    receiverAgentId?: string;
    accepted?: boolean;
    dependencyStatuses?: HandoffDependencyStatus[];
    refusalReason?: string;
    refusalReasons?: Array<Omit<HandoffRefusalReason, "refusedAt"> & { refusedAt?: string }>;
    evidenceRefs?: string[];
  } = {}
): HandoffReceiverReceipt {
  const packetResult = verifyHandoffPacket(workspace, packetId);
  if (!packetResult.packet || !packetResult.valid) {
    throw new Error(`Cannot accept invalid handoff packet ${packetId}: ${packetResult.errors.join("; ")}`);
  }
  const packet = packetResult.packet;
  const receiverAgentId = params.receiverAgentId ?? packet.toAgentId;
  const dependencyStatuses = mergeDependencyStatuses(
    packet.dependencyStatuses,
    handoffPacketSchema.shape.dependencyStatuses.parse(params.dependencyStatuses ?? [])
  );
  const unresolved = unresolvedDependencies(dependencyStatuses);
  const receivedTs = Date.now();
  const refusalReasons = handoffPacketSchema.shape.refusalReasons.parse([
    ...packet.refusalReasons,
    ...(params.refusalReasons ?? []).map((reason) => ({
      ...reason,
      refusedAt: reason.refusedAt ?? new Date(receivedTs).toISOString()
    })),
    ...(params.refusalReason ? [{
      agentId: receiverAgentId,
      reason: params.refusalReason,
      refusedAt: new Date(receivedTs).toISOString(),
      evidenceRefs: params.evidenceRefs ?? []
    }] : [])
  ]);
  const accepted = params.accepted ?? (unresolved.length === 0 && refusalReasons.length === 0);
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
  const receipt = handoffReceiverReceiptSchema.parse({
    ...receiptWithoutSignature,
    signature: signCanonicalBody(workspace, receiptWithoutSignature)
  });
  ensureDir(handoffReceiptDir(workspace));
  writeFileAtomic(handoffReceiverReceiptPath(workspace, packetId), JSON.stringify(receipt, null, 2), 0o644);
  const unresolvedLog: HandoffUnresolvedDependencyLog = {
    packetId,
    loggedAt: new Date(receivedTs).toISOString(),
    dependencies: unresolved,
    refusalReasons
  };
  writeFileAtomic(handoffUnresolvedDependencyPath(workspace, packetId), JSON.stringify(unresolvedLog, null, 2), 0o644);
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
    `- Level: ${packet.trustState.level}`,
    `- Confidence: ${packet.trustState.confidence}`,
    `- Integrity Index: ${packet.trustState.integrityIndex}`,
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
