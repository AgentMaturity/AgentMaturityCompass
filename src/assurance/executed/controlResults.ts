import { executedEvaluationSnapshotSchema, type ExecutedEvaluationSnapshot } from "./evaluationSnapshot.js";
import { seededRunReferencesSchema } from "./captureAdapter.js";
/** Native P1-11 projection of exact sealed synthetic captures; no local verdict is promoted. */
import type { Ledger } from "../../ledger/ledger.js";
import type { LoadedCatalog } from "../../catalog/loader.js";
import { evaluateControl } from "../../catalog/evidence/evaluate.js";
import type { ControlResult, EvidenceItem, ControlPlan } from "../../catalog/evidence/types.js";
import { canonicalize, isExactIsoTime } from "../../utils/json.js";
import { loadExecutedEvidence } from "./evidence.js";
import { bindingMatches } from "./oracles.js";
import { benignRegistryFor } from "./routes.js";
import type { Binding, CompiledScenario } from "./types.js";
import type { TrustContext } from "../../trust/trustContext.js";

const applicability = (value: ExecutedEvaluationSnapshot["applicability"]): ControlPlan["applicability"] =>
  value === "applicable" ? { state: "applicable" } : value === "not_applicable" ?
    { state: "not_applicable", rationale: "the capture's verified active plan excludes this control" } :
    { state: "unresolved", reason: "the capture's verified active plan leaves this control unresolved" };
export type ExecutedControlProjection = { ok: true; result: ControlResult } | { ok: false; reason: string };

/**
 * Call after sealing. `scope` and `evaluation` are from the verified native run/report subject,
 * including this control's actual compiled applicability; neither comes from a reference or model JSON.
 * Stored replay supplies that authenticated historical subject; it never reads today's active plan.
 * The loader proves provenance/tier from the exact bytes used here; null tiers remain null.
 */
export function evaluateExecutedControl(input: {
  ledger: Ledger; sessionId: string; compiled: CompiledScenario; catalog: LoadedCatalog;
  trust?: TrustContext;
  scope: Omit<Binding, "attemptId" | "fixtureDigest">; evaluation: ExecutedEvaluationSnapshot; references: unknown;
}): ExecutedControlProjection {
  const reject = (reason: string): ExecutedControlProjection => ({ ok: false, reason });
  const parsed = seededRunReferencesSchema.safeParse(input.references);
  const snapshot = executedEvaluationSnapshotSchema.safeParse(input.evaluation);
  if (!parsed.success || !snapshot.success) return reject("executed_control_projection_input_invalid");
  const { compiled, scope } = input, refs = parsed.data, expected = snapshot.data;
  const control = input.catalog.controls.get(compiled.controlId);
  if (!control || control.version !== compiled.controlVersion || scope.controlId !== control.id ||
      scope.controlVersion !== control.version || scope.policyDigest !== expected.policyDigest || !input.sessionId ||
      refs.scenarioId !== compiled.scenario.id || refs.packId !== compiled.scenario.packId ||
      refs.attack.length !== compiled.scenario.attempts) return reject("executed_control_projection_subject_mismatch");
  const benign = compiled.scenario.benignControl === null ? undefined : benignRegistryFor(compiled).get(compiled.scenario.benignControl);
  if (compiled.scenario.benignControl !== null && !benign ||
      refs.benign.length !== (benign ? compiled.scenario.attempts : 0)) return reject("executed_control_projection_pair_mismatch");
  const entries = [...refs.attack, ...refs.benign];
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!unique(entries.map(entry => entry.binding.attemptId)) ||
      !unique(entries.flatMap(entry => entry.reference ? [entry.reference.eventId] : [])) ||
      !unique(entries.flatMap(entry => entry.reference ? [entry.reference.receiptId] : [])) ||
      entries.some(entry => !bindingMatches(entry.binding, { ...scope,
        attemptId: entry.binding.attemptId, fixtureDigest: entry.binding.fixtureDigest }))) {
    return reject("executed_control_projection_duplicate_or_cross_scope");
  }
  const items: EvidenceItem[] = [];
  const collect = (scenario: CompiledScenario, rows: typeof refs.attack): string | null => {
    for (const entry of rows) {
      if (entry.reference === null) continue;
      const loaded = loadExecutedEvidence(input.ledger, entry.reference, { sessionId: input.sessionId,
        scenarioId: scenario.scenario.id, packId: scenario.scenario.packId, fixture: scenario.scenario.fixture, binding: entry.binding }, { trust: input.trust });
      if (!loaded.ok) return `executed_control_capture_not_authenticated:${loaded.reason}`;
      const recorded = executedEvaluationSnapshotSchema.safeParse(loaded.record.evaluation);
      if (!recorded.success || canonicalize(recorded.data) !== canonicalize(expected) ||
          loaded.record.binding.policyDigest !== expected.policyDigest) return "executed_control_evaluation_snapshot_mismatch";
      if (!isExactIsoTime(loaded.item.recordedAt)) return "executed_control_capture_time_invalid";
      // Keep the native loader's neutral verdict, provenance and null tier unchanged.
      items.push(loaded.item);
    }
    return null;
  };
  const attackError = collect(compiled, refs.attack);
  if (attackError) return reject(attackError);
  if (benign) { const benignError = collect(benign, refs.benign); if (benignError) return reject(benignError); }
  if (!items.length) return reject("executed_control_capture_empty");
  const timestamps = items.map(item => Date.parse(item.recordedAt));
  const result = evaluateControl(control, items, {
    subject: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, deploymentId: scope.deploymentId,
      agentId: scope.agentId, subjectId: null },
    window: { start: new Date(Math.min(...timestamps)).toISOString(), end: new Date(Math.max(...timestamps)).toISOString() },
    plan: { digest: expected.planDigest, policyDigest: expected.policyDigest,
      applicability: applicability(expected.applicability), mode: "enforce" },
    invalidations: [], reviews: [], producers: input.catalog.producers
  });
  // A regression must refuse, never mutate the native evaluator result into an apparently valid NE.
  if (result.dimensions.result !== "not_evaluated" || result.claimKind === "observed" || result.claimKind === "independently_reviewed") {
    return reject("executed_control_projection_exceeded_synthetic_ceiling");
  }
  return { ok: true, result };
}

/** Digest and every deterministic native field must match; only the evaluator's own clock is excluded. */
export function matchesExecutedControlResult(stored: unknown, recomputed: ControlResult): boolean {
  if (stored === null || typeof stored !== "object" || Array.isArray(stored)) return false;
  const { evaluatedAt, ...stable } = stored as Record<string, unknown>;
  if (typeof evaluatedAt !== "string" || !isExactIsoTime(evaluatedAt)) return false;
  const { evaluatedAt: _clock, ...expected } = recomputed;
  return stable.digest === recomputed.digest && canonicalize(stable) === canonicalize(expected);
}
