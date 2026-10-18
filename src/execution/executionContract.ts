/**
 * One execution API across the CLI, the TypeScript SDK, the Python wrapper and Studio (P2-13).
 *
 * Eight verbs with one meaning on every surface, and four phases that never imply each other: a finished model turn
 * whose log nobody verified reads `model-completion: succeeded`, `evidence-verification: pending`. Each phase has its
 * own source and nothing else may set it (docs/sdk/EXECUTION_API.md):
 *   - admission: whether the governed runtime admitted the session (lease, signed policy, writer) or refused it;
 *   - model-completion: the latest signed turn ending;
 *   - side-effect-completion: the verified receipt chains of the session's journaled consequential actions (P1-03);
 *   - evidence-verification: `verifyAgentRun` (`amc agent-loop verify`) and nothing else.
 *
 * `approve` answers a tool call's signed approval request through the approval engine; it is not the A4 gate decision
 * (P2-37), which has its own route and record. Pure: no I/O here, so the SDKs can import it.
 */
import type { TurnEndReason } from "../session/sessionTypes.js";

/** The wire version of this contract. Each client refuses a runtime that does not advertise exactly this version. */
/** @public */ export const EXECUTION_API_VERSION = 1;

/** @public */ export const EXECUTION_VERBS = ["start", "stream", "approve", "cancel", "resume", "fork", "dispose", "verify"] as const;
/** @public */ export type ExecutionVerb = (typeof EXECUTION_VERBS)[number];
/** @public */ export const EXECUTION_PHASES = ["admission", "model-completion", "side-effect-completion", "evidence-verification"] as const;
/** @public */ export type ExecutionPhase = (typeof EXECUTION_PHASES)[number];
/** @public */ export const PHASE_STATES = ["pending", "succeeded", "failed", "refused", "unknown"] as const;
/** @public */ export type PhaseState = (typeof PHASE_STATES)[number];

/** @public */
export interface ExecutionStatus {
  readonly sessionId: string;
  readonly phases: Readonly<Record<ExecutionPhase, PhaseState>>;
  /** The verified head state of each journaled action (P1-03 states), plus `evidence_incomplete` and `integrity_failed`. */
  readonly receiptStates: readonly string[];
}

/** A `completed` head whose evidence is marked incomplete, and a receipt chain that failed verification. */
export const EVIDENCE_INCOMPLETE = "evidence_incomplete";
export const INTEGRITY_FAILED = "integrity_failed";

/** Where each verb lives on each surface. Documentation and the parity test read this one table. */
export const EXECUTION_SURFACES = {
  cli: {
    start: "amc agent-loop run", stream: "amc agent-loop run --stream", approve: "amc approvals approve",
    cancel: "amc agent-loop run --cancel-after", resume: "amc agent-loop run --session", fork: "amc agent-loop run --fork-from",
    dispose: "amc agent-loop run --keep-open", verify: "amc agent-loop verify"
  },
  typescript: {
    start: "AMCNativeClient.start", stream: "AMCNativeTurn", approve: "AMCNativeClient.approve", cancel: "AMCNativeTurn.cancel",
    resume: "AMCNativeClient.resumeSession", fork: "AMCNativeClient.forkSession", dispose: "AMCNativeClient.dispose",
    verify: "AMCNativeClient.verifySession"
  },
  python: {
    start: "AmcAgent.new_session", stream: "Turn.iter_updates", approve: "AmcAgent.approve", cancel: "Turn.cancel",
    resume: "AmcAgent.resume_session", fork: "AmcAgent.fork_session", dispose: "AmcAgent.dispose", verify: "AmcAgent.verify_session"
  },
  studio: {
    start: "POST /api/v1/native-tasks", stream: "GET /api/v1/native-tasks/{taskId}?cursor={n}",
    approve: "POST /approvals/requests/{approvalRequestId}/decide", cancel: "POST /api/v1/native-tasks/{taskId}/cancel",
    resume: "POST /api/v1/native-tasks/{taskId}/resume", fork: "POST /api/v1/native-tasks/{taskId}/fork",
    dispose: "POST /api/v1/native-tasks/{taskId}/release", verify: "POST /api/v1/native-tasks/{taskId}/verify"
  }
} as const satisfies Record<string, Record<ExecutionVerb, string>>;
export type ExecutionSurface = keyof typeof EXECUTION_SURFACES;

/** What a surface observed. Each field feeds exactly one phase. */
export interface ExecutionFacts {
  readonly sessionId: string;
  /** `admitted` once the runtime opened the session; null before it answered. */
  readonly admission: "admitted" | "refused" | "failed" | null;
  /**
   * The latest recorded turn ending (a `TurnEndReason`); `running` while a turn is in flight; null before the first turn.
   * Any other value (`unreadable` when the rows could not be read, a reason this version does not know) reads unknown.
   */
  readonly turn: TurnEndReason | "running" | (string & Record<never, never>) | null;
  /** From `sessionReceiptStates`; null when the journal could not be read at all. */
  readonly receiptStates: readonly string[] | null;
  /** `verifyAgentRun(...).ok`; null until verification ran. */
  readonly verified: boolean | null;
}

const ADMISSION = { admitted: "succeeded", refused: "refused", failed: "failed" } as const;
/** Only `complete` is a finished turn. A cut-off turn (limits, cancellation, error) did not finish; `blocked` is a guard's refusal. */
const MODEL: Readonly<Record<string, PhaseState>> = { complete: "succeeded", blocked: "refused", cancelled: "failed",
  max_tokens: "failed", max_steps: "failed", error: "failed", interrupted: "failed" };
const SETTLED = new Set(["completed", "denied", "cancelled"]);
const OPEN = new Set(["requested", "authorized", "started"]);

/** Settlement, not success: denied and cancelled actions are settled; a dispatch whose outcome nobody recorded is not. */
function sideEffects(states: readonly string[] | null, turnSettled: boolean): PhaseState {
  if (states === null) return "unknown";
  if (states.includes(INTEGRITY_FAILED)) return "failed";
  if (states.some((state) => state === "outcome_unknown" || state === EVIDENCE_INCOMPLETE)) return "unknown";
  if (states.some((state) => OPEN.has(state))) return turnSettled ? "unknown" : "pending";
  if (!turnSettled) return "pending";
  return states.every((state) => SETTLED.has(state)) ? "succeeded" : "unknown";
}

export function deriveExecutionStatus(facts: ExecutionFacts): ExecutionStatus {
  const turnSettled = facts.turn !== null && facts.turn !== "running";
  return Object.freeze({
    sessionId: facts.sessionId,
    phases: Object.freeze({
      admission: facts.admission === null ? "pending" : ADMISSION[facts.admission],
      "model-completion": turnSettled ? MODEL[facts.turn as string] ?? "unknown" : "pending",
      "side-effect-completion": sideEffects(facts.receiptStates, turnSettled),
      "evidence-verification": facts.verified === null ? "pending" : facts.verified ? "succeeded" : "failed"
    }),
    receiptStates: Object.freeze([...(facts.receiptStates ?? [])])
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const sameKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

/** A status read off the wire, exactly in this shape, or null. Never repaired or defaulted. */
export function parseExecutionStatus(value: unknown): ExecutionStatus | null {
  if (!isRecord(value) || !sameKeys(value, ["sessionId", "phases", "receiptStates"]) || typeof value.sessionId !== "string"
    || value.sessionId.length > 200 || !isRecord(value.phases) || !sameKeys(value.phases, EXECUTION_PHASES)
    || !Array.isArray(value.receiptStates) || value.receiptStates.length > 4096) return null;
  const phases = value.phases;
  if (!EXECUTION_PHASES.every((phase) => (PHASE_STATES as readonly unknown[]).includes(phases[phase]))) return null;
  if (!value.receiptStates.every((state) => typeof state === "string" && /^[a-z_]{1,64}$/.test(state))) return null;
  return Object.freeze({ sessionId: value.sessionId, phases: Object.freeze({ ...phases }) as ExecutionStatus["phases"],
    receiptStates: Object.freeze([...value.receiptStates as string[]]) });
}
