/**
 * Secret redaction of tool output on the native pipeline (SH-SANDBOX-06).
 *
 * `redactSecrets` already runs over web fetches, fs.edit diffs and bridge rows; shell output, file reads, grep hits,
 * job and terminal reads and MCP results reached the model, the signed `tool/result` row and evidence unredacted.
 * The pipeline has had an output `filters` stage for exactly this and nothing composed one. This is that filter, a
 * pure function over the output: every secret the shared `SECRET_PATTERNS` recognise becomes `[AMC_REDACTED:<type>]`
 * before the outcome exists, so no row, spill, receipt or model-visible part ever holds it.
 *
 * COUNTS, NOT TEXT. What was found is kept per execution (a WeakMap keyed by the frozen execution, so a filter stays
 * pure and the composition's record callback writes the audit row, where a recorder failure already latches). The row
 * carries counts by type only.
 *
 * ORDER WITH P2-02. The protected-data tokenisation (`redactingSession`) runs when the session commits the row, after
 * this filter; it sees placeholders where credentials were and its own detectors then find nothing there. Declared
 * protected fields of a JSON result are still tokenised by it, because a placeholder inside a string value keeps the
 * result exact JSON.
 *
 * LIMITS. A secret that only appears split across two reads (`job_output` and `terminal_read` return byte ranges of a
 * stream) is not recognised in either; the raw job and terminal buffers themselves are not redacted. A tool that
 * writes back what it read would write the placeholder over the real value, so `fs.write` and `fs.edit` refuse content
 * that contains one.
 */
import type { ToolExecution } from "../../tools/toolTypes.js";
import { redactSecrets } from "./redactSecrets.js";

export const REDACTION_PLACEHOLDER_PREFIX = "[AMC_REDACTED:";
const placeholderFor = (type: string): string => `${REDACTION_PLACEHOLDER_PREFIX}${type}]`;

const findings = new WeakMap<object, Record<string, number>>();

/** The pipeline output filter. Pure over the text; what it found is readable through {@link redactionCountsFor}. */
export function secretRedactionFilter(output: string, execution: ToolExecution): string {
  if (output.length === 0) return output;
  const result = redactSecrets(output, placeholderFor);
  if (result.findings.length === 0) return output;
  const counts: Record<string, number> = {};
  for (const finding of result.findings) counts[finding.type] = (counts[finding.type] ?? 0) + 1;
  findings.set(execution, counts);
  return result.redacted;
}

/** Counts by secret type the filter replaced in this execution's output, or null when it replaced nothing. */
export function redactionCountsFor(execution: object): Readonly<Record<string, number>> | null {
  return findings.get(execution) ?? null;
}

/** Whether text carries a placeholder this filter wrote: content that must not be written back over a real value. */
export function containsRedactionPlaceholder(text: string): boolean {
  return text.includes(REDACTION_PLACEHOLDER_PREFIX);
}
