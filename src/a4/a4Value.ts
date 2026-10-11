/**
 * Activate's value reporting (P1-62 slice C; design §15). One signed `amc.a4-value-claim/v1` per value-contract KPI per
 * release, four lanes side by side and never merged: recommended (the contract's bound), implemented (the contract,
 * when its signature verifies), observed (the value snapshot's number only while every ledger ref behind it resolves to
 * a row of this agent and none dangles; null otherwise, a dangling ref is a reason, never an omission) and verified
 * (`not_evaluated` until an admitted external record names the KPI and its window, P2-24/P3-21).
 *
 * `createValueReport` appends OBSERVED value events on every call, so it runs once per review: in Review's post-commit
 * step (`recordReviewResults`, run once the review STEP committed, never on a replay or a refusal), which then records
 * the claims, and the ledger rows the monitor record named, as refs by amc-runtime in one transition. `valueView`
 * (GET …/value) only reads: it re-resolves each claim's refs now and appends nothing. Hypotheses are shown predicted
 * vs observed vs verdict; they leave `proposed` only through POST …/hypotheses/:id/observe.
 */
import { randomBytes } from "node:crypto";
import YAML from "yaml";
import { envelopeForUnboundResult } from "../claims/eligibility/adapters.js";
import { envelopeForAggregate } from "../claims/eligibility/adapters/results.js";
import { evaluateClaimEligibility } from "../claims/eligibility/evaluate.js";
import type { ClaimEnvelope, ClaimEvidenceTier, ClaimKind } from "../claims/eligibility/types.js";
import { effectiveTrustTier, eventMeta, readerTrustFor } from "../claims/evidenceProvenance.js";
import { verifySignedDigest } from "../crypto/signing/signer.js";
import type { Ledger } from "../ledger/ledger.js";
import { verifyEvidenceEventIntegrity } from "../ledger/ledgerVerification.js";
import { verifySignedFileWithAuditor } from "../org/orgSigner.js";
import type { EvidenceEvent } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { valueContractSchema } from "../value/valueContracts.js";
import { createValueReport } from "../value/valueReports.js";
import { readValueEvents, valueAgentContractPath } from "../value/valueStore.js";
import { ledgerRefClaim, resolveLedgerEvent } from "./a4Evidence.js";
import { A4_RUNTIME } from "./a4Gates.js";
import type { MonitorLedgerRef } from "./a4Monitor.js";
import { readReleaseRecord, recordEnvelope, regularBytes, writeReleaseRecord } from "./a4Package.js";
import type { A4ReadinessState } from "./a4Readiness.js";
import { a4ValueClaimV1Schema, laneForClaimKind, type A4ChainLink, type A4ValueClaimV1 } from "./a4Schema.js";
import { A4StoreError, openA4Store, type A4ChangeSpec, type A4Store } from "./a4Store.js";
import { errorCodeOf } from "./aspireUnderstand.js";
import { activateSpecOf, currentRelease, cycleLinks } from "./spec/activate.js";
import { answerValues, aspireSpecOf, hypothesisDigestOf, listValue, previousHypotheses, textValue } from "./spec/aspire.js";

/** ponytail: a claim lists at most this many ledger refs; a KPI resting on more is untraced past it (value null). Page them if that bites. */
const MAX_REFS = 256;
const VERIFIED_REASON = "ATTESTATION_SCOPE_EXCLUDES_KPI: no admitted external record names this KPI and its window (P2-24, P3-21)";
const NUMBER_NOTE = "The value snapshot's number; AMC checks that every ledger row behind it resolves, not that the number recomputes from them.";
const BOUNDARY = "Four lanes, never merged: recommended and implemented are what the contract states; observed holds a number only while every ledger ref "
  + "behind it resolves; independently reviewed needs an admitted external record.";

type Window = { readonly from: string; readonly to: string };
type Resolution = { resolved: number; dangling: number; tiers: ClaimEvidenceTier[]; newestTs: number | null; reasonCodes: string[] };
type Row = Pick<EvidenceEvent, "id" | "ts" | "event_hash" | "payload_sha256" | "meta_json" | "writer_sig" | "session_id"> & { row_id: number };

const iso = (ts: number): string => new Date(ts).toISOString();
const agentOf = (row: Pick<EvidenceEvent, "meta_json">): unknown => eventMeta(row).agentId ?? eventMeta(row).agent_id;

/**
 * Each `ledger:<eventHash>` ref against the ledger rows of its window: resolved when a row of this agent carries that hash
 * and the chain verifies up to the newest such row (one walk covers every row before it); dangling otherwise, with the
 * reason. A row of a turn A4 ran itself carries no tier (ledgerRefClaim), so it never makes a claim observed.
 * ponytail: reads the window's rows (no event_hash index) and walks the chain once per claim; index event_hash and share
 * the walk across claims if a large ledger makes GET …/value slow.
 */
function resolveRefs(ledger: Ledger, refs: readonly string[], window: Window, agentId: string): Resolution {
  const rows = new Map((ledger.db.prepare(`SELECT rowid AS row_id, id, ts, event_hash, payload_sha256, meta_json, writer_sig, session_id
    FROM evidence_events WHERE ts >= ? AND ts <= ?`).all(Date.parse(window.from), Date.parse(window.to)) as Row[]).map((row) => [row.event_hash, row]));
  const reasons = new Set<string>();
  const found = refs.flatMap((ref) => {
    const row = ref.startsWith("ledger:") ? rows.get(ref.slice("ledger:".length)) : undefined;
    const problem = row === undefined ? "REF_DANGLING" : agentOf(row) !== agentId ? "REF_FOREIGN_AGENT" : row.writer_sig === "unsigned" ? "REF_UNSIGNED" : null;
    if (problem !== null) reasons.add(problem);
    return problem === null ? [row!] : [];
  });
  const newest = found.reduce<Row | null>((top, row) => (top === null || row.row_id > top.row_id ? row : top), null);
  const intact = newest === null || verifyEvidenceEventIntegrity({ ledger, eventId: newest.id }).ok;
  if (!intact) reasons.add("CHAIN_UNVERIFIED");
  const resolved = intact ? found : [];
  const reader = readerTrustFor(ledger.workspace);
  return { resolved: resolved.length, dangling: refs.length - resolved.length, reasonCodes: [...reasons],
    tiers: resolved.flatMap((row) => {
      const tier = ledgerRefClaim(row, "self_reported", null, effectiveTrustTier(row, reader)).trustTier;
      return tier === null ? [] : [tier as ClaimEvidenceTier];
    }),
    newestTs: resolved.reduce<number | null>((top, row) => (top === null || row.ts > top ? row.ts : top), null) };
}

/** The observed lane's envelope from the eligibility service over the resolved rows' own tiers (a runtime row may make it observed). */
const observedClaim = (producer: string, resolution: Resolution, dangling: number, refs: readonly string[], regulated: boolean, now: number): ClaimEnvelope =>
  evaluateClaimEligibility({ producer, method: "runtime_observation", regulated, proposed: { result: "not_evaluated", level: null },
    evidence: { eventCount: resolution.resolved, tiers: resolution.tiers, newestTs: resolution.newestTs, boundToControl: true, sameScope: dangling === 0,
      contradictory: false, signatureValid: null, issuerPinned: null }, evidenceRefs: refs, now });

interface ReviewInput {
  readonly workspace: string;
  readonly projectId: string;
  readonly agentId: string;
  readonly releaseId: string;
  readonly revisionNo: number;
  readonly regulated: boolean;
  readonly now: number;
}

/**
 * The value claims of one review: createValueReport once, then per KPI of the signed contract the four lanes. A KPI's
 * value events with no ledger ref, and refs past MAX_REFS, are untraced and count as dangling.
 */
async function valueClaims(input: ReviewInput, ledger: Ledger): Promise<{ claims: A4ValueClaimV1[]; reasonCode: string | null }> {
  const path = valueAgentContractPath(input.workspace, input.agentId);
  const bytes = regularBytes(path, "value contract");
  if (bytes === null) return { claims: [], reasonCode: "VALUE_CONTRACT_MISSING" };
  // Read once: the KPIs and the contract digest come from the bytes whose signature was checked.
  const contract = valueContractSchema.parse(YAML.parse(bytes.toString("utf8")));
  const signed = verifySignedFileWithAuditor(input.workspace, path, bytes).valid;
  const { report: { snapshot } } = await createValueReport({ workspace: input.workspace, scopeType: "AGENT", scopeId: input.agentId, nowTs: input.now });
  const window = { from: iso(snapshot.baselines.startTs), to: iso(snapshot.baselines.endTs) };
  const events = readValueEvents({ workspace: input.workspace, scope: { type: "AGENT", idHash: sha256Hex(`AGENT:${input.agentId}`).slice(0, 16) },
    startTs: snapshot.baselines.startTs, endTs: snapshot.baselines.endTs });
  const claims = contract.valueContract.kpis.map((kpi) => {
    const producer = `a4:${input.projectId}:value:${input.releaseId}:${kpi.kpiId}`;
    const mine = events.filter((event) => event.kpiId === kpi.kpiId);
    const hashes = [...new Set(mine.flatMap((event) => event.evidenceRefs.eventHashes ?? []))];
    const refs = hashes.slice(0, MAX_REFS).map((hash) => `ledger:${hash}`);
    const resolution = resolveRefs(ledger, refs, window, input.agentId);
    const dangling = resolution.dangling + mine.filter((event) => (event.evidenceRefs.eventHashes ?? []).length === 0).length + Math.max(0, hashes.length - MAX_REFS);
    const current = snapshot.kpis.find((row) => row.kpiId === kpi.kpiId)?.currentValue;
    const value = snapshot.status === "OK" && dangling === 0 && resolution.resolved > 0 && typeof current === "number" ? current : null;
    const body = { schema: "amc.a4-value-claim/v1" as const, projectId: input.projectId, revisionNo: input.revisionNo, releaseId: input.releaseId, kpiId: kpi.kpiId,
      label: kpi.label, unit: kpi.unit,
      recommended: { target: `${kpi.direction === "HIGHER_IS_BETTER" ? ">=" : "<="} ${kpi.normalization.minGood} ${kpi.unit}`, source: "value_contract" as const,
        note: `The value contract's minGood bound (${kpi.direction}); a statement of intent.`, claimKind: "self_reported" as const },
      implemented: { instrumentation: signed ? "value_contract" as const : "none" as const, contractDigest: signed ? sha256Hex(bytes) : null, claimKind: "self_reported" as const },
      observed: { value, window, evidenceRefs: refs, resolvedRefs: resolution.resolved, danglingRefs: dangling,
        claim: observedClaim(producer, resolution, dangling, refs, input.regulated, input.now) },
      verified: { status: "not_evaluated" as const, reviewer: null, reason: VERIFIED_REASON,
        claim: envelopeForUnboundResult({ producer, method: "human_review", regulated: input.regulated, now: input.now }) },
      objective: { kind: "business" as const, statement: kpi.label, basis: `value contract KPI ${kpi.kpiId}; ${NUMBER_NOTE}` }, createdAt: iso(input.now) };
    return a4ValueClaimV1Schema.parse({ ...body, envelope: recordEnvelope(input.workspace, sha256Hex(canonicalize(body))) });
  });
  return { claims, reasonCode: snapshot.status === "OK" ? null : "VALUE_EVIDENCE_INSUFFICIENT" };
}

/** One EVIDENCE_REF by amc-runtime in Review's post-commit transition; the lane is derived from the claim, never chosen. */
function refSpec(input: ReviewInput, head: { revision_no: number }, seq: number, ts: number, reviewSeq: number, ref: { refKind: "ledger_event" | "value_claim";
  refId: string; sha256: string; claimKind: ClaimKind; trustTier: string | null; method: string | null; label: string;
  note: Record<string, unknown> }): A4ChangeSpec {
  const derived = laneForClaimKind(ref.claimKind, ref.trustTier, ref.method, "implementation");
  return { kind: "EVIDENCE_REF", stage: "activate", payload: { ...ref.note, refKind: ref.refKind, refId: ref.refId, sha256: ref.sha256, lane: derived.lane,
    claimKind: derived.claimKind, releaseId: input.releaseId, reviewSeq },
  sideRows: [{ table: "a4_evidence_refs", values: { project_id: input.projectId, seq, revision_no: head.revision_no, stage: "activate", lane: derived.lane,
    ref_kind: ref.refKind, ref_id: ref.refId, sha256: ref.sha256, claim_kind: derived.claimKind, trust_tier: ref.trustTier, method: ref.method, label: ref.label,
    actor_key: A4_RUNTIME.key, ts } }] };
}

/**
 * Review's post-commit step (once per committed review): the value claims, written and signed, then one transition by
 * amc-runtime recording them and the ledger rows the monitor record named. Refused inside the transaction unless the
 * newest STEP is this cycle's Activate review of this release and nothing was recorded for it yet. Never throws: a
 * failure is the answer's reason code (the review stands).
 */
export async function recordReviewResults(input: ReviewInput & { readonly ledgerRefs: readonly MonitorLedgerRef[] }): Promise<Record<string, unknown>> {
  let store: A4Store | null = null;
  try {
    store = openA4Store(input.workspace);
    const ledger = store.ledger;
    let built: { claims: A4ValueClaimV1[]; reasonCode: string | null };
    try {
      built = await valueClaims(input, ledger);
    } catch (error) {
      built = { claims: [], reasonCode: errorCodeOf(error, "VALUE_REPORT_FAILED") };
    }
    const files = built.claims.map((claim) => ({ claim, ...writeReleaseRecord(input.workspace, input.projectId, "value", input.releaseId,
      `a4val_${randomBytes(16).toString("hex")}`, claim, "a4-stage-output") }));
    if (files.length === 0 && input.ledgerRefs.length === 0) return { value: { recorded: 0, reasonCode: built.reasonCode } };
    const reviewed = store.transition(input.projectId, A4_RUNTIME, ({ head, seq, ts }) => {
      const chain = store!.readChain(input.projectId);
      const review = [...chain].reverse().find((link: A4ChainLink) => link.kind === "STEP");
      if (head?.stage !== "activate" || review?.body.stage !== "activate" || review.body.to !== "reviewed" || currentRelease(chain)?.body.releaseId !== input.releaseId) {
        throw new A4StoreError(409, "REVIEW_MOVED", "The project moved past this release's review before its results were recorded.");
      }
      if (chain.some((link) => link.seq > review.seq && link.kind === "EVIDENCE_REF" && link.body.reviewSeq === review.seq)) {
        throw new A4StoreError(409, "REVIEW_RESULTS_RECORDED", "This review's results are already recorded.");
      }
      const specs: A4ChangeSpec[] = [];
      for (const ref of input.ledgerRefs) {
        // Re-resolved here, as addEvidenceRef does: the row, its digest and chain, this agent, and its tier as the reader contract reads it.
        const row = ledger.getEventById(ref.refId);
        const resolved = resolveLedgerEvent(ledger, ref.refId, ref.sha256, readerTrustFor(input.workspace), []);
        if (row === null || (resolved.status !== "resolved" && resolved.status !== "payload_pruned") || agentOf(row) !== head.agent_id) continue;
        const claim = ledgerRefClaim(row, "observed", "runtime_observation", resolved.tier);
        specs.push(refSpec(input, head, seq + specs.length, ts, review.seq, { refKind: "ledger_event", refId: ref.refId, sha256: ref.sha256, claimKind: claim.claimKind,
          trustTier: claim.trustTier, method: claim.method, label: `monitor source ${ref.source}: the agent's newest row there (its own tier)`,
          note: { purpose: "monitor_source", source: ref.source } }));
      }
      for (const file of files) {
        specs.push(refSpec(input, head, seq + specs.length, ts, review.seq, { refKind: "value_claim", refId: file.path, sha256: file.sha256, claimKind: "self_reported",
          trustTier: null, method: null, label: `value claim ${file.claim.kpiId} of ${input.releaseId} (four lanes; self_reported record)`,
          note: { kpiId: file.claim.kpiId, observedValue: file.claim.observed.value, danglingRefs: file.claim.observed.danglingRefs } }));
      }
      if (specs.length === 0) throw new A4StoreError(409, "NOTHING_TO_RECORD", "No value claim was built and no monitor source row still resolves.");
      return specs;
    });
    return { value: { recorded: files.length, reasonCode: built.reasonCode, seq: reviewed.replay ? null : reviewed.seq } };
  } catch (error) {
    return { value: { recorded: 0, reasonCode: errorCodeOf(error, "REVIEW_RESULTS_NOT_RECORDED") } };
  } finally {
    store?.close();
  }
}

/** PMF hypotheses predicted vs observed vs verdict (design §10.1, §15): the observed value is the row's, the verdict a person's. */
function hypothesesView(state: A4ReadinessState, now: number): Array<Record<string, unknown>> {
  return previousHypotheses(aspireSpecOf(state).spec).map((hypothesis) => {
    const digest = hypothesisDigestOf(hypothesis);
    const link = state.chain.find((candidate) => candidate.kind === "EVIDENCE_REF" && candidate.body.hypothesisId === hypothesis.id
      && candidate.body.hypothesisDigest === digest);
    const ref = link === undefined ? undefined : state.refs.find((candidate) => candidate.refId === link.body.refId && candidate.sha256 === link.body.sha256);
    const earned = ref?.lane === "observed";
    return { id: hypothesis.id, statement: hypothesis.statement, predicted: hypothesis.predictedOutcome, window: hypothesis.window, evidenceSource: hypothesis.evidenceSource,
      observed: link === undefined ? { status: now > Date.parse(hypothesis.window.to) ? "expired" : "proposed", value: null, lane: null, reasonCodes: [] }
        : { status: earned ? "observed" : "not_evaluated", value: earned ? link.body.observedOutcome ?? null : null, lane: ref?.lane ?? null,
          reasonCodes: ref === undefined ? ["HYPOTHESIS_REF_UNRESOLVED"] : ref.reasonCodes },
      verdict: link === undefined ? null : { ...(link.body.verdict as Record<string, unknown>), claimKind: "self_reported" },
      observeRoute: link === undefined && state.project.stage !== "aspire" ? `POST /api/v1/a4/projects/${state.project.project_id}/hypotheses/${hypothesis.id}/observe` : null };
  });
}

/** One recorded claim as GET reads it: its signed file once, the envelope checked, its refs re-resolved now (never recorded again). */
function claimRow(store: A4Store, state: A4ReadinessState, link: A4ChainLink, regulated: boolean, now: number): { row: Record<string, unknown>; claims: ClaimEnvelope[] } {
  const read = readReleaseRecord(store.workspace, String(link.body.refId), String(link.body.sha256), "a4-stage-output");
  const failed = (reason: string) => ({ row: { kpiId: link.body.kpiId, integrity: { status: "integrity_failed", reasonCodes: [reason] } }, claims: [] });
  if ("reason" in read) return failed(read.reason);
  const parsed = a4ValueClaimV1Schema.safeParse(JSON.parse(read.bytes.toString("utf8")));
  if (!parsed.success) return failed("VALUE_CLAIM_INVALID");
  const { envelope, ...body } = parsed.data;
  const envelopeValid = envelope.digestSha256 === sha256Hex(canonicalize(body)) && verifySignedDigest({ workspace: store.workspace, digestHex: envelope.digestSha256, signed: envelope });
  const recorded = body.observed;
  const untraced = Math.max(0, recorded.danglingRefs - (recorded.evidenceRefs.length - recorded.resolvedRefs));
  const resolution = resolveRefs(store.ledger, recorded.evidenceRefs, recorded.window, state.project.agent_id);
  const dangling = resolution.dangling + untraced;
  const claim = observedClaim(`a4:${body.projectId}:value:${body.releaseId}:${body.kpiId}`, resolution, dangling, recorded.evidenceRefs, regulated, now);
  return { claims: [claim, body.verified.claim], row: { kpiId: body.kpiId, label: body.label, unit: body.unit, recommended: body.recommended, implemented: body.implemented,
    observed: { recorded, now: { value: recorded.value !== null && dangling === 0 && resolution.resolved > 0 ? recorded.value : null, resolvedRefs: resolution.resolved,
      danglingRefs: dangling, reasonCodes: resolution.reasonCodes, claim } },
    verified: body.verified, objective: body.objective, createdAt: body.createdAt,
    integrity: { status: envelopeValid ? "verified_locally" : "integrity_failed", envelopeValid, ref: { refId: link.body.refId, sha256: link.body.sha256 } } } };
}

/**
 * GET …/value: the four-lane view of the current release's value claims, the members' other objectives (self_reported,
 * not evaluated), the ROI worksheet (a recommendation, numeric self-answers) and the hypotheses. It reads; it never runs
 * createValueReport and never appends a value event.
 */
export function valueView(store: A4Store, state: A4ReadinessState, regulated: boolean, now: number): Record<string, unknown> {
  const projectId = state.project.project_id;
  const release = currentRelease(state.chain);
  const releaseId = typeof release?.body.releaseId === "string" ? release.body.releaseId : null;
  const links = cycleLinks(state.chain, "EVIDENCE_REF").filter((link) => link.body.refKind === "value_claim" && link.body.releaseId === releaseId);
  const rows = links.map((link) => claimRow(store, state, link, regulated, now));
  const values = answerValues(activateSpecOf(state).answers);
  const objectives = ([["business", "businessOutcomes"], ["sustainability", "sustainabilityObjectives"], ["social", "socialObjectives"]] as const)
    .flatMap(([kind, id]) => listValue(values.get(id)).map((statement) => ({ kind, statement, claimKind: "self_reported", observed: { status: "not_evaluated",
      reason: "an objective in the members' words names no evidence source; the value claims are the contract's KPIs" } })));
  const producer = `a4:${projectId}:value`;
  const claims = rows.flatMap((entry) => entry.claims);
  return { projectId, view: "value", releaseId, status: rows.length > 0 ? "recorded" : "not_evaluated",
    reasonCodes: releaseId === null ? ["NO_RELEASE"] : rows.length > 0 ? [] : ["NO_VALUE_CLAIM_RECORDED"],
    claims: rows.map((entry) => entry.row), objectives,
    roiWorksheet: { status: "not_evaluated", formula: "P3-20", inputs: { budgetCostUsdPerDay: textValue(values.get("budgetCostUsdPerDay")) },
      claim: envelopeForUnboundResult({ producer: `${producer}:roi`, method: "numeric_self_answer", regulated, now }) },
    hypotheses: hypothesesView(state, now), boundary: BOUNDARY,
    claim: claims.length > 0 ? envelopeForAggregate(producer, claims, now) : envelopeForUnboundResult({ producer, method: "human_review", regulated, now }) };
}
