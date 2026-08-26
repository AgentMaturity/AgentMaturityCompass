import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { hasNonBlankEvidenceRef, normalizeEvidenceRefs } from "./evidenceRefs.js";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  type LiveDriftAlert,
  type LiveDriftReceipt,
  type LiveDriftSampleRow,
  type LiveDriftThresholds,
  type LiveDriftWatchAlert,
  type LiveDriftWindow
} from "./liveDriftAlerts.js";

/**
 * One implementation of the proof-delegated drift monitor (P5.2b collapse).
 *
 * WHY THIS EXISTS. Measured with full identifier normalisation, five satellites
 * — braintrust, decibenchVoice, paperReadSkill, reflexionAgent, skillMatch —
 * sit in a cluster whose internal trigram similarity is 0.971 to 0.991. They
 * are the same 320-line program five times over, differing in field names.
 *
 * An earlier measurement of mine put their similarity at 0.08 and concluded
 * there was nothing to collapse. That normalisation stripped only the VENDOR
 * name from identifiers and left the rest — which are precisely the per-domain
 * field names a factory parameterises away. It measured the thing being
 * abstracted and reported its absence. ADR-0025 carries the correction.
 *
 * WHAT IS PARAMETERISED AND WHAT IS NOT. The proof-coverage walk, the coverage
 * arithmetic, the alert construction, the receipt enrichment and the rehash are
 * IDENTICAL across the five and live here once. What varies is field names,
 * ref selections, and the row payload — and the payload is supplied as a
 * CALLBACK rather than a field list on purpose.
 *
 * That is not laziness about generality. `canonicalize` maps arrays without
 * sorting them (`utils/json.ts`), so element order reaches
 * `sha256Hex(canonicalize(payload))` and therefore reaches every published
 * `rowProofHash` and `receiptHash`. A field list would have to reproduce each
 * file's exact `?? null` handling to stay byte-identical — a key that is
 * `undefined` disappears from the JSON while `null` survives. Keeping the
 * payload as the caller's own expression means the risky part is not
 * reconstructed at all, only relocated.
 *
 * Each converted monitor is pinned by a characterization test asserting
 * `sha256Hex(canonicalize(result))` over the WHOLE result, captured before the
 * collapse. If any of this changed behaviour, those five hashes would move.
 */

/** The `isPresent` used by four of the five. */
export function defaultIsPresent(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined;
}

/**
 * `reflexionAgent`'s variant, which additionally accepts finite numbers and
 * booleans. Carried rather than unified: the four that omit these branches
 * count `NaN` as present, and making them stricter would change coverage — and
 * therefore the receipt hash — on any row that carries a numeric proof field.
 * Retiring the fork is a behaviour decision with its own evidence, not a
 * side effect of deduplication.
 */
export function numericAwareIsPresent(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined;
}

export interface ProofDelegatedMonitorSpec<
  Row extends LiveDriftSampleRow,
  Proof extends object
> {
  /** Appears in the coverage alert message, e.g. "Braintrust-style live drift". */
  readonly incompleteSubject: string;
  /** Appears in the receipt summary, e.g. "braintrust evidence coverage". */
  readonly summaryLabel: string;
  /** The metric the coverage alert reports, e.g. "braintrustEvidenceCoverage0to1". */
  readonly coverageMetricId: string;
  readonly requiredProofFields: readonly (keyof Proof)[];
  readonly requiredRowFields: readonly (keyof Row)[];
  /** The hashed payload, WITHOUT evidence refs — the factory appends those. */
  readonly rowPayload: (row: Row) => Record<string, unknown>;
  /** Descriptor fields carried alongside the hash on each row proof. */
  readonly rowDescriptor: (row: Row) => Record<string, unknown>;
  readonly alertRefs: (proof: Proof) => unknown[];
  readonly signedRefs: (proof: Proof) => unknown[];
  /** Added to the receipt's own source refs. */
  readonly enrichedSourceRefs: (proof: Proof) => unknown[];
  /** Passed down into `runLiveScoreBehaviorDrift`. */
  readonly delegatedSourceRefs: (proof: Proof) => unknown[];
  /** Defaults to `defaultIsPresent`. */
  readonly isPresent?: (value: unknown) => boolean;
}

export interface ProofDelegatedMonitorInput<Row extends LiveDriftSampleRow, Proof> {
  readonly agentId: string;
  readonly sourceProof: Proof;
  readonly baselineWindow: Omit<LiveDriftWindow, "rows"> & { rows: Row[] };
  readonly liveWindow: Omit<LiveDriftWindow, "rows"> & { rows: Row[] };
  readonly thresholds?: Partial<LiveDriftThresholds>;
  readonly sourceRefs?: string[];
  readonly now?: Date;
}

export interface ProofDelegatedMonitorResult<Proof> {
  readonly receipt: LiveDriftReceipt;
  readonly watchAlerts: LiveDriftWatchAlert[];
  readonly sourceProof: Proof;
  readonly rowProofs: Array<Record<string, unknown>>;
  readonly missingReasons: string[];
  readonly coverage0to1: number;
}

const unique = (values: unknown): string[] => normalizeEvidenceRefs(values).sort();
const round = (value: number): number => Math.round(value * 10000) / 10000;

const rehashReceipt = (receipt: Omit<LiveDriftReceipt, "receiptHash">): LiveDriftReceipt => ({
  ...receipt,
  receiptHash: sha256Hex(canonicalize(receipt))
});

/**
 * Build one monitor from its spec.
 *
 * Returns the run function each satellite re-exports under its own name, so no
 * caller of `runBraintrustLiveDrift` and friends changes.
 */
export function createProofDelegatedMonitor<
  Row extends LiveDriftSampleRow,
  Proof extends object
>(spec: ProofDelegatedMonitorSpec<Row, Proof>) {
  const isPresent = spec.isPresent ?? defaultIsPresent;

  function rowProof(row: Row): Record<string, unknown> {
    const payload = {
      ...spec.rowPayload(row),
      evidenceRefs: unique(row.evidenceRefs ?? []),
      signedEvidenceRefs: unique(row.signedEvidenceRefs ?? [])
    };
    return {
      traceId: row.traceId,
      scenarioId: row.scenarioId,
      ...spec.rowDescriptor(row),
      rowProofHash: sha256Hex(canonicalize(payload)),
      evidenceRefs: payload.evidenceRefs,
      signedEvidenceRefs: payload.signedEvidenceRefs
    };
  }

  function proofStats(proof: Proof, rows: Row[]): {
    present: number;
    total: number;
    missingReasons: string[];
  } {
    let present = 0;
    let total = 0;
    const missingReasons: string[] = [];

    for (const field of spec.requiredProofFields) {
      total += 1;
      if (isPresent(proof[field])) present += 1;
      else missingReasons.push(String(field));
    }

    for (const row of rows) {
      for (const field of spec.requiredRowFields) {
        total += 1;
        if (isPresent(row[field])) present += 1;
        else missingReasons.push(`${row.traceId}.${String(field)}`);
      }
      total += 2;
      if (hasNonBlankEvidenceRef(row.evidenceRefs)) present += 1;
      else missingReasons.push(`${row.traceId}.evidenceRefs`);
      if (hasNonBlankEvidenceRef(row.signedEvidenceRefs)) present += 1;
      else missingReasons.push(`${row.traceId}.signedEvidenceRefs`);
    }

    return { present, total, missingReasons };
  }

  function enrich(
    receipt: LiveDriftReceipt,
    coverage: number,
    missingReasons: string[],
    proof: Proof
  ): LiveDriftReceipt {
    const { receiptHash: _oldHash, ...receiptWithoutHash } = receipt;
    const alerts: LiveDriftAlert[] = [...receipt.alerts];

    if (missingReasons.length > 0) {
      alerts.push({
        alertId: `live-drift:${receipt.agentId}:${receipt.baselineWindowId}:${receipt.liveWindowId}:${spec.coverageMetricId}`,
        metricId: spec.coverageMetricId as LiveDriftAlert["metricId"],
        severity: coverage < 0.75 ? "critical" : "high",
        message: `${spec.incompleteSubject} proof is incomplete: ${missingReasons.join(", ")}.`,
        threshold: 1,
        observed: round(coverage),
        evidenceRefs: unique(spec.alertRefs(proof)),
        signedEvidenceRefs: unique(spec.signedRefs(proof))
      });
    }

    const recommendation = alerts.length > 0 ? "alert" : receipt.recommendation;
    return rehashReceipt({
      ...receiptWithoutHash,
      alerts,
      recommendation,
      failClosed: alerts.length > 0,
      sourceRefs: unique([...receipt.sourceRefs, ...spec.enrichedSourceRefs(proof)]),
      summary: `${alerts.length} live drift alert(s), recommendation=${recommendation}; ${spec.summaryLabel}=${round(coverage)}`
    });
  }

  return function run(input: ProofDelegatedMonitorInput<Row, Proof>): ProofDelegatedMonitorResult<Proof> {
    const allRows = [...input.baselineWindow.rows, ...input.liveWindow.rows];
    const stats = proofStats(input.sourceProof, allRows);
    const coverage0to1 = stats.total === 0 ? 0 : round(stats.present / stats.total);
    const rowProofs = allRows.map(rowProof);
    const receipt = runLiveScoreBehaviorDrift({
      agentId: input.agentId,
      baselineWindow: input.baselineWindow,
      liveWindow: input.liveWindow,
      thresholds: input.thresholds,
      sourceRefs: unique([...(input.sourceRefs ?? []), ...spec.delegatedSourceRefs(input.sourceProof)]),
      now: input.now
    });
    const enriched = enrich(receipt, coverage0to1, stats.missingReasons, input.sourceProof);

    return {
      receipt: enriched,
      watchAlerts: buildLiveDriftWatchAlerts(enriched),
      sourceProof: input.sourceProof,
      rowProofs,
      missingReasons: stats.missingReasons,
      coverage0to1
    };
  };
}
