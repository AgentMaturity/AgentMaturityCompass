/**
 * The instruction for an automatic compaction summary step. Versioned, and the
 * version is written into each summary receipt, so a reader knows exactly which
 * instructions produced the text that replaced signed history.
 */
import { extractEnvelope } from "../../session/sessionTypes.js";
import type { EvidenceEvent } from "../../types.js";

export const SUMMARY_PROMPT_VERSION = 1;
/** The signed `step/start` kind of an automatic compaction summary step. */
export const COMPACTION_SUMMARY_STEP = "compaction-summary";

/**
 * Which rows were written inside a compaction summary step. Its prompt and its
 * self-reported summary are a context aid, never the user's input or the agent's
 * answer, so answer, child-output and replay readers skip them.
 */
export function compactionSummaryRows(events: readonly EvidenceEvent[]): (event: EvidenceEvent) => boolean {
  const stepOf = (event: EvidenceEvent): string => { const envelope = extractEnvelope(event.meta_json); return `${envelope?.turn}.${envelope?.step}`; };
  const steps = new Set(events.filter(event => event.event_type === "step/start"
    && (JSON.parse(event.meta_json) as { kind?: unknown }).kind === COMPACTION_SUMMARY_STEP).map(stepOf));
  return steps.size === 0 ? () => false : event => steps.has(stepOf(event));
}

export function summaryPrompt(completedTurns: number): string {
  return [
    `[AMC automatic compaction, summary prompt v${SUMMARY_PROMPT_VERSION}]`,
    `Summarize the earlier part of this conversation: the first ${completedTurns} completed request(s) and all the work done for them, `
      + "up to the request that is still in progress. Your summary will replace those messages in your context; "
      + "the original signed messages stay in AMC's evidence log.",
    "Keep facts, decisions, file paths, open tasks and errors. Invent nothing. Say what you omitted. Do not call tools.",
    "Reply with the summary only."
  ].join("\n");
}
