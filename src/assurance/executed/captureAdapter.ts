import { executedEvaluationSnapshotSchema, type ExecutedEvaluationSnapshot } from "./evaluationSnapshot.js";
import { canonicalize } from "../../utils/json.js";
/** Static integration proposal. Native assurance remains NE; replay returns only synthetic local diagnostics. */
import { z } from "zod";
import type { Ledger } from "../../ledger/ledger.js";
import type { Attempt, Binding, CompiledScenario, SeededScenarioRun } from "./types.js";
import { writeExecutedEvidence, loadExecutedEvidence, type ExecutedEvidenceReference } from "./evidence.js";
import { bindingMatches, replayCapturedAttempt } from "./oracles.js";
import { benignRegistryFor } from "./routes.js";

interface AttemptReference {
  binding: Binding;
  reference: ExecutedEvidenceReference | null;
}
export interface SeededRunReferences {
  v: 1;
  scenarioId: string;
  packId: string;
  attack: AttemptReference[];
  benign: AttemptReference[];
}
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const bindingSchema = z.object({ tenantId: id, workspaceId: id, deploymentId: id, agentId: id,
  controlId: id, controlVersion: id, policyDigest: z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/), runId: id, attemptId: id, fixtureDigest: sha }).strict();
const referenceSchema = z.object({ eventId: id, eventSha256: sha, receiptId: id,
  receiptSha256: sha, payloadSha256: sha }).strict();
const attemptSchema = z.object({ binding: bindingSchema, reference: referenceSchema.nullable() }).strict();
export const seededRunReferencesSchema = z.object({ v: z.literal(1), scenarioId: id, packId: id,
  attack: z.array(attemptSchema).max(25), benign: z.array(attemptSchema).max(25) }).strict();

/** Call while the run's actual assurance ledger session is still open. */
export function writeSeededRunCaptures(ledger: Ledger, sessionId: string, compiled: CompiledScenario,
  run: SeededScenarioRun, evaluation?: ExecutedEvaluationSnapshot): SeededRunReferences {
  const heldEvaluation = evaluation === undefined ? undefined : executedEvaluationSnapshotSchema.parse(evaluation);
  const benign = compiled.scenario.benignControl === null ? undefined : benignRegistryFor(compiled).get(compiled.scenario.benignControl);
  const write = (scenario: CompiledScenario, attempt: Attempt): AttemptReference => ({ binding: attempt.binding,
    reference: attempt.capture === null || attempt.policy === null ? null : writeExecutedEvidence(ledger, sessionId, {
      v: 1, scenarioId: scenario.scenario.id, packId: scenario.scenario.packId, fixture: scenario.scenario.fixture,
      binding: attempt.binding, policy: attempt.policy, capture: attempt.capture, invocationComplete: attempt.invocationComplete,
      ...(heldEvaluation === undefined ? {} : { evaluation: heldEvaluation }),
    }) });
  if (run.result.scenarioId !== compiled.scenario.id || run.result.outcome !== "not_evaluated" ||
      run.claimKind !== "synthetic_example" || run.regulatedEligible !== false || run.attemptResults.length !== compiled.scenario.attempts ||
      run.benignAttemptResults.length !== (benign ? compiled.scenario.attempts : 0)) throw new Error("CAPTURE_ATTEMPT_COUNT_MISMATCH");
  return { v: 1, scenarioId: compiled.scenario.id, packId: compiled.scenario.packId,
    attack: run.attemptResults.map(attempt => write(compiled, attempt)),
    benign: benign ? run.benignAttemptResults.map(attempt => write(benign, attempt)) : [] };
}

function unavailable(binding: Binding, reason: string): Attempt {
  return { binding, outcome: "not_evaluated", unauthorizedEffects: 0, reasons: [reason], invocationComplete: false,
    capture: null, policy: null, claimKind: "synthetic_example" };
}
/**
 * `expectedScope` and `sessionId` must come from the already verified report/run subject,
 * not from a stored reference or responder fields. Root must require report.sessionId.
 * The source registry compiles `compiled`; no caller-supplied scenario object is authoritative.
 */
export function replaySeededRunCaptures(ledger: Ledger, sessionId: string, compiled: CompiledScenario,
  expectedScope: Omit<Binding, "attemptId" | "fixtureDigest">, input: unknown, expectedEvaluation?: ExecutedEvaluationSnapshot):
  { ok: true; authenticationErrors: string[]; attack: Attempt[]; benign: Attempt[] } | { ok: false; reason: string } {
  let heldExpectedEvaluation: ExecutedEvaluationSnapshot | undefined;
  if (expectedEvaluation !== undefined) {
    const snapshot = executedEvaluationSnapshotSchema.safeParse(expectedEvaluation);
    if (!snapshot.success) return { ok: false, reason: "expected_evaluation_snapshot_invalid" };
    heldExpectedEvaluation = snapshot.data;
  }
  const parsed = seededRunReferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "stored_capture_references_invalid" };
  const refs = parsed.data;
  const benign = compiled.scenario.benignControl === null ? undefined : benignRegistryFor(compiled).get(compiled.scenario.benignControl);
  if (!sessionId || refs.scenarioId !== compiled.scenario.id || refs.packId !== compiled.scenario.packId ||
      refs.attack.length !== compiled.scenario.attempts || refs.benign.length !== (benign ? compiled.scenario.attempts : 0) ||
      expectedScope.controlId !== compiled.controlId || expectedScope.controlVersion !== compiled.controlVersion) {
    return { ok: false, reason: "stored_capture_run_subject_mismatch" };
  }
  const all = [...refs.attack, ...refs.benign];
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!unique(all.map(entry => entry.binding.attemptId)) ||
      !unique(all.flatMap(entry => entry.reference ? [entry.reference.eventId] : [])) ||
      !unique(all.flatMap(entry => entry.reference ? [entry.reference.receiptId] : [])) ||
      all.some(entry => !bindingMatches(entry.binding, { ...expectedScope,
        attemptId: entry.binding.attemptId, fixtureDigest: entry.binding.fixtureDigest }))) {
    return { ok: false, reason: "stored_capture_duplicate_or_cross_scope" };
  }
  const authenticationErrors: string[] = [];
  const replay = (scenario: CompiledScenario, entry: AttemptReference): Attempt => {
    if (entry.reference === null) return unavailable(entry.binding, "captured_attempt_unavailable");
    const loaded = loadExecutedEvidence(ledger, entry.reference, { sessionId,
      scenarioId: scenario.scenario.id, packId: scenario.scenario.packId, fixture: scenario.scenario.fixture, binding: entry.binding });
    if (!loaded.ok) { authenticationErrors.push(`${scenario.scenario.id}:${entry.binding.attemptId}:${loaded.reason}`);
      return unavailable(entry.binding, loaded.reason); }
    if (heldExpectedEvaluation !== undefined && canonicalize(loaded.record.evaluation) !== canonicalize(heldExpectedEvaluation)) {
      authenticationErrors.push(`${scenario.scenario.id}:${entry.binding.attemptId}:capture_evaluation_snapshot_mismatch`);
      return unavailable(entry.binding, "capture_evaluation_snapshot_mismatch");
    }
    const observed = replayCapturedAttempt(scenario, loaded.record.policy, loaded.record.capture,
      loaded.record.binding, loaded.record.invocationComplete);
    // Replay already consumed the unknown body. Do not cast malformed stored bytes to a typed live capture.
    return { binding: loaded.record.binding, capture: null, policy: null, invocationComplete: loaded.record.invocationComplete,
      outcome: observed.outcome, unauthorizedEffects: observed.unauthorizedEffects, reasons: observed.reasons,
      claimKind: "synthetic_example" };
  };
  const attack = refs.attack.map(entry => replay(compiled, entry));
  const benignAttempts = benign ? refs.benign.map(entry => replay(benign, entry)) : [];
  return { ok: true, authenticationErrors, attack, benign: benignAttempts };
}
