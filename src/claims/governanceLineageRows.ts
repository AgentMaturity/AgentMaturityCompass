import type Database from "better-sqlite3";
import type { ClaimTransparencyLink, PolicyChangeIntent } from "./governanceLineage.js";

/** Internal concrete row insertion shared by retained sync and checked async producers; no signing or trust override. */
export function insertTransparencyLinkRow(db: Database.Database, link: ClaimTransparencyLink, evidenceRefsJson?: string): void {
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
    evidenceRefsJson ?? JSON.stringify(link.evidenceRefs),
    link.ts,
    link.signature,
  );
}
export function insertPolicyIntentRow(db: Database.Database, intent: PolicyChangeIntent,
  json?: { claimIds: string; evidenceRefs: string }): void {
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
    json?.claimIds ?? JSON.stringify(intent.claimIds),
    json?.evidenceRefs ?? JSON.stringify(intent.evidenceRefs),
    intent.reversible ? 1 : 0,
    intent.rollbackInstructions,
    intent.createdTs,
    intent.createdBy,
    intent.prev_intent_hash,
    intent.intent_hash,
    intent.signature,
  );
}
