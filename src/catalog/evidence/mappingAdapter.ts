/**
 * Compliance mappings as evidence contracts (P1-11). Each requirement of a mapping becomes a one-contract control that
 * evaluateControl runs on items read from this workspace's ledger and sealed assurance reports. Provenance, binding
 * and verdicts come from the bytes read here, in the same read; nothing is read back from a report or an editable file.
 */
import { basename } from "node:path";
import { effectiveTrustTier, eventMeta, producerOfMeta, type ReaderTrust } from "../../claims/evidenceProvenance.js";
import { auditTypeOf, isBoundToControl, subjectRole, type VerifiedAssurance } from "../../compliance/evidenceBinding.js";
import type { ComplianceEvidenceRequirement, ComplianceMapping } from "../../compliance/mappingSchema.js";
import { verifyHexDigestAny } from "../../crypto/keys.js";
import { canonicalMetadataForHash } from "../../ledger/eventHash.js";
import { verifyReceipt } from "../../receipts/receipt.js";
import type { EvidenceEvent } from "../../types.js";
import { sha256Hex } from "../../utils/hash.js";
import type { BindingField, ProducerRecord } from "../types.js";
import { evaluateControl } from "./evaluate.js";
import type { ControlResult, EvaluatedContract, EvaluationContext, EvidenceItem, ItemProvenance } from "./types.js";

const LEDGER_PRODUCER = "amc.ledger";
const ASSURANCE_PRODUCER = "amc.assuranceRunner";
// ponytail: one freshness bound for every mapping-derived contract; per-control freshness comes with P1-53's re-keying.
const MAPPING_FRESHNESS_DAYS = 30;

const iso = (ms: number): string => {
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? "invalid" : date.toISOString();
};
const text = (value: unknown): string | undefined => (typeof value === "string" && value.length > 0 ? value : undefined);
/** The row with the payload its event hash covers, so binding reads the bytes the chain signed. */
const hashed = (event: EvidenceEvent): EvidenceEvent => ({ ...event, payload_inline: event.canonical_payload_inline ?? event.payload_inline });

/**
 * Null when the ledger's hash chain verifies whole and its head carries a monitor-key signature; otherwise why not. The
 * head signature commits to every row through the hash links. The monitor key is the workspace's own, so this is a
 * local audit trail, not a portable verdict (P0-09), and a truncated tail is invisible until anchoring (P1-26).
 */
export function ledgerChainError(events: readonly EvidenceEvent[], monitorKeys: string[]): string | null {
  // ponytail: rehashes the whole chain on every report; checkpoint a verified prefix if ledgers grow large.
  let previous = "GENESIS";
  for (const event of events) {
    if (event.prev_event_hash !== previous) return `ledger chain broken at event ${event.id}`;
    const canonical = canonicalMetadataForHash({
      id: event.id, ts: event.ts, sessionId: event.session_id, runtime: event.runtime, eventType: event.event_type,
      payloadPath: event.canonical_payload_path ?? event.payload_path,
      payloadInline: event.canonical_payload_inline ?? event.payload_inline,
      metaJson: event.meta_json
    });
    if (sha256Hex(`${event.prev_event_hash}${canonical}${event.payload_sha256}`) !== event.event_hash) {
      return `ledger event ${event.id} does not hash to its event_hash`;
    }
    previous = event.event_hash;
  }
  const head = events.at(-1);
  return head && !verifyHexDigestAny(head.event_hash, head.writer_sig, monitorKeys)
    ? `ledger head ${head.id} is not signed by this workspace's monitor key` : null;
}

export interface ComplianceEvidenceSource {
  workspaceId: string;
  agentId: string;
  /** In-window ledger rows that name this agent or sit in the workspace system session. */
  rows: readonly EvidenceEvent[];
  /** ledgerChainError of the chain these rows were read from, in the same read. */
  chainError: string | null;
  monitorKeys: string[];
  reader: () => ReaderTrust;
  assurance: VerifiedAssurance;
}

export function complianceContext(params: { workspaceId: string; agentId: string; windowStartTs: number; windowEndTs: number;
  producers: readonly ProducerRecord[] }): EvaluationContext {
  return {
    // No tenant, deployment or subject is recorded for a single workspace, and no compiled plan exists yet (P1-10).
    subject: { tenantId: null, workspaceId: params.workspaceId, deploymentId: null, agentId: params.agentId, subjectId: null },
    window: { start: iso(params.windowStartTs), end: iso(params.windowEndTs) },
    plan: null,
    invalidations: [],
    reviews: [],
    producers: params.producers
  };
}

function ledgerItem(event: EvidenceEvent, source: ComplianceEvidenceSource, verdict: EvidenceItem["verdict"],
  controlId?: string): EvidenceItem {
  const meta = eventMeta(event);
  const receiptText = text(meta.receipt);
  const receipt = receiptText === undefined ? null : verifyReceipt(receiptText, source.monitorKeys);
  const auditType = auditTypeOf(hashed(event));
  const decision = auditType === "TOOL_CALL_ALLOWED" ? "allow" : auditType === "TOOL_CALL_DENIED" ? "deny" : undefined;
  const callId = text(meta.callId);
  const provenance: ItemProvenance = source.chainError ? { verified: false, detail: source.chainError }
    : receipt && !receipt.ok ? { verified: false, detail: `the record's receipt does not verify (${receipt.error ?? "unknown"})` }
    : { verified: true, producerId: producerOfMeta(meta) === "amc-runtime" ? LEDGER_PRODUCER : null,
      trustTier: effectiveTrustTier(event, source.reader) };
  const binding = Object.fromEntries(Object.entries({
    workspaceId: source.workspaceId, sessionId: event.session_id, controlId, agentId: text(meta.agentId),
    tenantId: text(meta.tenantId), deploymentId: text(meta.deploymentId), subjectId: text(meta.subjectId),
    policyDigest: text(meta.policyDigest)
  }).filter(([, value]) => value !== undefined)) as EvidenceItem["binding"];
  return {
    ref: { kind: "ledger_event", id: event.id, sha256: event.event_hash },
    producerId: LEDGER_PRODUCER,
    provenance,
    recordedAt: iso(event.ts),
    claimedAt: null,
    binding,
    verdict,
    attributes: {
      eventType: event.event_type,
      ...(auditType === null ? {} : { auditType }),
      ...(receipt?.payload ? { receiptId: receipt.payload.receipt_id,
        foreignReceipt: receipt.payload.event_hash !== event.event_hash || receipt.payload.session_id !== event.session_id } : {}),
      ...(callId && decision ? { observationKey: `tool_call:${callId}`, observation: decision, decision } : {})
    }
  };
}

function assuranceItems(requirement: Extract<ComplianceEvidenceRequirement, { type: "requires_assurance_pack" }>,
  source: ComplianceEvidenceSource, notes: string[]): EvidenceItem[] {
  const { packId } = requirement;
  const item = (ref: EvidenceItem["ref"], provenance: ItemProvenance, ts: number, verdict: EvidenceItem["verdict"]): EvidenceItem => ({
    ref, producerId: ASSURANCE_PRODUCER, provenance, recordedAt: iso(ts), claimedAt: null,
    binding: { agentId: source.agentId, workspaceId: source.workspaceId }, verdict, attributes: { packId }
  });
  const items = source.assurance.unverifiable.filter((row) => row.packIds.includes(packId)).map((row) => item(
    { kind: "assurance_report", id: basename(row.file), sha256: row.sha256 },
    { verified: false, detail: `Assurance report for '${packId}' failed hash, seal or run integrity verification` }, Number.NaN, "neutral"));
  const pack = source.assurance.packs.get(packId);
  const run = source.assurance.runs.get(packId);
  if (!pack || !run) {
    if (items.length === 0) notes.push(`No sealed assurance run for '${packId}' in window`);
    return items;
  }
  const ref = { kind: "assurance_report" as const, id: run.runId, sha256: run.reportSha256 };
  // Truth rule 3: a keyword match is never a regulated result, pass or fail. Older reports carry no flag.
  if (pack.regulatedEligible !== true) {
    const detail = `assurance pack ${packId} is ${pack.gradingMethod ?? "keyword"}-graded; keyword grading is not regulated evidence`;
    return [...items, item(ref, { verified: false, detail }, run.ts, "neutral")];
  }
  const total = pack.scenarioResults.length;
  const inconclusive = pack.scenarioResults.filter((scenario) => scenario.inconclusive === true).length;
  const succeeded = pack.scenarioResults.reduce((sum, scenario) =>
    sum + scenario.auditEventTypes.filter((type) => type.endsWith("_SUCCEEDED")).length, 0);
  const pass = pack.score0to100 >= requirement.minScore && succeeded <= requirement.maxSucceeded;
  // A pack that measured nothing, or passed on part of its scenarios, proves nothing; a measured failure still fails.
  if (inconclusive === total) notes.push(`Assurance pack '${packId}' measured no scenario`);
  else if (pass && inconclusive > 0) notes.push(`Assurance pack '${packId}': ${inconclusive} of ${total} scenarios inconclusive; a partial measurement cannot pass`);
  else {
    notes.push(pass ? `Assurance pack '${packId}' score ${pack.score0to100} meets threshold`
      : `Assurance pack '${packId}' score ${pack.score0to100} / succeeded events ${succeeded} does not meet threshold`);
    items.push(item(ref, { verified: true, producerId: ASSURANCE_PRODUCER, trustTier: "OBSERVED" }, run.ts, pass ? "conforms" : "violates"));
  }
  return items;
}

export interface RequirementEvaluation {
  result: ControlResult;
  /** Admitted ledger records that decided the result: control-bound records and violations. */
  refs: Array<{ eventId: string; eventHash: string; eventType: string }>;
  notes: string[];
  /** What would let this requirement be evaluated or pass. */
  needed: string;
}

/** Runs one mapping requirement through evaluateControl. */
export function evaluateMappingRequirement(mapping: ComplianceMapping, requirement: ComplianceEvidenceRequirement, index: number,
  source: ComplianceEvidenceSource, ctx: EvaluationContext): RequirementEvaluation {
  const scope = mapping.binding?.scope ?? "agent";
  const scopeField: BindingField = scope === "workspace" ? "workspaceId" : "agentId";
  const notes: string[] = [];
  const contract = (producer: string, bindingFields: BindingField[], minObservedRatio?: number): EvaluatedContract => ({
    id: `${mapping.id}-E${index + 1}`, producer, bindingFields, freshness: { maxAgeDays: MAPPING_FRESHNESS_DAYS },
    sampling: { method: "all", ratePercent: null, minItems: 1 }, retention: { mode: "regime_max" },
    residency: { mode: "inherit_deployment" }, ...(minObservedRatio ? { minObservedRatio } : {})
  });
  let items: EvidenceItem[];
  let evidence: EvaluatedContract;
  let needed: string;
  if (requirement.type === "requires_evidence_event") {
    items = source.rows.filter((event) => requirement.eventTypes.includes(event.event_type)
      && isBoundToControl(hashed(event), mapping, requirement)).map((event) => ledgerItem(event, source, "conforms", mapping.id));
    if (items.length === 0) notes.push(`no control-bound evidence for ${mapping.id} in window`);
    evidence = contract(LEDGER_PRODUCER, ["controlId", scopeField], requirement.minObservedRatio);
    needed = `Capture ${requirement.eventTypes.join(", ")} events bound to '${mapping.id}' (meta.controlIds) from AMC runtime with OBSERVED trust tier`;
  } else if (requirement.type === "requires_no_audit") {
    // Coverage is any record of this subject; a denied audit type counts against it from the system session too.
    items = source.rows.flatMap((event) => {
      const role = subjectRole(event, source.agentId, scope);
      const auditType = auditTypeOf(hashed(event));
      const violates = auditType !== null && requirement.auditTypesDenylist.includes(auditType);
      return role === "positive" || (role === "violation-only" && violates) ? [ledgerItem(event, source, violates ? "violates" : "neutral")] : [];
    });
    evidence = contract(LEDGER_PRODUCER, [scopeField]);
    needed = `Resolve and eliminate audit events: ${requirement.auditTypesDenylist.join(", ")}`;
  } else {
    items = assuranceItems(requirement, source, notes);
    evidence = contract(ASSURANCE_PRODUCER, [scopeField]);
    needed = `Run assurance pack '${requirement.packId}' with score >= ${requirement.minScore} and *_SUCCEEDED <= ${requirement.maxSucceeded}`;
  }
  const result = evaluateControl({
    id: mapping.id, version: "1", invalidatedBy: [], evidence: [evidence],
    binding: { kind: "manual", points: [], mechanism: `compliance mapping requirement ${requirement.type}`, parameters: [], manualDuty: null }
  }, items, ctx);
  const admitted = new Set(result.admitted.map((row) => row.ref.id));
  const decisive = items.filter((item) => item.ref.kind === "ledger_event" && item.verdict !== "neutral" && admitted.has(item.ref.id));
  if (requirement.type === "requires_no_audit") {
    if (decisive.length > 0) notes.push(`Found denied audit events: ${requirement.auditTypesDenylist.join(", ")}`);
    else if (!items.some((item) => admitted.has(item.ref.id))) {
      notes.push("no agent activity in window; absence of violations proves nothing");
      needed = "Capture AMC runtime evidence for this agent in the window";
    }
  }
  return {
    result,
    refs: decisive.map((item) => ({ eventId: item.ref.id, eventHash: item.ref.sha256, eventType: String(item.attributes.eventType) })),
    notes,
    needed
  };
}
