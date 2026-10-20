import type { Applicability } from "../../catalog/compiler/types.js";
import type { ControlResult } from "../../catalog/evidence/types.js";
import type { SeededRunReferences } from "./captureAdapter.js";
import type { SeededRunSummary } from "./harness.js";
import type { Binding } from "./types.js";

/** This snapshot is supplied by verified native policy/profile reads, never a responder. */
export interface ExecutedRunScope {
  tenantId: string; workspaceId: string; deploymentId: string; agentId: string;
  policyDigest: string; runId: string; planDigest: string; profileSha256: string;
  controlApplicability: Readonly<Record<string, Applicability>>;
}
export interface ExecutedScenarioRunReport {
  v: 1;
  attempts: 1 | 25;
  references: SeededRunReferences;
  diagnostics: SeededRunSummary;
  controlResults: ControlResult[];
}
/** Preserve the native binding contract without copying unrelated policy snapshot fields. */
export function executedBindingScope(scope: ExecutedRunScope): Omit<Binding, "attemptId" | "fixtureDigest" | "controlId" | "controlVersion"> {
  return { tenantId: scope.tenantId, workspaceId: scope.workspaceId, deploymentId: scope.deploymentId,
    agentId: scope.agentId, policyDigest: scope.policyDigest, runId: scope.runId };
}
