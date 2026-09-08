import { randomUUID } from "node:crypto";
import { freezeToolArguments } from "./toolArguments.js";
import type { ToolRegistry } from "./toolRegistry.js";
import type {
  ToolBody,
  ToolDenial,
  ToolExecution,
  ToolMode,
  ToolOutcome
} from "./toolTypes.js";

/**
 * The tool execution pipeline (P4.1, ADR-4).
 *
 * Stage order is the design, so it is stated once here and enforced below:
 *
 *   visibility -> freeze arguments -> approval -> guards -> body -> filters
 *
 * Approval sits BEFORE guards deliberately. Approval is a question about
 * whether a human wants this; a guard is a statement that policy forbids it.
 * Putting approval last would let a granted approval overturn a policy denial,
 * which is precisely the laundering the monotonic guard type exists to
 * prevent. A guard denial is final and no approval reaches past it.
 *
 * Post-execute filters may rewrite OUTPUT and nothing else. A filter that
 * could clear `denied` would be a seventh way to launder a denial.
 */

/** Answers "may this call proceed", asked before guards. */
export type ToolApprovalAsker = (execution: ToolExecution) => Promise<ToolApprovalAnswer>;

/**
 * Three-valued on purpose. `unavailable` is what a missing or broken answerer
 * produces, and it denies — an approval nobody answered is not a grant.
 */
export type ToolApprovalAnswer = "allow" | "deny" | "unavailable";

/** Rewrites output after the body. Cannot change whether the call was denied. */
export type ToolOutputFilter = (output: string, execution: ToolExecution) => string;

/**
 * The reserved transport for Code Mode.
 *
 * Reserved rather than conventional: under `mode: "code"` this is the only
 * name a turn may call directly, so it cannot be a tool a plugin happens to
 * register under.
 */
export const RUN_CODE_TOOL = "run_code";

/**
 * `native` is one tool call per turn. `code` collapses every direct call onto
 * `run_code`, which dispatches the rest as SUB-CALLS through this same
 * pipeline.
 */
export type ToolDispatchMode = "native" | "code";

export interface ToolPipelineInit {
  readonly registry: ToolRegistry;
  readonly workspace: string;
  /** Defaults to `native`. */
  readonly mode?: ToolDispatchMode;
  /** Omitted means no tool requires approval in this composition. */
  readonly approve?: ToolApprovalAsker;
  /** Action classes that must be approved before guards are consulted. */
  readonly approvalRequiredFor?: ReadonlySet<string>;
  readonly filters?: readonly ToolOutputFilter[];
  /** Called exactly once per call, after the outcome is final. */
  readonly record?: (execution: ToolExecution, outcome: ToolOutcome) => void;
}

export interface ToolCallInput {
  /** The turn's cancellation signal, for a body long enough to need one. */
  readonly signal?: AbortSignal;
  readonly name: string;
  readonly agentId: string;
  readonly arguments: Record<string, unknown>;
  readonly requestedMode: ToolMode;
  readonly callId?: string;
  readonly rootCallId?: string;
  readonly parentToken?: string | null;
}

function denialOutcome(denied: ToolDenial): ToolOutcome {
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

export class ToolPipeline {
  constructor(private readonly init: ToolPipelineInit) {}

  async execute(input: ToolCallInput): Promise<ToolOutcome> {
    const collapsed = this.collapses(input);
    if (collapsed) {
      // Terminates HERE, before pre-execute policy and before guards.
      //
      // A collapsed call can only ever fail, and letting the policy pipeline
      // observe it would mean asking a human to approve — and recording an
      // approval for — something that was never going to run. It would also
      // spend budget and produce guard decisions about a call that does not
      // exist in any meaningful sense.
      return denialOutcome({
        stage: "visibility",
        reason: `"${input.name}" cannot be called directly under code mode; dispatch it from inside ${RUN_CODE_TOOL}`,
        guardLabel: null
      });
    }

    const visible = this.init.registry.visible(input.agentId);
    const definition = visible.get(input.name);
    if (!definition) {
      // No execution exists yet, so there is nothing to record against and
      // nothing for a guard to have seen. An invisible tool is not a policy
      // decision about a call; it is the absence of a call.
      return denialOutcome({
        stage: "visibility",
        reason: `unknown tool "${input.name}"`,
        guardLabel: null
      });
    }

    const callId = input.callId ?? randomUUID();
    const execution: ToolExecution = {
      token: `tok_${randomUUID()}`,
      callId,
      rootCallId: input.rootCallId ?? callId,
      name: definition.name,
      agentId: input.agentId,
      workspace: this.init.workspace,
      actionClass: definition.actionClass,
      requestedMode: input.requestedMode,
      effectiveMode: input.requestedMode,
      arguments: freezeToolArguments(input.arguments),
      parentToken: input.parentToken ?? null,
      ...(input.signal === undefined ? {} : { signal: input.signal })
    };

    const outcome = await this.runStages(execution, definition.body);
    try {
      this.init.record?.(execution, outcome);
    } catch {
      // The guarantee belongs HERE, not to each recorder. A recorder that
      // threw would turn an evidence problem into a tool failure, and the
      // model would see a denial that policy never made. The gap shows in the
      // spine as a missing row rather than as a wrong answer to the caller.
      //
      // It was previously the caller's job, which made it untestable: proving
      // it required a recorder that genuinely failed, and every filesystem
      // sabotage I tried was survived by SQLite.
    }
    return outcome;
  }

  /**
   * Whether this call is denied by the mode itself.
   *
   * A SUB-call is never collapsed: it carries a parent token, which means it
   * came from inside `run_code` and is exactly the dispatch code mode exists
   * to route. Collapsing those would leave code mode able to call nothing at
   * all.
   */
  private collapses(input: ToolCallInput): boolean {
    if ((this.init.mode ?? "native") !== "code") return false;
    if (input.name === RUN_CODE_TOOL) return false;
    return (input.parentToken ?? null) === null;
  }

  private async runStages(execution: ToolExecution, body: ToolBody): Promise<ToolOutcome> {
    const approval = await this.askApproval(execution);
    if (approval !== null) return approval;

    const denied = this.init.registry.guardReason(execution);
    if (denied) {
      return denialOutcome({ stage: "guard", reason: denied.reason, guardLabel: denied.label });
    }

    try {
      const result = await body(execution);
      const output = (this.init.filters ?? []).reduce(
        (text, filter) => filter(text, execution),
        result.output
      );
      return {
        ok: result.ok ?? true,
        exitCode: result.exitCode ?? null,
        timedOut: result.timedOut ?? false,
        denied: null,
        output,
        bytes: result.bytes ?? Buffer.byteLength(output, "utf8")
      };
    } catch (error: unknown) {
      // A thrown tool is a failed call, not a denied one. Reporting it as a
      // denial would credit policy with stopping something policy allowed.
      return {
        ok: false,
        exitCode: null,
        timedOut: false,
        denied: null,
        output: error instanceof Error ? error.message : String(error),
        bytes: 0
      };
    }
  }

  /** Returns a denial outcome, or null to continue. */
  private async askApproval(execution: ToolExecution): Promise<ToolOutcome | null> {
    if (!this.init.approvalRequiredFor?.has(execution.actionClass)) return null;
    if (!this.init.approve) {
      // Composition asked for approval on this class and supplied no answerer.
      // Proceeding would mean treating an unanswerable question as a yes.
      return denialOutcome({
        stage: "approval",
        reason: `no approval answerer is composed for ${execution.actionClass}`,
        guardLabel: null
      });
    }
    const answer = await this.init.approve(execution).catch((): ToolApprovalAnswer => "unavailable");
    if (answer === "allow") return null;
    return denialOutcome({
      stage: "approval",
      reason: answer === "deny" ? "approval denied" : "approval unavailable",
      guardLabel: null
    });
  }
}
