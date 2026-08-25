/**
 * The one error type prompt assembly throws, and the closed set of reasons.
 *
 * WHY A TYPE AND NOT A MESSAGE. "Fails loud" is only half a contract if the only
 * machine-readable part is prose: a caller that wants to distinguish "the
 * deployment's persona references a variable nobody registered" from "two
 * plugins both claimed the complete prompt" would end up matching on English.
 * The `reason` is the checkable part; the message is for the human who has to
 * fix it, and it therefore always names the offending thing AND what was
 * available instead.
 *
 * WHY THE SET IS CLOSED. Every reason here is a REFUSAL. There is deliberately
 * no `warning` and no fallback value: a prompt that silently dropped an
 * unresolved reference would send the model a sentence with a hole in it, and
 * the signed log would faithfully record the holed sentence as if it were what
 * the deployment asked for. Refusing is the only outcome that keeps the log's
 * account of what the model saw true.
 */

/** Why an assembly or a render refused. */
export type PromptAssemblyErrorReason =
  /** `{{name}}` is well-formed but no such variable is registered. */
  | "unknown-variable"
  /** `{{name}}` is registered, but its provider returned no value for this assembly. */
  | "variable-without-value"
  /** The braces closed, but what is between them is not a legal variable name. */
  | "malformed-variable-name"
  /** `{{` opened and a `}}` follows, but the two do not form one simple group. */
  | "malformed-reference"
  /** More than one section claimed to be the complete prompt. */
  | "multiple-complete-sections"
  /** A section, context, or variable name was registered twice. */
  | "duplicate-registration"
  /** A section or context was registered with a non-finite order. */
  | "invalid-order"
  /** A variable was registered under a name references cannot spell. */
  | "invalid-variable-name";

/** A refusal from the prompt-assembly registry or its renderer. */
export class PromptAssemblyError extends Error {
  readonly reason: PromptAssemblyErrorReason;

  constructor(reason: PromptAssemblyErrorReason, message: string) {
    super(message);
    this.name = "PromptAssemblyError";
    this.reason = reason;
  }
}
