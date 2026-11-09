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
 * structured result stands only after rescanning its serialized text and decoded members, including numeric and
 * boolean values. If neither form can be verified, the entire result is withheld.
 *
 * LIMITS. A secret that only appears split across two reads (`job_output` and `terminal_read` return byte ranges of a
 * stream) is not recognised in either; the raw job and terminal buffers themselves are not redacted. A tool that
 * writes back what it read would write the placeholder over the real value, so `fs.write` and `fs.edit` refuse content
 * that contains one.
 */
import type { ToolExecution } from "../../tools/toolTypes.js";
import { assertNoDuplicateJsonKeys } from "../../utils/json.js";
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
const hasUniqueJsonKeys = (text: string): boolean => {
  try { assertNoDuplicateJsonKeys(text); return true; } catch { return false; }
};

const MAX_JSON_MEMBER_RENAMES = 4096;
interface JsonRedaction {
  readonly counts: Record<string, number>;
  renames: number;
}

/**
 * Redaction inside a JSON value. A string member is probed as `name=value`, because the key-named patterns (`api_key`,
 * `aws_secret_access_key`) match the name and the value together; a match that consumed the name replaces the whole
 * value with one placeholder, one inside the value is kept in place. A member NAME is probed on its own, since a secret
 * can be a key (`{"AKIA…": …}`); two names that redact alike stay two members. Numbers and booleans are untouched.
 */
function redactJsonValues(value: unknown, name: string | null, state: JsonRedaction): unknown {
  if (typeof value === "string") {
    const prefix = name === null ? "" : `${name}=`;
    const probe = redactSecrets(`${prefix}${value}`, placeholderFor);
    if (probe.findings.length === 0) return value;
    tally(probe.findings, state.counts);
    return probe.redacted.startsWith(prefix) ? probe.redacted.slice(prefix.length) : placeholderFor(probe.findings[0]!.type);
  }
  if (Array.isArray(value)) return value.map(item => redactJsonValues(item, name, state));
  if (value === null || typeof value !== "object") return value;
  const members: Record<string, unknown> = Object.create(null); // a `__proto__` member stays a member
  const suffixes = new Map<string, number>();
  for (const [key, item] of Object.entries(value)) {
    const probe = redactSecrets(key, placeholderFor);
    tally(probe.findings, state.counts);
    let member = probe.redacted;
    if (Object.hasOwn(members, member)) {
      let suffix = suffixes.get(member) ?? 2;
      do {
        if (++state.renames > MAX_JSON_MEMBER_RENAMES) throw new RangeError("too many redacted JSON member names");
        member = `${probe.redacted}#${suffix++}`;
      } while (Object.hasOwn(members, member));
      suffixes.set(probe.redacted, suffix);
    }
    // The value is probed under the redacted name, so a secret name is not found (and counted) a second time.
    members[member] = redactJsonValues(item, probe.redacted, state);
  }
  return members;
}

/** Whether `found` has at least as many findings as `floor` for every type the flat pass reported. */
const coversEveryType = (found: Readonly<Record<string, number>>, floor: Readonly<Record<string, number>>): boolean =>
  Object.entries(floor).every(([type, count]) => (found[type] ?? 0) >= count);

/** Re-read names and decoded values: JSON escapes can hide a match from the serialized text scan. */
function firstJsonSecret(root: unknown): string | undefined {
  const pending: { value: unknown; name: string | null }[] = [{ value: root, name: null }];
  while (pending.length > 0) {
    const { value, name } = pending.pop()!;
    if (Array.isArray(value)) {
      for (const item of value) pending.push({ value: item, name });
    } else if (value !== null && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        const found = redactSecrets(key, placeholderFor).findings[0];
        if (found !== undefined) return found.type;
        pending.push({ value: item, name: key });
      }
    } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      // Exponential formatting must not hide a long integer under a secret-named member.
      const scalar = typeof value === "number" && Number.isInteger(value) && Math.abs(value) >= 1e21
        ? BigInt(value).toString() : String(value);
      const found = redactSecrets(name === null ? scalar : `${name}=${scalar}`, placeholderFor).findings[0];
      if (found !== undefined) return found.type;
    }
  }
  return undefined;
}

/** The pipeline output filter. Pure over the text; what it found is readable through {@link redactionCountsFor}. */
export function secretRedactionFilter(output: string, execution: ToolExecution): string {
  if (output.length === 0) return output;
  const result = redactSecrets(output, placeholderFor);
  const parsed = parseJson(output);
  const counts = countsOf(result.findings);
  if (parsed === undefined) {
    if (result.findings.length > 0) findings.set(execution, counts);
    return result.redacted;
  }
  if (!hasUniqueJsonKeys(output)) {
    // JSON.parse discards the earlier value, so the decoded scan cannot verify it.
    findings.set(execution, { ...counts, output_withheld: 1 });
    return placeholderFor("output_withheld");
  }

  const flat = result.findings.length === 0 ? parsed : parseJson(result.redacted);
  const remaining = flat === undefined ? undefined : firstJsonSecret(flat);
  if (flat !== undefined && remaining === undefined && (result.findings.length === 0
    || (hasUniqueJsonKeys(result.redacted) && redactSecrets(result.redacted, placeholderFor).findings.length === 0))) {
    if (result.findings.length > 0) findings.set(execution, counts);
    return result.redacted;
  }

  const state: JsonRedaction = { counts: {}, renames: 0 };
  try {
    const value = redactJsonValues(parsed, null, state);
    const text = JSON.stringify(value);
    if (coversEveryType(state.counts, counts) && redactSecrets(text, placeholderFor).findings.length === 0 && firstJsonSecret(value) === undefined) {
      findings.set(execution, state.counts);
      return text;
    }
  } catch (error) { if (!(error instanceof RangeError)) throw error; } // Depth or rename budget exceeded.
  // An invalid flat JSON result cannot be checked for remaining escaped or key-named secrets.
  findings.set(execution, result.findings.length > 0 ? counts : remaining === undefined ? { output_withheld: 1 } : { [remaining]: 1 });
  return placeholderFor("output_withheld");
}

/** Counts by secret type the filter replaced in this execution's output, or null when it replaced nothing. */
export function redactionCountsFor(execution: object): Readonly<Record<string, number>> | null {
  return findings.get(execution) ?? null;
}

/** Whether text carries a placeholder this filter wrote: content that must not be written back over a real value. */
export function containsRedactionPlaceholder(text: string): boolean {
  return text.includes(REDACTION_PLACEHOLDER_PREFIX);
}
