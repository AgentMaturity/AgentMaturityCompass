/**
 * The workspace-instructions context plugin — AMC reading what AMC writes.
 *
 * This is the plugin that closes the irony `src/guide/oneClickFix.ts` opened:
 * AMC has always been able to WRITE `AGENTS.md`, and until now nothing in the
 * product read it back as agent context. Precedence lives in
 * ./instructionPrecedence.ts (and is derived from the writer's, not invented);
 * reading and budgeting live in ./instructionFiles.ts. What is left here is the
 * rendering — which is where two decisions with real consequences sit.
 *
 * ONE: THE CONTENT IS QUOTED, NOT MERGED. Each file gets a heading naming the
 * path it came from, and its bytes follow verbatim. The alternative — folding
 * every file into one undifferentiated block — would leave the model unable to
 * say WHERE a rule came from, and an operator unable to act on "your AGENTS.md
 * says X" because nothing would attribute X to a file.
 *
 * TWO: OMISSIONS ARE STATED IN THE MODEL'S OWN CONTEXT. When a file exists and
 * AMC could not use it, the model is told, by path and by reason. That is the
 * opposite of the usual instinct (keep the prompt clean) and it is deliberate:
 * an agent that has been told "there are instructions here I could not read" can
 * ask; an agent that was told nothing proceeds confidently on incomplete rules,
 * and the signed log records a prompt indistinguishable from one built in a
 * workspace that never had those instructions at all.
 *
 * WHAT IS NOT STATED: a byte-identical duplicate collapsed into a stronger file.
 * That is a fact about the harness's deduplication, not guidance about the work,
 * and it is returned to the caller as a diagnostic instead.
 *
 * THE CONTRIBUTION IS LITERAL. It is registered — like every plugin's output —
 * as a literal context, so an `AGENTS.md` that documents a `{{placeholder}}`
 * reaches the model verbatim instead of being resolved against, or throwing on,
 * the prompt variable namespace. See PromptContext.literal.
 */
import {
  WORKSPACE_INSTRUCTIONS_CONTEXT,
  WORKSPACE_INSTRUCTIONS_ORDER,
  type ContextCollectInput,
  type ContextPlugin
} from "./contextTypes.js";
import {
  loadInstructionFiles,
  type InstructionLoad,
  type InstructionLoadOptions,
  type InstructionOmissionReason
} from "./instructionFiles.js";
import { INSTRUCTION_PRECEDENCE_STATEMENT } from "./instructionPrecedence.js";

/** How one omission reads in the model's context. */
const OMISSION_PHRASE: Readonly<Record<InstructionOmissionReason, string>> =
  Object.freeze({
    unreadable: "could not be read",
    oversize: "was too large to include",
    "over-budget": "was left out of this prompt"
  });

/**
 * Render one loaded set as the model-facing contribution.
 *
 * Returns `""` when the workspace has nothing to say — no files, nothing
 * omitted. An empty contribution is dropped by the assembly renderer, so a
 * workspace with no instruction files costs no tokens and produces no heading.
 *
 * @param load - what {@link loadInstructionFiles} found.
 * @returns the contribution text, or `""`.
 */
export function renderInstructionContext(load: InstructionLoad): string {
  if (load.included.length === 0 && load.omitted.length === 0) return "";
  const blocks: string[] = [];
  if (load.omitted.length > 0) {
    const lines = load.omitted.map(
      (omission) => `- ${omission.displayPath} ${OMISSION_PHRASE[omission.reason]} (${omission.detail}).`
    );
    blocks.push(
      [
        "Some workspace instruction files exist but are not included below. Treat " +
          "the instructions you have as incomplete, and ask before acting where " +
          "the missing file would plausibly have applied.",
        ...lines
      ].join("\n")
    );
  }
  if (load.included.length > 0) {
    blocks.push(INSTRUCTION_PRECEDENCE_STATEMENT);
    for (const file of load.included) {
      blocks.push(`Instructions from ${file.candidate.displayPath} (${file.candidate.scope} scope):\n\n${file.content.trim()}`);
    }
  }
  return blocks.join("\n\n");
}

export interface InstructionsContextOptions extends InstructionLoadOptions {
  /**
   * Called with each load's diagnostics.
   *
   * The hook exists because the duplicate collapse is real information that must
   * not reach the model: an operator debugging "why is my CLAUDE.md not in the
   * prompt" needs it, and the model does not.
   */
  readonly onLoad?: (load: InstructionLoad) => void;
}

/**
 * The workspace-instructions plugin.
 *
 * Constructed with the workspace it reads — the plugin closes over what it
 * needs, rather than being handed a root at collect time, because the thing that
 * registered it is the thing that knows which workspace this is.
 *
 * Re-reads on EVERY collect rather than caching. An instruction file that the
 * agent itself just edited is the interesting case, and a cache keyed on mtime
 * would trade a small read for a class of bug where the model is shown rules the
 * workspace no longer has.
 *
 * @param options - the workspace root, byte caps, and an optional diagnostics hook.
 * @returns a plugin registrable on a {@link import("./contextHost.js").ContextPluginHost}.
 */
export function createInstructionsContextPlugin(
  options: InstructionsContextOptions
): ContextPlugin {
  return {
    name: WORKSPACE_INSTRUCTIONS_CONTEXT,
    order: WORKSPACE_INSTRUCTIONS_ORDER,
    collect(input: ContextCollectInput): Promise<string> {
      const load = loadInstructionFiles({
        ...options,
        ...(input.signal === undefined ? {} : { signal: input.signal })
      });
      options.onLoad?.(load);
      return Promise.resolve(renderInstructionContext(load));
    }
  };
}
