import YAML from "yaml";

/**
 * SKILL.md and command-file frontmatter (SH-EXT-05), parsed as YAML with the installed `yaml` package so block lists
 * work, and validated field by field. A list field that cannot be read is a reported PROBLEM, never an empty list: a
 * `disallowed-tools` that silently restricts nothing is worse than none.
 *
 * Fields follow Claude Code's names. `allowed-tools`, `model` and `effort` are parsed and shown but never applied:
 * workspace text cannot widen a signed tool policy or pick a route. `disallowed-tools` only narrows.
 */
export interface SkillFields {
  readonly name?: string;
  readonly description?: string;
  readonly disableModelInvocation?: true;
  readonly userInvocable?: false;
  readonly argumentHint?: string;
  readonly whenToUse?: string;
  /** Declared names for `$name` substitution; also fed positionally. */
  readonly argumentNames?: readonly string[];
  /** Reported only; never widens policy. */
  readonly allowedTools?: readonly string[];
  /** Narrows the turn's toolset. */
  readonly disallowedTools?: readonly string[];
  /** Reported only. */
  readonly model?: string;
  readonly effort?: string;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
const TOOL = /^[A-Za-z0-9_.:-]{1,128}$/;
const TEXT_MAX = 1_024;

class FieldError extends Error {}
const fail = (message: string): never => { throw new FieldError(message); };

function text(fields: Record<string, unknown>, key: string): string | undefined {
  const value = fields[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return fail(`${key} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > TEXT_MAX) return fail(`${key} exceeds ${TEXT_MAX} characters`);
  return trimmed;
}
function flag(fields: Record<string, unknown>, key: string): boolean | undefined {
  const value = fields[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fail(`${key} must be true or false`);
}
/** A YAML list, or one string (a `[a, b]` flow list read as text included) split on commas and whitespace; every item must look like a name. */
function list(fields: Record<string, unknown>, key: string, pattern: RegExp, what: string): readonly string[] | undefined {
  const value = fields[key];
  if (value === undefined || value === null) return undefined;
  const items = typeof value === "string" ? value.replace(/^\[(.*)\]$/, "$1").split(/[\s,]+/).filter(item => item.length > 0)
    : Array.isArray(value) ? value : fail(`${key} must be a list or a string`);
  if (items.length > 64) return fail(`${key} lists more than 64 items`);
  const out: string[] = [];
  for (const item of items) {
    if (typeof item !== "string" || !pattern.test(item)) return fail(`${key} contains an item that is not a ${what}`);
    out.push(item);
  }
  return Object.freeze(out);
}

const TEXT_FIELDS = ["name", "description", "argument-hint", "when_to_use", "model", "effort"] as const;
const unquote = (value: string): string => /^(["'])(.*)\1$/.exec(value)?.[2] ?? value;

/**
 * The reader skills were written against before YAML: `key: rest of line`, plus `- item` lines under a `key:` with no
 * value. Null when a key repeats, which is a problem under both readers.
 */
function lineFields(front: string): Record<string, unknown> | null {
  const fields: Record<string, unknown> = {};
  let open: string[] | undefined;
  for (const line of front.split(/\r?\n/)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item !== null && open !== undefined) { open.push(unquote(item[1]!.trim())); continue; }
    open = undefined;
    const at = line.indexOf(":");
    if (at <= 0) continue;
    const key = line.slice(0, at).trim(), value = line.slice(at + 1).trim();
    if (Object.hasOwn(fields, key)) return null;
    if (value.length > 0) fields[key] = value;
    else { open = []; fields[key] = open; }
  }
  for (const [key, value] of Object.entries(fields)) if (Array.isArray(value) && value.length === 0) fields[key] = "";
  return fields;
}

/**
 * Parse one frontmatter block. Returns the fields, or the reason it cannot be read.
 *
 * LEGACY TEXT STILL LOADS. Skills were written for a `key: rest of line` reader, under which `description: Deploy:
 * ships it`, `*important* tool` and `#1 helper` were plain text; YAML rejects the first two and reads the third as a
 * comment. So when YAML cannot read the block, the line reader decides; and when YAML reads a text field as something
 * other than a string, the line as written wins for that field. A repeated key stays a problem either way.
 */
export function parseSkillFrontmatter(front: string): { fields: SkillFields } | { reason: string } {
  let raw: unknown, yamlProblem: string | undefined;
  try { raw = YAML.parse(front, { maxAliasCount: 8, uniqueKeys: true }); }
  catch (error) { yamlProblem = `frontmatter is not valid YAML: ${error instanceof Error ? error.message.split("\n")[0] : "parse error"}`; }
  const lines = lineFields(front);
  if (yamlProblem !== undefined) {
    if (lines === null) return { reason: yamlProblem };
    raw = lines;
  }
  if (raw === null || raw === undefined) raw = {};
  if (typeof raw !== "object" || Array.isArray(raw)) return { reason: "frontmatter must be a YAML mapping" };
  let fields = raw as Record<string, unknown>;
  if (yamlProblem === undefined && lines !== null) {
    for (const key of TEXT_FIELDS) {
      const written = lines[key];
      if (typeof fields[key] !== "string" && typeof written === "string" && written.length > 0) fields = { ...fields, [key]: written };
    }
  }
  try {
    const disable = flag(fields, "disable-model-invocation");
    const invocable = flag(fields, "user-invocable");
    return { fields: {
      ...(text(fields, "name") === undefined ? {} : { name: text(fields, "name")! }),
      ...(text(fields, "description") === undefined ? {} : { description: text(fields, "description")! }),
      ...(disable === true ? { disableModelInvocation: true as const } : {}),
      ...(invocable === false ? { userInvocable: false as const } : {}),
      ...(text(fields, "argument-hint") === undefined ? {} : { argumentHint: text(fields, "argument-hint")! }),
      ...(text(fields, "when_to_use") === undefined ? {} : { whenToUse: text(fields, "when_to_use")! }),
      ...(list(fields, "arguments", NAME, "argument name") === undefined ? {} : { argumentNames: list(fields, "arguments", NAME, "argument name")! }),
      ...(list(fields, "allowed-tools", TOOL, "tool name") === undefined ? {} : { allowedTools: list(fields, "allowed-tools", TOOL, "tool name")! }),
      ...(list(fields, "disallowed-tools", TOOL, "tool name") === undefined ? {} : { disallowedTools: list(fields, "disallowed-tools", TOOL, "tool name")! }),
      ...(text(fields, "model") === undefined ? {} : { model: text(fields, "model")! }),
      ...(text(fields, "effort") === undefined ? {} : { effort: text(fields, "effort")! })
    } };
  } catch (error) {
    if (error instanceof FieldError) return { reason: error.message };
    throw error;
  }
}
