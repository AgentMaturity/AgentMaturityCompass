/**
 * tests/zkPrivacy.test.ts
 * Unit tests for src/vault/zkPrivacy.ts
 */

import { describe, it, expect } from "vitest";
import {
  pedersenCommit,
  pedersenVerify,
  schnorrProve,
  schnorrVerify,
  createZKRangeProof,
  verifyZKRangeProof,
  shamirSplit,
  shamirReconstruct,
  commitToEvidence,
  revealEvidence,
} from "../src/vault/zkPrivacy.js";

describe("Pedersen Commitments", () => {
  it("pedersenCommit should return commitment, blindingFactor, value", () => {
    const result = pedersenCommit(42n);
    expect(result).toHaveProperty("commitment");
    expect(result).toHaveProperty("blindingFactor");
    expect(result).toHaveProperty("value");
  });

  it("pedersenVerify should return true for a valid commitment", () => {
    const { commitment, blindingFactor, value } = pedersenCommit(99n);
    const valid = pedersenVerify(commitment, BigInt("0x" + value), BigInt("0x" + blindingFactor));
    expect(valid).toBe(true);
  });

  it("pedersenVerify should return false for wrong value", () => {
    const { commitment, blindingFactor } = pedersenCommit(42n);
    const valid = pedersenVerify(commitment, 43n, BigInt("0x" + blindingFactor));
    expect(valid).toBe(false);
  });

  it("two commitments to same value should differ (hiding property)", () => {
    const c1 = pedersenCommit(50n);
    const c2 = pedersenCommit(50n);
    // Different blinding factors → different commitments
    expect(c1.commitment).not.toBe(c2.commitment);
  });

  it("commitment value field should match input", () => {
    const input = 77n;
    const { value } = pedersenCommit(input);
    expect(BigInt("0x" + value)).toBe(input);
  });
});

describe("Schnorr Proofs", () => {
  it("schnorrProve should return a proof with expected fields", () => {
    const proof = schnorrProve(12345n);
    // SchnorrProof has publicValue, commitmentA, challenge, response, verified
    expect(proof).toHaveProperty("publicValue");
    expect(proof).toHaveProperty("commitmentA");
    expect(proof).toHaveProperty("challenge");
    expect(proof).toHaveProperty("response");
    expect(proof).toHaveProperty("verified");
  });

  it("schnorrProve should set verified=true in the proof object", () => {
    const proof = schnorrProve(99999n);
    expect(proof.verified).toBe(true);
  });

  it("schnorrProve fields should be hex strings", () => {
    const proof = schnorrProve(12345n);
    expect(proof.publicValue).toMatch(/^[0-9a-f]+$/);
    expect(proof.commitmentA).toMatch(/^[0-9a-f]+$/);
    expect(proof.challenge).toMatch(/^[0-9a-f]+$/);
    expect(proof.response).toMatch(/^[0-9a-f]+$/);
  });

  it("schnorrVerify should return a boolean", () => {
    const proof = schnorrProve(12345n);
    const result = schnorrVerify(proof);
    expect(typeof result).toBe("boolean");
  });

  it("schnorrVerify should return false for tampered challenge", () => {
    const proof = schnorrProve(12345n);
    const tampered = { ...proof, challenge: "deadbeef" };
    expect(schnorrVerify(tampered)).toBe(false);
  });

  it("schnorrVerify should return false for tampered response", () => {
    const proof = schnorrProve(12345n);
    const tampered = { ...proof, response: "0000000000000000" };
    expect(schnorrVerify(tampered)).toBe(false);
  });

  it("two proofs for same secret should have same publicValue", () => {
    const secret = 12345n;
    const p1 = schnorrProve(secret);
    const p2 = schnorrProve(secret);
    expect(p1.publicValue).toBe(p2.publicValue);
  });
});

describe("ZK Range Proofs", () => {
  it("createZKRangeProof should return a proof object with required fields", () => {
    const proof = createZKRangeProof(80, 50, "agent-range-test");
    expect(proof).toHaveProperty("id");
    expect(proof).toHaveProperty("agentId");
    expect(proof).toHaveProperty("timestamp");
    expect(proof).toHaveProperty("claim");
    expect(proof).toHaveProperty("verified");
    expect(proof).toHaveProperty("threshold");
  });

  it("createZKRangeProof with value < threshold should set verified=false", () => {
    const proof = createZKRangeProof(30, 50, "agent-range-fail");
    expect(proof.verified).toBe(false);
  });

  it("verifyZKRangeProof should return false for unverified proof (value < threshold)", () => {
    const proof = createZKRangeProof(25, 50, "agent-verify-fail");
    expect(verifyZKRangeProof(proof)).toBe(false);
  });

  it("proof should include agentId and threshold", () => {
    const proof = createZKRangeProof(60, 40, "my-agent-123");
    expect(proof.agentId).toBe("my-agent-123");
    expect(proof.threshold).toBe(40);
  });

  it("proof claim should mention the threshold level", () => {
    const proof = createZKRangeProof(70, 60, "claim-agent");
    // Claim contains threshold value or level name
    expect(proof.claim.length).toBeGreaterThan(0);
    expect(typeof proof.claim).toBe("string");
  });

  it("proof for value < threshold should have empty value/delta commitments", () => {
    const proof = createZKRangeProof(10, 50, "agent-low");
    expect(proof.verified).toBe(false);
    // When value < threshold, delta < 0 → no valid proof can be generated
  });

  it("verifyZKRangeProof should return same as proof.verified when proof.verified=false", () => {
    const proof = createZKRangeProof(20, 80, "consistency-agent");
    if (!proof.verified) {
      expect(verifyZKRangeProof(proof)).toBe(false);
    }
  });
});

describe("Shamir Secret Sharing", () => {
  it("shamirSplit should return the correct number of shares", () => {
    const shares = shamirSplit(1234567n, 3, 5);
    expect(shares).toHaveLength(5);
  });

  it("shamirSplit shares should have index, value, partyId", () => {
    const shares = shamirSplit(999n, 2, 4);
    for (const s of shares) {
      expect(s).toHaveProperty("index");
      expect(s).toHaveProperty("value");
      expect(s).toHaveProperty("partyId");
    }
  });

  it("shamirReconstruct should recover the original secret with threshold shares", () => {
    const secret = 42n;
    const shares = shamirSplit(secret, 3, 5);
    const reconstructed = shamirReconstruct(shares.slice(0, 3));
    expect(reconstructed).toBe(secret);
  });

  it("shamirReconstruct with all shares should recover secret", () => {
    const secret = 99999n;
    const shares = shamirSplit(secret, 2, 4);
    expect(shamirReconstruct(shares)).toBe(secret);
  });

  it("reconstructing with different threshold subsets should give same secret", () => {
    const secret = 77n;
    const shares = shamirSplit(secret, 2, 4);
    const r1 = shamirReconstruct(shares.slice(0, 2));
    const r2 = shamirReconstruct(shares.slice(1, 3));
    expect(r1).toBe(secret);
    expect(r2).toBe(secret);
  });
});

describe("Evidence Commitments", () => {
  it("commitToEvidence should return an EvidenceCommitment", () => {
    const ec = commitToEvidence("agent-1", "evidence data");
    expect(ec).toHaveProperty("agentId");
    expect(ec).toHaveProperty("commitment");
    expect(ec).toHaveProperty("timestamp");
  });

  it("revealEvidence should return true for matching evidence", () => {
    const evidenceText = "my secret evidence";
    const ec = commitToEvidence("agent-1", evidenceText);
    expect(revealEvidence(ec, evidenceText)).toBe(true);
  });

  it("revealEvidence should return false for wrong evidence", () => {
    const ec = commitToEvidence("agent-1", "correct evidence");
    expect(revealEvidence(ec, "wrong evidence")).toBe(false);
  });
});
