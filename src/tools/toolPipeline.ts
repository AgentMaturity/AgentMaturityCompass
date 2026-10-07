import { randomUUID } from "node:crypto";
import {
  authorizationIntentFor, bindAuthorization, recheckAuthorization,
  type AuthorizationContext, type AuthorizationIntentResult, type BindResult
} from "../actions/authorize.js";
import { ACTION_CLASSES } from "../governor/actionCatalog.js";
import { freezeToolArguments } from "./toolArguments.js";
import type { ToolRegistry } from "./toolRegistry.js";
import type {
  ToolBody,
  ToolDefinition,
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
 *   visibility -> freeze arguments -> approval -> guards -> authorization -> body -> filters
 *
 * Authorization (P1-02) is last before the body on purpose: the record bound when the call entered is rechecked
 * against the policy files, the approvals and the freezes as they are NOW, synchronously, and its approvals are
 * consumed there. Nothing awaits between that recheck and the body.
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

/** Classes bound to an authorization record by default: every class except reads and low-impact writes. */
export const DEFAULT_AUTHORIZE_CLASSES: ReadonlySet<string> = new Set(
  ACTION_CLASSES.filter((actionClass) => actionClass !== "READ_ONLY" && actionClass !== "WRITE_LOW"));

/** Approvals named by trusted composition: the approval gate, the pipeline's own gate stage, ToolHub. */
export interface ToolAuthority {
  readonly approvalRequestIds: readonly string[];
}

/**
 * An approval gate composed in front of this pipeline (P1-02). Once one is bound, a call it gates in an authorized
 * class needs a signed approval named through `authority`, whatever path the call took, and a Code Mode sub-call is
 * asked on its own instead of riding on the `run_code` approval.
 */
export interface BoundApprovalGate {
  gates(toolName: string): boolean;
  /** Asks about one sub-call. Resolves to the signed requests that granted it, or null when it was not granted. */
  ask(execution: ToolExecution, intent: AuthorizationIntentResult | null): Promise<ToolAuthority | null>;
}

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
  /** Classes whose calls are bound to an authorization record and rechecked before the body. */
  readonly authorizeClasses?: ReadonlySet<string>;
  /** Authorized classes that need a signed approval through `authority` even with no gate bound (hooks, ToolHub). */
  readonly boundApprovalRequiredFor?: ReadonlySet<string>;
  /** Who is acting, for the record. Read per call, because the CLI binds its session after composing. */
  readonly authorizationContext?: () => Omit<AuthorizationContext, "authority">;
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
  /** Set only by trusted composition, after an approval was granted. Arguments never grant anything. */
  readonly authority?: ToolAuthority;
}

/** What the authorization stage needs, decided when the call entered. */
interface CallAuthorization {
  /** A sub-call the bound gate refused, denied at the approval stage. */
  readonly refused: ToolDenial | null;
  readonly context: AuthorizationContext | null;
  readonly bound: BindResult | null;
  /** A bound gate gates this call, so it needs a signed approval. */
  readonly required: boolean;
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

// The selected body must remain distinguishable from a later scoped override
// while approval is awaited. Callers cannot assign this binding through argv.
const selectedDefinitions = new WeakMap<ToolExecution, ToolDefinition>();
export function selectedToolDefinitionFor(execution: ToolExecution): ToolDefinition | undefined {
  return selectedDefinitions.get(execution);
}

export class ToolPipeline {
  private readonly gates: BoundApprovalGate[] = [];

  constructor(private readonly init: ToolPipelineInit) {}

  /** Bind a composed approval gate. Gates only add: a later one never lifts what an earlier one requires. */
  bindApprovalGate(gate: BoundApprovalGate): void {
    this.gates.push(gate);
  }

  /** The intent an approval for this call must bind, or null for a call outside the authorized classes. */
  authorizationIntent(input: Pick<ToolCallInput, "name" | "agentId" | "arguments" | "requestedMode">): AuthorizationIntentResult | null {
    const definition = this.init.registry.visible(input.agentId).get(input.name);
    if (!definition || !this.authorizes(definition.actionClass)) return null;
    return authorizationIntentFor({ workspace: this.init.workspace, name: definition.name, actionClass: definition.actionClass,
      effectiveMode: input.requestedMode, arguments: input.arguments });
  }

  private authorizes(actionClass: string): boolean {
    return (this.init.authorizeClasses ?? DEFAULT_AUTHORIZE_CLASSES).has(actionClass);
  }

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
    const draft: ToolExecution = {
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

    const authorization = await this.enter(draft, input.authority);
    const bound = authorization.bound;
    const execution: ToolExecution = bound?.ok
      ? { ...draft, authorization: { authorizationId: bound.record.authorizationId, digest: bound.digest, record: bound.record } }
      : draft;
    selectedDefinitions.set(execution, definition);
    let outcome: ToolOutcome;
    try {
      outcome = await this.runStages(execution, definition.body, authorization);
    } finally {
      selectedDefinitions.delete(execution);
    }
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

  /**
   * Decide the call's authority as it enters. A sub-call under a bound gate is asked here, before the record binds,
   * so the human wait is never inside the record's lifetime. Binding failures are held until after the guards, so a
   * guard's denial is still the one reported for a call the guards refuse.
   */
  private async enter(draft: ToolExecution, supplied: ToolAuthority | undefined): Promise<CallAuthorization> {
    const authorizes = this.authorizes(draft.actionClass);
    const gate = [...this.gates].reverse().find((candidate) => candidate.gates(draft.name));
    let authority = supplied;
    if (gate !== undefined && draft.parentToken !== null) {
      const intent = authorizes ? authorizationIntentFor(draft) : null;
      // An intent that cannot bind is not put to a human; the authorization stage denies it after the guards.
      const granted = intent?.ok === false ? undefined : await gate.ask(draft, intent).catch((): null => null);
      if (granted === null) {
        return { refused: { stage: "approval", reason: "approval not granted for this sub-call", guardLabel: null },
          context: null, bound: null, required: false };
      }
      authority = granted;
    }
    if (!authorizes) return { refused: null, context: null, bound: null, required: false };
    const context: AuthorizationContext = { ...(this.init.authorizationContext?.() ?? {}), ...(authority ? { authority } : {}) };
    const required = gate !== undefined || (this.init.boundApprovalRequiredFor?.has(draft.actionClass) ?? false);
    return { refused: null, context, bound: bindAuthorization(draft, context), required };
  }

  /** The authorization stage: a reason to deny, or null. Synchronous, so nothing runs between it and the body. */
  private authorizationDenial(execution: ToolExecution, authorization: CallAuthorization): string | null {
    const { bound, context } = authorization;
    if (bound === null || context === null) return null;
    if (!bound.ok) return `${bound.failures.join(", ")}: ${bound.reason}`;
    if (authorization.required && bound.record.authority.approvals.length === 0) {
      return "approval_missing: this composition requires a signed approval named through the authority channel";
    }
    const recheck = recheckAuthorization(bound.record, execution, context);
    return recheck.ok ? null : recheck.failures.join(", ");
  }

  private async runStages(execution: ToolExecution, body: ToolBody, authorization: CallAuthorization): Promise<ToolOutcome> {
    if (authorization.refused !== null) return denialOutcome(authorization.refused);
    const approval = await this.askApproval(execution);
    if (approval !== null) return approval;

    const denied = this.init.registry.guardReason(execution);
    if (denied) {
      return denialOutcome({ stage: "guard", reason: denied.reason, guardLabel: denied.label });
    }

    const unauthorized = this.authorizationDenial(execution, authorization);
    if (unauthorized !== null) return denialOutcome({ stage: "authorization", reason: unauthorized, guardLabel: null });

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
