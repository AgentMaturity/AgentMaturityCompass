import Database from "better-sqlite3";
import type { Claim, ClaimTransition, ClaimLifecycleState, ClaimProvenanceTag } from "./claimTypes.js";
import type { TrustTier } from "../types.js";

/**
 * SQLite store for claims and claim transitions using better-sqlite3
 * Follows patterns from src/ledger/ledger.ts
 */

/**
 * Insert a new claim (append-only)
 */
export function insertClaim(db: Database.Database, claim: Claim): void {
  const stmt = db.prepare(`
    INSERT INTO claims (
      claim_id,
      agent_id,
      run_id,
      question_id,
      assertion_text,
      claimed_level,
      provenance_tag,
      lifecycle_state,
      confidence,
      evidence_refs_json,
      trust_tier,
      promoted_from_claim_id,
      promotion_evidence_json,
      superseded_by_claim_id,
      created_ts,
      last_verified_ts,
      expiry_ts,
      prev_claim_hash,
      claim_hash,
      signature
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    claim.claimId,
    claim.agentId,
    claim.runId,
    claim.questionId,
    claim.assertionText,
    claim.claimedLevel,
    claim.provenanceTag,
    claim.lifecycleState,
    claim.confidence,
    JSON.stringify(claim.evidenceRefs),
    claim.trustTier,
    claim.promotedFromClaimId,
    JSON.stringify(claim.promotionEvidence),
    claim.supersededByClaimId,
    claim.createdTs,
    claim.lastVerifiedTs,
    claim.expiryTs,
    claim.prev_claim_hash,
    claim.claim_hash,
    claim.signature
  );
}

/**
 * Insert a claim state transition (append-only audit trail)
 */
export function insertClaimTransition(
  db: Database.Database,
  transition: ClaimTransition
): void {
  const stmt = db.prepare(`
    INSERT INTO claim_transitions (
      transition_id,
      claim_id,
      from_state,
      to_state,
      reason,
      evidence_refs_json,
      ts,
      signature
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    transition.transitionId,
    transition.claimId,
    transition.fromState,
    transition.toState,
    transition.reason,
    JSON.stringify(transition.evidenceRefs),
    transition.ts,
    transition.signature
  );
}

/**
 * Get all non-revoked claims for an agent
 */
export function getClaimsByAgent(
  db: Database.Database,
  agentId: string
): Claim[] {
  const stmt = db.prepare(`
    SELECT * FROM claims
    WHERE agent_id = ? AND lifecycle_state != 'REVOKED'
    ORDER BY created_ts DESC
  `);

  const rows = stmt.all(agentId) as Array<Record<string, unknown>>;
  return rows.map(rowToClaim);
}

/**
 * Get all claims for a specific question for an agent
 */
export function getClaimsByQuestion(
  db: Database.Database,
  agentId: string,
  questionId: string
): Claim[] {
  const stmt = db.prepare(`
    SELECT * FROM claims
    WHERE agent_id = ? AND question_id = ? AND lifecycle_state != 'REVOKED'
    ORDER BY created_ts DESC
  `);

  const rows = stmt.all(agentId, questionId) as Array<Record<string, unknown>>;
  return rows.map(rowToClaim);
}

/**
 * Get all claims in a specific lifecycle state for an agent
 */
export function getClaimsByState(
  db: Database.Database,
  agentId: string,
  state: ClaimLifecycleState
): Claim[] {
  const stmt = db.prepare(`
    SELECT * FROM claims
    WHERE agent_id = ? AND lifecycle_state = ?
    ORDER BY created_ts DESC
  `);

  const rows = stmt.all(agentId, state) as Array<Record<string, unknown>>;
  return rows.map(rowToClaim);
}

/**
 * Get the most recent non-revoked, non-deprecated claim for a question
 */
export function getLatestClaimForQuestion(
  db: Database.Database,
  agentId: string,
  questionId: string
): Claim | null {
  const stmt = db.prepare(`
    SELECT * FROM claims
    WHERE agent_id = ? AND question_id = ? AND lifecycle_state NOT IN ('REVOKED', 'DEPRECATED')
    ORDER BY created_ts DESC
    LIMIT 1
  `);

  const row = stmt.get(agentId, questionId) as Record<string, unknown> | undefined;
  return row ? rowToClaim(row) : null;
}

/**
 * Get full lineage chain for a claim via promotedFromClaimId
 */
export function getClaimHistory(
  db: Database.Database,
  claimId: string
): Claim[] {
  const claims: Claim[] = [];
  let currentId: string | null = claimId;

  const stmt = db.prepare("SELECT * FROM claims WHERE claim_id = ?");

  while (currentId) {
    const row = stmt.get(currentId) as Record<string, unknown> | undefined;
    if (!row) break;

    const claim = rowToClaim(row);
    claims.push(claim);
    currentId = claim.promotedFromClaimId;
  }

  return claims;
}

/**
 * Get all transitions for a claim
 */
export function getClaimTransitions(
  db: Database.Database,
  claimId: string
): ClaimTransition[] {
  const stmt = db.prepare(`
    SELECT * FROM claim_transitions
    WHERE claim_id = ?
    ORDER BY ts ASC
  `);

  const rows = stmt.all(claimId) as Array<Record<string, unknown>>;
  return rows.map(rowToTransition);
}

/**
 * Get the last claim hash for a given agent (for hash chaining)
 */
export function getLastClaimHash(
  db: Database.Database,
  agentId: string
): string {
  const stmt = db.prepare(`
    SELECT claim_hash FROM claims
    WHERE agent_id = ?
    ORDER BY rowid DESC
    LIMIT 1
  `);

  const row = stmt.get(agentId) as { claim_hash: string } | undefined;
  return row?.claim_hash ?? "GENESIS_CLAIMS";
}

/**
 * Get a specific claim by ID
 */
export function getClaimById(
  db: Database.Database,
  claimId: string
): Claim | null {
  const stmt = db.prepare("SELECT * FROM claims WHERE claim_id = ?");
  const row = stmt.get(claimId) as Record<string, unknown> | undefined;
  return row ? rowToClaim(row) : null;
}

/**
 * Helper: Convert database row to Claim object
 */
function rowToClaim(row: Record<string, unknown>): Claim {
  return {
    claimId: row.claim_id as string,
    agentId: row.agent_id as string,
    runId: row.run_id as string,
    questionId: row.question_id as string,
    assertionText: row.assertion_text as string,
    claimedLevel: row.claimed_level as number,
    provenanceTag: row.provenance_tag as ClaimProvenanceTag,
    lifecycleState: row.lifecycle_state as ClaimLifecycleState,
    confidence: row.confidence as number,
    evidenceRefs: JSON.parse(row.evidence_refs_json as string) as string[],
    trustTier: row.trust_tier as TrustTier,
    promotedFromClaimId: (row.promoted_from_claim_id as string | null) || null,
    promotionEvidence: JSON.parse(row.promotion_evidence_json as string) as string[],
    supersededByClaimId: (row.superseded_by_claim_id as string | null) || null,
    createdTs: row.created_ts as number,
    lastVerifiedTs: row.last_verified_ts as number,
    expiryTs: (row.expiry_ts as number | null) || null,
    prev_claim_hash: row.prev_claim_hash as string,
    claim_hash: row.claim_hash as string,
    signature: row.signature as string
  };
}

/**
 * Helper: Convert database row to ClaimTransition object
 */
function rowToTransition(row: Record<string, unknown>): ClaimTransition {
  return {
    transitionId: row.transition_id as string,
    claimId: row.claim_id as string,
    fromState: row.from_state as ClaimLifecycleState,
    toState: row.to_state as ClaimLifecycleState,
    reason: row.reason as string,
    evidenceRefs: JSON.parse(row.evidence_refs_json as string) as string[],
    ts: row.ts as number,
    signature: row.signature as string
  };
}
