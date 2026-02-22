/**
 * Claim-Level Governance Lineage
 *
 * Bridges claim state transitions with transparency log entries and policy changes.
 * Every claim promotion/revocation is:
 *  1. Recorded in the transparency log as a signed entry
 *  2. Linked to the evidence that justified the transition
 *  3. Optionally linked to the policy change it triggered or was triggered by
 *
 * This creates a full audit trail:
 *   Origin session → claim creation → promotions → current state → impact on policy
 *
 * The module also provides:
 *  - Policy change intent templates with mandatory rationale
 *  - Lineage views for claims and policies
 *  - Governance lineage reports
 */

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { signHexDigest, getPrivateKeyPem } from "../crypto/keys.js";
import type { Claim, ClaimTransition, ClaimLifecycleState } from "./claimTypes.js";
import {
  getClaimById,
  getClaimTransitions,
  getClaimHistory,
  getClaimsByAgent,
  getClaimsByState,
} from "./claimStore.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Transparency log linkage for a claim transition
 */
export interface ClaimTransparencyLink {
  linkId: string;
  claimId: string;
  transitionId: string;
  transparencyEntryHash: string; // hash of the transparency log entry
  fromState: ClaimLifecycleState;
  toState: ClaimLifecycleState;
  reason: string;
  evidenceRefs: string[];
  ts: number;
  signature: string;
}

/**
 * Policy change intent — mandatory rationale for any policy modification
 */
export type PolicyChangeCategory =
  | "RISK_MITIGATION"
  | "COMPLIANCE_REQUIREMENT"
  | "PERFORMANCE_OPTIMIZATION"
  | "EVIDENCE_DRIVEN"
  | "INCIDENT_RESPONSE"
  | "SCHEDULED_REVIEW"
  | "MANUAL_OVERRIDE";

export interface PolicyChangeIntent {
  intentId: string;
  agentId: string;
  policyFilePath: string; // which policy file was changed
  policyFileSha256Before: string;
  policyFileSha256After: string;
  category: PolicyChangeCategory;
  rationale: string; // mandatory human-readable reason
  impactSummary: string; // what the change affects
  claimIds: string[]; // claims that drove this policy change
  evidenceRefs: string[]; // evidence supporting the change
  reversible: boolean;
  rollbackInstructions: string | null;
  createdTs: number;
  createdBy: string; // "owner", "system", "auto-expire", etc.
  // Integrity
  prev_intent_hash: string;
  intent_hash: string;
  signature: string;
}

/**
 * Links a claim to the policy change it influenced
 */
export interface ClaimPolicyLink {
  linkId: string;
  claimId: string;
  intentId: string;
  direction: "CLAIM_DROVE_POLICY" | "POLICY_DROVE_CLAIM";
  ts: number;
}

/**
 * Full lineage view for a single claim
 */
export interface ClaimLineageView {
  claim: Claim;
  transitions: ClaimTransition[];
  transparencyLinks: ClaimTransparencyLink[];
  policyLinks: ClaimPolicyLink[];
  ancestors: Claim[]; // claims this claim was promoted from
  descendants: Claim[]; // claims that superseded this one
  originSessionId: string | null;
}

/**
 * Governance lineage report
 */
export interface GovernanceLineageReport {
  reportId: string;
  agentId: string;
  ts: number;
  totalClaims: number;
  claimsByState: Record<ClaimLifecycleState, number>;
  totalTransitions: number;
  totalTransparencyLinks: number;
  totalPolicyIntents: number;
  totalClaimPolicyLinks: number;
  unlinkedTransitions: number; // transitions without transparency log entry
  missingRationale: number; // policy changes without rationale
  lineageCoverage: number; // ratio of claims with full lineage
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Schema for policy change intents
// ---------------------------------------------------------------------------

export const policyChangeIntentSchema = z.object({
  intentId: z.string().min(1),
  agentId: z.string().min(1),
  policyFilePath: z.string().min(1),
  policyFileSha256Before: z.string().length(64),
  policyFileSha256After: z.string().length(64),
  category: z.enum([
    "RISK_MITIGATION",
    "COMPLIANCE_REQUIREMENT",
    "PERFORMANCE_OPTIMIZATION",
    "EVIDENCE_DRIVEN",
    "INCIDENT_RESPONSE",
    "SCHEDULED_REVIEW",
    "MANUAL_OVERRIDE",
  ]),
  rationale: z.string().min(10, "Rationale must be at least 10 characters"),
  impactSummary: z.string().min(1),
  claimIds: z.array(z.string()),
  evidenceRefs: z.array(z.string()),
  reversible: z.boolean(),
  rollbackInstructions: z.string().nullable(),
  createdTs: z.number().int(),
  createdBy: z.string().min(1),
});

// ---------------------------------------------------------------------------
// SQLite tables
// ---------------------------------------------------------------------------

export function initGovernanceLineageTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS claim_transparency_links (
      link_id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      transition_id TEXT NOT NULL,
      transparency_entry_hash TEXT NOT NULL,
      from_state TEXT NOT NULL CHECK (from_state IN ('QUARANTINE', 'PROVISIONAL', 'PROMOTED', 'EXPIRED', 'DEPRECATED', 'REVOKED')),
      to_state TEXT NOT NULL CHECK (to_state IN ('QUARANTINE', 'PROVISIONAL', 'PROMOTED', 'EXPIRED', 'DEPRECATED', 'REVOKED')),
      reason TEXT NOT NULL,
      evidence_refs_json TEXT NOT NULL,
      ts INTEGER NOT NULL,
      signature TEXT NOT NULL,
      FOREIGN KEY (claim_id) REFERENCES claims(claim_id),
      FOREIGN KEY (transition_id) REFERENCES claim_transitions(transition_id),
      CHECK (length(transparency_entry_hash) = 64)
    );

    CREATE INDEX IF NOT EXISTS idx_ctl_claim ON claim_transparency_links(claim_id);
    CREATE INDEX IF NOT EXISTS idx_ctl_transition ON claim_transparency_links(transition_id);
    CREATE INDEX IF NOT EXISTS idx_ctl_transparency ON claim_transparency_links(transparency_entry_hash);
    CREATE INDEX IF NOT EXISTS idx_ctl_claim_ts ON claim_transparency_links(claim_id, ts);

    CREATE TABLE IF NOT EXISTS policy_change_intents (
      intent_id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      policy_file_path TEXT NOT NULL,
      policy_file_sha256_before TEXT NOT NULL,
      policy_file_sha256_after TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN (
        'RISK_MITIGATION',
        'COMPLIANCE_REQUIREMENT',
        'PERFORMANCE_OPTIMIZATION',
        'EVIDENCE_DRIVEN',
        'INCIDENT_RESPONSE',
        'SCHEDULED_REVIEW',
        'MANUAL_OVERRIDE'
      )),
      rationale TEXT NOT NULL,
      impact_summary TEXT NOT NULL,
      claim_ids_json TEXT NOT NULL DEFAULT '[]',
      evidence_refs_json TEXT NOT NULL DEFAULT '[]',
      reversible INTEGER NOT NULL DEFAULT 1 CHECK (reversible IN (0, 1)),
      rollback_instructions TEXT,
      created_ts INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      prev_intent_hash TEXT NOT NULL,
      intent_hash TEXT NOT NULL,
      signature TEXT NOT NULL,
      CHECK (length(policy_file_sha256_before) = 64),
      CHECK (length(policy_file_sha256_after) = 64),
      CHECK (length(prev_intent_hash) > 0),
      CHECK (length(intent_hash) = 64)
    );

    CREATE INDEX IF NOT EXISTS idx_pci_agent ON policy_change_intents(agent_id);
    CREATE INDEX IF NOT EXISTS idx_pci_category ON policy_change_intents(category);
    CREATE INDEX IF NOT EXISTS idx_pci_agent_created_ts ON policy_change_intents(agent_id, created_ts DESC);

    CREATE TABLE IF NOT EXISTS claim_policy_links (
      link_id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      intent_id TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('CLAIM_DROVE_POLICY', 'POLICY_DROVE_CLAIM')),
      ts INTEGER NOT NULL,
      FOREIGN KEY (claim_id) REFERENCES claims(claim_id),
      FOREIGN KEY (intent_id) REFERENCES policy_change_intents(intent_id)
    );

    CREATE INDEX IF NOT EXISTS idx_cpl_claim ON claim_policy_links(claim_id);
    CREATE INDEX IF NOT EXISTS idx_cpl_intent ON claim_policy_links(intent_id);
    CREATE INDEX IF NOT EXISTS idx_cpl_claim_ts ON claim_policy_links(claim_id, ts);

    CREATE TRIGGER IF NOT EXISTS enforce_ctl_unique_transition
    BEFORE INSERT ON claim_transparency_links
    WHEN EXISTS(
      SELECT 1 FROM claim_transparency_links
      WHERE transition_id = NEW.transition_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'claim transition already linked to transparency');
    END;

    CREATE TRIGGER IF NOT EXISTS enforce_cpl_unique_direction
    BEFORE INSERT ON claim_policy_links
    WHEN EXISTS(
      SELECT 1 FROM claim_policy_links
      WHERE claim_id = NEW.claim_id
        AND intent_id = NEW.intent_id
        AND direction = NEW.direction
    )
    BEGIN
      SELECT RAISE(ABORT, 'duplicate claim-policy linkage');
    END;

    CREATE TRIGGER IF NOT EXISTS enforce_policy_intent_rationale_min_length
    BEFORE INSERT ON policy_change_intents
    WHEN length(trim(NEW.rationale)) < 10
    BEGIN
      SELECT RAISE(ABORT, 'policy rationale must be at least 10 characters');
    END;

    CREATE TRIGGER IF NOT EXISTS protect_claim_transparency_links_immutable
    BEFORE UPDATE ON claim_transparency_links
    BEGIN
      SELECT RAISE(ABORT, 'claim_transparency_links are append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS no_delete_claim_transparency_links
    BEFORE DELETE ON claim_transparency_links
    BEGIN
      SELECT RAISE(ABORT, 'claim_transparency_links cannot be deleted');
    END;

    CREATE TRIGGER IF NOT EXISTS protect_policy_change_intents_immutable
    BEFORE UPDATE ON policy_change_intents
    BEGIN
      SELECT RAISE(ABORT, 'policy_change_intents are append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS no_delete_policy_change_intents
    BEFORE DELETE ON policy_change_intents
    BEGIN
      SELECT RAISE(ABORT, 'policy_change_intents cannot be deleted');
    END;

    CREATE TRIGGER IF NOT EXISTS protect_claim_policy_links_immutable
    BEFORE UPDATE ON claim_policy_links
    BEGIN
      SELECT RAISE(ABORT, 'claim_policy_links are append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS no_delete_claim_policy_links
    BEFORE DELETE ON claim_policy_links
    BEGIN
      SELECT RAISE(ABORT, 'claim_policy_links cannot be deleted');
    END;
  `);
}

// ---------------------------------------------------------------------------
// Row converters
// ---------------------------------------------------------------------------

function rowToTransparencyLink(row: Record<string, unknown>): ClaimTransparencyLink {
  return {
    linkId: row.link_id as string,
    claimId: row.claim_id as string,
    transitionId: row.transition_id as string,
    transparencyEntryHash: row.transparency_entry_hash as string,
    fromState: row.from_state as ClaimLifecycleState,
    toState: row.to_state as ClaimLifecycleState,
    reason: row.reason as string,
    evidenceRefs: JSON.parse(row.evidence_refs_json as string),
    ts: row.ts as number,
    signature: row.signature as string,
  };
}

function rowToPolicyIntent(row: Record<string, unknown>): PolicyChangeIntent {
  return {
    intentId: row.intent_id as string,
    agentId: row.agent_id as string,
    policyFilePath: row.policy_file_path as string,
    policyFileSha256Before: row.policy_file_sha256_before as string,
    policyFileSha256After: row.policy_file_sha256_after as string,
    category: row.category as PolicyChangeCategory,
    rationale: row.rationale as string,
    impactSummary: row.impact_summary as string,
    claimIds: JSON.parse(row.claim_ids_json as string),
    evidenceRefs: JSON.parse(row.evidence_refs_json as string),
    reversible: (row.reversible as number) === 1,
    rollbackInstructions: row.rollback_instructions as string | null,
    createdTs: row.created_ts as number,
    createdBy: row.created_by as string,
    prev_intent_hash: row.prev_intent_hash as string,
    intent_hash: row.intent_hash as string,
    signature: row.signature as string,
  };
}

function rowToClaimPolicyLink(row: Record<string, unknown>): ClaimPolicyLink {
  return {
    linkId: row.link_id as string,
    claimId: row.claim_id as string,
    intentId: row.intent_id as string,
    direction: row.direction as "CLAIM_DROVE_POLICY" | "POLICY_DROVE_CLAIM",
    ts: row.ts as number,
  };
}

// ---------------------------------------------------------------------------
// Transparency link operations
// ---------------------------------------------------------------------------

/**
 * Record a claim transition in the transparency log and create a linkage record.
 *
 * Call this AFTER transitionClaim() to link the transition to transparency.
 * The transparencyEntryHash is the hash from the transparency log entry that
 * was created for this transition (via appendTransparencyEntry).
 */
export function linkTransitionToTransparency(
  db: Database.Database,
  transition: ClaimTransition,
  transparencyEntryHash: string,
  workspace: string,
): ClaimTransparencyLink {
  const linkId = `ctl_${randomUUID().slice(0, 12)}`;
  const now = Date.now();

  const body = {
    linkId,
    claimId: transition.claimId,
    transitionId: transition.transitionId,
    transparencyEntryHash,
    fromState: transition.fromState,
    toState: transition.toState,
    reason: transition.reason,
    evidenceRefs: transition.evidenceRefs,
    ts: now,
  };

  const hashPayload = canonicalize(body);
  const linkHash = sha256Hex(hashPayload);

  let signature = "unsigned";
  try {
    signature = signHexDigest(linkHash, getPrivateKeyPem(workspace, "auditor"));
  } catch {
    // No auditor key available
  }

  const link: ClaimTransparencyLink = { ...body, signature };

  db.prepare(`
    INSERT INTO claim_transparency_links (
      link_id, claim_id, transition_id, transparency_entry_hash,
      from_state, to_state, reason, evidence_refs_json, ts, signature
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    link.linkId,
    link.claimId,
    link.transitionId,
    link.transparencyEntryHash,
    link.fromState,
    link.toState,
    link.reason,
    JSON.stringify(link.evidenceRefs),
    link.ts,
    link.signature,
  );

  return link;
}

export function getTransparencyLinksForClaim(
  db: Database.Database,
  claimId: string,
): ClaimTransparencyLink[] {
  const rows = db
    .prepare("SELECT * FROM claim_transparency_links WHERE claim_id = ? ORDER BY ts ASC")
    .all(claimId) as Array<Record<string, unknown>>;
  return rows.map(rowToTransparencyLink);
}

export function getTransparencyLinkByTransition(
  db: Database.Database,
  transitionId: string,
): ClaimTransparencyLink | null {
  const row = db
    .prepare("SELECT * FROM claim_transparency_links WHERE transition_id = ?")
    .get(transitionId) as Record<string, unknown> | undefined;
  return row ? rowToTransparencyLink(row) : null;
}

export function getAllTransparencyLinks(
  db: Database.Database,
  agentId?: string,
): ClaimTransparencyLink[] {
  if (agentId) {
    // Join with claims to filter by agent
    const rows = db
      .prepare(`
        SELECT ctl.* FROM claim_transparency_links ctl
        JOIN claims c ON ctl.claim_id = c.claim_id
        WHERE c.agent_id = ?
        ORDER BY ctl.ts ASC
      `)
      .all(agentId) as Array<Record<string, unknown>>;
    return rows.map(rowToTransparencyLink);
  }
  const rows = db
    .prepare("SELECT * FROM claim_transparency_links ORDER BY ts ASC")
    .all() as Array<Record<string, unknown>>;
  return rows.map(rowToTransparencyLink);
}

// ---------------------------------------------------------------------------
// Policy change intent operations
// ---------------------------------------------------------------------------

export function getLastIntentHash(db: Database.Database, agentId: string): string {
  const row = db
    .prepare("SELECT intent_hash FROM policy_change_intents WHERE agent_id = ? ORDER BY rowid DESC LIMIT 1")
    .get(agentId) as { intent_hash: string } | undefined;
  return row?.intent_hash ?? "GENESIS_POLICY_INTENT";
}

/**
 * Record a policy change with mandatory rationale, claim linkage, and evidence.
 */
export function recordPolicyChangeIntent(
  db: Database.Database,
  params: {
    agentId: string;
    policyFilePath: string;
    policyFileSha256Before: string;
    policyFileSha256After: string;
    category: PolicyChangeCategory;
    rationale: string;
    impactSummary: string;
    claimIds?: string[];
    evidenceRefs?: string[];
    reversible?: boolean;
    rollbackInstructions?: string | null;
    createdBy: string;
  },
  workspace: string,
): PolicyChangeIntent {
  // Validate rationale length
  if (params.rationale.length < 10) {
    throw new Error("Policy change rationale must be at least 10 characters");
  }

  const intentId = `pci_${randomUUID().slice(0, 12)}`;
  const now = Date.now();
  const prevHash = getLastIntentHash(db, params.agentId);

  const body = {
    intentId,
    agentId: params.agentId,
    policyFilePath: params.policyFilePath,
    policyFileSha256Before: params.policyFileSha256Before,
    policyFileSha256After: params.policyFileSha256After,
    category: params.category,
    rationale: params.rationale,
    impactSummary: params.impactSummary,
    claimIds: params.claimIds ?? [],
    evidenceRefs: params.evidenceRefs ?? [],
    reversible: params.reversible ?? true,
    rollbackInstructions: params.rollbackInstructions ?? null,
    createdTs: now,
    createdBy: params.createdBy,
    prev_intent_hash: prevHash,
  };

  const hashPayload = canonicalize(body);
  const intentHash = sha256Hex(hashPayload);

  let signature = "unsigned";
  try {
    signature = signHexDigest(intentHash, getPrivateKeyPem(workspace, "auditor"));
  } catch {
    // No auditor key
  }

  const intent: PolicyChangeIntent = {
    ...body,
    intent_hash: intentHash,
    signature,
  };

  db.prepare(`
    INSERT INTO policy_change_intents (
      intent_id, agent_id, policy_file_path,
      policy_file_sha256_before, policy_file_sha256_after,
      category, rationale, impact_summary,
      claim_ids_json, evidence_refs_json,
      reversible, rollback_instructions,
      created_ts, created_by,
      prev_intent_hash, intent_hash, signature
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    intent.intentId,
    intent.agentId,
    intent.policyFilePath,
    intent.policyFileSha256Before,
    intent.policyFileSha256After,
    intent.category,
    intent.rationale,
    intent.impactSummary,
    JSON.stringify(intent.claimIds),
    JSON.stringify(intent.evidenceRefs),
    intent.reversible ? 1 : 0,
    intent.rollbackInstructions,
    intent.createdTs,
    intent.createdBy,
    intent.prev_intent_hash,
    intent.intent_hash,
    intent.signature,
  );

  // Auto-create claim-policy links for all referenced claims
  for (const claimId of intent.claimIds) {
    linkClaimToPolicy(db, claimId, intent.intentId, "CLAIM_DROVE_POLICY");
  }

  return intent;
}

export function getPolicyIntentById(
  db: Database.Database,
  intentId: string,
): PolicyChangeIntent | null {
  const row = db
    .prepare("SELECT * FROM policy_change_intents WHERE intent_id = ?")
    .get(intentId) as Record<string, unknown> | undefined;
  return row ? rowToPolicyIntent(row) : null;
}

export function getPolicyIntentsByAgent(
  db: Database.Database,
  agentId: string,
): PolicyChangeIntent[] {
  const rows = db
    .prepare("SELECT * FROM policy_change_intents WHERE agent_id = ? ORDER BY created_ts DESC")
    .all(agentId) as Array<Record<string, unknown>>;
  return rows.map(rowToPolicyIntent);
}

export function getPolicyIntentsByClaim(
  db: Database.Database,
  claimId: string,
): PolicyChangeIntent[] {
  const rows = db
    .prepare(`
      SELECT pci.* FROM policy_change_intents pci
      JOIN claim_policy_links cpl ON pci.intent_id = cpl.intent_id
      WHERE cpl.claim_id = ?
      ORDER BY pci.created_ts DESC
    `)
    .all(claimId) as Array<Record<string, unknown>>;
  return rows.map(rowToPolicyIntent);
}

// ---------------------------------------------------------------------------
// Claim-policy link operations
// ---------------------------------------------------------------------------

export function linkClaimToPolicy(
  db: Database.Database,
  claimId: string,
  intentId: string,
  direction: "CLAIM_DROVE_POLICY" | "POLICY_DROVE_CLAIM",
): ClaimPolicyLink {
  const linkId = `cpl_${randomUUID().slice(0, 12)}`;
  const now = Date.now();

  const link: ClaimPolicyLink = {
    linkId,
    claimId,
    intentId,
    direction,
    ts: now,
  };

  db.prepare(`
    INSERT INTO claim_policy_links (
      link_id, claim_id, intent_id, direction, ts
    ) VALUES (?, ?, ?, ?, ?)
  `).run(link.linkId, link.claimId, link.intentId, link.direction, link.ts);

  return link;
}

export function getClaimPolicyLinks(
  db: Database.Database,
  claimId: string,
): ClaimPolicyLink[] {
  const rows = db
    .prepare("SELECT * FROM claim_policy_links WHERE claim_id = ? ORDER BY ts ASC")
    .all(claimId) as Array<Record<string, unknown>>;
  return rows.map(rowToClaimPolicyLink);
}

export function getPolicyClaimLinks(
  db: Database.Database,
  intentId: string,
): ClaimPolicyLink[] {
  const rows = db
    .prepare("SELECT * FROM claim_policy_links WHERE intent_id = ? ORDER BY ts ASC")
    .all(intentId) as Array<Record<string, unknown>>;
  return rows.map(rowToClaimPolicyLink);
}

// ---------------------------------------------------------------------------
// Lineage view builder
// ---------------------------------------------------------------------------

/**
 * Build a comprehensive lineage view for a single claim.
 * Includes: transitions, transparency links, policy links, ancestors, descendants.
 */
export function buildClaimLineageView(
  db: Database.Database,
  claimId: string,
): ClaimLineageView | null {
  const claim = getClaimById(db, claimId);
  if (!claim) return null;

  const transitions = getClaimTransitions(db, claimId);
  const transparencyLinks = getTransparencyLinksForClaim(db, claimId);
  const policyLinks = getClaimPolicyLinks(db, claimId);

  // Get ancestors (promoted-from chain)
  const ancestors = getClaimHistory(db, claimId).slice(1); // exclude self

  // Get descendants (claims that superseded this one)
  const descendants: Claim[] = [];
  if (claim.supersededByClaimId) {
    const successor = getClaimById(db, claim.supersededByClaimId);
    if (successor) descendants.push(successor);
  }

  // Extract origin session from the oldest ancestor or the claim's run_id
  const oldestAncestor = ancestors.length > 0 ? ancestors[ancestors.length - 1] : undefined;
  const originSessionId = oldestAncestor ? oldestAncestor.runId : claim.runId;

  return {
    claim,
    transitions,
    transparencyLinks,
    policyLinks,
    ancestors,
    descendants,
    originSessionId,
  };
}

/**
 * Build lineage views for all active claims for an agent.
 */
export function buildAgentClaimLineage(
  db: Database.Database,
  agentId: string,
): ClaimLineageView[] {
  const claims = getClaimsByAgent(db, agentId);
  const views: ClaimLineageView[] = [];

  for (const claim of claims) {
    const view = buildClaimLineageView(db, claim.claimId);
    if (view) views.push(view);
  }

  return views;
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

export function generateGovernanceLineageReport(
  db: Database.Database,
  agentId: string,
): GovernanceLineageReport {
  const reportId = `glr_${randomUUID().slice(0, 12)}`;
  const now = Date.now();

  // Count claims by state
  const states: ClaimLifecycleState[] = [
    "QUARANTINE", "PROVISIONAL", "PROMOTED", "EXPIRED", "DEPRECATED", "REVOKED",
  ];
  const claimsByState: Record<ClaimLifecycleState, number> = {
    QUARANTINE: 0,
    PROVISIONAL: 0,
    PROMOTED: 0,
    EXPIRED: 0,
    DEPRECATED: 0,
    REVOKED: 0,
  };
  let totalClaims = 0;
  for (const state of states) {
    const count = getClaimsByState(db, agentId, state).length;
    claimsByState[state] = count;
    totalClaims += count;
  }

  // Count transitions
  const allLinks = getAllTransparencyLinks(db, agentId);
  const totalTransparencyLinks = allLinks.length;

  // Count transitions from claim_transitions table for this agent
  const allClaimsForAgent = getClaimsByAgent(db, agentId);
  let totalTransitions = 0;
  let unlinkedTransitions = 0;
  const linkedTransitionIds = new Set(allLinks.map((l) => l.transitionId));

  for (const claim of allClaimsForAgent) {
    const transitions = getClaimTransitions(db, claim.claimId);
    totalTransitions += transitions.length;
    for (const t of transitions) {
      if (!linkedTransitionIds.has(t.transitionId)) {
        unlinkedTransitions++;
      }
    }
  }

  // Count policy intents
  const policyIntents = getPolicyIntentsByAgent(db, agentId);
  const totalPolicyIntents = policyIntents.length;
  const missingRationale = policyIntents.filter(
    (p) => p.rationale.length < 10,
  ).length;

  // Count claim-policy links
  let totalClaimPolicyLinks = 0;
  for (const claim of allClaimsForAgent) {
    totalClaimPolicyLinks += getClaimPolicyLinks(db, claim.claimId).length;
  }

  // Coverage: claims with at least one transparency link or policy link
  let linkedClaimCount = 0;
  for (const claim of allClaimsForAgent) {
    const tLinks = getTransparencyLinksForClaim(db, claim.claimId);
    const pLinks = getClaimPolicyLinks(db, claim.claimId);
    if (tLinks.length > 0 || pLinks.length > 0) {
      linkedClaimCount++;
    }
  }
  const lineageCoverage = totalClaims > 0 ? linkedClaimCount / totalClaims : 0;

  // Recommendations
  const recommendations: string[] = [];
  if (unlinkedTransitions > 0) {
    recommendations.push(
      `${unlinkedTransitions} claim transition(s) are not linked to transparency log entries. Use linkTransitionToTransparency after each transition.`,
    );
  }
  if (lineageCoverage < 0.5 && totalClaims > 0) {
    recommendations.push(
      `Lineage coverage is ${(lineageCoverage * 100).toFixed(0)}%. Link more claim transitions to transparency entries.`,
    );
  }
  if (totalPolicyIntents === 0 && totalClaims > 5) {
    recommendations.push(
      "No policy change intents recorded. Use recordPolicyChangeIntent when policy changes are made.",
    );
  }
  if (missingRationale > 0) {
    recommendations.push(
      `${missingRationale} policy change(s) have insufficient rationale. Provide at least 10 characters of justification.`,
    );
  }

  return {
    reportId,
    agentId,
    ts: now,
    totalClaims,
    claimsByState,
    totalTransitions,
    totalTransparencyLinks,
    totalPolicyIntents,
    totalClaimPolicyLinks,
    unlinkedTransitions,
    missingRationale,
    lineageCoverage,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

export function renderGovernanceLineageMarkdown(
  report: GovernanceLineageReport,
): string {
  const lines: string[] = [
    "# Governance Lineage Report",
    "",
    `- Report ID: ${report.reportId}`,
    `- Agent: ${report.agentId}`,
    `- Timestamp: ${new Date(report.ts).toISOString()}`,
    "",
    "## Claims Overview",
    `- Total claims: ${report.totalClaims}`,
    `- QUARANTINE: ${report.claimsByState.QUARANTINE}`,
    `- PROVISIONAL: ${report.claimsByState.PROVISIONAL}`,
    `- PROMOTED: ${report.claimsByState.PROMOTED}`,
    `- DEPRECATED: ${report.claimsByState.DEPRECATED}`,
    `- REVOKED: ${report.claimsByState.REVOKED}`,
    "",
    "## Governance Links",
    `- Total transitions: ${report.totalTransitions}`,
    `- Transparency-linked transitions: ${report.totalTransparencyLinks}`,
    `- Unlinked transitions: ${report.unlinkedTransitions}`,
    `- Policy change intents: ${report.totalPolicyIntents}`,
    `- Claim-policy links: ${report.totalClaimPolicyLinks}`,
    `- Missing rationale: ${report.missingRationale}`,
    `- Lineage coverage: ${(report.lineageCoverage * 100).toFixed(1)}%`,
    "",
  ];

  if (report.recommendations.length > 0) {
    lines.push("## Recommendations");
    for (const r of report.recommendations) {
      lines.push(`- ${r}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Render a single claim's lineage as markdown
 */
export function renderClaimLineageMarkdown(
  view: ClaimLineageView,
): string {
  const lines: string[] = [
    `## Claim ${view.claim.claimId}`,
    "",
    `- Question: ${view.claim.questionId}`,
    `- Level: ${view.claim.claimedLevel}`,
    `- State: ${view.claim.lifecycleState}`,
    `- Provenance: ${view.claim.provenanceTag}`,
    `- Confidence: ${view.claim.confidence.toFixed(2)}`,
    `- Origin session: ${view.originSessionId ?? "unknown"}`,
    "",
  ];

  if (view.ancestors.length > 0) {
    lines.push("### Ancestor Chain");
    for (const a of view.ancestors) {
      lines.push(`  → ${a.claimId} (${a.lifecycleState}, level ${a.claimedLevel})`);
    }
    lines.push("");
  }

  if (view.transitions.length > 0) {
    lines.push("### Transitions");
    lines.push("| From | To | Reason | Time |");
    lines.push("|---|---|---|---|");
    for (const t of view.transitions) {
      const time = new Date(t.ts).toISOString();
      const reason = t.reason.length > 60 ? `${t.reason.slice(0, 57)}...` : t.reason;
      lines.push(`| ${t.fromState} | ${t.toState} | ${reason} | ${time} |`);
    }
    lines.push("");
  }

  if (view.transparencyLinks.length > 0) {
    lines.push("### Transparency Log Links");
    for (const tl of view.transparencyLinks) {
      lines.push(`- ${tl.fromState} → ${tl.toState}: entry ${tl.transparencyEntryHash.slice(0, 12)}...`);
    }
    lines.push("");
  }

  if (view.policyLinks.length > 0) {
    lines.push("### Policy Links");
    for (const pl of view.policyLinks) {
      lines.push(`- ${pl.direction}: intent ${pl.intentId}`);
    }
    lines.push("");
  }

  if (view.descendants.length > 0) {
    lines.push("### Successors");
    for (const d of view.descendants) {
      lines.push(`  ← ${d.claimId} (${d.lifecycleState}, level ${d.claimedLevel})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
