import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { afterEach, describe, expect, test } from "vitest";
import {
  initGovernanceLineageTables,
  linkTransitionToTransparency,
  getTransparencyLinksForClaim,
  getTransparencyLinkByTransition,
  getAllTransparencyLinks,
  recordPolicyChangeIntent,
  getPolicyIntentById,
  getPolicyIntentsByAgent,
  getPolicyIntentsByClaim,
  getLastIntentHash,
  linkClaimToPolicy,
  getClaimPolicyLinks,
  getPolicyClaimLinks,
  buildClaimLineageView,
  buildAgentClaimLineage,
  generateGovernanceLineageReport,
  renderGovernanceLineageMarkdown,
  renderClaimLineageMarkdown,
  type ClaimTransparencyLink,
  type PolicyChangeIntent,
  type ClaimPolicyLink,
  type GovernanceLineageReport,
} from "../src/claims/governanceLineage.js";
import { insertClaim, insertClaimTransition } from "../src/claims/claimStore.js";
import type { Claim, ClaimTransition } from "../src/claims/claimTypes.js";

const roots: string[] = [];

function freshDb(): { db: Database.Database; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "amc-govlineage-test-"));
  roots.push(dir);
  const db = new Database(join(dir, "test.db"));

  // Create claims and claim_transitions tables
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

  initGovernanceLineageTables(db);
  return { db, dir };
}

function makeClaim(
  db: Database.Database,
  overrides: Partial<Claim> = {},
): Claim {
  const now = Date.now();
  const claim: Claim = {
    claimId: `claim_${Math.random().toString(36).slice(2, 10)}`,
    agentId: "agent-1",
    runId: "run-1",
    questionId: "Q1",
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
  insertClaim(db, claim);
  return claim;
}

function makePolicyIntent(db: Database.Database, intentId: string): void {
  db.prepare(`
    INSERT OR IGNORE INTO policy_change_intents (
      intent_id, agent_id, policy_file_path, policy_file_sha256_before,
      policy_file_sha256_after, category, rationale, impact_summary,
      claim_ids_json, evidence_refs_json, reversible, created_ts,
      created_by, prev_intent_hash, intent_hash, signature
    ) VALUES (?, 'agent-1', 'policy.yaml', '${"a".repeat(64)}', '${"b".repeat(64)}',
      'EVIDENCE_DRIVEN', 'test rationale', 'test impact', '[]', '[]', 1, ?,
      'test-user', '${"c".repeat(64)}', '${"d".repeat(64)}', 'sig-test')
  `).run(intentId, Date.now());
}

function makeTransition(
  db: Database.Database,
  overrides: Partial<ClaimTransition> = {},
): ClaimTransition {
  const transition: ClaimTransition = {
    transitionId: `tr_${Math.random().toString(36).slice(2, 10)}`,
    claimId: "claim-1",
    fromState: "QUARANTINE",
    toState: "PROVISIONAL",
    reason: "Sufficient evidence observed",
    evidenceRefs: ["ev-1"],
    ts: Date.now(),
    signature: "test-sig",
    ...overrides,
  };
  insertClaimTransition(db, transition);
  return transition;
}

afterEach(() => {
  for (const r of roots) {
    try { rmSync(r, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  roots.length = 0;
});

// ---------------------------------------------------------------------------
// Table initialization
// ---------------------------------------------------------------------------
describe("initGovernanceLineageTables", () => {
  test("creates tables without error", () => {
    const { db } = freshDb();
    // Double init is safe
    initGovernanceLineageTables(db);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Transparency links
// ---------------------------------------------------------------------------
describe("transparency link operations", () => {
  test("linkTransitionToTransparency creates and retrieves link", () => {
    const { db, dir } = freshDb();
    const claim = makeClaim(db, { claimId: "cl-1" });
    const transition = makeTransition(db, { claimId: "cl-1", transitionId: "tr-1" });

    const link = linkTransitionToTransparency(db, transition, "abcd".repeat(16), dir);
    expect(link.linkId).toMatch(/^ctl_/);
    expect(link.claimId).toBe("cl-1");
    expect(link.transitionId).toBe("tr-1");
    expect(link.transparencyEntryHash).toBe("abcd".repeat(16));
    expect(link.fromState).toBe("QUARANTINE");
    expect(link.toState).toBe("PROVISIONAL");
    db.close();
  });

  test("getTransparencyLinksForClaim returns links for a specific claim", () => {
    const { db, dir } = freshDb();
    makeClaim(db, { claimId: "cl-2" });
    makeClaim(db, { claimId: "cl-3" });
    const tr1 = makeTransition(db, { claimId: "cl-2", transitionId: "tr-2a" });
    const tr2 = makeTransition(db, { claimId: "cl-2", transitionId: "tr-2b" });
    const tr3 = makeTransition(db, { claimId: "cl-3", transitionId: "tr-3" });

    linkTransitionToTransparency(db, tr1, "a".repeat(64), dir);
    linkTransitionToTransparency(db, tr2, "b".repeat(64), dir);
    linkTransitionToTransparency(db, tr3, "c".repeat(64), dir);

    const links = getTransparencyLinksForClaim(db, "cl-2");
    expect(links.length).toBe(2);
    expect(links.every((l) => l.claimId === "cl-2")).toBe(true);
    db.close();
  });

  test("getTransparencyLinkByTransition returns specific link", () => {
    const { db, dir } = freshDb();
    makeClaim(db, { claimId: "cl-4" });
    const tr = makeTransition(db, { claimId: "cl-4", transitionId: "tr-4" });
    linkTransitionToTransparency(db, tr, "d".repeat(64), dir);

    const link = getTransparencyLinkByTransition(db, "tr-4");
    expect(link).not.toBeNull();
    expect(link!.transitionId).toBe("tr-4");
    db.close();
  });

  test("getTransparencyLinkByTransition returns null for nonexistent", () => {
    const { db } = freshDb();
    expect(getTransparencyLinkByTransition(db, "nonexistent")).toBeNull();
    db.close();
  });

  test("getAllTransparencyLinks returns all links or filtered by agent", () => {
    const { db, dir } = freshDb();
    makeClaim(db, { claimId: "cl-a1", agentId: "agent-1" });
    makeClaim(db, { claimId: "cl-b1", agentId: "agent-2" });
    const tra = makeTransition(db, { claimId: "cl-a1", transitionId: "tr-a1" });
    const trb = makeTransition(db, { claimId: "cl-b1", transitionId: "tr-b1" });
    linkTransitionToTransparency(db, tra, "e".repeat(64), dir);
    linkTransitionToTransparency(db, trb, "f".repeat(64), dir);

    const all = getAllTransparencyLinks(db);
    expect(all.length).toBe(2);

    const agent1Only = getAllTransparencyLinks(db, "agent-1");
    expect(agent1Only.length).toBe(1);
    expect(agent1Only[0].claimId).toBe("cl-a1");
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Policy change intents
// ---------------------------------------------------------------------------
describe("policy change intent operations", () => {
  test("recordPolicyChangeIntent creates a signed intent", () => {
    const { db, dir } = freshDb();
    const intent = recordPolicyChangeIntent(
      db,
      {
        agentId: "agent-1",
        policyFilePath: "guardrails.yaml",
        policyFileSha256Before: "a".repeat(64),
        policyFileSha256After: "b".repeat(64),
        category: "RISK_MITIGATION",
        rationale: "Tightened safety constraints after incident",
        impactSummary: "Higher barrier for DEPLOY actions",
        claimIds: [],
        evidenceRefs: ["ev-incident-1"],
        reversible: true,
        rollbackInstructions: "Revert guardrails.yaml to previous SHA",
        createdBy: "owner",
      },
      dir,
    );

    expect(intent.intentId).toMatch(/^pci_/);
    expect(intent.category).toBe("RISK_MITIGATION");
    expect(intent.intent_hash).toBeTruthy();
    expect(intent.prev_intent_hash).toBe("GENESIS_POLICY_INTENT");
    db.close();
  });

  test("rationale must be at least 10 characters", () => {
    const { db, dir } = freshDb();
    expect(() =>
      recordPolicyChangeIntent(
        db,
        {
          agentId: "agent-1",
          policyFilePath: "p.yaml",
          policyFileSha256Before: "a".repeat(64),
          policyFileSha256After: "b".repeat(64),
          category: "MANUAL_OVERRIDE",
          rationale: "short", // too short
          impactSummary: "test",
          createdBy: "owner",
        },
        dir,
      ),
    ).toThrow("at least 10 characters");
    db.close();
  });

  test("getPolicyIntentById retrieves intent", () => {
    const { db, dir } = freshDb();
    const intent = recordPolicyChangeIntent(
      db,
      {
        agentId: "agent-1",
        policyFilePath: "policy.yaml",
        policyFileSha256Before: "a".repeat(64),
        policyFileSha256After: "b".repeat(64),
        category: "EVIDENCE_DRIVEN",
        rationale: "Evidence shows current policy is too restrictive",
        impactSummary: "Lowered barrier for READ_ONLY",
        createdBy: "system",
      },
      dir,
    );

    const retrieved = getPolicyIntentById(db, intent.intentId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.intentId).toBe(intent.intentId);
    expect(retrieved!.rationale).toBe("Evidence shows current policy is too restrictive");
    db.close();
  });

  test("getPolicyIntentsByAgent returns all intents for agent", () => {
    const { db, dir } = freshDb();
    recordPolicyChangeIntent(
      db,
      {
        agentId: "agent-1",
        policyFilePath: "p1.yaml",
        policyFileSha256Before: "a".repeat(64),
        policyFileSha256After: "b".repeat(64),
        category: "COMPLIANCE_REQUIREMENT",
        rationale: "Required by SOC2 audit findings",
        impactSummary: "Stricter logging requirements",
        createdBy: "owner",
      },
      dir,
    );
    recordPolicyChangeIntent(
      db,
      {
        agentId: "agent-1",
        policyFilePath: "p2.yaml",
        policyFileSha256Before: "c".repeat(64),
        policyFileSha256After: "d".repeat(64),
        category: "SCHEDULED_REVIEW",
        rationale: "Quarterly policy review iteration",
        impactSummary: "Updated thresholds",
        createdBy: "owner",
      },
      dir,
    );

    const intents = getPolicyIntentsByAgent(db, "agent-1");
    expect(intents.length).toBe(2);
    db.close();
  });

  test("hash chaining works across intents", () => {
    const { db, dir } = freshDb();
    const i1 = recordPolicyChangeIntent(
      db,
      {
        agentId: "agent-1",
        policyFilePath: "p.yaml",
        policyFileSha256Before: "a".repeat(64),
        policyFileSha256After: "b".repeat(64),
        category: "EVIDENCE_DRIVEN",
        rationale: "First policy change for this agent",
        impactSummary: "Initial policy",
        createdBy: "owner",
      },
      dir,
    );
    expect(i1.prev_intent_hash).toBe("GENESIS_POLICY_INTENT");

    const lastHash = getLastIntentHash(db, "agent-1");
    expect(lastHash).toBe(i1.intent_hash);

    const i2 = recordPolicyChangeIntent(
      db,
      {
        agentId: "agent-1",
        policyFilePath: "p.yaml",
        policyFileSha256Before: "b".repeat(64),
        policyFileSha256After: "c".repeat(64),
        category: "PERFORMANCE_OPTIMIZATION",
        rationale: "Optimized policy evaluation latency",
        impactSummary: "Faster policy checks",
        createdBy: "system",
      },
      dir,
    );
    expect(i2.prev_intent_hash).toBe(i1.intent_hash);
    db.close();
  });

  test("recordPolicyChangeIntent auto-creates claim-policy links", () => {
    const { db, dir } = freshDb();
    makeClaim(db, { claimId: "cl-link1" });
    makeClaim(db, { claimId: "cl-link2" });

    recordPolicyChangeIntent(
      db,
      {
        agentId: "agent-1",
        policyFilePath: "p.yaml",
        policyFileSha256Before: "a".repeat(64),
        policyFileSha256After: "b".repeat(64),
        category: "EVIDENCE_DRIVEN",
        rationale: "Claims show safety improvement needed",
        impactSummary: "Stricter safety policy",
        claimIds: ["cl-link1", "cl-link2"],
        createdBy: "owner",
      },
      dir,
    );

    const links1 = getClaimPolicyLinks(db, "cl-link1");
    expect(links1.length).toBe(1);
    expect(links1[0].direction).toBe("CLAIM_DROVE_POLICY");

    const links2 = getClaimPolicyLinks(db, "cl-link2");
    expect(links2.length).toBe(1);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Claim-policy links
// ---------------------------------------------------------------------------
describe("claim-policy link operations", () => {
  test("linkClaimToPolicy creates bidirectional link", () => {
    const { db } = freshDb();
    makeClaim(db, { claimId: "cl-cpl1" });
    makePolicyIntent(db, "pci-1");

    const link = linkClaimToPolicy(db, "cl-cpl1", "pci-1", "POLICY_DROVE_CLAIM");
    expect(link.linkId).toMatch(/^cpl_/);
    expect(link.direction).toBe("POLICY_DROVE_CLAIM");

    const claimLinks = getClaimPolicyLinks(db, "cl-cpl1");
    expect(claimLinks.length).toBe(1);

    const policyLinks = getPolicyClaimLinks(db, "pci-1");
    expect(policyLinks.length).toBe(1);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Lineage view
// ---------------------------------------------------------------------------
describe("buildClaimLineageView", () => {
  test("returns null for nonexistent claim", () => {
    const { db } = freshDb();
    expect(buildClaimLineageView(db, "nonexistent")).toBeNull();
    db.close();
  });

  test("builds lineage view with transitions and links", () => {
    const { db, dir } = freshDb();
    const claim = makeClaim(db, { claimId: "cl-view1" });
    const tr = makeTransition(db, {
      claimId: "cl-view1",
      transitionId: "tr-view1",
      fromState: "QUARANTINE",
      toState: "PROVISIONAL",
    });
    linkTransitionToTransparency(db, tr, "g".repeat(64), dir);
    makePolicyIntent(db, "pci-view1");
    linkClaimToPolicy(db, "cl-view1", "pci-view1", "CLAIM_DROVE_POLICY");

    const view = buildClaimLineageView(db, "cl-view1");
    expect(view).not.toBeNull();
    expect(view!.claim.claimId).toBe("cl-view1");
    expect(view!.transitions.length).toBe(1);
    expect(view!.transparencyLinks.length).toBe(1);
    expect(view!.policyLinks.length).toBe(1);
    expect(view!.originSessionId).toBe(claim.runId);
    db.close();
  });

  test("builds lineage with ancestors", () => {
    const { db } = freshDb();
    // Parent claim
    makeClaim(db, {
      claimId: "cl-parent",
      runId: "run-origin",
      lifecycleState: "PROMOTED",
    });
    // Child claim promoted from parent
    makeClaim(db, {
      claimId: "cl-child",
      runId: "run-later",
      promotedFromClaimId: "cl-parent",
    });

    const view = buildClaimLineageView(db, "cl-child");
    expect(view).not.toBeNull();
    expect(view!.ancestors.length).toBe(1);
    expect(view!.ancestors[0].claimId).toBe("cl-parent");
    expect(view!.originSessionId).toBe("run-origin");
    db.close();
  });
});

describe("buildAgentClaimLineage", () => {
  test("builds lineage for all active agent claims", () => {
    const { db } = freshDb();
    makeClaim(db, { claimId: "cl-agent1", agentId: "agent-1" });
    makeClaim(db, { claimId: "cl-agent2", agentId: "agent-1" });
    makeClaim(db, { claimId: "cl-other", agentId: "agent-2" });

    const views = buildAgentClaimLineage(db, "agent-1");
    expect(views.length).toBe(2);
    expect(views.every((v) => v.claim.agentId === "agent-1")).toBe(true);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------
describe("generateGovernanceLineageReport", () => {
  test("generates report with correct counts", () => {
    const { db, dir } = freshDb();
    makeClaim(db, { claimId: "cl-rpt1", agentId: "agent-1", lifecycleState: "PROMOTED" });
    makeClaim(db, { claimId: "cl-rpt2", agentId: "agent-1", lifecycleState: "QUARANTINE" });
    makeClaim(db, { claimId: "cl-rpt3", agentId: "agent-1", lifecycleState: "PROVISIONAL" });

    const tr = makeTransition(db, { claimId: "cl-rpt1", transitionId: "tr-rpt1" });
    linkTransitionToTransparency(db, tr, "h".repeat(64), dir);

    const report = generateGovernanceLineageReport(db, "agent-1");
    expect(report.reportId).toMatch(/^glr_/);
    expect(report.totalClaims).toBe(3);
    expect(report.claimsByState.PROMOTED).toBe(1);
    expect(report.claimsByState.QUARANTINE).toBe(1);
    expect(report.claimsByState.PROVISIONAL).toBe(1);
    expect(report.totalTransparencyLinks).toBe(1);
    db.close();
  });

  test("includes recommendations for unlinked transitions", () => {
    const { db } = freshDb();
    makeClaim(db, { claimId: "cl-rec1", agentId: "agent-1" });
    makeTransition(db, { claimId: "cl-rec1", transitionId: "tr-rec1" });
    // Transition is NOT linked to transparency

    const report = generateGovernanceLineageReport(db, "agent-1");
    expect(report.unlinkedTransitions).toBe(1);
    expect(report.recommendations.some((r) => r.includes("not linked to transparency"))).toBe(true);
    db.close();
  });

  test("empty agent produces empty report", () => {
    const { db } = freshDb();
    const report = generateGovernanceLineageReport(db, "nonexistent");
    expect(report.totalClaims).toBe(0);
    expect(report.lineageCoverage).toBe(0);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------
describe("renderGovernanceLineageMarkdown", () => {
  test("renders governance lineage report", () => {
    const { db, dir } = freshDb();
    makeClaim(db, { claimId: "cl-md1", agentId: "agent-1", lifecycleState: "PROMOTED" });
    const tr = makeTransition(db, { claimId: "cl-md1", transitionId: "tr-md1" });
    linkTransitionToTransparency(db, tr, "i".repeat(64), dir);

    const report = generateGovernanceLineageReport(db, "agent-1");
    const md = renderGovernanceLineageMarkdown(report);

    expect(md).toContain("# Governance Lineage Report");
    expect(md).toContain("## Claims Overview");
    expect(md).toContain("## Governance Links");
    expect(md).toContain("PROMOTED: 1");
    db.close();
  });
});

describe("renderClaimLineageMarkdown", () => {
  test("renders claim lineage with all sections", () => {
    const { db, dir } = freshDb();
    makeClaim(db, { claimId: "cl-clmd1", questionId: "Q1", claimedLevel: 4 });
    const tr = makeTransition(db, { claimId: "cl-clmd1", transitionId: "tr-clmd1" });
    linkTransitionToTransparency(db, tr, "j".repeat(64), dir);
    makePolicyIntent(db, "pci-clmd1");
    linkClaimToPolicy(db, "cl-clmd1", "pci-clmd1", "CLAIM_DROVE_POLICY");

    const view = buildClaimLineageView(db, "cl-clmd1");
    expect(view).not.toBeNull();
    const md = renderClaimLineageMarkdown(view!);

    expect(md).toContain("## Claim cl-clmd1");
    expect(md).toContain("### Transitions");
    expect(md).toContain("### Transparency Log Links");
    expect(md).toContain("### Policy Links");
    expect(md).toContain("CLAIM_DROVE_POLICY");
    db.close();
  });
});

// ---------------------------------------------------------------------------
// getPolicyIntentsByClaim
// ---------------------------------------------------------------------------
describe("getPolicyIntentsByClaim", () => {
  test("returns policy intents linked to a claim", () => {
    const { db, dir } = freshDb();
    makeClaim(db, { claimId: "cl-pbc1" });

    const intent = recordPolicyChangeIntent(
      db,
      {
        agentId: "agent-1",
        policyFilePath: "p.yaml",
        policyFileSha256Before: "a".repeat(64),
        policyFileSha256After: "b".repeat(64),
        category: "INCIDENT_RESPONSE",
        rationale: "Incident response required policy tightening",
        impactSummary: "Blocked DEPLOY for 24h",
        claimIds: ["cl-pbc1"],
        createdBy: "owner",
      },
      dir,
    );

    const intents = getPolicyIntentsByClaim(db, "cl-pbc1");
    expect(intents.length).toBe(1);
    expect(intents[0].intentId).toBe(intent.intentId);
    db.close();
  });
});
