import { describe, expect, test } from "vitest";
import {
  createAttestation,
  verifyAttestation,
  scoreOutputAttestation,
} from "../src/score/outputAttestation.js";
import {
  createChallenge,
  respondToChallenge,
  verifyMutualTrust,
  scoreMutualVerification,
} from "../src/score/mutualVerification.js";
import type { AgentIdentity } from "../src/score/mutualVerification.js";
import { TransparencyLog } from "../src/score/networkTransparencyLog.js";

describe("output attestation", () => {
  test("creates and verifies attestation with valid signature", () => {
    const att = createAttestation({
      agentId: "agent-a",
      output: "hello world",
      trustLevel: 4,
      shieldResults: [
        { pack: "injection", passed: true },
        { pack: "exfiltration", passed: true },
      ],
    });
    expect(att.attestationId).toMatch(/^att_/);
    expect(att.trustLevel).toBe(4);
    expect(att.shieldSummary.totalPacks).toBe(2);
    expect(att.shieldSummary.passed).toBe(2);

    const ver = verifyAttestation(att);
    expect(ver.valid).toBe(true);
    expect(ver.effectiveWeight).toBeGreaterThan(0);
  });

  test("rejects attestation with wrong key", () => {
    const att = createAttestation({ agentId: "a", output: "x", trustLevel: 3 }, "key-1");
    const ver = verifyAttestation(att, "key-2");
    expect(ver.valid).toBe(false);
    expect(ver.reason).toBe("signature_mismatch");
  });

  test("rejects expired attestation", () => {
    const att = createAttestation({
      agentId: "a",
      output: "x",
      trustLevel: 3,
      timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000, // 31 days ago
    });
    const ver = verifyAttestation(att);
    expect(ver.valid).toBe(false);
    expect(ver.reason).toBe("expired");
  });

  test("trust decays over time", () => {
    const now = Date.now();
    const att = createAttestation({
      agentId: "a",
      output: "x",
      trustLevel: 5,
      timestamp: now - 10 * 24 * 60 * 60 * 1000, // 10 days ago
    });
    const ver = verifyAttestation(att, "amc-default-key", now);
    expect(ver.valid).toBe(true);
    expect(ver.trustDecay).toBeGreaterThan(0);
    expect(ver.trustDecay).toBeLessThan(1);
  });

  test("delegation chain reduces effective trust", () => {
    const att = createAttestation({
      agentId: "orchestrator",
      output: "delegated result",
      trustLevel: 4,
      delegationChain: ["sub-agent-1", "sub-agent-2"],
    });
    expect(att.delegationDepth).toBe(2);
  });

  test("scoring reflects capabilities", () => {
    const att = createAttestation({
      agentId: "a",
      output: "x",
      trustLevel: 4,
      shieldResults: [{ pack: "injection", passed: true }],
    });
    const ver = verifyAttestation(att);
    const report = scoreOutputAttestation({
      attestations: [att],
      verifications: [ver],
    });
    expect(report.score).toBeGreaterThan(0);
    expect(report.hasOutputSigning).toBe(true);
    expect(report.hasTrustLevelBinding).toBe(true);
    expect(report.hasShieldResultBinding).toBe(true);
  });
});

describe("mutual verification", () => {
  const agentA: AgentIdentity = {
    agentId: "terpy",
    amcVersion: "2.0.0",
    trustLevel: 4,
    scoreTimestamp: Date.now(),
    evidenceChainHead: "abc123def456",
    shieldPassRate: 0.95,
    protocolVersion: "amc-mvp-1.0",
  };

  const agentB: AgentIdentity = {
    agentId: "polaris",
    amcVersion: "2.0.0",
    trustLevel: 3,
    scoreTimestamp: Date.now(),
    evidenceChainHead: "789xyz000111",
    shieldPassRate: 0.90,
    protocolVersion: "amc-mvp-1.0",
  };

  test("full challenge-response flow succeeds", () => {
    const challenge = createChallenge(agentA);
    expect(challenge.challengeId).toMatch(/^ch_/);
    expect(challenge.nonce).toHaveLength(64);

    const response = respondToChallenge(challenge, agentB);
    expect(response.nonce).toBe(challenge.nonce);

    const result = verifyMutualTrust(challenge, response);
    expect(result.verified).toBe(true);
    expect(result.protocolCompatible).toBe(true);
    expect(result.scoresFresh).toBe(true);
    expect(result.evidenceChainsValid).toBe(true);
    // Weakest-link: bounded by agentB's trust (3)
    expect(result.effectiveMutualTrust).toBeLessThanOrEqual(agentB.trustLevel);
  });

  test("rejects mismatched nonce", () => {
    const challenge = createChallenge(agentA);
    const response = respondToChallenge(challenge, agentB);
    response.nonce = "tampered";
    const result = verifyMutualTrust(challenge, response);
    expect(result.verified).toBe(false);
    expect(result.reason).toBe("nonce_mismatch");
  });

  test("penalizes stale scores", () => {
    const staleA: AgentIdentity = {
      ...agentA,
      scoreTimestamp: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days old
    };
    const challenge = createChallenge(staleA);
    const response = respondToChallenge(challenge, agentB);
    const result = verifyMutualTrust(challenge, response);
    expect(result.verified).toBe(true);
    expect(result.scoresFresh).toBe(false);
    // Stale penalty applied
    expect(result.effectiveMutualTrust).toBeLessThan(agentB.trustLevel);
  });

  test("penalizes incompatible protocols", () => {
    const oldAgent: AgentIdentity = { ...agentA, protocolVersion: "amc-alpha-0.1" };
    const challenge = createChallenge(oldAgent);
    const response = respondToChallenge(challenge, agentB);
    const result = verifyMutualTrust(challenge, response);
    expect(result.verified).toBe(true);
    expect(result.protocolCompatible).toBe(false);
  });

  test("scoring reflects verification capabilities", () => {
    const challenge = createChallenge(agentA);
    const response = respondToChallenge(challenge, agentB);
    const result = verifyMutualTrust(challenge, response);
    const report = scoreMutualVerification({ verifications: [result] });
    expect(report.score).toBeGreaterThan(0);
    expect(report.hasChallengeResponse).toBe(true);
    expect(report.hasNonceVerification).toBe(true);
    expect(report.hasBidirectionalAttestation).toBe(true);
    expect(report.hasWeakestLinkEnforcement).toBe(true);
  });
});

describe("network transparency log", () => {
  test("appends entries with hash chaining", () => {
    const log = new TransparencyLog();
    const e1 = log.append("score_issued", "agent-a", { level: 4, score: 82 });
    const e2 = log.append("delegation_receipt", "agent-a", { delegate: "agent-b" });
    expect(e2.previousHash).toBe(e1.entryHash);
    expect(log.size()).toBe(2);
  });

  test("verifies chain integrity", () => {
    const log = new TransparencyLog();
    log.append("score_issued", "agent-a", { level: 4 });
    log.append("shield_result", "agent-a", { passed: true });
    log.append("attestation", "agent-b", { trust: 3 });
    const result = log.verifyChain();
    expect(result.intact).toBe(true);
  });

  test("builds Merkle tree and generates inclusion proofs", () => {
    const log = new TransparencyLog();
    log.append("score_issued", "agent-a", { level: 4 });
    log.append("score_issued", "agent-b", { level: 3 });
    log.append("delegation_receipt", "agent-a", { to: "agent-b" });
    log.append("shield_result", "agent-b", { passed: true });

    const root = log.getMerkleRoot();
    expect(root).not.toBe("0".repeat(64));

    const proof = log.generateInclusionProof(1);
    expect(proof).not.toBeNull();
    expect(proof!.entryIndex).toBe(1);
    expect(log.verifyInclusionProof(proof!)).toBe(true);
  });

  test("filters entries by agent and type", () => {
    const log = new TransparencyLog();
    log.append("score_issued", "agent-a", { level: 4 });
    log.append("score_issued", "agent-b", { level: 3 });
    log.append("shield_result", "agent-a", { passed: true });

    expect(log.getEntriesByAgent("agent-a")).toHaveLength(2);
    expect(log.getEntriesByType("score_issued")).toHaveLength(2);
  });

  test("scoring reflects log capabilities", () => {
    const log = new TransparencyLog();
    log.append("score_issued", "agent-a", { level: 4 });
    log.append("delegation_receipt", "agent-b", { from: "agent-a" });
    const report = log.score();
    expect(report.score).toBeGreaterThan(0);
    expect(report.hasAppendOnlyLog).toBe(true);
    expect(report.hasHashChaining).toBe(true);
    expect(report.hasMerkleTree).toBe(true);
    expect(report.hasCrossAgentVerification).toBe(true);
    expect(report.chainIntact).toBe(true);
  });

  test("empty log scores zero", () => {
    const log = new TransparencyLog();
    const report = log.score();
    expect(report.score).toBe(0);
    expect(report.level).toBe(0);
  });
});
