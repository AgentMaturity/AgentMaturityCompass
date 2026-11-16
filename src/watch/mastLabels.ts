/**
 * MAST failure-mode labels for trace failure index entries.
 *
 * The taxonomy is from "Why Do Multi-Agent LLM Systems Fail?" (Cemri et al., arXiv 2503.13657v3, 2025-10-26,
 * https://arxiv.org/abs/2503.13657v3; list read from https://arxiv.org/html/2503.13657v3 on 2026-11-17): 14 modes in
 * three categories. A label here is one an AMC rule assigned from the recorded steps, shown with the rule's name. It is
 * not a finding, and AMC does not check the modes no rule covers.
 */
import type { AMCTraceV1 } from "../correlation/traceSchema.js";
import type { ProductionTrace } from "../agents/traceIngestion.js";

const MAST_FAILURE_MODES = {
  "FM-1.1": { category: "System design issues", name: "Disobey task specification" },
  "FM-1.2": { category: "System design issues", name: "Disobey role specification" },
  "FM-1.3": { category: "System design issues", name: "Step repetition" },
  "FM-1.4": { category: "System design issues", name: "Loss of conversation history" },
  "FM-1.5": { category: "System design issues", name: "Unaware of termination conditions" },
  "FM-2.1": { category: "Inter-agent misalignment", name: "Conversation reset" },
  "FM-2.2": { category: "Inter-agent misalignment", name: "Fail to ask for clarification" },
  "FM-2.3": { category: "Inter-agent misalignment", name: "Task derailment" },
  "FM-2.4": { category: "Inter-agent misalignment", name: "Information withholding" },
  "FM-2.5": { category: "Inter-agent misalignment", name: "Ignored other agent's input" },
  "FM-2.6": { category: "Inter-agent misalignment", name: "Reasoning-action mismatch" },
  "FM-3.1": { category: "Task verification", name: "Premature termination" },
  "FM-3.2": { category: "Task verification", name: "No or incomplete verification" },
  "FM-3.3": { category: "Task verification", name: "Incorrect verification" }
} as const;

type MastMode = keyof typeof MAST_FAILURE_MODES;

export interface MastLabel {
  mode: MastMode;
  name: string;
  category: string;
  /** The AMC rule that assigned the label. */
  rule: string;
  /** What the rule saw, in AMC's words. */
  basis: string;
  meaning: "label assigned by an AMC rule; not a finding";
}

/** Same tool, same arguments, this many times in a row. */
const REPEAT_THRESHOLD = 3;

function label(mode: MastMode, rule: string, basis: string): MastLabel {
  return { mode, ...MAST_FAILURE_MODES[mode], rule, basis, meaning: "label assigned by an AMC rule; not a finding" };
}

/** The label, if any, an AMC rule assigns to one recorded step. Only traces that carry the step metadata are labelled. */
export function mastLabelFor(trace: AMCTraceV1 | ProductionTrace): MastLabel | null {
  const metadata = "metadata" in trace && trace.metadata && typeof trace.metadata === "object" ? trace.metadata as Record<string, unknown> : null;
  if (!metadata) return null;
  const repeats = typeof metadata.repeatCount === "number" ? metadata.repeatCount : 0;
  if (repeats >= REPEAT_THRESHOLD) {
    return label("FM-1.3", "amc.mast.same-call-repeated",
      `The same tool was called with the same arguments ${repeats} times in a row.`);
  }
  if (metadata.endedOnError === true) {
    return label("FM-3.1", "amc.mast.ended-on-error",
      "The recorded session ends on this failed step, with no reply from the agent after it.");
  }
  return null;
}

/** The recorded step number of a trace, or null when the source has none. */
export function failingStepOf(trace: AMCTraceV1 | ProductionTrace): { step: number; sourceStep: number | null } | null {
  const metadata = "metadata" in trace && trace.metadata && typeof trace.metadata === "object" ? trace.metadata as Record<string, unknown> : null;
  if (!metadata || typeof metadata.step !== "number") return null;
  return { step: metadata.step, sourceStep: typeof metadata.sourceStep === "number" ? metadata.sourceStep : null };
}
