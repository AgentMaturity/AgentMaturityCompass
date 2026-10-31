/**
 * Cross-Agent Receipt Chaining
 *
 * Extends receipts with delegation chains for cross-agent accountability.
 * Adds parentReceiptId and delegationChain fields.
 */

import { openSessionEventStore, readSessionStoreMarker } from "../persistence/openSessionEventStore.js";
import { verifyStoredSessionEventMetadata } from "../persistence/sessionStoreVerification.js";
import type { EvidenceEvent } from "../types.js";
import { randomUUID, sign } from "node:crypto";
import { join } from "node:path";
import { readdirSync } from "node:fs";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { ReceiptPayloadV1, ReceiptKind } from "./receipt.js";
import { parseReceipt, verifyReceipt } from "./receipt.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";

// ---------------------------------------------------------------------------
// Extended Receipt Types
// ---------------------------------------------------------------------------

export interface ChainedReceiptPayloadV1 extends ReceiptPayloadV1 {
  /** Parent receipt ID for delegation chains (null if root) */
  parent_receipt_id: string | null;
  /** Full delegation chain: ordered list of receipt IDs from root to this receipt */
  delegation_chain: string[];
}

export interface DelegationChainEntry {
  receiptId: string;
  agentId: string;
  kind: ReceiptKind;
  ts: number;
  parentReceiptId: string | null;
}

export interface ChainVerificationResult {
  valid: boolean;
  chainLength: number;
  entries: DelegationChainEntry[];
  errors: string[];
  rootReceiptId: string | null;
  leafReceiptId: string;
}

// ---------------------------------------------------------------------------
// Receipt Store (for chaining lookups)
// ---------------------------------------------------------------------------

/**
 * Chained receipts, in memory and on disk.
 *
 * The store used to be only this Map. Every consumer of the chain — `amc
 * receipts-chain` and the /crypto chain route — runs in a process that never
 * minted anything, so the Map was always empty and verification could only ever
 * report "Receipt <id> not found in store". The command failed closed, which is
 * the right direction, but it could not succeed for any input.
 *
 * Receipts are now written under the workspace so a later process can find
 * them. Only the signed receipt string is persisted: the payload is decoded
 * back out of it on read, so an edited file cannot present a payload that
 * disagrees with the bytes that were signed.
 */
const receiptStore = new Map<string, { receipt: string; payload: ChainedReceiptPayloadV1 }>();

function chainDir(workspace: string): string {
  return join(workspace, ".amc", "receipts", "chain");
}

function chainPath(workspace: string, receiptId: string): string {
  // Receipt ids reach here from CLI arguments and HTTP routes, so a traversal
  // in the id must not escape the store directory.
  return join(chainDir(workspace), `${encodeURIComponent(receiptId)}.receipt`);
}

/**
 * Register a receipt in the chain store for later lookup.
 *
 * With a workspace, the receipt is also persisted so other processes can
 * verify the chain; without one, the registration stays in-process.
 */
function registerChainedReceipt(
  receiptId: string,
  receipt: string,
  payload: ChainedReceiptPayloadV1,
  workspace?: string | null,
): void {
  receiptStore.set(receiptId, { receipt, payload });
  if (workspace) {
    ensureDir(chainDir(workspace));
    writeFileAtomic(chainPath(workspace, receiptId), receipt, 0o600);
  }
}

/**
 * How many chained receipts this workspace has recorded.
 *
 * Lets a caller tell "that id is not here" apart from "nothing has ever
 * recorded a chained receipt", which are very different answers for someone
 * trying to trace a delegation.
 */
export function countStoredReceipts(workspace: string): number {
  const dir = chainDir(workspace);
  if (!pathExists(dir)) return 0;
  return readdirSync(dir).filter((name) => name.endsWith(".receipt")).length;
}

/**
 * Look up a stored receipt by ID, in memory first and then on disk.
 */
export function getStoredReceipt(
  receiptId: string,
  workspace?: string | null,
): { receipt: string; payload: ChainedReceiptPayloadV1 } | null {
  // A workspace lookup must read that workspace, including edits since minting.
  if (!workspace) return receiptStore.get(receiptId) ?? null;
  const path = chainPath(workspace, receiptId);
  if (!pathExists(path)) return null;
  try {
    const receipt = readUtf8(path).trim();
    // Decoded from the signed bytes, never from a separately stored copy.
    const payload = parseReceipt(receipt).payload as ChainedReceiptPayloadV1;
    if (payload.receipt_id !== receiptId || payload.v !== 1
      || !(payload.parent_receipt_id === null || typeof payload.parent_receipt_id === "string")
      || !Array.isArray(payload.delegation_chain)) return null;
    return { receipt, payload };
  } catch {
    // A corrupt or truncated file is a missing receipt, and the caller reports
    // it as such rather than treating the chain as verified.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Minting Chained Receipts
// ---------------------------------------------------------------------------

function toBase64Url(bytes: Buffer): string {
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export interface MintChainedReceiptInput {
  kind: ReceiptKind;
  ts: number;
  agentId: string;
  providerId: string;
  model: string | null;
  eventHash: string;
  bodySha256: string;
  sessionId: string;
  privateKeyPem: string;
  parentReceiptId?: string | null;
  receiptId?: string;
  /** Workspace to persist the receipt in, so other processes can verify it. */
  workspace?: string | null;
}

function chainedPayload(input: Omit<MintChainedReceiptInput, "privateKeyPem">): ChainedReceiptPayloadV1 {
  // Build delegation chain from parent
  let delegationChain: string[] = [];
  if (input.parentReceiptId) {
    const parent = getStoredReceipt(input.parentReceiptId, input.workspace);
    if (parent) {
      delegationChain = [...parent.payload.delegation_chain, input.parentReceiptId];
    } else {
      delegationChain = [input.parentReceiptId];
    }
  }

  const receiptId = input.receiptId ?? randomUUID();

  return {
    v: 1,
    kind: input.kind,
    receipt_id: receiptId,
    ts: input.ts,
    agentId: input.agentId || "unknown",
    providerId: input.providerId || "unknown",
    model: input.model ?? null,
    event_hash: input.eventHash,
    body_sha256: input.bodySha256,
    session_id: input.sessionId,
    parent_receipt_id: input.parentReceiptId ?? null,
    delegation_chain: delegationChain,
  };
}

/**
 * Mint a receipt that carries delegation chain info.
 */
export function mintChainedReceipt(input: MintChainedReceiptInput): {
  payload: ChainedReceiptPayloadV1;
  receipt: string;
  receiptSha256: string;
} {
  const payload = chainedPayload(input);
  const payloadBytes = Buffer.from(canonicalize(payload), "utf8");
  const signatureBytes = sign(null, payloadBytes, input.privateKeyPem);
  const receipt = `${toBase64Url(payloadBytes)}.${toBase64Url(signatureBytes)}`;
  const receiptSha256 = sha256Hex(Buffer.from(receipt, "utf8"));

  // Auto-register in store
  registerChainedReceipt(payload.receipt_id, receipt, payload, input.workspace);

  return { payload, receipt, receiptSha256 };
}

/** Native producer: the existing purpose provider signs; publication rechecks original authority. */
export async function mintChainedReceiptAsync(
  input: Omit<MintChainedReceiptInput, "privateKeyPem" | "workspace"> & { workspace: string },
  beforePublish?: () => void
): Promise<{ payload: ChainedReceiptPayloadV1; receipt: string; receiptSha256: string }> {
  const workspace = input.workspace, payload = chainedPayload(input);
  const assertParent = () => {
    if (payload.parent_receipt_id && !verifyDelegationChain(payload.parent_receipt_id, getPurposeKeyHistory(workspace, "receipt"), workspace).valid) {
      throw new Error("Delegation parent receipt chain is invalid");
    }
  };
  assertParent();
  const publication = capturePurposePublication(workspace, "receipt");
  const bytes = Buffer.from(canonicalize(payload), "utf8");
  const signed = await signWithPurposeKey(workspace, "receipt", bytes);
  assertPurposePublicationCurrent(workspace, publication, signed);
  assertParent();
  beforePublish?.();
  const receipt = `${toBase64Url(bytes)}.${toBase64Url(signed.signature)}`;
  registerChainedReceipt(payload.receipt_id, receipt, payload, workspace);
  return { payload, receipt, receiptSha256: sha256Hex(receipt) };
}

// ---------------------------------------------------------------------------
// Chain Verification
// ---------------------------------------------------------------------------

/**
 * Verify the integrity of an entire delegation chain for a receipt.
 */
export function verifyDelegationChain(
  leafReceiptId: string,
  publicKeysPem: string[],
  workspace?: string | null,
): ChainVerificationResult {
  const errors: string[] = [];
  const entries: DelegationChainEntry[] = [];
  let currentId: string | null = leafReceiptId;
  const visited = new Set<string>();
  const declaredChains = new Map<string, string[]>();
  let nativeLineage: ReturnType<typeof readDelegationLineage> | undefined;
  if (!leafReceiptId) errors.push("Leaf receipt ID must be nonempty");

  while (currentId) {
    if (visited.has(currentId)) {
      errors.push(`Circular reference detected at receipt ${currentId}`);
      break;
    }
    visited.add(currentId);

    const stored = getStoredReceipt(currentId, workspace);
    if (!stored) {
      errors.push(`Receipt ${currentId} not found in store`);
      break;
    }

    if (stored.payload.parent_receipt_id === "") {
      errors.push(`Receipt ${currentId}: parent receipt ID must be nonempty or null`);
      break;
    }

    // Verify signature
    const verification = verifyReceipt(stored.receipt, publicKeysPem);
    if (!verification.ok) {
      errors.push(`Receipt ${currentId}: ${verification.error ?? "signature verification failed"}`);
    }

    if (stored.payload.providerId === "amc-native-delegation" || currentId.startsWith("delegation:")) {
      try {
        if (!workspace) throw new Error("native delegation verification requires its workspace ledger");
        nativeLineage ??= readDelegationLineage(workspace);
        const entry = nativeLineage.delegations.find(row => nativeDelegationReceiptId(row.event.id) === currentId);
        if (!entry) throw new Error("native delegation receipt has no canonical ledger event");
        const expected = chainedPayload({ ...nativeDelegationReceiptInput(nativeLineage, entry), workspace });
        if (canonicalize(stored.payload) !== canonicalize(expected)) throw new Error("native delegation receipt differs from canonical ledger evidence");
      } catch (error) { errors.push(`Receipt ${currentId}: ${String(error)}`); }
    }

    declaredChains.set(currentId, stored.payload.delegation_chain);
    entries.unshift({
      receiptId: stored.payload.receipt_id,
      agentId: stored.payload.agentId,
      kind: stored.payload.kind,
      ts: stored.payload.ts,
      parentReceiptId: stored.payload.parent_receipt_id,
    });

    currentId = stored.payload.parent_receipt_id;
  }

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    if (canonicalize(declaredChains.get(entry.receiptId)) !== canonicalize(entries.slice(0, i).map(parent => parent.receiptId))) {
      errors.push(`Receipt ${entry.receiptId}: delegation_chain does not match its parents`);
    }
  }

  return {
    valid: errors.length === 0,
    chainLength: entries.length,
    entries,
    errors,
    rootReceiptId: entries.length > 0 ? entries[0]!.receiptId : null,
    leafReceiptId,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function renderDelegationChainMarkdown(result: ChainVerificationResult): string {
  const lines: string[] = [
    "# Receipt Delegation Chain",
    "",
    `Leaf receipt: ${result.leafReceiptId}`,
    `Chain length: ${result.chainLength}`,
    `Valid: ${result.valid}`,
    "",
  ];

  if (result.errors.length > 0) {
    lines.push("## Errors");
    for (const e of result.errors) {
      lines.push(`- ${e}`);
    }
    lines.push("");
  }

  if (result.entries.length > 0) {
    lines.push("## Chain (root → leaf)");
    for (let i = 0; i < result.entries.length; i++) {
      const e = result.entries[i]!;
      const prefix = i === 0 ? "ROOT" : i === result.entries.length - 1 ? "LEAF" : `  ${i}`;
      lines.push(`${prefix}: ${e.receiptId}`);
      lines.push(`  Agent: ${e.agentId} | Kind: ${e.kind} | ts: ${new Date(e.ts).toISOString()}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Reset (for testing)
// ---------------------------------------------------------------------------

export function resetReceiptChainStore(): void {
  receiptStore.clear();
}

/** Stable projection identity shared by the receipt chain and fleet DAG. */
export const nativeDelegationReceiptId = (eventId: string): string => `delegation:${eventId}`;

export interface NativeDelegationEvent {
  readonly event: EvidenceEvent;
  readonly meta: { childRunAs: string; childSessionId: string; packetId: string;
    governedAs?: string; depth?: number; settledAs?: string };
}

/** Read the pinned store, authenticating the entire metadata prefix before projecting any edge. */
// ponytail: verify the full prefix per projection; cache by authenticated head if delegation volume requires it.
export function readDelegationLineage(workspace: string): { rows: readonly EvidenceEvent[]; delegations: NativeDelegationEvent[] } {
  const backend = readSessionStoreMarker(workspace);
  if (backend === null) {
    try { readUtf8(join(workspace, ".amc", "session-store.json")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { rows: [], delegations: [] };
      throw error;
    }
    throw new Error("Delegation lineage session-store marker is invalid");
  }
  const store = openSessionEventStore(workspace, backend, { readOnly: true });
  try {
    const rows = store.readAllEvents(), checked = verifyStoredSessionEventMetadata(workspace, rows);
    if (!checked.ok) throw new Error(`Delegation lineage invalid: ${checked.errors.slice(0, 3).join("; ")}`);
    const delegations = rows.filter(event => event.event_type === "agent_delegation_started" || event.event_type === "agent_delegation_completed")
      .map(event => ({ event, meta: JSON.parse(event.meta_json) as NativeDelegationEvent["meta"] }));
    const starts = new Map<string, NativeDelegationEvent>(), settled = new Set<string>();
    for (const entry of delegations) {
      if (entry.event.event_type === "agent_delegation_started") {
        if (starts.has(entry.meta.childSessionId)) throw new Error("Delegation lineage has duplicate child-session announcements");
        starts.set(entry.meta.childSessionId, entry);
      } else {
        const start = starts.get(entry.meta.childSessionId);
        if (!start || start.event.session_id !== entry.event.session_id || start.meta.packetId !== entry.meta.packetId
          || start.meta.childRunAs !== entry.meta.childRunAs) throw new Error("Delegation lineage completion has no matching start");
        if (settled.has(entry.meta.childSessionId)) throw new Error("Delegation lineage has duplicate child-session completions");
        settled.add(entry.meta.childSessionId);
      }
    }
    return { rows, delegations };
  } finally { store.close(); }
}

export function delegationStartFor(events: readonly NativeDelegationEvent[], entry: NativeDelegationEvent): NativeDelegationEvent | undefined {
  return events.find(candidate => candidate.event.event_type === "agent_delegation_started"
    && candidate.event.session_id === entry.event.session_id && candidate.meta.packetId === entry.meta.packetId
    && candidate.meta.childSessionId === entry.meta.childSessionId);
}

export function incomingDelegationFor(events: readonly NativeDelegationEvent[], sessionId: string): NativeDelegationEvent | undefined {
  return events.find(candidate => candidate.event.event_type === "agent_delegation_started" && candidate.meta.childSessionId === sessionId);
}

export function delegatingAgentFor(lineage: ReturnType<typeof readDelegationLineage>, entry: NativeDelegationEvent): string {
  const incoming = incomingDelegationFor(lineage.delegations, entry.event.session_id);
  if (incoming) return incoming.meta.childRunAs;
  const opened = lineage.rows.find(row => row.session_id === entry.event.session_id && row.event_type === "session/open");
  return opened ? (JSON.parse(opened.meta_json) as { agentId: string }).agentId : entry.meta.governedAs ?? "unknown";
}

/** One canonical payload builder for production minting and synchronous chain verification. */
export function nativeDelegationReceiptInput(lineage: ReturnType<typeof readDelegationLineage>, entry: NativeDelegationEvent): Omit<MintChainedReceiptInput, "privateKeyPem" | "workspace"> {
  const completed = entry.event.event_type === "agent_delegation_completed";
  const parent = completed ? delegationStartFor(lineage.delegations, entry) : incomingDelegationFor(lineage.delegations, entry.event.session_id);
  if (completed && !parent) throw new Error("Delegation lineage completion has no matching start");
  const event = entry.event;
  return { receiptId: nativeDelegationReceiptId(event.id), kind: completed ? "tool_result" : "tool_action", ts: event.ts,
    agentId: completed ? entry.meta.childRunAs : delegatingAgentFor(lineage, entry), providerId: "amc-native-delegation", model: null,
    eventHash: event.event_hash, bodySha256: event.payload_sha256, sessionId: completed ? entry.meta.childSessionId : event.session_id,
    parentReceiptId: parent ? nativeDelegationReceiptId(parent.event.id) : null };
}
