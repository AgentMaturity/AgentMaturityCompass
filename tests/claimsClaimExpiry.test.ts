import Database from "better-sqlite3";
import { describe, expect, test } from "vitest";
import { insertClaim, getClaimById, getClaimTransitions } from "../src/claims/claimStore.js";
import {
  defaultExpiryConfig,
  effectiveTtl,
  isClaimStale,
  findStaleClaims,
  sweepStaleClaims,
  renderStaleClaimsMarkdown,
  renderSweepResultMarkdown
} from "../src/claims/claimExpiry.js";
import type { Claim } from "../src/claims/claimTypes.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function initClaimTables(db: Database.Database, withImmutableUpdateTrigger = false): void {
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

    CREATE TABLE IF NOT EXISTS claim_transitions (
      transition_id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      from_state TEXT NOT NULL,
      to_state TEXT NOT NULL,
      reason TEXT NOT NULL,
      evidence_refs_json TEXT NOT NULL,
      ts INTEGER NOT NULL,
      signature TEXT NOT NULL
    );
  `);

  if (withImmutableUpdateTrigger) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS protect_claims_immutable
      BEFORE UPDATE ON claims
      BEGIN
        SELECT RAISE(ABORT, 'claims are append-only');
      END;
    `);
  }
}

function freshDb(withImmutableUpdateTrigger = false): Database.Database {
  const db = new Database(":memory:");
  initClaimTables(db, withImmutableUpdateTrigger);
  return db;
}

function makeClaim(overrides: Partial<Claim> = {}): Claim {
  const now = overrides.createdTs ?? Date.now();
  return {
    claimId: overrides.claimId ?? `claim_${Math.random().toString(36).slice(2, 10)}`,
    agentId: overrides.agentId ?? "agent-1",
    runId: overrides.runId ?? "run-1",
    questionId: overrides.questionId ?? "AMC-2.1",
    assertionText: overrides.assertionText ?? "Claim assertion",
    claimedLevel: overrides.claimedLevel ?? 3,
    provenanceTag: overrides.provenanceTag ?? "OBSERVED_FACT",
    lifecycleState: overrides.lifecycleState ?? "PROMOTED",
    confidence: overrides.confidence ?? 0.8,
    evidenceRefs: overrides.evidenceRefs ?? [],
    trustTier: overrides.trustTier ?? "OBSERVED",
    promotedFromClaimId: overrides.promotedFromClaimId ?? null,
    promotionEvidence: overrides.promotionEvidence ?? [],
    supersededByClaimId: overrides.supersededByClaimId ?? null,
    createdTs: now,
    lastVerifiedTs: overrides.lastVerifiedTs ?? now,
    expiryTs: overrides.expiryTs ?? null,
    prev_claim_hash: overrides.prev_claim_hash ?? "GENESIS_CLAIMS",
    claim_hash: overrides.claim_hash ?? `hash_${Math.random().toString(36).slice(2, 10)}`,
    signature: overrides.signature ?? "sig"
  };
}

describe("claims claimExpiry", () => {
  test("defaultExpiryConfig returns fresh mutable copies", () => {
    const a = defaultExpiryConfig();
    const b = defaultExpiryConfig();
    expect(a.ttlByProvenance.HYPOTHESIS).toBe(7 * DAY_MS);
    a.ttlByProvenance.HYPOTHESIS = 123;
    expect(b.ttlByProvenance.HYPOTHESIS).toBe(7 * DAY_MS);
  });

  test("effectiveTtl prefers explicit expiryTs on the claim", () => {
    const claim = makeClaim({ lastVerifiedTs: 1000, expiryTs: 6000 });
    expect(effectiveTtl(claim)).toBe(5000);
  });

  test("effectiveTtl uses provenance TTL when available", () => {
    const claim = makeClaim({ provenanceTag: "SESSION_LOCAL", lifecycleState: "PROMOTED", expiryTs: null });
    expect(effectiveTtl(claim)).toBe(1 * DAY_MS);
  });

  test("effectiveTtl falls back to lifecycle TTL for unknown provenance", () => {
    const claim = makeClaim({
      provenanceTag: "UNKNOWN" as Claim["provenanceTag"],
      lifecycleState: "QUARANTINE",
      expiryTs: null
    });
    expect(effectiveTtl(claim)).toBe(7 * DAY_MS);
  });

  test("effectiveTtl defaults to 30 days if no provenance or lifecycle match", () => {
    const claim = makeClaim({
      provenanceTag: "UNKNOWN" as Claim["provenanceTag"],
      lifecycleState: "REVOKED",
      expiryTs: null
    });
    expect(effectiveTtl(claim)).toBe(30 * DAY_MS);
  });

  test("isClaimStale skips terminal states", () => {
    const revoked = makeClaim({ lifecycleState: "REVOKED" });
    const deprecated = makeClaim({ lifecycleState: "DEPRECATED" });
    expect(isClaimStale(revoked, Date.now())).toBeNull();
    expect(isClaimStale(deprecated, Date.now())).toBeNull();
  });

  test("isClaimStale returns null when claim is still within TTL", () => {
    const now = Date.now();
    const claim = makeClaim({
      lastVerifiedTs: now - 2 * DAY_MS,
      provenanceTag: "PROVISIONAL" as Claim["provenanceTag"],
      lifecycleState: "PROVISIONAL"
    });
    expect(isClaimStale(claim, now)).toBeNull();
  });

  test("isClaimStale returns stale details with reason and overdue days", () => {
    const now = Date.now();
    const claim = makeClaim({
      claimId: "claim-stale",
      provenanceTag: "HYPOTHESIS",
      lastVerifiedTs: now - 10 * DAY_MS
    });
    const stale = isClaimStale(claim, now);
    expect(stale).not.toBeNull();
    expect(stale?.claim.claimId).toBe("claim-stale");
    expect(stale?.overdueDays).toBeGreaterThanOrEqual(2);
    expect(stale?.reason).toContain("TTL");
  });

  test("findStaleClaims returns stale claims sorted by staleSinceTs ascending", () => {
    const db = freshDb();
    const now = Date.now();
    insertClaim(db, makeClaim({ claimId: "stale-old", lastVerifiedTs: now - 20 * DAY_MS, provenanceTag: "HYPOTHESIS" }));
    insertClaim(db, makeClaim({ claimId: "stale-new", lastVerifiedTs: now - 9 * DAY_MS, provenanceTag: "HYPOTHESIS" }));
    insertClaim(db, makeClaim({ claimId: "fresh", lastVerifiedTs: now - 1 * DAY_MS, provenanceTag: "HYPOTHESIS" }));

    const stale = findStaleClaims(db, "agent-1", now);
    expect(stale.map((s) => s.claim.claimId)).toEqual(["stale-old", "stale-new"]);
    db.close();
  });

  test("sweepStaleClaims demotes non-provisional stale claims and records transition", () => {
    const db = freshDb();
    const now = Date.now();
    insertClaim(
      db,
      makeClaim({
        claimId: "claim-demote",
        lifecycleState: "PROMOTED",
        provenanceTag: "HYPOTHESIS",
        lastVerifiedTs: now - 20 * DAY_MS
      })
    );

    const result = sweepStaleClaims(db, "agent-1", ".", now);
    expect(result.demoted).toEqual(["claim-demote"]);
    expect(result.errors).toHaveLength(0);

    const updated = getClaimById(db, "claim-demote");
    expect(updated?.lifecycleState).toBe("PROVISIONAL");
    expect(updated?.lastVerifiedTs).toBe(now);

    const transitions = getClaimTransitions(db, "claim-demote");
    expect(transitions).toHaveLength(1);
    expect(transitions[0]?.toState).toBe("PROVISIONAL");
    expect(transitions[0]?.reason).toContain("Auto-demoted");
    db.close();
  });

  test("sweepStaleClaims keeps stale provisional claims in alreadyProvisional", () => {
    const db = freshDb();
    const now = Date.now();
    insertClaim(
      db,
      makeClaim({
        claimId: "claim-provisional",
        lifecycleState: "PROVISIONAL",
        provenanceTag: "HYPOTHESIS",
        lastVerifiedTs: now - 20 * DAY_MS
      })
    );

    const result = sweepStaleClaims(db, "agent-1", ".", now);
    expect(result.alreadyProvisional).toEqual(["claim-provisional"]);
    expect(result.demoted).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    db.close();
  });

  test("sweepStaleClaims captures update failures when claims table is immutable", () => {
    const db = freshDb(true);
    const now = Date.now();
    insertClaim(
      db,
      makeClaim({
        claimId: "claim-immutable",
        lifecycleState: "PROMOTED",
        provenanceTag: "HYPOTHESIS",
        lastVerifiedTs: now - 15 * DAY_MS
      })
    );

    const result = sweepStaleClaims(db, "agent-1", ".", now);
    expect(result.demoted).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("claims are append-only");
    db.close();
  });

  test("sweepStaleClaims continues processing when one claim is already provisional", () => {
    const db = freshDb();
    const now = Date.now();
    insertClaim(
      db,
      makeClaim({
        claimId: "claim-stale-1",
        lifecycleState: "PROMOTED",
        provenanceTag: "HYPOTHESIS",
        lastVerifiedTs: now - 15 * DAY_MS
      })
    );
    insertClaim(
      db,
      makeClaim({
        claimId: "claim-stale-2",
        lifecycleState: "PROVISIONAL",
        provenanceTag: "HYPOTHESIS",
        lastVerifiedTs: now - 15 * DAY_MS
      })
    );

    const result = sweepStaleClaims(db, "agent-1", ".", now);
    expect(result.demoted).toContain("claim-stale-1");
    expect(result.alreadyProvisional).toContain("claim-stale-2");
    db.close();
  });

  test("renderStaleClaimsMarkdown renders no-stale state", () => {
    const md = renderStaleClaimsMarkdown([], "agent-1");
    expect(md).toContain("Stale claims: 0");
    expect(md).toContain("No stale claims found.");
  });

  test("renderStaleClaimsMarkdown includes claim details for stale entries", () => {
    const now = Date.now();
    const stale = isClaimStale(
      makeClaim({ claimId: "claim-md", questionId: "AMC-4.2", lifecycleState: "PROMOTED", provenanceTag: "HYPOTHESIS", lastVerifiedTs: now - 20 * DAY_MS }),
      now
    );
    expect(stale).not.toBeNull();

    const md = renderStaleClaimsMarkdown([stale!], "agent-1");
    expect(md).toContain("## claim-md");
    expect(md).toContain("Question: AMC-4.2");
    expect(md).toContain("Reason:");
  });

  test("renderSweepResultMarkdown includes demoted and errors sections", () => {
    const md = renderSweepResultMarkdown(
      {
        demoted: ["c1", "c2"],
        alreadyProvisional: ["c3"],
        skipped: [],
        errors: ["c4: claims are append-only"]
      },
      "agent-1"
    );
    expect(md).toContain("Demoted: 2");
    expect(md).toContain("## Demoted to PROVISIONAL");
    expect(md).toContain("## Errors");
  });

  test("findStaleClaims respects custom expiry config", () => {
    const db = freshDb();
    const now = Date.now();
    insertClaim(
      db,
      makeClaim({
        claimId: "claim-custom-ttl",
        provenanceTag: "OBSERVED_FACT",
        lifecycleState: "PROMOTED",
        lastVerifiedTs: now - 3 * DAY_MS
      })
    );
    const stale = findStaleClaims(db, "agent-1", now, {
      ttlByProvenance: { OBSERVED_FACT: 2 * DAY_MS },
      ttlByLifecycle: {}
    });
    expect(stale.map((s) => s.claim.claimId)).toEqual(["claim-custom-ttl"]);
    db.close();
  });

  test("isClaimStale computes staleSinceTs as lastVerifiedTs + ttl", () => {
    const lastVerifiedTs = 1_000_000;
    const claim = makeClaim({
      lastVerifiedTs,
      provenanceTag: "HYPOTHESIS"
    });
    const ttl = effectiveTtl(claim);
    const stale = isClaimStale(claim, lastVerifiedTs + ttl + 1);
    expect(stale?.staleSinceTs).toBe(lastVerifiedTs + ttl);
  });
});
