import { NATIVE_EXTENSION_LIMITS } from "../extensions/nativeExtensionManifest.js";
import { sha256Hex } from "../utils/hash.js";

/**
 * `$ARGUMENTS` substitution for skills and command files (SH-EXT-05), Claude Code's dialect: `$ARGUMENTS` is the whole
 * argument text, `$ARGUMENTS[N]` and `$N` (0-based) are quote-aware words, `$name` is a declared argument fed
 * positionally, `${AMC_SKILL_DIR}` and `${AMC_WORKSPACE}` are paths, and `\$` is a literal dollar.
 *
 * ONE PASS, LITERAL VALUES. Every placeholder is replaced by one regular-expression callback over the original body, so
 * a value containing `$0` or `$ARGUMENTS` is inserted as text and never expanded again. Values are inserted as typed
 * (no quoting), because the body is prose for a model, not a template for an engine; the attribution frame in
 * ./skillPrompt.ts says which bytes were the author's and which were the operator's. This differs from the signed
 * extension templates (`{{args}}`, JSON-quoted, 1-based): those are reviewed, signed files; these are skills.
 */

export interface RenderedSkillBody {
  readonly text: string;
  /** True when any argument placeholder was replaced. */
  readonly substituted: boolean;
  readonly argumentsText: string;
  readonly argumentsSha256: string;
  readonly renderedSha256: string;
}

export class SkillArgumentError extends Error {}

/** Shell-like words: whitespace-separated, with `"..."` and `'...'` grouping and `\` escaping inside double quotes. */
export function tokenizeSkillArguments(rest: string): string[] {
  const words: string[] = [];
  let current = "", quote: "\"" | "'" | null = null, open = false;
  for (let index = 0; index < rest.length; index++) {
    const char = rest[index]!;
    if (quote === null) {
      if (char === "\"" || char === "'") { quote = char; open = true; continue; }
      if (/\s/.test(char)) { if (open) { words.push(current); current = ""; open = false; } continue; }
      if (char === "\\" && index + 1 < rest.length) { current += rest[++index]; open = true; continue; }
      current += char; open = true; continue;
    }
    if (char === quote) { quote = null; continue; }
    if (quote === "\"" && char === "\\" && index + 1 < rest.length && (rest[index + 1] === "\"" || rest[index + 1] === "\\")) { current += rest[++index]; continue; }
    current += char;
  }
  if (quote !== null) throw new SkillArgumentError("skill arguments have an unterminated quote");
  if (open) words.push(current);
  return words;
}

const PLACEHOLDER = /\\\$|\$\{AMC_SKILL_DIR\}|\$\{AMC_WORKSPACE\}|\$ARGUMENTS\[(\d{1,2})\]|\$ARGUMENTS\b|\$(\d{1,2})\b|\$([A-Za-z_][A-Za-z0-9_]{0,31})\b/g;

export function renderSkillBody(body: string, init: { readonly rest: string; readonly argumentNames?: readonly string[];
  readonly skillDirectory?: string; readonly workspace: string }): RenderedSkillBody {
  const rest = init.rest.trim();
  if (Buffer.byteLength(rest) > NATIVE_EXTENSION_LIMITS.argumentBytes) throw new SkillArgumentError(`skill arguments exceed ${NATIVE_EXTENSION_LIMITS.argumentBytes} bytes`);
  const words = tokenizeSkillArguments(rest);
  if (words.length > NATIVE_EXTENSION_LIMITS.positionalArguments) throw new SkillArgumentError(`more than ${NATIVE_EXTENSION_LIMITS.positionalArguments} positional skill arguments`);
  const named = new Map<string, string>();
  for (const [index, name] of (init.argumentNames ?? []).entries()) named.set(name, words[index] ?? "");
  let substituted = false;
  const text = body.replace(PLACEHOLDER, (match, indexed?: string, positional?: string, name?: string) => {
    if (match === "\\$") return "$";
    if (match === "${AMC_SKILL_DIR}") return init.skillDirectory ?? "";
    if (match === "${AMC_WORKSPACE}") return init.workspace;
    if (indexed !== undefined || positional !== undefined) { substituted = true; return words[Number(indexed ?? positional)] ?? ""; }
    if (name !== undefined) { if (!named.has(name)) return match; substituted = true; return named.get(name)!; }
    substituted = true; return rest; // $ARGUMENTS
  });
  if (Buffer.byteLength(text) > NATIVE_EXTENSION_LIMITS.expansionBytes) throw new SkillArgumentError("the rendered skill exceeds the expansion limit");
  return { text, substituted, argumentsText: rest, argumentsSha256: sha256Hex(rest), renderedSha256: sha256Hex(text) };
}
