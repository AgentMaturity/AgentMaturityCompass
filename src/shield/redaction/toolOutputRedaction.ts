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
 * ORDER WITH P2-02, continued: a result that parses as JSON is kept JSON, by redacting inside its string values when the
 * flat pass would otherwise consume a member name's quotes and colon (`{"api_key":"…"}`).
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

const countsOf = (found: readonly { readonly type: string }[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const finding of found) counts[finding.type] = (counts[finding.type] ?? 0) + 1;
  return counts;
};

const parseJson = (text: string): unknown => { try { return JSON.parse(text); } catch { return undefined; } };

/**
 * Redaction inside a JSON value's strings. A member is probed as `name=value`, because the key-named patterns
 * (`api_key`, `aws_secret_access_key`) match the name and the value together; a match that consumed the name replaces
 * the whole value with one placeholder, one inside the value is kept in place. Names, numbers and booleans are untouched.
 */
function redactJsonValues(value: unknown, name: string | null, counts: Record<string, number>): unknown {
  if (typeof value === "string") {
    const prefix = name === null ? "" : `${name}=`;
    const probe = redactSecrets(`${prefix}${value}`, placeholderFor);
    if (probe.findings.length === 0) return value;
    for (const finding of probe.findings) counts[finding.type] = (counts[finding.type] ?? 0) + 1;
    return probe.redacted.startsWith(prefix) ? probe.redacted.slice(prefix.length) : placeholderFor(probe.findings[0]!.type);
  }
  if (Array.isArray(value)) return value.map(item => redactJsonValues(item, name, counts));
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactJsonValues(item, key, counts)]));
  return value;
}

/** The pipeline output filter. Pure over the text; what it found is readable through {@link redactionCountsFor}. */
export function secretRedactionFilter(output: string, execution: ToolExecution): string {
  if (output.length === 0) return output;
  const result = redactSecrets(output, placeholderFor);
  if (result.findings.length === 0) return output;
  let redacted = result.redacted;
  let counts = countsOf(result.findings);
  const parsed = parseJson(output);
  if (parsed !== undefined && parseJson(redacted) === undefined) {
    // The flat pass ate a member name's quotes and colon, so a JSON result stopped parsing and P2-02 would withhold it
    // whole. Redact per string value instead; if that finds nothing the flat text stands (the secret must not survive).
    const structured: Record<string, number> = {};
    const value = JSON.stringify(redactJsonValues(parsed, null, structured));
    if (Object.keys(structured).length > 0) { redacted = value; counts = structured; }
  }
  findings.set(execution, counts);
  return redacted;
}

/** Counts by secret type the filter replaced in this execution's output, or null when it replaced nothing. */
export function redactionCountsFor(execution: object): Readonly<Record<string, number>> | null {
  return findings.get(execution) ?? null;
}

/** Whether text carries a placeholder this filter wrote: content that must not be written back over a real value. */
export function containsRedactionPlaceholder(text: string): boolean {
  return text.includes(REDACTION_PLACEHOLDER_PREFIX);
}
