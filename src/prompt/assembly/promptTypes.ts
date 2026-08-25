/**
 * The contracts one prompt contributor and one assembly call exchange (plan P3.3).
 *
 * WHY THIS IS A SUBDIRECTORY AND NOT MORE FILES IN src/prompt/. The modules
 * directly in src/prompt/ are the prompt-PACK surface: signed, versioned prompt
 * artifacts that an operator publishes and an auditor verifies — governance ABOUT
 * prompts. This directory is a different subject with the same noun: the
 * in-process registry that builds the ONE system prompt a native AMC turn
 * actually sends. Keeping them in separate directories is what stops a reader
 * from assuming `promptCompiler.ts` and this assembler are two halves of one
 * thing. A prompt pack can become a section here; that is the only relationship,
 * and it goes one way.
 *
 * THE ORDER BANDS. Sections are concatenated in ascending `order`, and the bands
 * are a convention with a reason behind each number:
 *
 *   -100  harness identity — who the model is running under. It is first because
 *         everything after it is deployment-authored, and identity that appears
 *         after the instructions it constrains is identity a later section can
 *         talk over.
 *      0  deployment persona — the operator's own voice. Order 0 is the origin so
 *         a composition can place its own material on either side without
 *         negotiating for a number.
 * 100-199 tool guidance — how to use what the model was given. It comes after the
 *         persona because it qualifies the job, and before nothing in particular.
 *
 * Other negative orders are legal and render before the persona; the bands name
 * the three slots that always exist, not the whole number line.
 *
 * WHAT IS DELIBERATELY ABSENT: TOOL SCHEMAS. dsh's assembly also carries the
 * model-visible tool list. AMC's does not, because P3.2 already made
 * `AgentToolSeam.schemas()` the single source of that set and the driver writes
 * it to a `request/tools` row the `request/header` cites. A second tool list
 * assembled here would be a second source of truth for what the model was
 * offered — and the whole point of the spine is that there is exactly one, and it
 * is signed.
 */

/**
 * Per-assembly caller context, handed to every text and variable provider.
 *
 * Merge-extensible by intent: later stages add fields, and a provider that does
 * not care about them keeps compiling. It is NOT a place to smuggle state that
 * belongs to a service — a provider that needs the workspace root closes over it
 * at registration, because the thing that registered it is the thing that knows.
 */
export interface AssembleContext {
  /** The session this assembly is for, when it is for one. */
  readonly sessionId?: string;
  /**
   * The control signal for the turn that asked for this assembly.
   *
   * Scoped to THIS request. A provider must not retain it to control later
   * turns: the next turn gets its own signal, and a retained one aborts work
   * nobody asked to stop.
   */
  readonly signal?: AbortSignal;
}

/** Static text, or text resolved from the assembly that asked for it. */
export type PromptTextProvider = (context: AssembleContext) => string;

/** A prompt variable's value for one assembly; `undefined` means "no value here". */
export type PromptVariableProvider = (context: AssembleContext) => string | undefined;

/** One contributed section of the system prompt (registry input). */
export interface PromptSection {
  /** Unique within the registry — a duplicate registration throws. */
  readonly name: string;
  /** Ascending concatenation order. See the module header for the bands. */
  readonly order: number;
  /**
   * Static text, or a provider evaluated at each assembly. The text may
   * reference `{{variable}}`s; they are interpolated later, at render.
   */
  readonly text: string | PromptTextProvider;
  /**
   * Treat this contribution as the COMPLETE system prompt: when it is active,
   * the assembled section list is exactly this one section and every other
   * registered section is dropped. Two active complete sections make assembly
   * fail rather than picking a winner — "which of your two total overrides did
   * the model actually get" is not a question a signed log should have to answer
   * by inference.
   */
  readonly complete?: boolean;
}

/**
 * Dynamic runtime context — the facts that change between turns.
 *
 * Separate from {@link PromptSection} because of where it goes: a section is the
 * system prompt (stable, cached by providers), while a context is materialized
 * as a durable snapshot in model history. Registering a clock as a section would
 * invalidate the prompt every second.
 */
export interface PromptContext {
  /** Unique within the registry — a duplicate registration throws. */
  readonly name: string;
  /** Ascending join order. */
  readonly order: number;
  /** Static text or a provider. Text that resolves empty contributes nothing. */
  readonly text: string | PromptTextProvider;
  /**
   * Treat the resolved text as DATA, not as a template: a `{{...}}` inside it
   * reaches the model verbatim and is never looked up in the variable namespace.
   *
   * THIS IS A SECURITY BOUNDARY, NOT A CONVENIENCE. A context plugin's text is
   * COMPUTED — from a file in the workspace, from a clock, from a tool's output —
   * and computed text is untrusted input to this process. Interpolating it would
   * hand anyone who can write a workspace file the ability to name a prompt
   * variable, which is exactly the namespace escape interpolate.ts already
   * refuses for substituted VALUES; the two rules are the same rule, applied at
   * both of the places runtime data enters the prompt.
   *
   * It would also be a denial of service in the other direction: an `AGENTS.md`
   * that documents a `{{placeholder}}` — an entirely ordinary thing for an
   * instruction file to contain — would otherwise throw `unknown-variable` and
   * block every request in the session.
   *
   * Deployment-authored context (a human wrote the string into a config) leaves
   * this unset and keeps the fail-loud `{{var}}` contract.
   */
  readonly literal?: boolean;
}

/** One registered section with its text resolved but NOT yet interpolated. */
export interface AssembledSection {
  readonly name: string;
  readonly text: string;
}

/**
 * One registered context with its text resolved but NOT yet interpolated.
 *
 * `literal` rides along rather than being dropped at assembly, because the
 * decision belongs to whoever registered the contribution and the renderer runs
 * later: a flag consumed at assembly time would leave the renderer guessing at
 * the one thing it must not guess at.
 */
export interface AssembledContext {
  readonly name: string;
  readonly text: string;
  /** See {@link PromptContext.literal}. Absent means "interpolate normally". */
  readonly literal?: boolean;
}

/**
 * The resolved inputs for one model step.
 *
 * Sections and contexts are still uninterpolated: rendering is a separate step so
 * a caller that wants to log or diff WHAT was assembled can do it before variable
 * substitution, and so a variable failure names the section it came from.
 *
 * `variables` is a plain object rather than a Map because it is the render
 * contract's input and a caller may build one by hand. That is exactly why
 * interpolation resolves names with `Object.hasOwn` and never with `in`: a plain
 * object inherits `constructor`, `toString` and the rest of `Object.prototype`,
 * and `in` would happily resolve `{{constructor}}` into the prompt.
 */
export interface PromptAssembly {
  readonly sections: readonly AssembledSection[];
  readonly contexts: readonly AssembledContext[];
  readonly variables: Readonly<Record<string, string | undefined>>;
}

/** How a `{{variable}}` name must be written between the braces. */
export const VARIABLE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

/** The harness-identity section's name — first thing the model reads. */
export const HARNESS_IDENTITY_SECTION = "harness:identity";

/** Prompt order of the harness-identity band. */
export const HARNESS_IDENTITY_ORDER = -100;

/**
 * The deployment persona's section name.
 *
 * Exported because a composition replaces this slot rather than adding beside
 * it, and both sides naming the same section is what makes that a replacement
 * instead of two personas.
 */
export const PERSONA_SECTION = "deployment:persona";

/** Prompt order of the persona slot. */
export const PERSONA_ORDER = 0;

/** First order in the tool-guidance band. */
export const TOOL_GUIDANCE_ORDER = 100;

/** Last order in the tool-guidance band. */
export const TOOL_GUIDANCE_ORDER_END = 199;
