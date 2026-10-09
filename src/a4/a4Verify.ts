/**
 * A4 chain verification (P1-57; design §14.5). `verifyA4Chain` re-checks one project from its rows: the hash-linked
 * chain and every side row through the store's own verifier (A4_CHAIN_INVALID, A4_SIDE_ROW_MISMATCH), each transition's
 * audit row (a pruned inline payload is `payload_pruned`, bound by digest, never a failure), the A4_RECORD envelopes,
 * every gate's binding digest and in-force gate-policy digest, every decision's request digest (a decision not bound to
 * its gate is `freshness: fail` and counts for nothing), self-approval re-derived with its ratchet, trust tiers
 * recomputed from the referenced rows (TRUST_TIER_INFLATED), the lane/claim-kind rule, verified-lane re-admission, the
 * per-slot checks of every EFFECT_FINISHED, and credentials in stored request responses. Every verdict is an integrity
 * statement about bytes under this workspace's own keys and the operator's trust list: never a lane, a ref or a claim.
 */
import { approvalDecisionSchema, approvalRequestBindingDigest, approvalRequestSchema } from "../approvals/approvalChainStore.js";
import { eventMeta } from "../claims/evidenceProvenance.js";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { openLedger, type Ledger } from "../ledger/ledger.js";
import { hasTable } from "../ledger/ledgerSchema.js";
import { highSeveritySecretTypes } from "../release/releaseSecretScan.js";
import type { IssuerAdmission } from "../trust/admission.js";
import { checkDigestSignature, envelopePublicKey } from "../trust/signatureCheck.js";
import { loadTrustContext, type TrustContext } from "../trust/trustContext.js";
import { buildVerifierReport, type VerifierReportV1 } from "../trust/verifierReport.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { resolveRefs } from "./a4Evidence.js";
import {
  DEFAULT_A4_GATE_POLICY, a4EvidenceRefRowSchema, a4TransitionRowSchema, gatePolicyDigestOf, ratchetedFromChain, type A4ChainLink, type A4EvidenceRefRow
} from "./a4Schema.js";
import { A4StoreError, readA4Store } from "./a4Store.js";

/** The ledger migration that created the A4 tables (src/ledger/ledgerSchemaA4.ts). */
export const A4_MIGRATION = 13;
const OBSERVED_TIERS = new Set(["OBSERVED", "OBSERVED_HARDENED"]);
const ROTATED_OUT = new Set(["expired", "revoked", "distrusted", "not-yet-valid"]);
/** A lease token as src/a4/a4Store.ts refuses to store one. */
const LEASE_TOKEN = /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{40,}/;

type Row = Record<string, unknown>;
const object = (text: unknown): Row | null => {
  try {
    const value: unknown = typeof text === "string" ? JSON.parse(text) : null;
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
  } catch {
    return null;
  }
};
const flat = (value: unknown, prefix = ""): Array<[string, string]> => value === null || typeof value !== "object" ? []
  : Object.entries(value as Row).flatMap(([key, child]) => typeof child === "string" ? [[`${prefix}${key}`, child] as [string, string]]
    : flat(child, `${prefix}${key}.`));

/** The project's chain from the stored rows, for the derived checks; the store verifier decides whether it is intact. */
function chainOf(ledger: Ledger, projectId: string): { links: A4ChainLink[]; rows: ReturnType<typeof a4TransitionRowSchema.parse>[] } {
  const rows = (ledger.db.prepare("SELECT * FROM a4_transitions WHERE project_id = ? ORDER BY seq").all(projectId) as unknown[])
    .flatMap((raw) => {
      const parsed = a4TransitionRowSchema.safeParse(raw);
      return parsed.success ? [parsed.data] : [];
    });
  return { rows, links: rows.map((row) => ({ seq: row.seq, kind: row.kind, revisionNo: row.revision_no, body: object(row.body_json) ?? {} })) };
}

/** Each transition's audit row and envelope: digest, tier, pruning, signature and key admission. */
function checkTransitions(ledger: Ledger, rows: ReturnType<typeof chainOf>["rows"], trust: TrustContext, out: Findings): void {
  let auditorKeys: string[] = [];
  try {
    auditorKeys = getPublicKeyHistory(ledger.workspace, "auditor");
  } catch {
    // No auditor key: any envelope fails integrity below.
  }
  for (const row of rows) {
    const event = ledger.getEventById(row.evidence_event_id);
    if (!event || event.payload_sha256 !== row.body_digest) {
      out.errors.push(`A4_CHAIN_INVALID: transition ${row.seq} audit row does not carry its body digest`);
    } else {
      if (event.payload_pruned === 1) out.warnings.push(`payload_pruned: transition ${row.seq} is bound by digest`);
      const tier = eventMeta(event).trustTier;
      if (typeof tier === "string" && OBSERVED_TIERS.has(tier)) out.errors.push(`TRUST_TIER_INFLATED: transition ${row.seq} is an A4_STATE row claiming ${tier}`);
    }
    if (row.envelope_json === null) continue;
    const envelope = object(row.envelope_json) as { digestSha256?: unknown; signature?: unknown; signedTs?: unknown; envelope?: unknown } | null;
    if (envelope?.digestSha256 !== row.body_digest || typeof envelope.signature !== "string") {
      out.errors.push(`A4_ENVELOPE_INVALID: transition ${row.seq} envelope does not sign its body`);
      continue;
    }
    const check = checkDigestSignature({ signature: `a4 transition ${row.seq}`, purpose: "artifact-seal", digestHex: row.body_digest,
      signatureB64: envelope.signature, candidates: [envelopePublicKey(envelope.envelope), ...auditorKeys], context: trust,
      claimedSignedAt: typeof envelope.signedTs === "number" ? envelope.signedTs : null });
    out.signatures.push(check.admission);
    if (!check.verified) out.errors.push(`A4_ENVELOPE_INVALID: transition ${row.seq} envelope does not verify`);
    else if (ROTATED_OUT.has(check.admission.status)) out.warnings.push(`KEY_ROTATED_OUT: transition ${row.seq} envelope key is ${check.admission.status} (not evaluated)`);
  }
}

/** Gate binding and gate-policy digests, decision binding and self-approval, all re-derived from the rows. */
function checkGates(ledger: Ledger, projectId: string, links: readonly A4ChainLink[], out: Findings): Map<string, Row> {
  const db = ledger.db;
  const gates = new Map((db.prepare("SELECT * FROM a4_gates WHERE project_id = ?").all(projectId) as Row[]).map((gate) => [String(gate.gate_id), gate]));
  for (const link of links) {
    if ((link.kind === "CREATED" || link.kind === "GATE_POLICY_CHANGED") && link.body.gatePolicyDigest !== sha256Hex(canonicalize(link.body.gatePolicy ?? null))) {
      out.errors.push(`A4_GATE_POLICY_MISMATCH: transition ${link.seq} names another policy digest`);
    }
  }
  for (const [gateId, gate] of gates) {
    const request = approvalRequestSchema.safeParse(object(gate.request_json));
    if (!request.success || approvalRequestBindingDigest(request.data) !== gate.binding_digest) out.errors.push(`A4_GATE_BINDING_INVALID: gate ${gateId}`);
    const requested = links.find((link) => link.kind === "GATE_REQUESTED" && link.body.gateId === gateId);
    const inForce = requested ? gatePolicyDigestOf(links.filter((link) => link.seq < requested.seq)) ?? sha256Hex(canonicalize(DEFAULT_A4_GATE_POLICY)) : null;
    if (inForce !== gate.gate_policy_digest) out.errors.push(`A4_GATE_POLICY_MISMATCH: gate ${gateId} binds a policy that was not in force`);
  }
  for (const decision of db.prepare("SELECT * FROM a4_decisions WHERE project_id = ?").all(projectId) as Row[]) {
    const id = String(decision.decision_id);
    const binding = gates.get(String(decision.gate_id))?.binding_digest;
    const record = approvalDecisionSchema.safeParse(object(decision.decision_json));
    if (binding === undefined || decision.request_digest !== binding || !record.success || record.data.requestDigestSha256 !== binding) {
      out.stale.push(`DECISION_NOT_BOUND: decision ${id} carries no request digest equal to its gate's binding and counts for nothing`);
    }
    if (decision.self_approved !== 1) continue;
    const facts = object(decision.self_approval_facts_json);
    const decided = links.find((link) => link.kind === "GATE_DECIDED" && link.body.decisionId === id);
    const ratcheted = decided === undefined || ratchetedFromChain(links.filter((link) => link.seq < decided.seq));
    if (facts?.selfApprovalAllowed !== true || facts.regulated !== false || ratcheted) {
      out.errors.push(`A4_SELF_APPROVAL_UNDERIVED: decision ${id} is self-approved where the chain does not derive it`);
    }
  }
  return gates;
}

/** Ref rows: the lane rule, tiers recomputed from the referenced rows, verified-lane re-admission against `trust`. */
function checkRefs(ledger: Ledger, projectId: string, trust: TrustContext, now: number, out: Findings): void {
  const refs: A4EvidenceRefRow[] = [];
  for (const raw of ledger.db.prepare("SELECT * FROM a4_evidence_refs WHERE project_id = ? ORDER BY seq").all(projectId) as Row[]) {
    const parsed = a4EvidenceRefRowSchema.safeParse(raw);
    if (parsed.success) refs.push(parsed.data);
    else out.errors.push(`A4_LANE_CLAIM_MISMATCH: evidence ref ${String(raw.seq)} does not earn its lane`);
  }
  resolveRefs(ledger, refs, trust, now).forEach((resolved, index) => {
    const ref = refs[index]!;
    if (resolved.reasonCodes.includes("TRUST_TIER_INFLATED") || resolved.reasonCodes.includes("TRUST_TIER_CHANGED")) {
      out.errors.push(`TRUST_TIER_INFLATED: evidence ref ${ref.seq} stores ${ref.trust_tier ?? "no tier"}, the referenced row reads ${resolved.trustTier ?? "none"}`);
    }
    if (resolved.downgrade !== null) out.warnings.push(`A4_REF_DOWNGRADED: evidence ref ${ref.seq} ${resolved.downgrade.from} -> ${resolved.lane} (${resolved.downgrade.reason})`);
  });
}

/** Every EFFECT_FINISHED names exactly the bound slots of its gate's intent, each checked. */
function checkEffects(links: readonly A4ChainLink[], gates: Map<string, Row>, out: Findings): void {
  for (const finished of links.filter((link) => link.kind === "EFFECT_FINISHED")) {
    const started = links.find((link) => link.kind === "EFFECT_STARTED" && link.body.effectId === finished.body.effectId);
    const intent = object(gates.get(String(started?.body.gateId))?.intent_json);
    const bound = flat(intent?.resourceDigests).map(([slot, expected]) => canonicalize({ slot, expected })).sort();
    const checks = Array.isArray(finished.body.slotChecks) ? finished.body.slotChecks as Row[] : null;
    const recorded = (checks ?? []).map((check) => canonicalize({ slot: check.slot, expected: check.expected })).sort();
    if (started === undefined || checks === null || checks.some((check) => check.ok !== true) || canonicalize(bound) !== canonicalize(recorded)) {
      out.errors.push(`A4_EFFECT_SLOT_MISMATCH: transition ${finished.seq} does not record the bound slot checks`);
    }
  }
}

interface Findings { errors: string[]; warnings: string[]; stale: string[]; signatures: IssuerAdmission[] }

/** One project's VerifierReportV1. Trust is the operator's (`loadTrustContext()`), never a request's. */
export function verifyA4Chain(ledger: Ledger, projectId: string, trust: TrustContext = loadTrustContext(), now = Date.now()): VerifierReportV1 {
  const out: Findings = { errors: [], warnings: [], stale: [], signatures: [] };
  try {
    if (readA4Store(ledger).verifyChain(projectId) === null) out.errors.push(`A4_PROJECT_NOT_FOUND: ${projectId}`);
  } catch (error) {
    const problems = error instanceof A4StoreError && Array.isArray(error.detail) ? error.detail as string[] : [error instanceof Error ? error.message : String(error)];
    out.errors.push(...problems.map((problem) => problem.startsWith("A4_SIDE_ROW_") ? problem : `A4_CHAIN_INVALID: ${problem}`));
  }
  const { rows, links } = chainOf(ledger, projectId);
  checkTransitions(ledger, rows, trust, out);
  const gates = checkGates(ledger, projectId, links, out);
  checkRefs(ledger, projectId, trust, now, out);
  checkEffects(links, gates, out);
  for (const request of ledger.db.prepare("SELECT client_request_id, response_json FROM a4_requests WHERE project_id = ?").all(projectId) as Row[]) {
    const json = String(request.response_json);
    if (LEASE_TOKEN.test(json) || highSeveritySecretTypes(json).length > 0) out.errors.push(`A4_REQUEST_SECRET: request ${String(request.client_request_id)} stores a credential`);
  }
  const report = buildVerifierReport({ artifact: { kind: "a4-project", path: `a4-projects/${projectId}`, sha256: rows.at(-1)?.body_digest ?? "0".repeat(64) },
    context: trust, integrityErrors: out.errors, signatures: out.signatures, warnings: out.warnings, verifiedAt: new Date(now),
    anchoring: { status: "unanchored", detail: "A4 rows are signed with this workspace's own keys; anchoring is the ledger's (verify all: ledger-trust-root)" } });
  return out.stale.length === 0 ? report : { ...report, freshness: { status: "fail", reasons: out.stale } };
}

/**
 * The `a4-projects` rows of `amc verify all`: one per project, opened read-only. A ledger whose schema is a contiguous
 * prefix below migration 13 skips (no A4 tables yet); a schema at or above it without the tables fails, never an empty pass.
 */
export function verifyA4Projects(workspace: string, trust: TrustContext): Array<{ status: "PASS" | "FAIL" | "SKIP"; details: string[] }> {
  let ledger: Ledger;
  try {
    ledger = openLedger(workspace, { readonly: true });
  } catch (error) {
    return [{ status: "SKIP", details: [`no readable evidence ledger: ${error instanceof Error ? error.message : String(error)}`] }];
  }
  try {
    const db = ledger.db;
    if (!hasTable(db, "a4_projects")) {
      const versions = hasTable(db, "schema_migrations") ? (db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Array<{ version: number }>) : [];
      const prefix = versions.length > 0 && versions.length < A4_MIGRATION && versions.every((row, index) => row.version === index + 1);
      return [prefix ? { status: "SKIP", details: [`ledger schema predates migration ${A4_MIGRATION}; no A4 tables`] }
        : { status: "FAIL", details: [`A4 tables are missing from a ledger schema at or after migration ${A4_MIGRATION}`] }];
    }
    // Every project any A4 row or audit session names, not only those with a head: a deleted head row (or project) must
    // fail as A4_CHAIN_INVALID / A4_PROJECT_NOT_FOUND, never read as a smaller passing set. Sessions are `a4-<projectId>-<seq>`.
    const named = db.prepare(`SELECT project_id AS id FROM a4_projects UNION SELECT project_id FROM a4_transitions
      UNION SELECT substr(session_id, 4, 36) FROM sessions WHERE session_id GLOB 'a4-a4p_*'
      UNION SELECT substr(session_id, 4, 36) FROM evidence_events WHERE session_id GLOB 'a4-a4p_*'`).all() as Array<{ id: string }>;
    const projects = named.map((row) => row.id).filter((id) => /^a4p_[0-9a-f]{32}$/.test(id)).sort();
    if (projects.length === 0) return [{ status: "SKIP", details: ["no A4 projects"] }];
    return projects.map((projectId) => {
      const report = verifyA4Chain(ledger, projectId, trust);
      const failed = report.integrity.status === "fail";
      return { status: failed ? "FAIL" : "PASS", details: [projectId, ...(failed ? report.integrity.errors.slice(0, 20)
        : ["chain, side rows and envelopes verify (integrity of bytes under this workspace's keys)"]),
        ...(report.freshness.status === "fail" ? report.freshness.reasons.slice(0, 5) : [])] };
    });
  } finally {
    ledger.close();
  }
}
