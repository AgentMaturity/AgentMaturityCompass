import { ledgerChainError } from "../../catalog/evidence/mappingAdapter.js";
import { eventMeta } from "../../claims/evidenceProvenance.js";
import { verifyHexDigestAny } from "../../crypto/keys.js";
import { legacyLedgerRowKeys } from "../../keys/operationalLedgerReader.js";
import type { TrustContext } from "../../trust/trustContext.js";
/** Replay authenticated seeded captures before any native inconclusive-row skip. */
import { z } from "zod";
import type { Ledger } from "../../ledger/ledger.js";
import type { LoadedCatalog } from "../../catalog/loader.js";
import type { AssuranceScenarioResult } from "../../types.js";
import { canonicalize } from "../../utils/json.js";
import { seededRunReferencesSchema, replaySeededRunCaptures } from "./captureAdapter.js";
import { summarizeSeededScenario } from "./harness.js";
import { evaluateExecutedControl, matchesExecutedControlResult } from "./controlResults.js";
import { executedEvaluationSnapshotSchema } from "./evaluationSnapshot.js";
import { compileLegacyScenario, compileStationQuestion, benignRegistryFor } from "./routes.js";
import { getExecutedScenarioDisposition, REGULATED_SCENARIO_DISPOSITIONS, STATION_QUESTION_CONVERSIONS } from "./registry.js";
import { executedBindingScope, type ExecutedRunScope } from "./reportTypes.js";

const QUESTION_PACK = "station-question-conversions";
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const applicability = z.enum(["applicable", "not_applicable", "unresolved"]);
const scopeSchema = executedEvaluationSnapshotSchema.omit({ v: true, applicability: true }).extend({
  tenantId: id, workspaceId: id, deploymentId: id, agentId: id, runId: id,
  controlApplicability: z.record(z.string().min(1), applicability)
}).strict();
const executionSchema = z.object({ v: z.literal(1), attempts: z.union([z.literal(1), z.literal(25)]),
  references: seededRunReferencesSchema, diagnostics: z.unknown(), controlResults: z.array(z.unknown()).max(1) }).strict();
const equal = (left: unknown, right: unknown) => canonicalize(left) === canonicalize(right);
export function isExecutedReportPack(packId: string): boolean {
  return packId === QUESTION_PACK || REGULATED_SCENARIO_DISPOSITIONS.some(row => row.packId === packId);
}

/** Historical prompt/reply references prove only that the native session recorded an ungraded exchange. */
function authenticHistoricalReferences(input: {
  ledger: Ledger; sessionId: string; agentId: string | undefined; packId: string; row: AssuranceScenarioResult;
  trust?: TrustContext;
}): boolean {
  const ids = input.row.evidenceEventIds;
  if (!input.sessionId || !input.agentId || ids.length < 1 || ids.length > 2 ||
      ids.some(id => typeof id !== "string") || new Set(ids).size !== ids.length) return false;
  try {
    const keys = legacyLedgerRowKeys(input.ledger.workspace);
    const snapshot = input.ledger.db.transaction(() => ({ events: input.ledger.getAllEvents(),
      session: input.ledger.getSessionById(input.sessionId) }))();
    if (ledgerChainError(snapshot.events, keys, { workspace: input.ledger.workspace, ledger: input.ledger, trust: input.trust })) return false;
    const session = snapshot.session, last = snapshot.events.filter(event => event.session_id === input.sessionId).at(-1);
    if (!session || session.binary_path !== "amc-assurance-runner" || session.ended_ts === null ||
        !session.session_final_event_hash || session.session_final_event_hash !== last?.event_hash ||
        !session.session_seal_sig || !verifyHexDigestAny(session.session_final_event_hash, session.session_seal_sig, keys)) return false;
    return ids.every((id, index) => {
      const event = snapshot.events.find(candidate => candidate.id === id);
      if (!event || event.session_id !== input.sessionId || !["sandbox", "any"].includes(event.runtime) ||
          event.event_type !== (index === 0 ? "stdin" : "stdout")) return false;
      const meta = eventMeta(event);
      return meta.source === "assurance" && meta.packId === input.packId && meta.scenarioId === input.row.scenarioId &&
        meta.agentId === input.agentId && meta.direction === (index === 0 ? "assurance_to_agent" : "agent_to_assurance");
    });
  } catch { return false; }
}

/** Outer native verification owns the report hash/seal and ledger-run binding before trusting its scope. */
export function validateExecutedReportRow(input: {
  ledger: Ledger; sessionId: string; scope: ExecutedRunScope | undefined; agentId?: string;
  trust?: TrustContext;
  row: AssuranceScenarioResult; packId: string; catalog: LoadedCatalog;
}): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const fail = (reason: string) => { errors.push(reason); return { ok: false, errors }; };
  try {
    const { row, packId, catalog } = input;
    const isQuestion = packId === QUESTION_PACK;
    const disposition = isQuestion ? null : getExecutedScenarioDisposition(packId, row.scenarioId);
    if (isQuestion ? !STATION_QUESTION_CONVERSIONS.some(entry => entry.questionId === row.scenarioId) : !disposition) {
      return fail("executed_report_unknown_scenario_or_pack");
    }
    if (row.inconclusive !== true || row.pass !== false || row.score0to5 !== 0 || row.score0to100 !== 0 ||
        row.executed !== undefined && row.gradingMethod !== "executed" || !Array.isArray(row.evidenceEventIds) ||
        row.responseTransport === "direct") return fail("executed_report_native_synthetic_markers_invalid");
    // Unsupported/missing-scope/invocation-unavailable rows carry no authenticated execution packet or evidence.
    if (row.executed === undefined) {
      if (row.evidenceEventIds.length === 0) return { ok: true, errors };
      return authenticHistoricalReferences({ ledger: input.ledger, sessionId: input.sessionId, trust: input.trust,
        agentId: input.scope?.agentId ?? input.agentId, packId, row }) ? { ok: true, errors } :
        fail("executed_report_unbacked_evidence_references");
    }
    const parsed = executionSchema.safeParse(row.executed);
    if (!parsed.success) return fail("executed_report_packet_invalid");
    const packet = parsed.data;
    const selected = isQuestion ? compileStationQuestion(row.scenarioId, catalog, packet.attempts) :
      compileLegacyScenario(packId, row.scenarioId, catalog, packet.attempts);
    if (!selected.ok) return fail(`executed_report_source_compilation_refused:${selected.reason}`);
    const compiled = selected.compiled;
    const scopeResult = scopeSchema.safeParse(input.scope);
    if (!scopeResult.success || !input.sessionId) return fail("executed_report_trusted_scope_or_session_missing");
    const scope = scopeResult.data;
    const bindingScope = { ...executedBindingScope(scope), controlId: compiled.controlId, controlVersion: compiled.controlVersion };
    const replay = replaySeededRunCaptures(input.ledger, input.sessionId, compiled, bindingScope, packet.references, undefined, { trust: input.trust });
    if (!replay.ok) return fail(`executed_report_capture_replay_refused:${replay.reason}`);
    // Auth failures are hard verification errors, even when stored rows/diagnostics say NE or inconclusive.
    if (replay.authenticationErrors.length > 0) return fail("executed_report_capture_authentication_failed");
    const references = [...packet.references.attack, ...packet.references.benign];
    const expectedEventIds = references.flatMap(entry => entry.reference === null ? [] : [entry.reference.eventId]);
    if (!equal(row.evidenceEventIds, expectedEventIds)) return fail("executed_report_evidence_references_mismatch");
    if (expectedEventIds.length > 0 && row.responseTransport !== "gateway") return fail("executed_report_gateway_transport_missing");
    const diagnostics = summarizeSeededScenario(compiled, replay.attack, replay.benign, benignRegistryFor(compiled));
    if (!equal(packet.diagnostics, diagnostics)) return fail("executed_report_diagnostics_mismatch");
    const evaluation = executedEvaluationSnapshotSchema.parse({ v: 1, planDigest: scope.planDigest,
      profileSha256: scope.profileSha256, policyDigest: scope.policyDigest,
      applicability: scope.controlApplicability[compiled.controlId] ?? "unresolved" });
    const projection = evaluateExecutedControl({ ledger: input.ledger, sessionId: input.sessionId, trust: input.trust,
      compiled, catalog, scope: bindingScope, evaluation, references: packet.references });
    if (!projection.ok) {
      // A truly empty authenticated reference set cannot supply a native insertion-time window or result.
      if (projection.reason === "executed_control_capture_empty" && expectedEventIds.length === 0 && packet.controlResults.length === 0) {
        return { ok: true, errors };
      }
      return fail(`executed_report_control_projection_refused:${projection.reason}`);
    }
    if (packet.controlResults.length !== 1 || !matchesExecutedControlResult(packet.controlResults[0], projection.result)) {
      return fail("executed_report_control_result_mismatch");
    }
    return { ok: true, errors };
  } catch {
    return fail("executed_report_validation_failed");
  }
}
