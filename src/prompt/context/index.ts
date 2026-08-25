/**
 * Context plugins — the dynamic half of what the model reads (plan P3.3, stage 2).
 *
 * The system prompt is identity and it is stable. This is everything that is
 * true only right now: the clock, and what the workspace's own instruction files
 * currently say. It is materialized as a durable, superseded USER-ROLE snapshot
 * rather than folded into the system prompt, so context can be replaced without
 * rewriting identity — dsh's separation, kept for dsh's reason.
 *
 * The pieces, in the order a reader meets them:
 *
 *   contextTypes.ts          what a plugin is, and the join-order bands.
 *   contextHost.ts           the registry, and the one place plugin I/O happens.
 *   instructionPrecedence.ts which instruction files, and which one wins.
 *   instructionFiles.ts      reading them, under a stated byte budget.
 *   instructionsContext.ts   the plugin that renders them.
 *   timeContext.ts           the reference plugin.
 *   contextPreStep.ts        the loop seam — and the only route to a model.
 */
export { ContextPluginHost } from "./contextHost.js";
export { createContextPreStep, type ContextPreStepInit, type ContextPreStepSeam } from "./contextPreStep.js";
export {
  TIME_CONTEXT,
  TIME_CONTEXT_ORDER,
  WORKSPACE_INSTRUCTIONS_CONTEXT,
  WORKSPACE_INSTRUCTIONS_ORDER,
  type ContextCollectInput,
  type ContextPlugin
} from "./contextTypes.js";
export {
  DEFAULT_MAX_INSTRUCTION_FILE_BYTES,
  DEFAULT_MAX_INSTRUCTION_TOTAL_BYTES,
  loadInstructionFiles,
  type InstructionDuplicate,
  type InstructionLoad,
  type InstructionLoadOptions,
  type InstructionOmission,
  type InstructionOmissionReason,
  type LoadedInstruction
} from "./instructionFiles.js";
export {
  INSTRUCTION_FILE_NAMES,
  INSTRUCTION_PRECEDENCE_STATEMENT,
  INSTRUCTION_SCOPES,
  instructionCandidates,
  STRONGEST_INSTRUCTION_FILE,
  type InstructionCandidate,
  type InstructionCandidateOptions,
  type InstructionScope
} from "./instructionPrecedence.js";
export {
  createInstructionsContextPlugin,
  renderInstructionContext,
  type InstructionsContextOptions
} from "./instructionsContext.js";
export { createTimeContextPlugin, formatElapsed, type TimeContextOptions } from "./timeContext.js";
