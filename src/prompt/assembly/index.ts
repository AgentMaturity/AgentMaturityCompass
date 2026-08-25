/**
 * System-prompt assembly — public surface (plan P3.3, stage 1).
 *
 * `PromptAssemblyRegistry` is the registry: contributors register ordered
 * sections, runtime contexts, and variables; `assemble()` resolves them into one
 * `PromptAssembly` in a machine-independent order. `renderPrompt` and
 * `renderContextSnapshot` are the second half — interpolation is separate from
 * assembly so a caller can log or diff WHAT was assembled before any variable is
 * substituted, and so a variable failure can name the section it came from.
 *
 * The renderers are strict by design: an unresolvable `{{variable}}` throws a
 * `PromptAssemblyError` rather than producing a prompt with a hole in it. See
 * interpolate.ts for why refusing is the only outcome that keeps the signed
 * log's account of what the model saw true.
 */
export {
  interpolatePromptText,
  joinContextSections,
  renderContextSections,
  renderContextSnapshot,
  renderPrompt,
  type InterpolationInput,
  type PromptTextKind
} from "./interpolate.js";
export {
  PromptAssemblyError,
  type PromptAssemblyErrorReason
} from "./promptErrors.js";
export {
  DEFAULT_HARNESS_IDENTITY,
  PromptAssemblyRegistry,
  type PromptRegistryOptions
} from "./promptRegistry.js";
export {
  HARNESS_IDENTITY_ORDER,
  HARNESS_IDENTITY_SECTION,
  PERSONA_ORDER,
  PERSONA_SECTION,
  TOOL_GUIDANCE_ORDER,
  TOOL_GUIDANCE_ORDER_END,
  VARIABLE_NAME_PATTERN,
  type AssembleContext,
  type AssembledContext,
  type AssembledSection,
  type PromptAssembly,
  type PromptContext,
  type PromptSection,
  type PromptTextProvider,
  type PromptVariableProvider
} from "./promptTypes.js";
