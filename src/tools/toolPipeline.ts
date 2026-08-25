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

export interface ToolPipelineInit {
  readonly registry: ToolRegistry;
  readonly workspace: string;
  /** Omitted means no tool requires approval in this composition. */
  readonly approve?: ToolApprovalAsker;
  /** Action classes that must be approved before guards are consulted. */
  readonly approvalRequiredFor?: ReadonlySet<string>;
  readonly filters?: readonly ToolOutputFilter[];
  /** Called exactly once per call, after the outcome is final. */
  readonly record?: (execution: ToolExecution, outcome: ToolOutcome) => void;
}

export interface ToolCallInput {
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
      parentToken: input.parentToken ?? null
    };

    const outcome = await this.runStages(execution, definition.body);
    this.init.record?.(execution, outcome);
    return outcome;
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
        ok: true,
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
