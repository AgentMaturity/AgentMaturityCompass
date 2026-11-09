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
 * ORDER WITH P2-02, continued: a result that parses as JSON is kept JSON, by redacting inside its member names and string
 * values when the flat pass would otherwise consume a member name's quotes and colon (`{"api_key":"…"}`). That
 * structured result stands only when it found at least as many secrets of every type as the flat pass (S22); otherwise
 * the flat text stands, and P2-02 withholds a declared result that no longer parses rather than see a secret.
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

const tally = (found: readonly { readonly type: string }[], counts: Record<string, number>): void => {
  for (const finding of found) counts[finding.type] = (counts[finding.type] ?? 0) + 1;
};

const countsOf = (found: readonly { readonly type: string }[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  tally(found, counts);
  return counts;
};

const parseJson = (text: string): unknown => { try { return JSON.parse(text); } catch { return undefined; } };

/**
 * Redaction inside a JSON value. A string member is probed as `name=value`, because the key-named patterns (`api_key`,
 * `aws_secret_access_key`) match the name and the value together; a match that consumed the name replaces the whole
 * value with one placeholder, one inside the value is kept in place. A member NAME is probed on its own, since a secret
 * can be a key (`{"AKIA…": …}`); two names that redact alike stay two members. Numbers and booleans are untouched.
 */
function redactJsonValues(value: unknown, name: string | null, counts: Record<string, number>): unknown {
  if (typeof value === "string") {
    const prefix = name === null ? "" : `${name}=`;
    const probe = redactSecrets(`${prefix}${value}`, placeholderFor);
    if (probe.findings.length === 0) return value;
    tally(probe.findings, counts);
    return probe.redacted.startsWith(prefix) ? probe.redacted.slice(prefix.length) : placeholderFor(probe.findings[0]!.type);
  }
  if (Array.isArray(value)) return value.map(item => redactJsonValues(item, name, counts));
  if (value === null || typeof value !== "object") return value;
  const members: Record<string, unknown> = Object.create(null); // a `__proto__` member stays a member
  for (const [key, item] of Object.entries(value)) {
    const probe = redactSecrets(key, placeholderFor);
    tally(probe.findings, counts);
    let member = probe.redacted;
    for (let n = 2; Object.hasOwn(members, member); n++) member = `${probe.redacted}#${n}`;
    // The value is probed under the redacted name, so a secret name is not found (and counted) a second time.
    members[member] = redactJsonValues(item, probe.redacted, counts);
  }
  return members;
}

/** Whether `found` has at least as many findings as `floor` for every type the flat pass reported. */
const coversEveryType = (found: Readonly<Record<string, number>>, floor: Readonly<Record<string, number>>): boolean =>
  Object.entries(floor).every(([type, count]) => (found[type] ?? 0) >= count);

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
    // whole. Redact per member instead, and keep that only if it missed nothing the flat pass caught (S22): a secret
    // the structured view cannot see (a numeric value under a key-named member) keeps the flat text.
    const structured: Record<string, number> = {};
    let value: string | null = null;
    // JSON nested deeper than the stack can walk keeps the flat text (still redacted) rather than failing the call.
    try { value = JSON.stringify(redactJsonValues(parsed, null, structured)); } catch (error) { if (!(error instanceof RangeError)) throw error; }
    if (value !== null && coversEveryType(structured, counts)) { redacted = value; counts = structured; }
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
