/**
 * A4 chain verification (P1-57; design §14.5). `verifyA4Chain` re-checks one project from its rows: the hash-linked
 * chain and every side row through the store's own verifier (A4_CHAIN_INVALID, A4_SIDE_ROW_MISMATCH), each transition's
 * audit row (a pruned inline payload is `payload_pruned`, bound by digest, never a failure), the A4_RECORD envelopes,
 * every gate's binding digest and in-force gate-policy digest, every decision's request digest (a decision not bound to
 * its gate is `freshness: fail` and counts for nothing), self-approval re-derived with its ratchet, trust tiers
 * recomputed from the referenced rows (TRUST_TIER_INFLATED above what the row can read under any trust list; a
 * trust-list change is the warning TRUST_TIER_CHANGED), the lane/claim-kind rule, verified-lane re-admission, the
 * per-slot checks of every EFFECT_FINISHED, and credentials in stored request responses. Every verdict is an integrity
 * statement about bytes under this workspace's own keys and the operator's trust list: never a lane, a ref or a claim.
 * `verifyA4Bundle` (P1-63) runs the same checks offline over an `.amcbundle` A4 slice or an `amc.a4-record/v1` export, under
 * the caller's pinned trust only, and adds scope, freshness, completeness and satisfaction (spec/ACCEPTANCE_RULES.md).
 */
import Database from "better-sqlite3";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { approvalDecisionSchema, approvalRequestBindingDigest, approvalRequestSchema, type ApprovalDecisionRecord } from "../approvals/approvalChainStore.js";
import { evaluateApprovalQuorum } from "../approvals/approvalQuorum.js";
import { a4ProjectIds, materializeA4Record, syntheticIn, type A4BundleSlice } from "../bundles/bundleA4.js";
import { eventMeta } from "../claims/evidenceProvenance.js";
import { a4RecordV1Schema, type A4RecordV1 } from "../contracts/v1/a4Record.js";
import { getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { canonicalMetadataForHash, openLedger, type Ledger } from "../ledger/ledger.js";
import { hasTable } from "../ledger/ledgerSchema.js";
import { highSeveritySecretTypes } from "../release/releaseSecretScan.js";
import { extractValidatedTarGzipArchive } from "../security/safeTarArchive.js";
import { boundedFile } from "../standard/externalEvidenceFiles.js";
import { admitKey, type IssuerAdmission } from "../trust/admission.js";
import { carriedLedgerAnchoring, checkDigestSignature, envelopePublicKey } from "../trust/signatureCheck.js";
import { loadTrustContext, type TrustContext } from "../trust/trustContext.js";
import { buildVerifierReport, type VerifierReportV1 } from "../trust/verifierReport.js";
import type { EvidenceEvent } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { resolveRefs } from "./a4Evidence.js";
import {
  A4_BOUND_ITEMS, A4_ENVELOPE_KINDS, DEFAULT_A4_GATE_POLICY, a4EvidenceRefRowSchema, a4TransitionRowSchema, flatSlots, gatePolicyDigestOf, gateSupersededBy,
  ratchetedFromChain, type A4ChainLink, type A4EvidenceRefRow, type A4Stage
} from "./a4Schema.js";
import { authorOf, buildersOf, evaluateSod, type SodDecision } from "./a4SoD.js";
import { A4StoreError, readA4Store } from "./a4Store.js";

/** The ledger migration that created the A4 tables (src/ledger/ledgerSchemaA4.ts). */
export const A4_MIGRATION = 13;
const OBSERVED_TIERS = new Set(["OBSERVED", "OBSERVED_HARDENED"]);
/** Lowest first, as src/a4/a4Evidence.ts ranks them; a missing or unknown tier ranks below all of them. */
const TIER_ORDER: readonly string[] = ["SELF_REPORTED", "ATTESTED", "OBSERVED", "OBSERVED_HARDENED"];
const ROTATED_OUT = new Set(["expired", "revoked", "distrusted", "not-yet-valid"]);
/** A lease token as src/a4/a4Store.ts refuses to store one. */
const LEASE_TOKEN = /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{40,}/;

type Row = Record<string, unknown>;
const parsed = (text: unknown): unknown => {
  try {
    return typeof text === "string" ? JSON.parse(text) as unknown : null;
  } catch {
    return null;
  }
};
const object = (text: unknown): Row | null => {
  const value = parsed(text);
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
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
    // envelope_json is outside the body digest and the audit row, so a kind the store always signs must carry one.
    if (row.envelope_json === null) {
      if (A4_ENVELOPE_KINDS.includes(row.kind)) out.errors.push(`A4_ENVELOPE_MISSING: transition ${row.seq} (${row.kind}) carries no A4_RECORD envelope`);
      continue;
    }
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

/**
 * The intent a gate stored against the rows it binds as they stood at its GATE_REQUESTED (design §6.2): the revision's
 * spec and resource digests (a policy gate's proposal instead), the member set, the revision's evidence refs, the policy
 * in force, the excluded keys (requester, author, a completion gate's builders) and its own bound item set, with the
 * request's intentHash over the stored bytes. The readiness binding digest is the workspace's statement at request time
 * (live facts are not exported); it is checked for one value across gate, intent and request body.
 */
function intentProblems(db: Ledger["db"], projectId: string, links: readonly A4ChainLink[], gateId: string, gate: Row): string[] {
  const intent = object(gate.intent_json);
  const request = object(gate.request_json) as { boundHashes?: { intentHash?: unknown } } | null;
  const requested = links.find((link) => link.kind === "GATE_REQUESTED" && link.body.gateId === gateId);
  if (intent === null || requested === undefined) return [`A4_INTENT_MISMATCH: gate ${gateId} names no intent or request transition`];
  const before = links.filter((link) => link.seq < requested.seq);
  const revisionNo = Number(gate.revision_no);
  const revision = db.prepare("SELECT spec_digest, resource_digests_json FROM a4_revisions WHERE project_id = ? AND revision_no = ?").get(projectId, revisionNo) as Row | undefined;
  const members = new Map<string, string[] | null>();
  for (const row of db.prepare("SELECT principal_key, event, roles_json FROM a4_members WHERE project_id = ? AND seq < ? ORDER BY seq").all(projectId, requested.seq) as Row[]) {
    const roles = parsed(row.roles_json);
    members.set(String(row.principal_key), row.event === "removed" || !Array.isArray(roles) ? null : roles.map(String));
  }
  const refs = db.prepare("SELECT ref_kind, ref_id, sha256 FROM a4_evidence_refs WHERE project_id = ? AND revision_no = ? AND seq < ? ORDER BY seq")
    .all(projectId, revisionNo, requested.seq) as Row[];
  const author = gate.gate === "policy" ? null : authorOf(before, revisionNo);
  const expected: Row = {
    schema: "amc.a4-intent/v1", projectId, stage: gate.stage, gate: gate.gate, revisionNo,
    specDigest: gate.gate === "policy" ? sha256Hex(canonicalize(requested.body.proposedGatePolicy ?? null)) : revision?.spec_digest ?? sha256Hex(""),
    resourceDigests: revision ? flatSlots(parsed(revision.resource_digests_json)) : {},
    memberSetDigest: sha256Hex(canonicalize([...members].filter((entry): entry is [string, string[]] => entry[1] !== null).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, roles]) => ({ key, roles: [...roles].sort() })))),
    evidenceRefDigests: refs.map((ref) => sha256Hex(canonicalize([ref.ref_kind, ref.ref_id, ref.sha256]))),
    readinessBindingDigest: gate.readiness_sha256, boundItemIds: parsed(gate.bound_items_json),
    gatePolicyDigest: gate.gate_policy_digest,
    excludedKeys: [...new Set([String(gate.requested_by_key), ...(author === null ? [] : [author]), ...(gate.gate === "completion" ? buildersOf(before, revisionNo) : [])])].sort()
  };
  const problems = Object.keys(expected).filter((key) => canonicalize(expected[key]) !== canonicalize(intent[key] ?? null)).map((key) => `A4_INTENT_MISMATCH: gate ${gateId} ${key}`);
  if (gate.intent_json !== canonicalize(intent) || request?.boundHashes?.intentHash !== sha256Hex(String(gate.intent_json))
    || requested.body.readinessBindingDigest !== gate.readiness_sha256) problems.push(`A4_INTENT_MISMATCH: gate ${gateId} intentHash`);
  // Exactly the stage's set: never a gate-derived item or an environment fact, never fewer than the mandatory items.
  // ponytail: one v1 table; key A4_BOUND_ITEMS by intent version the day it changes, or older gates would fail here.
  if (canonicalize(expected.boundItemIds) !== canonicalize(A4_BOUND_ITEMS[gate.stage as A4Stage] ?? null)) {
    problems.push(`A4_BOUND_ITEMS: gate ${gateId} binds an item set other than A4_BOUND_ITEMS[${String(gate.stage)}]`);
  }
  return problems;
}

/** Gate binding and gate-policy digests, the recomputed intent, decision binding and self-approval, all re-derived from the rows. */
function checkGates(ledger: Ledger, projectId: string, links: readonly A4ChainLink[], out: Findings, sideRowsIntact: boolean): Map<string, Row> {
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
    // An intent is recomputed only from side rows the chain verified; a missing row already fails completeness.
    if (sideRowsIntact) out.errors.push(...intentProblems(db, projectId, links, gateId, gate));
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
      // ATTESTED holds only while the row's attestation verifies under the trust list in force, so a row that declares
      // ATTESTED with an attestation reads ATTESTED or SELF_REPORTED as the list changes: its ceiling is ATTESTED, and a
      // stored tier within the ceiling is a trust-list change (a warning; the read-time lane downgrade covers the claim).
      const event = ledger.getEventById(ref.ref_id);
      const meta = event ? eventMeta(event) : {};
      const ceiling = resolved.trustTier !== null && meta.trustTier === "ATTESTED" && typeof meta.attestation === "object" && meta.attestation !== null
        ? "ATTESTED" : resolved.trustTier;
      const stated = `evidence ref ${ref.seq} stores ${ref.trust_tier ?? "no tier"}, the referenced row reads ${resolved.trustTier ?? "none"}`;
      if (TIER_ORDER.indexOf(ref.trust_tier ?? "") > TIER_ORDER.indexOf(ceiling ?? "")) out.errors.push(`TRUST_TIER_INFLATED: ${stated}`);
      else out.warnings.push(`TRUST_TIER_CHANGED: ${stated} under the current trust list (not evaluated as tampering)`);
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
  const gates = checkGates(ledger, projectId, links, out, !out.errors.some((error) => error.startsWith("A4_SIDE_ROW_")));
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
    // A deleted head row (or project) fails as A4_CHAIN_INVALID / A4_PROJECT_NOT_FOUND, never reads as a smaller passing set.
    const projects = a4ProjectIds(db);
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

// ── Offline verification of an exported project (P1-63; spec/ACCEPTANCE_RULES.md "A4 project record") ──

/** An export larger than this is refused before it is parsed; an archive is bounded again as it is extracted. */
const A4_INPUT_LIMIT = 128 * 1024 * 1024;
const A4_ARCHIVE_LIMITS = { maxEntries: 10_000, maxCompressedBytes: A4_INPUT_LIMIT, maxEntryBytes: A4_INPUT_LIMIT, maxTotalBytes: 512 * 1024 * 1024, maxPathBytes: 1024 };
const RECORD_NOTE = "a4-record: each exported ledger row is checked on its own; its place in the workspace ledger chain is not evaluated from a record";
const NOT_ADMITTED = "ISSUER_NOT_ADMITTED: integrity only; a pinned trust list must admit the monitor and auditor keys";
const PROJECT_ID = /^a4p_[0-9a-f]{32}$/;
type Dimension = VerifierReportV1["scope"];
type Dimensions = Pick<VerifierReportV1, "scope" | "freshness" | "completeness" | "satisfaction">;
const dimension = (status: Dimension["status"], reasons: string[]): Dimension => ({ status, reasons });
const allNotEvaluated = (reason: string): Dimensions => {
  const none = dimension("not-evaluated", [reason]);
  return { scope: none, freshness: none, completeness: none, satisfaction: none };
};
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const unloadable = (artifact: VerifierReportV1["artifact"], trust: TrustContext, now: number, error: string): VerifierReportV1 => ({
  ...buildVerifierReport({ artifact, context: trust, integrityErrors: [error], signatures: [], verifiedAt: new Date(now),
    anchoring: { status: "unanchored", detail: "the export did not load" } }),
  ...allNotEvaluated("INTEGRITY_FAILED")
});

/** Why one exported ledger row does not recompute to its own event hash or verify under a carried monitor key (no chain walk). */
function rowProblem(event: EvidenceEvent, keys: string[]): string | null {
  const preimage = canonicalMetadataForHash({ id: event.id, ts: event.ts, sessionId: event.session_id, runtime: event.runtime, eventType: event.event_type,
    payloadPath: event.canonical_payload_path ?? event.payload_path, payloadInline: event.canonical_payload_inline ?? event.payload_inline, metaJson: event.meta_json });
  if (sha256Hex(`${event.prev_event_hash}${preimage}${event.payload_sha256}`) !== event.event_hash) return "does not recompute to its event hash";
  return verifyHexDigestAny(event.event_hash, event.writer_sig, keys) ? null : "is not signed by a carried monitor key";
}

/**
 * What an export adds to verifyA4Chain: each exported ledger row recomputes and is signed on its own, and each transition's
 * audit row is the A4_STATE, a4-store, SELF_REPORTED row of that transition (integrity); every row names the project, and
 * every ledger_event ref names a row of the project's agent (scope); every such ref resolves in the export (completeness).
 */
function recordChecks(ledger: Ledger, record: A4RecordV1): { errors: string[]; scope: string[]; completeness: string[]; agentId: string | null } {
  const keys = getPublicKeyHistory(ledger.workspace, "monitor");
  const events = new Map(record.evidence.events.map((row) => [String(row.id), row as unknown as EvidenceEvent]));
  const errors = [...events.values()].flatMap((event) => {
    const problem = rowProblem(event, keys);
    return problem === null ? [] : [`A4_EVIDENCE_ROW_INVALID: ledger row ${event.id} ${problem}`];
  });
  for (const transition of record.tables.a4_transitions) {
    const event = events.get(String(transition.evidence_event_id));
    const meta = event ? eventMeta(event) : null;
    if (meta !== null && (meta.auditType !== "A4_STATE" || meta.source !== "a4-store" || meta.trustTier !== "SELF_REPORTED"
      || meta.projectId !== record.projectId || meta.seq !== transition.seq)) {
      errors.push(`A4_AUDIT_ROW_UNBOUND: transition ${String(transition.seq)} is not backed by its own A4_STATE, a4-store, SELF_REPORTED audit row`);
    }
  }
  if (record.containsSyntheticExamples !== syntheticIn(record.tables)) {
    errors.push(`A4_SYNTHETIC_LABEL_MISMATCH: containsSyntheticExamples is ${String(record.containsSyntheticExamples)} but the evidence refs say otherwise`);
  }
  const agentId = object(record.tables.a4_transitions.find((row) => row.seq === 0)?.body_json)?.agentId;
  const agent = typeof agentId === "string" ? agentId : null;
  const scope = Object.entries(record.tables).flatMap(([table, rows]) => rows.some((row) => row.project_id !== record.projectId)
    ? [`A4_SCOPE_FOREIGN_ROW: ${table} holds rows of another project`] : []);
  if (agent === null || record.tables.a4_projects.some((row) => row.agent_id !== agent)) scope.push("A4_SCOPE_AGENT: the head row and the CREATED transition name different agents, or none");
  const completeness: string[] = [];
  for (const ref of record.tables.a4_evidence_refs.filter((row) => row.ref_kind === "ledger_event")) {
    const event = events.get(String(ref.ref_id));
    if (event === undefined) completeness.push(`REF_DANGLING: evidence ref ${String(ref.seq)} names ledger row ${String(ref.ref_id)}, absent from this export`);
    else if (ref.sha256 !== event.event_hash && ref.sha256 !== event.payload_sha256) completeness.push(`REF_DIGEST_MISMATCH: evidence ref ${String(ref.seq)}`);
    else if ((eventMeta(event).agentId ?? eventMeta(event).agent_id) !== agent) scope.push(`A4_SCOPE_FOREIGN_AGENT: evidence ref ${String(ref.seq)} names a row of another agent`);
  }
  return { errors, scope, completeness, agentId: agent };
}

/**
 * A consumed gate's quorum as the approval engine counts it at the consume (role-allowed decisions, distinct users, any
 * DENY terminal), after checking nothing superseded the gate first: GATE_CONSUMED is itself the gate's first superseding
 * transition, and anything earlier killed every vote. An open gate reads GATE_OPEN with its count; null when neither.
 */
function quorumFinding(gate: Record<string, unknown>, links: readonly A4ChainLink[], counted: ApprovalDecisionRecord[], supersededBy: A4ChainLink | null,
  asOf: number): string | null {
  const gateId = String(gate.gate_id);
  const request = approvalRequestSchema.safeParse(object(gate.request_json));
  if (!request.success) return null; // A4_GATE_BINDING_INVALID already failed integrity
  const quorumAt = (ts: number) => evaluateApprovalQuorum({ request: { ...request.data, status: "PENDING" }, decisions: counted, now: ts });
  const consumed = links.find((link) => link.kind === "GATE_CONSUMED" && link.body.gateId === gateId);
  if (consumed === undefined) {
    if (supersededBy !== null) return null;
    const open = quorumAt(asOf);
    return `GATE_OPEN: gate ${gateId} ${open.received} of ${open.required} approvals (${open.status})`;
  }
  if (supersededBy !== null && supersededBy.seq < consumed.seq) {
    return `GATE_CONSUMED_AFTER_SUPERSEDED: gate ${gateId} was consumed at seq ${consumed.seq} after seq ${supersededBy.seq} (${supersededBy.kind}) superseded it`;
  }
  const quorum = quorumAt(Number(consumed.body.ts));
  if (quorum.status === "DENIED") return `GATE_DENIED_CONSUMED: gate ${gateId} was consumed after a counted DENY`;
  return quorum.status === "QUORUM_MET" ? null : `QUORUM_NOT_MET: gate ${gateId} was consumed with ${quorum.received} of ${quorum.required} approvals (${quorum.status})`;
}

/**
 * The gate rules over the verified snapshot: a decision counts only when it binds its gate's request digest and precedes
 * any superseding transition; every counted APPROVE passes SoD as of its own seq (builders, authors and requesters never
 * approve their own work); a consumed gate was not superseded first and met its quorum as the engine counts it
 * (`evaluateApprovalQuorum`: role-allowed decisions, distinct users, any DENY terminal). Self-approval, a single-user
 * workspace, a synthetic bound ref and a LOCAL_USER-only regulated quorum leave it not evaluated; an open gate is listed
 * with its count. SoD-distinct is never independent.
 */
function satisfactionOf(snapshot: ReturnType<ReturnType<typeof readA4Store>["snapshot"]>): Dimension {
  const { links, rows } = snapshot;
  const failed: string[] = [];
  const open: string[] = [];
  const pending: string[] = [];
  const asOf = Number(links.at(-1)?.body.ts);
  const facts = links.find((link) => link.kind === "CREATED")?.body.selfApprovalFacts as { activeUserCount?: unknown } | null | undefined;
  if (facts?.activeUserCount === 1 && !ratchetedFromChain(links)) open.push("SINGLE_USER_WORKSPACE: the project was created in a single-user workspace and never ratcheted");
  for (const gate of rows.a4_gates) {
    const gateId = String(gate.gate_id);
    const revisionNo = Number(gate.revision_no);
    const requested = links.find((link) => link.kind === "GATE_REQUESTED" && link.body.gateId === gateId);
    if (requested === undefined) continue; // a side row the chain does not name fails completeness first
    const supersededBy = gateSupersededBy(links, { gateId, revisionNo, requestedSeq: requested.seq });
    const counted = rows.a4_decisions.filter((row) => row.gate_id === gateId).flatMap((row) => {
      const decided = links.find((link) => link.kind === "GATE_DECIDED" && link.body.decisionId === row.decision_id);
      const record = approvalDecisionSchema.safeParse(object(row.decision_json));
      const bound = record.success && row.request_digest === gate.binding_digest && record.data.requestDigestSha256 === gate.binding_digest;
      return decided !== undefined && bound && (supersededBy === null || decided.seq < supersededBy.seq) ? [{ row, seq: decided.seq, record: record.data }] : [];
    }).sort((a, b) => a.seq - b.seq);
    if (rows.a4_evidence_refs.some((ref) => ref.revision_no === revisionNo && ref.claim_kind === "synthetic_example" && Number(ref.seq) < requested.seq)) {
      open.push(`SYNTHETIC_VALUES: gate ${gateId} binds a synthetic_example ref`);
    }
    counted.forEach((entry, index) => {
      if (entry.row.self_approved === 1) open.push(`SINGLE_USER_WORKSPACE: gate ${gateId} decision ${String(entry.row.decision_id)} is self-approved`);
      if (entry.row.self_approved === 1 || entry.record.decision !== "APPROVE_EXECUTE") return;
      const sod = evaluateSod({ gate: { gateId, gate: gate.gate as "direction" | "completion" | "policy", revisionNo, requesterKeys: [String(gate.requested_by_key)],
        excludedKeys: ([parsed(gate.excluded_keys_json)].flat() as unknown[]).map(String) },
      decisions: counted.slice(0, index).map((prior) => ({ approverKey: String(prior.row.approver_key), authSource: String(prior.row.auth_source),
        decision: prior.record.decision as SodDecision["decision"] })),
      transitions: links.filter((link) => link.seq < entry.seq), regulated: object(entry.row.self_approval_facts_json)?.regulated !== false,
      selfApprovalAllowed: false, approver: { key: String(entry.row.approver_key), authSource: String(entry.row.auth_source) } });
      if (!sod.ok) failed.push(`SOD_VIOLATION: gate ${gateId} decision ${String(entry.row.decision_id)} (${sod.violations.join(", ")})`);
      if (sod.degraded.includes("SOD_DEGRADED_SELF_PROVISIONED")) open.push(`SOD_DEGRADED_SELF_PROVISIONED: gate ${gateId} has a regulated quorum of LOCAL_USER keys only`);
    });
    const quorum = quorumFinding(gate, links, counted.map((entry) => entry.record), supersededBy, asOf);
    if (quorum !== null) (quorum.startsWith("GATE_OPEN") ? pending : failed).push(quorum);
  }
  if (failed.length > 0) return dimension("fail", [...failed, ...open]);
  if (open.length > 0) return dimension("not-evaluated", open);
  if (rows.a4_gates.length === 0) return dimension("not-evaluated", ["NO_GATES"]);
  return dimension("pass", ["every counted decision binds its gate and is SoD-distinct, and every consumed gate met its quorum; SoD-distinct is not independent: each decision is self_reported (review.independent = false)",
    ...pending]);
}

/** One exported project: verifyA4Chain on its rows, the export's own checks, then the four dimensions under admitted keys only. */
function recordReport(ledger: Ledger, record: A4RecordV1, trust: TrustContext, now: number, artifact: VerifierReportV1["artifact"], note: string | null): VerifierReportV1 {
  const chain = verifyA4Chain(ledger, record.projectId, trust, now);
  const checks = recordChecks(ledger, record);
  const integrityErrors = [...chain.integrity.errors, ...checks.errors];
  const sideRows = integrityErrors.filter((error) => error.startsWith("A4_SIDE_ROW_"));
  const intact = integrityErrors.length === sideRows.length;
  const signatures = [...chain.issuerAdmission.signatures];
  const monitor = admitKey({ publicKeyPem: record.publicKeys.monitor.publicKeyPem, purpose: "ledger-row", signature: "a4-record monitor key", context: trust,
    keyHistory: record.publicKeys.monitor.history ?? undefined });
  const anchoring = carriedLedgerAnchoring(monitor, intact, signatures);
  const fileRefs = record.tables.a4_evidence_refs.filter((row) => row.ref_kind !== "ledger_event" && row.ref_kind !== "external").length;
  const report = buildVerifierReport({ artifact, context: trust, integrityErrors, signatures, anchoring, verifiedAt: new Date(now),
    warnings: [...chain.warnings.filter((warning) => !warning.startsWith("workspace-self:")), ...(note === null ? [] : [note]),
      ...(fileRefs > 0 ? [`FILE_REFS_BOUND_BY_DIGEST: ${fileRefs} file evidence refs are bound by sha256; their bytes are not part of an export`] : [])] });
  if (!intact) return { ...report, ...allNotEvaluated("INTEGRITY_FAILED") };
  // A project with no envelope yet has no auditor signature to admit (issuer admission not-evaluated): only a refused key blocks.
  if (report.issuerAdmission.status === "fail" || anchoring.status !== "anchored") return { ...report, ...allNotEvaluated(NOT_ADMITTED) };
  const completeness = [...sideRows, ...checks.completeness];
  return {
    ...report,
    scope: checks.scope.length > 0 ? dimension("fail", checks.scope) : dimension("pass", [`every row names project ${record.projectId} of agent ${checks.agentId ?? ""}`]),
    freshness: chain.freshness.status === "fail" ? chain.freshness
      : record.tables.a4_decisions.length > 0 ? dimension("pass", ["every decision carries its gate's request digest"]) : dimension("not-evaluated", ["NO_DECISIONS"]),
    completeness: completeness.length > 0 ? dimension("fail", completeness) : dimension("pass", ["every side row the chain names is present and unchanged; every ledger_event ref resolves"]),
    satisfaction: completeness.length > 0 ? dimension("not-evaluated", ["COMPLETENESS_FAILED"]) : satisfactionOf(readA4Store(ledger).snapshot(record.projectId))
  };
}

/** An `amc.a4-record/v1` export, loaded into a temporary ledger of exactly its rows. Trust is the caller's. */
export function verifyA4Record(record: A4RecordV1, trust: TrustContext, now = Date.now(),
  artifact: VerifierReportV1["artifact"] = { kind: "a4-record", path: record.projectId, sha256: sha256Hex(canonicalize(record)) }, note: string | null = RECORD_NOTE): VerifierReportV1 {
  let materialized: ReturnType<typeof materializeA4Record>;
  try {
    materialized = materializeA4Record(record);
  } catch (error) {
    return unloadable(artifact, trust, now, `A4_RECORD_UNLOADABLE: ${messageOf(error)}`);
  }
  try {
    const ledger = openLedger(materialized.workspace, { readonly: true });
    try {
      return recordReport(ledger, record, trust, now, artifact, note);
    } catch (error) {
      // Rows that load but cannot be read back as A4 records are an integrity failure, never another verdict.
      return unloadable(artifact, trust, now, `A4_RECORD_UNVERIFIABLE: ${messageOf(error)}`);
    } finally {
      ledger.close();
    }
  } finally {
    materialized.cleanup();
  }
}

const combine = (parts: ReadonlyArray<{ projectId: string; dimension: Dimension }>): Dimension => ({
  status: parts.some((part) => part.dimension.status === "fail") ? "fail"
    : parts.length === 0 || parts.some((part) => part.dimension.status === "not-evaluated") ? "not-evaluated" : "pass",
  reasons: parts.length === 0 ? ["NO_A4_SLICE: the bundle lists no A4 project"] : parts.flatMap((part) => part.dimension.reasons.map((reason) => `${reason} [${part.projectId}]`))
});

/**
 * Verifies an exported A4 project offline: an `amc.a4-record/v1` JSON file, or an `.amcbundle` with an A4 slice (the
 * bundle's manifest, files and ledger through verifyEvidenceBundle, then each project `a4/index.json` lists, whose record
 * file `a4/<projectId>.json` must hold the listed head; the signed manifest pins both files). The file is read once;
 * every check reads those bytes. Trust is the caller's: the operator's on an API route (never a request's),
 * `--trust-list` on the CLI. Every verdict is an integrity-section item.
 */
export async function verifyA4Bundle(file: string, trust: TrustContext = loadTrustContext(), now = Date.now()): Promise<VerifierReportV1> {
  const bytes = boundedFile(file, A4_INPUT_LIMIT);
  const artifact = { kind: "a4-record", path: file, sha256: sha256Hex(bytes) };
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    let parsed: ReturnType<typeof a4RecordV1Schema.safeParse> | null = null;
    try {
      parsed = a4RecordV1Schema.safeParse(JSON.parse(bytes.toString("utf8")));
    } catch {
      // Not JSON: reported below.
    }
    return parsed?.success ? verifyA4Record(parsed.data, trust, now, artifact) : unloadable(artifact, trust, now, "A4_RECORD_INVALID: not an amc.a4-record/v1 document");
  }
  const bundleArtifact = { ...artifact, kind: "a4-bundle" };
  const dir = mkdtempSync(join(tmpdir(), "amc-a4-bundle-"));
  try {
    const copy = join(dir, "bundle.amcbundle");
    writeFileSync(copy, bytes, { mode: 0o600 });
    const { verifyEvidenceBundle } = await import("../bundles/bundle.js");
    const bundle = (await verifyEvidenceBundle(copy, trust)).report;
    const root = join(dir, "root");
    mkdirSync(root);
    extractValidatedTarGzipArchive({ file: copy, destination: root, label: "archive", limits: A4_ARCHIVE_LIMITS });
    const index = join(root, "a4", "index.json");
    const slice = existsSync(index) ? parsed(readFileSync(index, "utf8")) as A4BundleSlice | null : undefined;
    const sliceErrors: string[] = [];
    if (slice === null || (slice !== undefined && (slice.schema !== "amc.a4-bundle-slice/v1" || !Array.isArray(slice.projects)))) {
      sliceErrors.push("A4_SLICE_INDEX_INVALID: a4/index.json is not an amc.a4-bundle-slice/v1 listing");
    }
    const listed = Array.isArray(slice?.projects) ? slice.projects : [];
    const records = listed.flatMap((entry) => {
      const path = join(root, "a4", `${entry.projectId}.json`);
      const record = PROJECT_ID.test(entry.projectId) && existsSync(path) ? a4RecordV1Schema.safeParse(parsed(readFileSync(path, "utf8"))) : null;
      if (record?.success !== true || record.data.projectId !== entry.projectId) {
        sliceErrors.push(`A4_SLICE_RECORD_INVALID: a4/index.json lists ${entry.projectId}, whose a4/<projectId>.json is not its amc.a4-record/v1 record`);
        return [];
      }
      const head = record.data.tables.a4_projects[0];
      if (head?.head_seq !== entry.headSeq || head.head_digest !== entry.headDigest) {
        sliceErrors.push(`A4_SLICE_HEAD_MISMATCH: the exported head of ${entry.projectId} is not the head a4/index.json lists`);
      }
      return [record.data];
    });
    const unlisted = existsSync(join(root, "a4")) ? readdirSync(join(root, "a4"))
      .filter((name) => name !== "index.json" && !listed.some((entry) => `${entry.projectId}.json` === name)) : [];
    sliceErrors.push(...unlisted.map((name) => `A4_SLICE_UNLISTED: a4/${name} is in the bundle but a4/index.json does not list it`));
    if (slice != null && slice.containsSyntheticExamples !== records.some((record) => syntheticIn(record.tables))) {
      sliceErrors.push("A4_SYNTHETIC_LABEL_MISMATCH: a4/index.json's containsSyntheticExamples does not match the exported evidence refs");
    }
    // A later A4 audit session in the bundle's own ledger witnesses a transition the record does not show (rule 1).
    const db = new Database(join(root, "evidence", "evidence.sqlite"), { readonly: true });
    try {
      for (const entry of listed) {
        const sessionId = `a4-${entry.projectId}-${entry.headSeq + 1}`;
        if (db.prepare("SELECT 1 FROM sessions WHERE session_id = ? UNION ALL SELECT 1 FROM evidence_events WHERE session_id = ? LIMIT 1").get(sessionId, sessionId) !== undefined) {
          sliceErrors.push(`A4_SLICE_TRUNCATED: the bundle ledger holds session ${sessionId}, after the head a4/index.json lists`);
        }
      }
    } finally {
      db.close();
    }
    const projects = records.map((record) => ({ projectId: record.projectId, report: verifyA4Record(record, trust, now, bundleArtifact) }));
    const integrityErrors = [...bundle.integrity.errors, ...sliceErrors,
      ...projects.flatMap((project) => project.report.integrity.errors.map((error) => `${error} [${project.projectId}]`))];
    // Each record's rows are signed by the monitor key it carries, admitted on its own: the bundle is anchored only when every record is.
    const unanchored = projects.find((project) => project.report.anchoring.status !== "anchored");
    const anchoring = unanchored === undefined ? bundle.anchoring
      : { status: "unanchored" as const, detail: `A4 record ${unanchored.projectId}: ${unanchored.report.anchoring.detail ?? "monitor key not admitted for ledger-row"}` };
    const report = buildVerifierReport({ artifact: bundleArtifact, context: trust, integrityErrors, anchoring, verifiedAt: new Date(now),
      signatures: [...bundle.issuerAdmission.signatures, ...projects.flatMap((project) => project.report.issuerAdmission.signatures)],
      warnings: [...bundle.warnings.filter((warning) => !warning.startsWith("workspace-self:")), ...new Set(projects.flatMap((project) => project.report.warnings))] });
    if (report.integrity.status === "fail") return { ...report, ...allNotEvaluated("INTEGRITY_FAILED") };
    // manifest.sig pins the heads: no dimension is evaluated unless every signature, that one included, is admitted.
    if (report.issuerAdmission.status !== "pass" || anchoring.status !== "anchored") return { ...report, ...allNotEvaluated(NOT_ADMITTED) };
    const of = (key: keyof Dimensions): Dimension => combine(projects.map((project) => ({ projectId: project.projectId, dimension: project.report[key] })));
    return { ...report, scope: of("scope"), freshness: of("freshness"), completeness: of("completeness"), satisfaction: of("satisfaction") };
  } catch (error) {
    return unloadable(bundleArtifact, trust, now, `A4_BUNDLE_UNREADABLE: ${messageOf(error)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
