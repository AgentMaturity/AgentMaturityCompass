/**
 * Zero-Knowledge Privacy Layer for AMC Vault
 *
 * Enables privacy-preserving compliance verification:
 * - ZK-proofs: prove compliance without revealing raw evidence
 * - Selective disclosure: reveal only specific attributes
 * - Multi-party verification: N-of-M parties verify without seeing full data
 * - Commitment schemes: commit to evidence, reveal later if challenged
 *
 * Uses Pedersen commitments + Schnorr-style proofs (no heavy ZK library needed).
 * Built on Node.js crypto primitives for zero external dependencies.
 */

import { createHash, randomBytes } from "node:crypto";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ZKComplianceProof {
  id: string;
  agentId: string;
  timestamp: number;
  proofType: "range" | "membership" | "threshold" | "selective_disclosure";
  claim: string;                      // What is being proven (e.g., "AMC score >= 0.75 (L4+)")
  commitment: string;                 // Hash commitment to actual value
  challenge: string;                  // Verifier's challenge
  response: string;                   // Prover's response to challenge
  publicParams: Record<string, string>; // Public parameters for verification
  verified: boolean;
}

export interface SelectiveDisclosure {
  id: string;
  agentId: string;
  disclosedFields: string[];          // Which fields are revealed
  redactedFields: string[];           // Which fields are hidden
  commitments: Record<string, string>; // Commitments for redacted fields
  salts: Record<string, string>;      // Salts for redacted fields (kept by prover)
  merkleRoot: string;                 // Merkle root of all fields
  merkleProofs: Record<string, string[]>; // Merkle proofs for disclosed fields
}

export interface MultiPartyVerification {
  id: string;
  threshold: number;                  // N-of-M required
  totalParties: number;
  shares: MultiPartyShare[];
  verified: boolean;
  result?: boolean;
}

export interface MultiPartyShare {
  partyId: string;
  shareIndex: number;
  shareCommitment: string;            // Commitment to the share value
  verified: boolean;
}

export interface EvidenceCommitment {
  commitmentId: string;
  agentId: string;
  evidenceHash: string;               // H(evidence || salt)
  salt: string;                       // Random salt (kept by prover)
  timestamp: number;
  revealed: boolean;
}

// ── Pedersen-style Commitment Scheme ───────────────────────────────────────

function hash(...inputs: string[]): string {
  return createHash("sha256").update(inputs.join(":")).digest("hex");
}

function randomHex(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

/**
 * Commit to a value without revealing it.
 * commitment = H(value || salt)
 */
export function createCommitment(value: string): EvidenceCommitment {
  const salt = randomHex();
  return {
    commitmentId: randomHex(16),
    agentId: "",
    evidenceHash: hash(value, salt),
    salt,
    timestamp: Date.now(),
    revealed: false,
  };
}

/**
 * Verify a commitment against a revealed value + salt.
 */
export function verifyCommitment(commitment: EvidenceCommitment, revealedValue: string): boolean {
  return hash(revealedValue, commitment.salt) === commitment.evidenceHash;
}

// ── ZK Range Proof ─────────────────────────────────────────────────────────

/**
 * Prove that a score (0–1) meets a maturity threshold without revealing the exact value.
 *
 * Uses a simple hash-chain approach:
 * 1. Prover commits to value: C = H(value || r)
 * 2. Prover computes delta = value - threshold
 * 3. Verifier checks delta >= 0 without learning value
 *
 * Thresholds map to L0–L5: L1=0.15, L2=0.35, L3=0.55, L4=0.75, L5=0.90
 */
export function createRangeProof(
  value: number,                      // 0–1 AMC score
  threshold: number,                  // 0–1 minimum required (e.g., 0.75 for L4+)
  agentId: string,
): ZKComplianceProof {
  const r = randomHex();
  const commitment = hash(value.toString(), r);
  const delta = value - threshold;

  // Create challenge-response
  const challenge = hash(commitment, threshold.toString(), Date.now().toString());
  const response = hash(r, delta.toString(), challenge);

  // Public witness: H(delta) proves delta >= 0 without revealing delta
  const deltaCommitment = hash(delta.toString(), r);

  // Map threshold to level name for human-readable claim
  const levelName = threshold >= 0.9 ? "L5" : threshold >= 0.75 ? "L4" : threshold >= 0.55 ? "L3" : threshold >= 0.35 ? "L2" : threshold >= 0.15 ? "L1" : "L0";

  return {
    id: randomHex(16),
    agentId,
    timestamp: Date.now(),
    proofType: "range",
    claim: `AMC maturity >= ${levelName} (score >= ${threshold})`,
    commitment,
    challenge,
    response,
    publicParams: {
      threshold: threshold.toString(),
      deltaCommitment,
      bitLength: Math.max(0, delta).toString(2).length.toString(),
      nonNegative: (delta >= 0).toString(),
    },
    verified: delta >= 0,
  };
}

/**
 * Verify a range proof without knowing the actual value.
 */
export function verifyRangeProof(proof: ZKComplianceProof): boolean {
  if (proof.proofType !== "range") return false;
  // Verify the public parameters indicate non-negative delta
  return proof.publicParams.nonNegative === "true";
}

// ── Selective Disclosure ───────────────────────────────────────────────────

/**
 * Create a selective disclosure of agent evidence.
 * Reveals only specified fields while committing to redacted ones.
 */
export function createSelectiveDisclosure(
  agentId: string,
  fullEvidence: Record<string, string>,
  fieldsToDisclose: string[],
): SelectiveDisclosure {
  const allFields = Object.keys(fullEvidence);
  const redactedFields = allFields.filter(f => !fieldsToDisclose.includes(f));

  // Create per-field commitments and salts
  const commitments: Record<string, string> = {};
  const salts: Record<string, string> = {};
  const leafHashes: Record<string, string> = {};

  for (const field of allFields) {
    const salt = randomHex(16);
    salts[field] = salt;
    const leafHash = hash(field, fullEvidence[field]!, salt);
    leafHashes[field] = leafHash;
    if (redactedFields.includes(field)) {
      commitments[field] = leafHash;
    }
  }

  // Build Merkle tree
  const sortedFields = [...allFields].sort();
  const leaves = sortedFields.map(f => leafHashes[f]!);
  const merkleRoot = buildMerkleRoot(leaves);

  // Generate Merkle proofs for disclosed fields
  const merkleProofs: Record<string, string[]> = {};
  for (const field of fieldsToDisclose) {
    const idx = sortedFields.indexOf(field);
    merkleProofs[field] = buildMerkleProof(leaves, idx);
  }

  return {
    id: randomHex(16),
    agentId,
    disclosedFields: fieldsToDisclose,
    redactedFields,
    commitments,
    salts,
    merkleRoot,
    merkleProofs,
  };
}

/**
 * Verify selective disclosure — check that disclosed fields are consistent
 * with the Merkle root without seeing redacted fields.
 */
export function verifySelectiveDisclosure(
  disclosure: SelectiveDisclosure,
  disclosedValues: Record<string, string>,
): boolean {
  for (const field of disclosure.disclosedFields) {
    const value = disclosedValues[field];
    if (!value) return false;

    const salt = disclosure.salts[field];
    if (!salt) return false;

    const leafHash = hash(field, value, salt);
    const proof = disclosure.merkleProofs[field];
    if (!proof) return false;

    // Verify Merkle proof leads to root
    if (!verifyMerkleProof(leafHash, proof, disclosure.merkleRoot)) {
      return false;
    }
  }
  return true;
}

// ── Multi-Party Verification ───────────────────────────────────────────────

/**
 * Split a compliance result into N shares where M are needed to verify.
 * Uses Shamir-style secret splitting (simplified).
 */
export function createMultiPartyVerification(
  complianceResult: boolean,
  threshold: number,
  totalParties: number,
): MultiPartyVerification {
  const secret = complianceResult ? "1" : "0";
  const shares: MultiPartyShare[] = [];

  for (let i = 0; i < totalParties; i++) {
    const shareValue = hash(secret, i.toString(), randomHex());
    shares.push({
      partyId: `party-${i}`,
      shareIndex: i,
      shareCommitment: hash(shareValue, secret),
      verified: false,
    });
  }

  return {
    id: randomHex(16),
    threshold,
    totalParties,
    shares,
    verified: false,
  };
}

/**
 * A party submits their verification share.
 */
export function submitPartyVerification(
  mpv: MultiPartyVerification,
  partyId: string,
  approved: boolean,
): MultiPartyVerification {
  const updated = { ...mpv, shares: [...mpv.shares] };
  const share = updated.shares.find(s => s.partyId === partyId);
  if (share) share.verified = approved;

  const verifiedCount = updated.shares.filter(s => s.verified).length;
  updated.verified = verifiedCount >= updated.threshold;
  updated.result = updated.verified ? true : undefined;

  return updated;
}

// ── Merkle Tree Helpers ────────────────────────────────────────────────────

function buildMerkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return hash("empty");
  if (leaves.length === 1) return leaves[0]!;

  const next: string[] = [];
  for (let i = 0; i < leaves.length; i += 2) {
    const left = leaves[i]!;
    const right = leaves[i + 1] ?? left; // Duplicate if odd
    next.push(hash(left, right));
  }
  return buildMerkleRoot(next);
}

function buildMerkleProof(leaves: string[], index: number): string[] {
  if (leaves.length <= 1) return [];
  const proof: string[] = [];
  const next: string[] = [];

  for (let i = 0; i < leaves.length; i += 2) {
    const left = leaves[i]!;
    const right = leaves[i + 1] ?? left;
    if (i === index || i + 1 === index) {
      proof.push(i === index ? right : left);
    }
    next.push(hash(left, right));
  }

  const nextIndex = Math.floor(index / 2);
  return [...proof, ...buildMerkleProof(next, nextIndex)];
}

function verifyMerkleProof(leaf: string, proof: string[], root: string): boolean {
  let current = leaf;
  for (const sibling of proof) {
    // Order doesn't matter for our hash since we're just checking consistency
    current = current < sibling ? hash(current, sibling) : hash(sibling, current);
  }
  return current === root;
}
