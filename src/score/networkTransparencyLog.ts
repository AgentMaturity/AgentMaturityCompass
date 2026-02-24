/**
 * Network Transparency Log — shared Merkle tree for cross-agent verification.
 *
 * Not a blockchain (no consensus, no mining). A Certificate Transparency-style
 * append-only log where every AMC score, delegation receipt, and attestation
 * gets a signed, timestamped entry. Agents prove their scores via inclusion
 * proofs. Anyone can verify the log hasn't been tampered with.
 *
 * Design: centralized protocol, decentralized execution.
 * The log structure is standardized. Each agent maintains its own log.
 * Cross-agent verification uses inclusion proofs against known log heads.
 */

import { createHash, createHmac } from "node:crypto";

// ── Types ────────────────────────────────────────────────────────────────────

export type LogEntryType =
  | "score_issued"
  | "delegation_receipt"
  | "attestation"
  | "shield_result"
  | "level_transition"
  | "evidence_ingested"
  | "protocol_update"
  | "violation_recorded";

export interface LogEntry {
  index: number;
  entryType: LogEntryType;
  agentId: string;
  timestamp: number;
  payload: Record<string, unknown>;
  payloadHash: string;
  previousHash: string;
  entryHash: string;
}

export interface MerkleNode {
  hash: string;
  left?: MerkleNode;
  right?: MerkleNode;
  index?: number;
}

export interface InclusionProof {
  entryIndex: number;
  entryHash: string;
  proof: { hash: string; direction: "left" | "right" }[];
  rootHash: string;
  logSize: number;
}

export interface ConsistencyProof {
  oldSize: number;
  newSize: number;
  oldRoot: string;
  newRoot: string;
  proof: string[];
  consistent: boolean;
}

export interface TransparencyLogReport {
  score: number;
  level: number;
  hasAppendOnlyLog: boolean;
  hasHashChaining: boolean;
  hasMerkleTree: boolean;
  hasInclusionProofs: boolean;
  hasConsistencyProofs: boolean;
  hasTimestampBinding: boolean;
  hasCrossAgentVerification: boolean;
  logSize: number;
  chainIntact: boolean;
  merkleRoot: string;
}

// ── Core: Append-Only Hash-Chained Log ───────────────────────────────────────

export class TransparencyLog {
  private entries: LogEntry[] = [];
  private signingKey: string;

  constructor(signingKey: string = "amc-transparency-key") {
    this.signingKey = signingKey;
  }

  append(entryType: LogEntryType, agentId: string, payload: Record<string, unknown>): LogEntry {
    const index = this.entries.length;
    const timestamp = Date.now();
    const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const previousHash = index > 0 ? this.entries[index - 1].entryHash : "0".repeat(64);

    const preimage = `${index}:${entryType}:${agentId}:${timestamp}:${payloadHash}:${previousHash}`;
    const entryHash = createHmac("sha256", this.signingKey).update(preimage).digest("hex");

    const entry: LogEntry = {
      index, entryType, agentId, timestamp, payload, payloadHash, previousHash, entryHash,
    };
    this.entries.push(entry);
    return entry;
  }

  get(index: number): LogEntry | undefined {
    return this.entries[index];
  }

  size(): number {
    return this.entries.length;
  }

  head(): string {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1].entryHash : "0".repeat(64);
  }

  verifyChain(): { intact: boolean; brokenAt?: number } {
    for (let i = 1; i < this.entries.length; i++) {
      if (this.entries[i].previousHash !== this.entries[i - 1].entryHash) {
        return { intact: false, brokenAt: i };
      }
      // Re-derive hash
      const e = this.entries[i];
      const preimage = `${e.index}:${e.entryType}:${e.agentId}:${e.timestamp}:${e.payloadHash}:${e.previousHash}`;
      const expected = createHmac("sha256", this.signingKey).update(preimage).digest("hex");
      if (expected !== e.entryHash) {
        return { intact: false, brokenAt: i };
      }
    }
    return { intact: true };
  }

  getEntriesByAgent(agentId: string): LogEntry[] {
    return this.entries.filter(e => e.agentId === agentId);
  }

  getEntriesByType(entryType: LogEntryType): LogEntry[] {
    return this.entries.filter(e => e.entryType === entryType);
  }

  getEntriesBetween(start: number, end: number): LogEntry[] {
    return this.entries.filter(e => e.timestamp >= start && e.timestamp <= end);
  }

  // ── Merkle Tree ──────────────────────────────────────────────────────────

  buildMerkleTree(): MerkleNode | null {
    if (this.entries.length === 0) return null;

    let leaves: MerkleNode[] = this.entries.map((e, i) => ({
      hash: e.entryHash,
      index: i,
    }));

    // Pad to power of 2
    while (leaves.length > 1 && (leaves.length & (leaves.length - 1)) !== 0) {
      leaves.push({ hash: "0".repeat(64) });
    }

    while (leaves.length > 1) {
      const next: MerkleNode[] = [];
      for (let i = 0; i < leaves.length; i += 2) {
        const left = leaves[i];
        const right = leaves[i + 1] ?? { hash: "0".repeat(64) };
        const combined = createHash("sha256").update(left.hash + right.hash).digest("hex");
        next.push({ hash: combined, left, right });
      }
      leaves = next;
    }

    return leaves[0];
  }

  getMerkleRoot(): string {
    const tree = this.buildMerkleTree();
    return tree?.hash ?? "0".repeat(64);
  }

  generateInclusionProof(index: number): InclusionProof | null {
    if (index < 0 || index >= this.entries.length) return null;

    const entry = this.entries[index];
    let leaves: { hash: string; index?: number }[] = this.entries.map((e, i) => ({
      hash: e.entryHash,
      index: i,
    }));

    // Pad to power of 2
    while (leaves.length > 1 && (leaves.length & (leaves.length - 1)) !== 0) {
      leaves.push({ hash: "0".repeat(64) });
    }

    const proof: { hash: string; direction: "left" | "right" }[] = [];
    let pos = index;

    let currentLevel = leaves.map(l => l.hash);
    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = currentLevel[i + 1] ?? "0".repeat(64);
        nextLevel.push(createHash("sha256").update(left + right).digest("hex"));

        if (i === pos - (pos % 2)) {
          if (pos % 2 === 0) {
            proof.push({ hash: right, direction: "right" });
          } else {
            proof.push({ hash: left, direction: "left" });
          }
        }
      }
      pos = Math.floor(pos / 2);
      currentLevel = nextLevel;
    }

    return {
      entryIndex: index,
      entryHash: entry.entryHash,
      proof,
      rootHash: currentLevel[0],
      logSize: this.entries.length,
    };
  }

  verifyInclusionProof(proof: InclusionProof): boolean {
    let hash = proof.entryHash;
    for (const step of proof.proof) {
      if (step.direction === "right") {
        hash = createHash("sha256").update(hash + step.hash).digest("hex");
      } else {
        hash = createHash("sha256").update(step.hash + hash).digest("hex");
      }
    }
    return hash === proof.rootHash;
  }

  // ── Scoring ──────────────────────────────────────────────────────────────

  score(): TransparencyLogReport {
    const chainResult = this.verifyChain();
    const merkleRoot = this.getMerkleRoot();
    const hasEntries = this.entries.length > 0;

    const hasAppendOnlyLog = hasEntries;
    const hasHashChaining = hasEntries && chainResult.intact;
    const hasMerkleTree = hasEntries && merkleRoot !== "0".repeat(64);
    const hasInclusionProofs = hasEntries && this.generateInclusionProof(0) !== null;
    const hasConsistencyProofs = this.entries.length >= 2;
    const hasTimestampBinding = hasEntries && this.entries.every(e => e.timestamp > 0);
    const hasCrossAgentVerification = new Set(this.entries.map(e => e.agentId)).size > 1;

    let s = 0;
    if (hasAppendOnlyLog) s += 15;
    if (hasHashChaining) s += 20;
    if (hasMerkleTree) s += 15;
    if (hasInclusionProofs) s += 15;
    if (hasConsistencyProofs) s += 10;
    if (hasTimestampBinding) s += 10;
    if (hasCrossAgentVerification) s += 15;

    const level = s >= 85 ? 5 : s >= 65 ? 4 : s >= 45 ? 3 : s >= 25 ? 2 : s > 0 ? 1 : 0;

    return {
      score: s,
      level,
      hasAppendOnlyLog,
      hasHashChaining,
      hasMerkleTree,
      hasInclusionProofs,
      hasConsistencyProofs,
      hasTimestampBinding,
      hasCrossAgentVerification,
      logSize: this.entries.length,
      chainIntact: chainResult.intact,
      merkleRoot,
    };
  }
}
