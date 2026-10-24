import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import type { ClaimTransition } from "./claimTypes.js";
import { linkClaimToPolicy, type ClaimTransparencyLink, type PolicyChangeIntent, type recordPolicyChangeIntent } from "./governanceLineage.js";
import { insertTransparencyLinkRow, insertPolicyIntentRow } from "./governanceLineageRows.js";

function noCallerTransaction(db: Database.Database): void {
  if (db.inTransaction) throw new Error("governance lineage async signing requires no active caller transaction");
}
function transitionFields(value: Pick<ClaimTransition, "transitionId" | "claimId" | "fromState" | "toState" | "reason" | "evidenceRefs">): string {
  return canonicalize({ transitionId: value.transitionId, claimId: value.claimId, fromState: value.fromState,
    toState: value.toState, reason: value.reason, evidenceRefs: value.evidenceRefs });
}
function selectedTransition(db: Database.Database, transitionId: string): string | null {
  const row = db.prepare("SELECT transition_id, claim_id, from_state, to_state, reason, evidence_refs_json FROM claim_transitions WHERE transition_id = ?")
    .get(transitionId) as { transition_id: string; claim_id: string; from_state: ClaimTransition["fromState"]; to_state: ClaimTransition["toState"]; reason: string; evidence_refs_json: string } | undefined;
  return row ? transitionFields({ transitionId: row.transition_id, claimId: row.claim_id, fromState: row.from_state,
    toState: row.to_state, reason: row.reason, evidenceRefs: JSON.parse(row.evidence_refs_json) }) : null;
}
function assertUnlinked(db: Database.Database, transitionId: string): void {
  if (db.prepare("SELECT link_id FROM claim_transparency_links WHERE transition_id = ?").get(transitionId)) throw new Error("claim transition already linked to transparency");
}

/** Stronger async admission: selected persisted transition fields must match; this does not authenticate a claim or log hash. */
export async function linkTransitionToTransparencyAsync(db: Database.Database, input: ClaimTransition,
  transparencyEntryHash: string, workspace: string): Promise<ClaimTransparencyLink> {
  noCallerTransaction(db); workspace = resolve(workspace);
  const transition = structuredClone(input), expected = transitionFields(transition);
  const selected = db.transaction(() => {
    const row = selectedTransition(db, transition.transitionId);
    if (row === null || row !== expected) throw new Error("selected claim transition does not match the linkage input");
    assertUnlinked(db, transition.transitionId); return row;
  })();
  const body = { linkId: `ctl_${randomUUID().slice(0, 12)}`, claimId: transition.claimId, transitionId: transition.transitionId,
    transparencyEntryHash, fromState: transition.fromState, toState: transition.toState, reason: transition.reason,
    evidenceRefs: transition.evidenceRefs, ts: Date.now() };
  const digest = sha256Hex(canonicalize(body)), publication = capturePurposePublication(workspace, "artifact-seal");
  const signed = await signWithPurposeKey(workspace, "artifact-seal", Buffer.from(digest, "hex"));
  const link: ClaimTransparencyLink = { ...body, signature: signed.signature.toString("base64") }, evidenceRefsJson = JSON.stringify(link.evidenceRefs);
  noCallerTransaction(db);
  db.transaction(() => {
    assertPurposePublicationCurrent(workspace, publication, signed);
    if (selectedTransition(db, transition.transitionId) !== selected) throw new Error("selected claim transition changed while signing; retry");
    assertUnlinked(db, transition.transitionId);
    insertTransparencyLinkRow(db, link, evidenceRefsJson);
  }).immediate();
  return link;
}

type IntentInput = Parameters<typeof recordPolicyChangeIntent>[1];
interface IntentHead { rowid: number; intent_id: string; intent_hash: string }
function intentHead(db: Database.Database, agentId: string): IntentHead | null {
  return (db.prepare("SELECT rowid AS rowid, intent_id, intent_hash FROM policy_change_intents WHERE agent_id = ? ORDER BY rowid DESC LIMIT 1")
    .get(agentId) as IntentHead | undefined) ?? null;
}
/** Signed intent and automatic links are atomic here; the retained sync API keeps its sequential partial semantics. */
export async function recordPolicyChangeIntentAsync(db: Database.Database, input: IntentInput, workspace: string): Promise<PolicyChangeIntent> {
  noCallerTransaction(db); workspace = resolve(workspace); const params = structuredClone(input);
  if (params.rationale.length < 10) throw new Error("Policy change rationale must be at least 10 characters");
  const head = db.transaction(() => intentHead(db, params.agentId))();
  const body = { intentId: `pci_${randomUUID().slice(0, 12)}`, agentId: params.agentId, policyFilePath: params.policyFilePath,
    policyFileSha256Before: params.policyFileSha256Before, policyFileSha256After: params.policyFileSha256After,
    category: params.category, rationale: params.rationale, impactSummary: params.impactSummary,
    claimIds: params.claimIds ?? [], evidenceRefs: params.evidenceRefs ?? [], reversible: params.reversible ?? true,
    rollbackInstructions: params.rollbackInstructions ?? null, createdTs: Date.now(), createdBy: params.createdBy,
    prev_intent_hash: head?.intent_hash ?? "GENESIS_POLICY_INTENT" };
  const intentHash = sha256Hex(canonicalize(body)), publication = capturePurposePublication(workspace, "artifact-seal");
  const signed = await signWithPurposeKey(workspace, "artifact-seal", Buffer.from(intentHash, "hex"));
  const intent: PolicyChangeIntent = { ...body, intent_hash: intentHash, signature: signed.signature.toString("base64") };
  const json = { claimIds: JSON.stringify(intent.claimIds), evidenceRefs: JSON.stringify(intent.evidenceRefs) };
  noCallerTransaction(db);
  db.transaction(() => {
    assertPurposePublicationCurrent(workspace, publication, signed);
    if (canonicalize(intentHead(db, params.agentId)) !== canonicalize(head)) throw new Error("policy intent head changed while signing; retry");
    insertPolicyIntentRow(db, intent, json);
    for (const claimId of intent.claimIds) linkClaimToPolicy(db, claimId, intent.intentId, "CLAIM_DROVE_POLICY");
  }).immediate();
  return intent;
}
