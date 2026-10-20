/** Shared execution of source-compiled synthetic fixtures; native rows remain unscored and NE. */
import type { AssuranceScenarioResult } from "../../types.js";
import type { LoadedCatalog } from "../../catalog/loader.js";
import type { Ledger } from "../../ledger/ledger.js";
import type { CompiledScenario, Responder } from "./types.js";
import type { ExecutedRunScope } from "./reportTypes.js";
import { executedBindingScope } from "./reportTypes.js";
import { runSeededScenario, summarizeSeededScenario } from "./harness.js";
import { writeSeededRunCaptures } from "./captureAdapter.js";
import { executedEvaluationSnapshotSchema } from "./evaluationSnapshot.js";
import { benignRegistryFor } from "./routes.js";
import { instant } from "./oracles.js";

export interface CompiledExecutionInput {
  ledger: Ledger;
  sessionId: string;
  catalog: LoadedCatalog;
  scope: ExecutedRunScope | null;
  getResponder: () => Promise<Responder>;
  compiled: CompiledScenario;
  now: string;
  seed: string;
}
/** Shared unavailable row: no attempted fixture, invented capture or positive score. */
export function unavailableExecutedRow(input: {
  scenarioId: string; title?: string; category?: string; prompt?: string; reason: string;
}): AssuranceScenarioResult {
  return { scenarioId: input.scenarioId, title: input.title ?? input.scenarioId,
    category: input.category ?? "synthetic_executed_fixture", riskTier: "all", prompt: input.prompt ?? "", response: "",
    pass: false, score0to5: 0, score0to100: 0,
    reasons: ["synthetic_fixture_only", "production_capture_and_authority_unavailable", input.reason],
    correlatedRequestIds: [], evidenceEventIds: [], auditEventTypes: ["INDUSTRY_EVIDENCE_MISSING"],
    inconclusive: true, inconclusiveCause: "ungradable_evidence", gradingMethod: "executed" };
}
/** Root constructs scope from verified native policy/profile reads, never responder or report assertions. */
export async function executeCompiledScenario(input: CompiledExecutionInput): Promise<AssuranceScenarioResult> {
  const compiled = structuredClone(input.compiled);
  const scope = input.scope === null ? null : structuredClone(input.scope);
  const base = unavailableExecutedRow({ scenarioId: compiled.scenario.id, prompt: compiled.scenario.task, reason: "synthetic_native_result_not_evaluated" });
  const unavailable = (reason: string): AssuranceScenarioResult => ({ ...base, reasons: [...base.reasons, reason] });
  if (scope === null) return unavailable("verified_execution_scope_unavailable");
  const control = input.catalog.controls.get(compiled.controlId);
  if (!control || control.support === "retired" || control.version !== compiled.controlVersion ||
      !compiled.scenario.controlIds.includes(compiled.controlId) || ![1, 25].includes(compiled.scenario.attempts)) {
    return unavailable("compiled_control_or_attempt_scope_invalid");
  }
  if (!input.sessionId || !input.seed || input.seed.length > 200 || instant(input.now) === null) {
    return unavailable("fixture_execution_input_invalid");
  }
  const applicability = scope.controlApplicability[compiled.controlId];
  const snapshot = executedEvaluationSnapshotSchema.safeParse({ v: 1, applicability:
    applicability === "applicable" || applicability === "not_applicable" ? applicability : "unresolved",
    planDigest: scope.planDigest, profileSha256: scope.profileSha256, policyDigest: scope.policyDigest });
  if (!snapshot.success) return unavailable("verified_evaluation_snapshot_invalid");
  const evaluation = snapshot.data;
  let responder: Responder;
  try {
    responder = await input.getResponder();
    if (responder.target.transport !== "gateway" || responder.target.agentId !== scope.agentId) {
      return unavailable("gateway_responder_scope_mismatch");
    }
  } catch { return unavailable("gateway_responder_unavailable"); }
  const registry = benignRegistryFor(compiled);
  let run: Awaited<ReturnType<typeof runSeededScenario>>;
  try {
    run = await runSeededScenario(compiled, responder, { seed: input.seed, now: input.now,
      scope: { ...executedBindingScope(scope), controlId: compiled.controlId, controlVersion: compiled.controlVersion } }, registry);
  } catch { return unavailable("synthetic_fixture_execution_unavailable"); }
  const diagnostics = summarizeSeededScenario(compiled, run.attemptResults, run.benignAttemptResults, registry);
  let references: ReturnType<typeof writeSeededRunCaptures>;
  try { references = writeSeededRunCaptures(input.ledger, input.sessionId, compiled, run, evaluation); }
  catch {
    return { ...unavailable("synthetic_capture_write_unavailable"), reasons: [...base.reasons,
      "synthetic_capture_write_unavailable", ...(diagnostics.localOutcome === "fail" ? ["synthetic_local_failure_observed_unsealed"] : [])] };
  }
  return { ...base, reasons: [...base.reasons, ...diagnostics.reasons], responseTransport: "gateway",
    evidenceEventIds: [...references.attack, ...references.benign].flatMap(entry => entry.reference ? [entry.reference.eventId] : []),
    executed: { v: 1, attempts: compiled.scenario.attempts as 1 | 25, references, diagnostics, controlResults: [] } };
}
