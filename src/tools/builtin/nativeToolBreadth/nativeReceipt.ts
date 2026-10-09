import type { ToolBody, ToolBodyResult, ToolExecution } from "../../toolTypes.js";
import { EgressBlocked } from "../../../residency/checkEgress.js";
import { NativeToolRefusal } from "./originPolicy.js";

/**
 * Ledger receipts for the five native tools (P1-43, AMC-1549).
 *
 * The composition supplies the recorder and adds who and where (tool,
 * session, agent, call); a tool supplies what happened. A recorder that throws
 * fails the call: an effect without its receipt is one nobody can account for.
 */
export interface NativeReceipt {
  readonly auditType: string;
  readonly decision: "allow" | "deny" | "fail";
  readonly [field: string]: unknown;
}

export type NativeReceiptRecorder = (execution: ToolExecution, receipt: NativeReceipt) => void;

/**
 * Every EXECUTE call leaves exactly one call receipt of `auditType`. The body
 * writes its own `allow` row at the point it chooses (before the effect it
 * describes, or before returning content). A body that throws before that
 * leaves a `deny` row for a refusal or a `fail` row for anything else, with
 * the reason. SIMULATE has no effect and leaves none.
 */
export function receiptedBody(auditType: string, record: NativeReceiptRecorder,
  body: (execution: ToolExecution, allow: (fields: Readonly<Record<string, unknown>>) => void) => Promise<ToolBodyResult>): ToolBody {
  return async (execution) => {
    let recorded = false;
    const allow = (fields: Readonly<Record<string, unknown>>): void => {
      record(execution, { ...fields, auditType, decision: "allow" });
      recorded = true;
    };
    try {
      return await body(execution, allow);
    } catch (error: unknown) {
      if (!recorded && execution.effectiveMode !== "SIMULATE") {
        record(execution, { auditType, decision: error instanceof NativeToolRefusal || error instanceof EgressBlocked ? "deny" : "fail",
          reason: error instanceof Error ? error.message : String(error) });
      }
      throw error;
    }
  };
}
