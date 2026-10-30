import type { EffectState } from "../actions/receiptStates.js";
import { DefiniteFailureError, type ToolBodyResult, type ToolDenial, type ToolOutcome } from "./toolTypes.js";

// Pure outcome helpers of ToolPipeline, split out to keep toolPipeline.ts under its line cap.

/** Undeclared effects of these classes are `outcome_unknown`: the effect is too costly to assume either way. */
const EFFECT_MUST_BE_DECLARED: ReadonlySet<string> = new Set(["FINANCIAL", "DATA_EXPORT", "IDENTITY"]);

export type EffectVerdict =
  | { readonly state: "completed"; readonly effect: EffectState | null; readonly reasonCode: string }
  | { readonly state: "outcome_unknown"; readonly reasonCode: string };

/** Effect classification (P1-03) for a body that returned, or one that threw. */
export function effectVerdict(actionClass: string, settled: { readonly result: ToolBodyResult } | { readonly error: unknown }): EffectVerdict {
  if ("error" in settled) {
    return settled.error instanceof DefiniteFailureError ? { state: "completed", effect: "not_applied", reasonCode: "definite_failure" }
      : { state: "outcome_unknown", reasonCode: "body_threw_ambiguous" };
  }
  const effect: unknown = settled.result.effect;
  if (effect === "applied" || effect === "not_applied") return { state: "completed", effect, reasonCode: `effect_declared:${effect}` };
  if (effect === "unknown") return { state: "outcome_unknown", reasonCode: "effect_declared_unknown" };
  // A declaration nobody defined is not a declaration: fail toward unknown, never toward "applied".
  if (effect !== undefined) return { state: "outcome_unknown", reasonCode: "effect_declaration_invalid" };
  return EFFECT_MUST_BE_DECLARED.has(actionClass) ? { state: "outcome_unknown", reasonCode: "effect_not_declared" }
    : { state: "completed", effect: null, reasonCode: "completed" };
}

export function thrownOutcome(error: unknown): ToolOutcome {
  // A thrown tool is a failed call, not a denied one. Reporting it as a
  // denial would credit policy with stopping something policy allowed.
  return { ok: false, exitCode: null, timedOut: false, denied: null, output: error instanceof Error ? error.message : String(error), bytes: 0 };
}

/** A call cancelled before its body ran: not a denial (policy did not refuse it) and not a body failure. */
export function notDispatched(): ToolOutcome {
  const output = "[amc] not dispatched: the call was cancelled before its body ran";
  return { ok: false, exitCode: null, timedOut: false, denied: null, output, bytes: Buffer.byteLength(output, "utf8") };
}

export function denialOutcome(denied: ToolDenial): ToolOutcome {
  return {
    ok: false,
    // Not an exit code. A call that never ran has no exit status, and using a
    // sentinel here would make "denied" indistinguishable from "the tool
    // exited 126" in six-month-old evidence.
    exitCode: null,
    timedOut: false,
    denied,
    output: "",
    bytes: 0
  };
}

/** A missing guard keeps existing behavior; malformed or throwing guards never grant an effect. */
export function effectGuardDenial(beforeEffect: (() => string | null) | undefined): ToolDenial | null {
  if (beforeEffect === undefined) return null;
  let reason: unknown;
  try { reason = beforeEffect(); }
  catch { reason = "Trusted effect guard could not be verified."; }
  return reason === null ? null : { stage: "guard", guardLabel: "trusted-before-effect",
    reason: typeof reason === "string" ? reason : "Trusted effect guard returned no valid decision." };
}
