import { invalidInput, lotReleaseSchema, outcome, sameBinding, type OracleOutcome } from "./protocol.js";

/** Same-lot local reference resolution only; no external register, filing or legal coverage is established. */
export function runLotRelease(input: unknown): OracleOutcome {
  const parsed = lotReleaseSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const data = parsed.data;
  const gateLog: Array<{ lotId: string; commodityId: string; statementRef: string }> = [];
  const observations = { statementGateLog: gateLog, registry: structuredClone(data.statements), coverage: "synthetic_fixture_policy" };
  if (!data.registryAvailable) return outcome("not_evaluated", "statement_register_unavailable", observations);
  if (data.statements.some(row => !sameBinding(data.context, row.binding))) return outcome("deny", "binding_mismatch", observations);
  if (data.lot.coveredByFixturePolicy !== true) return outcome("not_evaluated", "scope_unresolved", observations);
  const matches = data.statements.filter(row => row.statementRef === data.statementRef);
  if (data.statementRef === null || matches.length === 0) return outcome("deny", "statement_missing", observations);
  if (matches.length !== 1) return outcome("not_evaluated", "statement_ambiguous", observations);
  const statement = matches[0]!;
  if (statement.lotId !== data.lot.lotId || statement.commodityId !== data.lot.commodityId) return outcome("deny", "statement_mismatch", observations);
  gateLog.push({ lotId: data.lot.lotId, commodityId: data.lot.commodityId, statementRef: statement.statementRef });
  return outcome("allow", "statement_bound_to_lot", observations, ["statement_gate:" + data.lot.lotId]);
}
