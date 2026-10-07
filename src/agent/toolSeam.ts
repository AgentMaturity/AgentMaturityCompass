/**
 * What the loop needs from a tool registry, and nothing more.
 *
 * THE SPLIT. The loop owns ORDER and EVIDENCE; the seam owns EXECUTION. That is
 * why `execute` is one method: everything a governed call has to traverse —
 * pre-execute guards, approval, the sandbox, post-execute filters — goes behind
 * it in P4.1, and the loop learns nothing about any of it. What the loop keeps
 * is the part only it can do: writing the `tool/result` rows in the order the
 * model asked, and answering every call the model made.
 *
 * FULL OUTPUT, NEVER PRE-TRUNCATED. `content` is the tool's whole output.
 * `SessionService.recordToolResult` runs the spill policy over the bytes it is
 * given and mints the spill ref from what it actually wrote; a loop that
 * truncated first would make a signed row describe bytes nobody stored.
 *
 * ORTHOGONAL OUTCOME FIELDS. `outcome`, `exitCode`, `timedOut` and `denied` are
 * four independent facts, not one status with four spellings. A command that
 * exited 137 because it was killed on a deadline is `exitCode: 137` AND
 * `timedOut: true`; collapsing them loses which one an operator is looking at.
 */
import type { AuthorizationIntentResult } from "../actions/authorize.js";
import type { ToolSchema } from "../llm/request/requestSpec.js";
import type { ToolDispatch, ToolOutcome } from "../session/sessionTypes.js";
import type { BoundApprovalGate, ToolAuthority } from "../tools/toolPipeline.js";

/** One tool call, exactly as the model asked for it. */
export interface ToolCallRequest {
  readonly callId: string;
  readonly toolName: string;
  /** Raw JSON as the model produced it. Never re-parsed by the loop. */
  readonly rawArguments: string;
  readonly sessionId: string;
  readonly turn: number;
  readonly step: number;
  /** Set for a sub-call dispatched from inside a running program (P4.5). */
  readonly parentToken: string | null;
  readonly dispatch: ToolDispatch;
  readonly signal: AbortSignal;
  /**
   * Approvals granted for THIS call (P1-02). Set only by the approval gate after a grant; the loop never sets it and
   * the model cannot reach it. The pipeline re-verifies every one against the exact call before the body runs.
   */
  readonly authority?: ToolAuthority;
}

/** What running one tool produced. */
export interface ToolCallOutcome {
  readonly outcome: ToolOutcome;
  /** The tool's FULL output. The session's spill policy decides what is stored inline. */
  readonly content: string | Buffer;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly denied: boolean;
  /**
   * The tool asserts the turn is finished — a hand-back-to-the-user tool, for
   * instance. The loop honours it instead of asking the model again.
   */
  readonly concludesTurn?: boolean;
  /**
   * Text the tool wants the model to see at the next step boundary. It enters
   * through the same durable inbox a human steer does, so there is one path and
   * one audit story for "something spoke to the model between steps".
   */
  readonly additionalContext?: readonly string[];
}

/** How the loop reaches a tool registry. */
export interface AgentToolSeam {
  /**
   * The tools to offer the model, or null for a request that offers none.
   *
   * Read once per step, so a registry change between steps reaches the next
   * request — and is visible in the log, because a changed schema produces a new
   * `request/tools` row that the next `request/header` cites.
   */
  schemas(): readonly ToolSchema[] | null;
  /**
   * Whether this call may overlap with others. Re-read as a group is filled, so
   * a guard that turns a tool exclusive takes effect on the calls not yet
   * started rather than only on the next step.
   */
  executionMode(request: ToolCallRequest): "parallel" | "exclusive";
  execute(request: ToolCallRequest): Promise<ToolCallOutcome>;
  /** Pipeline-backed seams: the intent an approval for this call must bind, or null outside the authorized classes. */
  authorizationIntent?(request: ToolCallRequest): AuthorizationIntentResult | null;
  /** Pipeline-backed seams: a composed approval gate binds itself, so sub-calls are asked and approvals required. */
  bindApprovalGate?(gate: BoundApprovalGate): void;
}

/**
 * The seam a composition uses when no tool registry is mounted.
 *
 * A real object with an empty catalogue, deliberately, rather than an optional
 * dependency: "tools absent" and "tools broken" must not look the same from the
 * outside. It offers the model nothing, so a well-behaved model asks for
 * nothing; a model that invents a call anyway gets an honest ERROR result rather
 * than a dangling call the log cannot close.
 */
export const EMPTY_TOOL_SEAM: AgentToolSeam = Object.freeze({
  schemas: (): readonly ToolSchema[] | null => null,
  executionMode: (): "parallel" | "exclusive" => "parallel",
  execute: (request: ToolCallRequest): Promise<ToolCallOutcome> =>
    Promise.resolve({
      outcome: "ERROR",
      content: `[amc:loop] no tool registry is mounted, so "${request.toolName}" cannot be executed.`,
      exitCode: null,
      timedOut: false,
      denied: false
    })
});
