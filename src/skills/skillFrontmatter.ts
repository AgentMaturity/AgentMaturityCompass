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
/** A YAML list, or one string split on commas and whitespace; every item must look like a name. */
function list(fields: Record<string, unknown>, key: string, pattern: RegExp, what: string): readonly string[] | undefined {
  const value = fields[key];
  if (value === undefined || value === null) return undefined;
  const items = typeof value === "string" ? value.split(/[\s,]+/).filter(item => item.length > 0)
    : Array.isArray(value) ? value : fail(`${key} must be a list or a string`);
  if (items.length > 64) return fail(`${key} lists more than 64 items`);
  const out: string[] = [];
  for (const item of items) {
    if (typeof item !== "string" || !pattern.test(item)) return fail(`${key} contains an item that is not a ${what}`);
    out.push(item);
  }
  return Object.freeze(out);
}

/** Parse one frontmatter block. Returns the fields, or the reason it cannot be read. */
export function parseSkillFrontmatter(front: string): { fields: SkillFields } | { reason: string } {
  let raw: unknown;
  try { raw = YAML.parse(front, { maxAliasCount: 8, uniqueKeys: true }); }
  catch (error) { return { reason: `frontmatter is not valid YAML: ${error instanceof Error ? error.message.split("\n")[0] : "parse error"}` }; }
  if (raw === null || raw === undefined) raw = {};
  if (typeof raw !== "object" || Array.isArray(raw)) return { reason: "frontmatter must be a YAML mapping" };
  const fields = raw as Record<string, unknown>;
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
