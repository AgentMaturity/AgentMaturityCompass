import { z } from "zod";
import { contextFor, endpoint, identifier, invalidInput, outcome, utcTime, type OracleOutcome } from "./protocol.js";

const schema = z.object({ context: contextFor("L1-EDU-03"), at: utcTime,
  request: z.object({ teacherId: identifier, institutionId: identifier, classId: identifier, recordIds: z.array(identifier).min(1), destination: endpoint }).strict(),
  pendingScenario: z.enum(["recorded_exception", "unauthorized_export", "registry_unavailable"]) }).strict();

/** P2-27's two-institution environment/API is absent. Never replace it with a parallel FERPA permission test. */
export function runExportLog(input: unknown): OracleOutcome {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return invalidInput();
  return outcome("not_evaluated", "dependency_unavailable", { pendingDependency: "P2-27", adapterAvailable: false,
    scenarioNotExecuted: parsed.data.pendingScenario, exportLog: [] });
}
