/**
 * The context-plugin contract (plan P3.3, stage 2).
 *
 * WHAT A CONTEXT PLUGIN IS, AND WHY IT IS NOT A PROMPT SECTION. A section is
 * identity: who the model is, what the deployment wants, how the tools work. It
 * is written once by a human and it is stable enough for a provider to cache.
 * A CONTEXT is the opposite — the facts that change between steps: what time it
 * is, what the workspace's instruction files currently say. dsh keeps the two
 * apart by materializing context as a durable USER-ROLE snapshot carrying a
 * supersession preamble, separate from the system prompt, and AMC keeps that
 * separation for the reason dsh had it: context can then be REPLACED without
 * rewriting identity, and a stale snapshot in history is explicitly superseded
 * rather than silently contradicted.
 *
 * A PLUGIN CLOSES OVER WHAT IT NEEDS. {@link ContextCollectInput} carries only
 * what the LOOP knows and the plugin cannot: which session, which turn and step,
 * and the signal for this boundary. It deliberately does not carry a workspace
 * root, a filesystem, or a config — a plugin that reads instruction files is
 * constructed with the directory it reads, because the thing that registered it
 * is the thing that knows. (Same rule, same reason, as AssembleContext in
 * ../assembly/promptTypes.ts.)
 *
 * COLLECT IS ASYNC AND THE ORDER IS DECLARED. `collect` returns a promise
 * because the interesting plugins do I/O, and every plugin carries an explicit
 * `order` for the same reason a prompt section does: registration order is a
 * plugin-load artifact and must never decide what the model reads.
 *
 * A PLUGIN'S TEXT IS DATA. Everything a plugin returns is registered as a
 * LITERAL context — see PromptContext.literal. A plugin computes its text from
 * runtime inputs this process does not control, so that text must never be
 * scanned for `{{variable}}` references.
 */

/** What the loop tells a plugin about the boundary it is contributing to. */
export interface ContextCollectInput {
  /** The session this step belongs to, when the caller has one. */
  readonly sessionId?: string;
  /** 1-based turn number of the step being prepared. */
  readonly turn: number;
  /** 1-based step number within that turn. */
  readonly step: number;
  /**
   * The control signal for THIS boundary.
   *
   * Scoped to this step: a plugin must not retain it, because the next step gets
   * its own and a retained signal aborts work nobody asked to stop.
   */
  readonly signal?: AbortSignal;
}

/**
 * One contributor of dynamic runtime context.
 *
 * `collect` returns the plugin's whole contribution for this boundary. An empty
 * string means "nothing to say right now" — which is a normal outcome, not a
 * failure, and contributes no text and no heading.
 *
 * A `collect` that REJECTS is a loud failure by design: see ./contextHost.ts for
 * why a context plugin that breaks must stop the step rather than quietly send
 * the model a prompt with its guardrails missing.
 */
export interface ContextPlugin {
  /**
   * Unique within one host, and used verbatim as the registered context name, so
   * an auditor reading an assembled snapshot can attribute every part of it.
   */
  readonly name: string;
  /** Ascending join order within the snapshot. See the band constants below. */
  readonly order: number;
  collect(input: ContextCollectInput): Promise<string>;
}

/**
 * THE ORDER BANDS, broadest and most stable first.
 *
 * The snapshot is read top to bottom, so what changes least goes first and the
 * volatile reading goes last. That is not decoration: it puts the workspace's
 * standing instructions ahead of a clock reading, which is the order a human
 * would state them in.
 */

/** The workspace's own instruction files (AGENTS.md, CLAUDE.md). */
export const WORKSPACE_INSTRUCTIONS_CONTEXT = "context:workspace-instructions";

/** Join order of the workspace-instructions contribution. */
export const WORKSPACE_INSTRUCTIONS_ORDER = 100;

/** The wall clock sampled while the step was prepared. */
export const TIME_CONTEXT = "context:time";

/** Join order of the time contribution — last, because it changes fastest. */
export const TIME_CONTEXT_ORDER = 900;
