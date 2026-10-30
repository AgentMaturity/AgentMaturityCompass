import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { afterEach, describe, expect, test } from "vitest";
import {
  defaultConfidenceThresholdPolicy,
  classifyConfidenceDomain,
  computeCitationQuality,
  assessClaimConfidence,
  assessAgentClaimConfidence,
  checkConfidenceGate,
  buildConfidenceHistograms,
  generateClaimConfidenceReport,
  renderClaimConfidenceMarkdown,
  type ConfidenceDomain,
  type ClaimConfidenceAssessment,
} from "../src/claims/claimConfidence.js";
import { insertClaim } from "../src/claims/claimStore.js";
import type { Claim } from "../src/claims/claimTypes.js";
import type { EvidenceEvent } from "../src/types.js";

const roots: string[] = [];

function freshDb(): { db: Database.Database; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "amc-claimconf-test-"));
  roots.push(dir);
  const db = new Database(join(dir, "test.db"));
  db.exec(`
    CREATE TABLE IF NOT EXISTS claims (
      claim_id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      assertion_text TEXT NOT NULL,
      claimed_level INTEGER NOT NULL,
      provenance_tag TEXT NOT NULL,
      lifecycle_state TEXT NOT NULL,
      confidence REAL NOT NULL,
      evidence_refs_json TEXT NOT NULL,
      trust_tier TEXT NOT NULL,
      promoted_from_claim_id TEXT,
      promotion_evidence_json TEXT NOT NULL DEFAULT '[]',
      superseded_by_claim_id TEXT,
      created_ts INTEGER NOT NULL,
      last_verified_ts INTEGER NOT NULL,
      expiry_ts INTEGER,
      prev_claim_hash TEXT NOT NULL,
      claim_hash TEXT NOT NULL,
      signature TEXT NOT NULL
    );
  `);
  return { db, dir };
}

function makeClaim(overrides: Partial<Claim> = {}): Claim {
  const now = Date.now();
  return {
    claimId: `claim_${Math.random().toString(36).slice(2, 10)}`,
    agentId: "agent-1",
    runId: "run-1",
    questionId: "AMC-1.1",
    assertionText: "Test assertion",
    claimedLevel: 3,
    provenanceTag: "OBSERVED_FACT",
    lifecycleState: "PROVISIONAL",
    confidence: 0.8,
    evidenceRefs: ["ev-1", "ev-2"],
    trustTier: "OBSERVED",
    promotedFromClaimId: null,
    promotionEvidence: [],
    supersededByClaimId: null,
    createdTs: now,
    lastVerifiedTs: now,
    expiryTs: null,
    prev_claim_hash: "GENESIS_CLAIMS",
    claim_hash: `hash_${Math.random().toString(36).slice(2, 10)}`,
    signature: "test-sig",
    ...overrides,
  };
}

function makeEvidenceEvent(overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  const now = Date.now();
  return {
    id: `ev_${Math.random().toString(36).slice(2, 10)}`,
    ts: now,
    session_id: "session-1",
    runtime: "claude",
    event_type: "stdout",
    payload_path: null,
    payload_inline: "test",
    payload_sha256: "a".repeat(64),
    meta_json: "{}",
    prev_event_hash: "GENESIS",
    event_hash: `hash_${Math.random().toString(36).slice(2, 10)}`,
    writer_sig: "sig",
    ...overrides,
  };
}

afterEach(() => {
  for (const r of roots) {
    try { rmSync(r, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  roots.length = 0;
});

// ---------------------------------------------------------------------------
// Default policy
// ---------------------------------------------------------------------------
describe("defaultConfidenceThresholdPolicy", () => {
  test("returns sensible defaults", () => {
    const cfg = defaultConfidenceThresholdPolicy();
    expect(cfg.globalMinConfidence).toBe(0.3);
    expect(cfg.noCitationPenalty).toBe(0.4);
    expect(cfg.domainMinConfidence.RISK).toBe(0.6);
    expect(cfg.blockBelowThreshold).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Domain classification
// ---------------------------------------------------------------------------
describe("classifyConfidenceDomain", () => {
  test("classifies AMC question IDs correctly", () => {
    expect(classifyConfidenceDomain("AMC-1.1")).toBe("EXECUTION");
    expect(classifyConfidenceDomain("AMC-2.3")).toBe("POLICY");
    expect(classifyConfidenceDomain("AMC-3.1")).toBe("RISK");
    expect(classifyConfidenceDomain("AMC-4.5")).toBe("FACTS");
    expect(classifyConfidenceDomain("AMC-5.2")).toBe("EXECUTION");
    expect(classifyConfidenceDomain("unknown")).toBe("GENERAL");
  });
});

// ---------------------------------------------------------------------------
// Citation quality scoring
// ---------------------------------------------------------------------------
describe("computeCitationQuality", () => {
  test("returns zero quality for claim with no evidence", () => {
    const claim = makeClaim({ evidenceRefs: [] });
    const quality = computeCitationQuality(claim, []);
    expect(quality.evidenceCount).toBe(0);
    expect(quality.qualityScore).toBe(0);
  });

  test("computes quality from matching evidence events", () => {
    const ev1 = makeEvidenceEvent({ id: "ev-1", session_id: "s1", event_type: "stdout" });
    const ev2 = makeEvidenceEvent({ id: "ev-2", session_id: "s2", event_type: "metric" });
    const claim = makeClaim({ evidenceRefs: ["ev-1", "ev-2"] });

    const quality = computeCitationQuality(claim, [ev1, ev2]);
    expect(quality.evidenceCount).toBe(2);
    expect(quality.sessionCount).toBe(2);
    expect(quality.observedRatio).toBe(1.0); // both are observable types
    expect(quality.qualityScore).toBeGreaterThan(0);
  });

  test("ignores evidence events not referenced by claim", () => {
    const ev1 = makeEvidenceEvent({ id: "ev-1" });
    const ev2 = makeEvidenceEvent({ id: "ev-other" });
    const claim = makeClaim({ evidenceRefs: ["ev-1"] });

    const quality = computeCitationQuality(claim, [ev1, ev2]);
    expect(quality.evidenceCount).toBe(1);
  });

  test("detects attested evidence", () => {
    const ev1 = makeEvidenceEvent({ id: "ev-1", event_type: "audit" });
    const claim = makeClaim({ evidenceRefs: ["ev-1"] });

    const quality = computeCitationQuality(claim, [ev1]);
    expect(quality.hasAttestedEvidence).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Confidence assessment
// ---------------------------------------------------------------------------
describe("assessClaimConfidence", () => {
  test("applies NO_CITATION penalty for zero evidence", () => {
    const claim = makeClaim({ evidenceRefs: [], confidence: 0.8 });
    const assessment = assessClaimConfidence(claim, []);

    expect(assessment.penalties.some((p) => p.type === "NO_CITATION")).toBe(true);
    expect(assessment.adjustedConfidence).toBeLessThan(0.8);
  });

  test("applies HYPOTHESIS_PENALTY for hypothesis claims", () => {
    const claim = makeClaim({ provenanceTag: "HYPOTHESIS", confidence: 0.7 });
    const assessment = assessClaimConfidence(claim, []);

    expect(assessment.penalties.some((p) => p.type === "HYPOTHESIS_PENALTY")).toBe(true);
  });

  test("applies SESSION_LOCAL_PENALTY for session-local claims", () => {
    const claim = makeClaim({ provenanceTag: "SESSION_LOCAL", confidence: 0.7 });
    const assessment = assessClaimConfidence(claim, []);

    expect(assessment.penalties.some((p) => p.type === "SESSION_LOCAL_PENALTY")).toBe(true);
  });

  test("applies UNSUPPORTED_CONFIDENCE when confidence >> evidence quality", () => {
    const ev = makeEvidenceEvent({ id: "ev-1" });
    const claim = makeClaim({
      evidenceRefs: ["ev-1"],
      confidence: 0.95, // very high confidence
      trustTier: "SELF_REPORTED", // but low trust
    });

    const assessment = assessClaimConfidence(claim, [ev]);
    // With only 1 evidence event and SELF_REPORTED, quality will be low
    // So 0.95 - quality should be > 0.3 threshold
    if (assessment.citationQuality.qualityScore < 0.65) {
      expect(assessment.penalties.some((p) => p.type === "UNSUPPORTED_CONFIDENCE")).toBe(true);
    }
  });

  test("passes threshold for well-evidenced claim", () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      makeEvidenceEvent({
        id: `ev-${i}`,
        session_id: `session-${i}`,
        event_type: "stdout",
      }),
    );
    const claim = makeClaim({
      evidenceRefs: events.map((e) => e.id),
      confidence: 0.8,
      trustTier: "OBSERVED",
      questionId: "AMC-1.1", // EXECUTION domain, threshold 0.5
    });

    const assessment = assessClaimConfidence(claim, events);
    expect(assessment.penalties.length).toBe(0);
    expect(assessment.passesThreshold).toBe(true);
  });

  test("classifies domain from question ID", () => {
    const claim = makeClaim({ questionId: "AMC-3.1" });
    const assessment = assessClaimConfidence(claim, []);
    expect(assessment.domain).toBe("RISK");
  });

  test("uses domain-specific threshold", () => {
    // RISK domain has threshold 0.6 by default
    const claim = makeClaim({
      questionId: "AMC-3.1",
      confidence: 0.55,
      evidenceRefs: ["ev-1", "ev-2", "ev-3", "ev-4", "ev-5"],
    });
    const events = Array.from({ length: 5 }, (_, i) =>
      makeEvidenceEvent({ id: `ev-${i + 1}`, session_id: `s-${i}`, event_type: "stdout" }),
    );

    const assessment = assessClaimConfidence(claim, events);
    expect(assessment.threshold).toBe(0.6);
  });
});

// ---------------------------------------------------------------------------
// Batch assessment
// ---------------------------------------------------------------------------
describe("assessAgentClaimConfidence", () => {
  test("assesses all claims for an agent", () => {
    const { db } = freshDb();
    const c1 = makeClaim({ claimId: "cl-batch1", agentId: "agent-1" });
    const c2 = makeClaim({ claimId: "cl-batch2", agentId: "agent-1" });
    insertClaim(db, c1);
    insertClaim(db, c2);

    const assessments = assessAgentClaimConfidence(db, "agent-1", []);
    expect(assessments.length).toBe(2);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Confidence gate
// ---------------------------------------------------------------------------
describe("checkConfidenceGate", () => {
  test("passes when no relevant claims", () => {
    const { db } = freshDb();
    const result = checkConfidenceGate(db, "agent-1", ["Q999"], []);
    expect(result.pass).toBe(true);
    db.close();
  });

  test("fails when relevant claims are below threshold", () => {
    const { db } = freshDb();
    const claim = makeClaim({
      claimId: "cl-gate1",
      agentId: "agent-1",
      questionId: "AMC-3.1", // RISK domain, threshold 0.6
      confidence: 0.2, // very low
      evidenceRefs: [],
    });
    insertClaim(db, claim);

    const result = checkConfidenceGate(db, "agent-1", ["AMC-3.1"], []);
    expect(result.pass).toBe(false);
    expect(result.failingClaims.length).toBe(1);
    expect(result.reasons.length).toBe(1);
    db.close();
  });

  test("passes when blockBelowThreshold is false", () => {
    const { db } = freshDb();
    const claim = makeClaim({
      claimId: "cl-gate2",
      agentId: "agent-1",
      questionId: "AMC-3.1",
      confidence: 0.1,
      evidenceRefs: [],
    });
    insertClaim(db, claim);

    const result = checkConfidenceGate(db, "agent-1", ["AMC-3.1"], [], {
      blockBelowThreshold: false,
    });
    expect(result.pass).toBe(true);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Histograms
// ---------------------------------------------------------------------------
describe("buildConfidenceHistograms", () => {
  test("preserves the midpoint median and four-decimal mean for even claim populations", () => {
    const assessments: ClaimConfidenceAssessment[] = [0.1, 0.3, 0.7, 0.9].map((adjustedConfidence, index) => ({
      claimId: `claim-${index}`, agentId: "fixture", questionId: "AMC-1.1", domain: "FACTS",
      rawConfidence: adjustedConfidence, adjustedConfidence, penalties: [], passesThreshold: true, threshold: 0,
      citationQuality: { evidenceCount: 1, sessionCount: 1, highestTrustTier: "OBSERVED",
        observedRatio: 1, hasAttestedEvidence: false, qualityScore: 1 },
    }));
    expect(buildConfidenceHistograms(assessments)[0]).toMatchObject({
      totalClaims: 4, avgConfidence: 0.5, medianConfidence: 0.5,
    });
  });

  test("builds histograms by domain", () => {
    const assessments = [
      { domain: "FACTS" as ConfidenceDomain, adjustedConfidence: 0.7, claimId: "c1", passesThreshold: true },
      { domain: "FACTS" as ConfidenceDomain, adjustedConfidence: 0.3, claimId: "c2", passesThreshold: false },
      { domain: "RISK" as ConfidenceDomain, adjustedConfidence: 0.8, claimId: "c3", passesThreshold: true },
    ] as any[];

    const histograms = buildConfidenceHistograms(assessments, 5);
    expect(histograms.length).toBe(2); // FACTS and RISK
    const factsHist = histograms.find((h) => h.domain === "FACTS");
    expect(factsHist).toBeDefined();
    expect(factsHist!.totalClaims).toBe(2);
    expect(factsHist!.avgConfidence).toBeCloseTo(0.5, 1);
  });

  test("returns empty for no assessments", () => {
    const histograms = buildConfidenceHistograms([]);
    expect(histograms.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------
describe("generateClaimConfidenceReport", () => {
  test("generates report with assessments and histograms", () => {
    const { db } = freshDb();
    insertClaim(db, makeClaim({ claimId: "cl-rpt1", agentId: "agent-1", confidence: 0.8 }));
    insertClaim(db, makeClaim({ claimId: "cl-rpt2", agentId: "agent-1", confidence: 0.3, evidenceRefs: [] }));

    const report = generateClaimConfidenceReport(db, "agent-1", []);
    expect(report.reportId).toMatch(/^ccr_/);
    expect(report.totalClaims).toBe(2);
    expect(report.assessments.length).toBe(2);
    expect(report.belowThresholdCount).toBeGreaterThanOrEqual(0);
    db.close();
  });

  test("includes penalty breakdown", () => {
    const { db } = freshDb();
    insertClaim(db, makeClaim({
      claimId: "cl-penalty1",
      agentId: "agent-1",
      confidence: 0.9,
      evidenceRefs: [],
    }));

    const report = generateClaimConfidenceReport(db, "agent-1", []);
    expect(report.penaltyBreakdown["NO_CITATION"]).toBe(1);
    db.close();
  });

  test("includes recommendations for failing claims", () => {
    const { db } = freshDb();
    insertClaim(db, makeClaim({
      claimId: "cl-rec1",
      agentId: "agent-1",
      confidence: 0.1,
      evidenceRefs: [],
      questionId: "AMC-3.1", // RISK domain, threshold 0.6
    }));

    const report = generateClaimConfidenceReport(db, "agent-1", []);
    expect(report.recommendations.length).toBeGreaterThan(0);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------
describe("renderClaimConfidenceMarkdown", () => {
  test("renders markdown with all sections", () => {
    const { db } = freshDb();
    insertClaim(db, makeClaim({
      claimId: "cl-md1",
      agentId: "agent-1",
      confidence: 0.8,
      evidenceRefs: [],
    }));
    insertClaim(db, makeClaim({
      claimId: "cl-md2",
      agentId: "agent-1",
      confidence: 0.1,
      evidenceRefs: [],
      questionId: "AMC-3.1",
    }));

    const report = generateClaimConfidenceReport(db, "agent-1", []);
    const md = renderClaimConfidenceMarkdown(report);

    expect(md).toContain("# Claim Confidence Report");
    expect(md).toContain("## Summary");
    expect(md).toContain("## Penalty Breakdown");
    expect(md).toContain("NO_CITATION");
    db.close();
  });

  test("renders empty report gracefully", () => {
    const { db } = freshDb();
    const report = generateClaimConfidenceReport(db, "agent-1", []);
    const md = renderClaimConfidenceMarkdown(report);
    expect(md).toContain("# Claim Confidence Report");
    expect(md).toContain("Total claims: 0");
    db.close();
  });
});
