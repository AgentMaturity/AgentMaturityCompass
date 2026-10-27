import type { AssurancePackResult } from "../../types.js";
import type { Ledger } from "../../ledger/ledger.js";
import type { LoadedCatalog } from "../../catalog/loader.js";
import { compileLegacyScenario, compileStationQuestion } from "./routes.js";
import { evaluateExecutedControl } from "./controlResults.js";
import { executedBindingScope, type ExecutedRunScope } from "./reportTypes.js";
import { workspaceSelfTrust } from "../../trust/trustContext.js";

/** Native admission reads the exact sealed captures; local fixture verdicts never become production passes. */
export function finalizeExecutedResults(input: { ledger: Ledger; sessionId: string; catalog: LoadedCatalog;
  scope: ExecutedRunScope | null; packs: AssurancePackResult[] }): void {
  for (const pack of input.packs) for (const row of pack.scenarioResults) {
    const packet = row.executed;
    if (!packet) continue;
    if (!input.scope) throw new Error("EXECUTED_CONTROL_SCOPE_MISSING");
    const selected = pack.packId === "station-question-conversions" ?
      compileStationQuestion(row.scenarioId, input.catalog, packet.attempts) :
      compileLegacyScenario(pack.packId, row.scenarioId, input.catalog, packet.attempts);
    if (!selected.ok) throw new Error("EXECUTED_CONTROL_SOURCE_COMPILATION_FAILED");
    const compiled = selected.compiled, scope = input.scope;
    const projected = evaluateExecutedControl({ ledger: input.ledger, sessionId: input.sessionId, catalog: input.catalog, trust: workspaceSelfTrust(input.ledger.workspace),
      compiled, references: packet.references,
      scope: { ...executedBindingScope(scope), controlId: compiled.controlId, controlVersion: compiled.controlVersion },
      evaluation: { v: 1, planDigest: scope.planDigest, profileSha256: scope.profileSha256,
        policyDigest: scope.policyDigest, applicability: scope.controlApplicability[compiled.controlId] ?? "unresolved" } });
    if (projected.ok) packet.controlResults = [projected.result];
    else if (projected.reason === "executed_control_capture_empty") packet.controlResults = [];
    else throw new Error("EXECUTED_CONTROL_PROJECTION_INTEGRITY_FAILURE");
  }
}
