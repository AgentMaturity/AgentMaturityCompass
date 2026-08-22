/**
 * Cross-Agent Receipt Chaining
 *
 * Extends receipts with delegation chains for cross-agent accountability.
 * Adds parentReceiptId and delegationChain fields.
 */

import { randomUUID, sign, verify } from "node:crypto";
import { join } from "node:path";
import { readdirSync } from "node:fs";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { ReceiptPayloadV1, ReceiptKind } from "./receipt.js";
import { parseReceipt, verifyReceipt } from "./receipt.js";

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
export function registerChainedReceipt(
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
  const inMemory = receiptStore.get(receiptId);
  if (inMemory) return inMemory;
  if (!workspace) return null;
  const path = chainPath(workspace, receiptId);
  if (!pathExists(path)) return null;
  try {
    const receipt = readUtf8(path).trim();
    // Decoded from the signed bytes, never from a separately stored copy.
    const payload = parseReceipt(receipt).payload as ChainedReceiptPayloadV1;
    if (payload.receipt_id !== receiptId) return null;
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

/**
 * Mint a receipt that carries delegation chain info.
 */
export function mintChainedReceipt(input: MintChainedReceiptInput): {
  payload: ChainedReceiptPayloadV1;
  receipt: string;
  receiptSha256: string;
} {
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

  const payload: ChainedReceiptPayloadV1 = {
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

  const payloadBytes = Buffer.from(canonicalize(payload), "utf8");
  const signatureBytes = sign(null, payloadBytes, input.privateKeyPem);
  const receipt = `${toBase64Url(payloadBytes)}.${toBase64Url(signatureBytes)}`;
  const receiptSha256 = sha256Hex(Buffer.from(receipt, "utf8"));

  // Auto-register in store
  registerChainedReceipt(receiptId, receipt, payload, input.workspace);

  return { payload, receipt, receiptSha256 };
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

    // Verify signature
    const verification = verifyReceipt(stored.receipt, publicKeysPem);
    if (!verification.ok) {
      errors.push(`Receipt ${currentId}: ${verification.error ?? "signature verification failed"}`);
    }

    entries.unshift({
      receiptId: stored.payload.receipt_id,
      agentId: stored.payload.agentId,
      kind: stored.payload.kind,
      ts: stored.payload.ts,
      parentReceiptId: stored.payload.parent_receipt_id,
    });

    currentId = stored.payload.parent_receipt_id;
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
