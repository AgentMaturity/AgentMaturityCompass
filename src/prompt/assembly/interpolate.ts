/**
 * Strict `{{variable}}` interpolation — the fail-loud half of P3.3 VERIFY-2.
 *
 * FOUR THROW PATHS AND NO FIFTH OUTCOME. Every `{{` in a section resolves to
 * exactly one of five things, four of which are refusals:
 *
 *   1. a registered variable with a value          → substituted
 *   2. a well-formed name nobody registered        → THROW unknown-variable
 *   3. a registered name whose provider gave none  → THROW variable-without-value
 *   4. closed braces around an illegal name        → THROW malformed-variable-name
 *   5. an opened group that never closes properly  → THROW malformed-reference
 *
 * There is no "leave it as-is" and no empty-string default, because both of
 * those ship a prompt the deployment did not write while the log records it as
 * one the deployment did.
 *
 * THE ONE NON-THROWING NEAR-MISS. A `{{` with NO `}}` anywhere after it is
 * literal prose — a model told to emit `{{` in its output would otherwise make
 * the very instruction that says so unassemblable. The discriminator is whether
 * a closing pair exists later at all: braces that open and then close wrongly
 * are a typo in a reference; braces that never close are text.
 *
 * SUBSTITUTED VALUES ARE NEVER RE-SCANNED. Scanning walks the ORIGINAL text and
 * appends to a separate result, so a value containing `{{other}}` lands in the
 * prompt as those literal characters. This is a security property, not a
 * convenience: variable values carry runtime data — a file path, a git branch, a
 * user's own words — and re-scanning would let anything that reaches a variable
 * value reach the variable NAMESPACE, which is prompt injection with the
 * harness's own hands.
 *
 * LITERAL CONTEXTS ARE NOT SCANNED AT ALL. A context registered with
 * `literal: true` is text a plugin COMPUTED — from a workspace file, a clock, a
 * tool result — and it bypasses this scanner entirely. That is the same rule as
 * the previous paragraph seen from the other side: runtime data must never reach
 * the variable namespace, whether it arrives as a substituted value or as a
 * whole contribution. See PromptContext.literal.
 *
 * NAMES ARE RESOLVED WITH Object.hasOwn, NEVER `in`. `variables` is a plain
 * object, so `in` finds every key of `Object.prototype`: `{{constructor}}`,
 * `{{tostring}}`... `{{constructor}}` in particular would not merely resolve, it
 * would resolve to a real function and stringify into the prompt.
 */
import { PromptAssemblyError } from "./promptErrors.js";
import {
  VARIABLE_NAME_PATTERN,
  type AssembledContext,
  type AssembledSection,
  type PromptAssembly
} from "./promptTypes.js";

/** A complete `{{...}}` reference group at the scan position, validated after. */
const GROUP_AT = /^\{\{([^{}]*)\}\}/;

/** How many characters of context a malformed-reference message quotes. */
const MALFORMED_EXCERPT_LENGTH = 16;

/** Which kind of contribution a diagnostic is about. */
export type PromptTextKind = "section" | "context";

/** The minimum a diagnostic needs to attribute a failure to its owner. */
export interface InterpolationInput {
  readonly name: string;
  readonly text: string;
}

/** The preamble that tells the model this snapshot replaces the last one. */
const CONTEXT_SNAPSHOT_PREAMBLE =
  "Current runtime context. This snapshot supersedes earlier runtime-context snapshots.";

/** Render the registered variable names for a diagnostic, in a stable order. */
function describeRegistered(variables: Readonly<Record<string, string | undefined>>): string {
  const names = Object.keys(variables).sort();
  return names.length > 0 ? names.join(", ") : "(none)";
}

/**
 * Interpolate one section or context, attributing every failure to its owner.
 *
 * @param input - the contribution being rendered, named for diagnostics.
 * @param variables - this assembly's variable values.
 * @param kind - whether `input` is a section or a runtime context.
 * @returns the interpolated text.
 * @throws PromptAssemblyError on any of the four refusal paths.
 */
export function interpolatePromptText(
  input: InterpolationInput,
  variables: Readonly<Record<string, string | undefined>>,
  kind: PromptTextKind
): string {
  const text = input.text;
  let result = "";
  let last = 0;
  for (let open = text.indexOf("{{"); open >= 0; open = text.indexOf("{{", last)) {
    const group = GROUP_AT.exec(text.slice(open));
    if (group === null) {
      // A later closing pair makes this a broken reference; with none, it is prose.
      if (text.indexOf("}}", open + 2) >= 0) {
        const excerpt = text.slice(open, open + MALFORMED_EXCERPT_LENGTH);
        throw new PromptAssemblyError(
          "malformed-reference",
          `malformed prompt variable reference at "${excerpt}…" in ${kind} "${input.name}" ` +
            `(a reference is one complete {{name}} group)`
        );
      }
      result += text.slice(last, open + 2);
      last = open + 2;
      continue;
    }
    const reference = group[0];
    // `{{}}` yields an empty name and takes the malformed-name path below.
    const name = reference.slice(2, -2);
    if (!VARIABLE_NAME_PATTERN.test(name)) {
      throw new PromptAssemblyError(
        "malformed-variable-name",
        `malformed prompt variable reference "{{${name}}}" in ${kind} "${input.name}" ` +
          `(variable names match ${String(VARIABLE_NAME_PATTERN)})`
      );
    }
    // Object.hasOwn, never `in`: `in` resolves inherited Object.prototype keys.
    if (!Object.hasOwn(variables, name)) {
      throw new PromptAssemblyError(
        "unknown-variable",
        `unknown prompt variable "{{${name}}}" in ${kind} "${input.name}"; ` +
          `registered variables: ${describeRegistered(variables)}`
      );
    }
    const value = variables[name];
    if (value === undefined) {
      throw new PromptAssemblyError(
        "variable-without-value",
        `prompt variable "{{${name}}}" has no value for this assembly ` +
          `(${kind} "${input.name}")`
      );
    }
    // Append the value to the RESULT and resume scanning the ORIGINAL text past
    // the reference, so the value itself is never scanned.
    result += text.slice(last, open) + value;
    last = open + reference.length;
  }
  return result + text.slice(last);
}

/**
 * Render the system prompt: interpolate every section, drop the empty ones, join
 * with blank lines.
 *
 * Empty sections are dropped rather than joined, so an unconfigured persona slot
 * costs nothing instead of opening the prompt with two blank lines.
 *
 * @param assembly - the assembly to render.
 * @returns the rendered prompt, or `""` when every section resolved empty.
 */
export function renderPrompt(assembly: PromptAssembly): string {
  return assembly.sections
    .map((section: AssembledSection) => interpolatePromptText(section, assembly.variables, "section"))
    .filter((text) => text.length > 0)
    .join("\n\n");
}

/**
 * The runtime-context snapshot as the named contributions it came from.
 *
 * A consumer that presents the snapshot uses these to attribute each part to the
 * subsystem that contributed it, instead of re-splitting joined prose.
 *
 * @param assembly - the assembly to render.
 * @returns one entry per context that rendered to non-empty text.
 */
export function renderContextSections(assembly: PromptAssembly): AssembledContext[] {
  return assembly.contexts
    .map((context: AssembledContext) => ({
      ...context,
      // A literal context is DATA that a plugin computed, not a template a human
      // wrote. Scanning it would let a `{{name}}` that arrived in a workspace
      // file resolve against the variable namespace — the same escape this
      // module refuses for substituted values — and would make an instruction
      // file that merely DOCUMENTS a placeholder throw on every request.
      text: context.literal === true
        ? context.text
        : interpolatePromptText(context, assembly.variables, "context")
    }))
    .filter((section) => section.text.length > 0);
}

/**
 * Join already-rendered context sections into the model-facing snapshot.
 *
 * Separate from {@link renderContextSnapshot} so a caller that also needs the
 * per-section attribution renders once and joins here, rather than interpolating
 * every context twice per request.
 *
 * @param sections - sections from {@link renderContextSections}.
 * @returns the snapshot text, or `""` when no context is active.
 */
export function joinContextSections(sections: readonly AssembledContext[]): string {
  const body = sections.map((section) => section.text).join("\n\n");
  if (body.length === 0) return "";
  return `${CONTEXT_SNAPSHOT_PREAMBLE}\n\n${body}`;
}

/**
 * Render the complete runtime-context snapshot.
 *
 * @param assembly - the assembly to render.
 * @returns the snapshot text, or `""` when no context is active.
 */
export function renderContextSnapshot(assembly: PromptAssembly): string {
  return joinContextSections(renderContextSections(assembly));
}
