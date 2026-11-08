import { existsSync } from "node:fs";
import { outcomeContractPath } from "../outcomes/outcomeContractEngine.js";
import { listStandardSchemas } from "../standard/standardGenerator.js";
import { valueAgentContractPath, valuePolicyPath, valueWorkspaceContractPath } from "../value/valueStore.js";

/**
 * Configuration a fresh workspace legitimately lacks (live-readiness console audit, coordinator section 9). Each route
 * answers with a status and body the console renders as empty, instead of the 500 the missing file used to throw.
 */
export interface EmptyState {
  status: number;
  body: Record<string, unknown>;
}

const AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** The value contract (and, for snapshots and reports, the value policy) the scope needs, or the 4xx for the gap. */
export function missingValueInput(workspace: string, scopeType: string, scopeId: string, needsPolicy: boolean): EmptyState | null {
  if (scopeType === "AGENT" && (!AGENT_ID.test(scopeId) || scopeId.includes(".."))) return { status: 400, body: { error: "invalid agent id" } };
  if (needsPolicy && !existsSync(valuePolicyPath(workspace))) return { status: 404, body: { error: "value policy missing", code: "VALUE_POLICY_MISSING" } };
  const contract = scopeType === "AGENT" ? valueAgentContractPath(workspace, scopeId) : valueWorkspaceContractPath(workspace);
  return existsSync(contract) ? null : { status: 404, body: { error: "value contract missing", code: "VALUE_CONTRACT_MISSING" } };
}

/** No outcome contract yet: 200 with no report, which the outcomes page renders as zeros (it reads `report`). */
export function missingOutcomeContract(workspace: string, agentId: string): EmptyState | null {
  return existsSync(outcomeContractPath(workspace, agentId)) ? null
    : { status: 200, body: { agentId, status: "OUTCOME_CONTRACT_MISSING", report: null } };
}

/** A standard schema that is unknown or not generated yet is a 404, not a 500. */
export function missingStandardSchema(workspace: string, id: string): EmptyState | null {
  const name = id.endsWith(".schema.json") ? id : `${id}.schema.json`;
  return listStandardSchemas(workspace).some((row) => row.name === name) ? null
    : { status: 404, body: { error: `schema not generated: ${name}`, code: "STANDARD_SCHEMA_NOT_GENERATED" } };
}
