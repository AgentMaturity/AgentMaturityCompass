import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

/**
 * A layered, digest-driven skill catalog (plan P6.2).
 *
 * A skill is a `SKILL.md` under a layer root: frontmatter naming it, and a body
 * of instructions the model is given when the skill loads.
 *
 * THE SECURITY QUESTION, and why this file does not answer it. A SKILL.md is a
 * file in a workspace — untrusted content that becomes INSTRUCTIONS. The prompt
 * spine already settled that case: `PromptContext.literal`
 * (../prompt/assembly/promptTypes.ts) exists so workspace-authored instruction
 * text is never interpolated, and its docstring names `AGENTS.md` as the
 * motivating example. A skill is the same example under a different filename, so
 * a loaded skill enters the prompt as a LITERAL CONTEXT and never as a
 * `PromptSection`, which is deployment-authored and always interpolated. This
 * module produces the text; ./skillPrompt.ts is where that rule is applied.
 *
 * LAYERS OVERRIDE BY POSITION, later winning, which is the usual shape (a
 * workspace layer over a shared one). What matters more than the rule is that
 * the WINNER records where it came from: "which of the three files on disk is
 * the model actually being given" should never need inference.
 *
 * DIGESTS NAME CONTENT, NOT LOCATION. Two identical skills in different
 * directories produce the same catalog digest, and one changed byte produces a
 * different one — so a signed run can say exactly which instructions the model
 * was given, and moving a layer does not read as a change.
 */

export interface Skill {
  readonly name: string;
  readonly description: string;
  readonly body: string;
  /** Which file won, after layering. */
  readonly sourcePath: string;
  /** sha256 of the file's full contents. */
  readonly digest: string;
}

export interface SkillProblem {
  readonly name: string;
  readonly sourcePath: string;
  readonly reason: string;
}

export interface SkillCatalog {
  readonly skills: readonly Skill[];
  /**
   * Skills that exist on disk and could not be read.
   *
   * Reported rather than dropped: a skill that cannot be parsed is not the same
   * as a skill that is absent, and an operator who wrote one and sees nothing
   * needs to be told which file and why.
   */
  readonly problems: readonly SkillProblem[];
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseSkill(dirName: string, sourcePath: string, raw: string): Skill | SkillProblem {
  const matched = FRONTMATTER.exec(raw);
  if (!matched) {
    return { name: dirName, sourcePath, reason: "no --- frontmatter block at the top of the file" };
  }
  const [, front = "", body = ""] = matched;

  const fields = new Map<string, string>();
  for (const line of front.split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at <= 0) continue;
    fields.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
  }

  const name = fields.get("name") ?? "";
  const description = fields.get("description") ?? "";
  if (name.length === 0) return { name: dirName, sourcePath, reason: "frontmatter has no name" };
  if (name !== dirName) {
    // The directory is what `/name` resolves against; the frontmatter is what a
    // reader believes. Two answers to "what is this skill called" is one too
    // many, and the mismatch is how a skill gets loaded under a name nobody
    // reviewed.
    return {
      name: dirName,
      sourcePath,
      reason: `frontmatter name ${JSON.stringify(name)} does not match its directory ${JSON.stringify(dirName)}`
    };
  }
  if (description.length === 0) {
    return { name: dirName, sourcePath, reason: "frontmatter has no description" };
  }

  return { name, description, body, sourcePath, digest: sha256Hex(raw) };
}

/**
 * Read every layer in order, later layers overriding earlier ones by name.
 *
 * A root that does not exist contributes nothing and is not an error: layering a
 * workspace directory over a shared one means the workspace usually has none.
 */
export function buildSkillCatalog(roots: readonly string[]): SkillCatalog {
  const winners = new Map<string, Skill>();
  const problems = new Map<string, SkillProblem>();

  for (const root of roots) {
    if (!pathExists(root)) continue;
    let entries: string[];
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }

    for (const dirName of entries.sort()) {
      const dir = join(root, dirName);
      try {
        if (!statSync(dir).isDirectory()) continue;
      } catch {
        continue;
      }
      const sourcePath = join(dir, "SKILL.md");
      if (!pathExists(sourcePath)) continue;

      let raw: string;
      try {
        raw = readUtf8(sourcePath);
      } catch (error) {
        problems.set(dirName, { name: dirName, sourcePath, reason: `unreadable: ${String(error)}` });
        continue;
      }

      const parsed = parseSkill(dirName, sourcePath, raw);
      if ("digest" in parsed) {
        winners.set(dirName, parsed);
        // A later layer that parses replaces an earlier layer's complaint: the
        // problem was about a file this catalog no longer uses.
        problems.delete(dirName);
      } else {
        winners.delete(dirName);
        problems.set(dirName, parsed);
      }
    }
  }

  return {
    skills: [...winners.values()].sort((a, b) => a.name.localeCompare(b.name)),
    problems: [...problems.values()].sort((a, b) => a.name.localeCompare(b.name))
  };
}

/**
 * One digest over the whole catalog, naming content rather than location.
 *
 * Source paths are deliberately excluded: moving a layer is not a change to what
 * the model is told, and a digest that moved with the directory would report one.
 */
export function skillCatalogDigest(catalog: SkillCatalog): string {
  return sha256Hex(
    canonicalize(catalog.skills.map((one) => ({ name: one.name, digest: one.digest })))
  );
}

export type SkillCommand =
  | { readonly kind: "skill"; readonly skill: Skill; readonly rest: string }
  | { readonly kind: "unknown-skill"; readonly name: string; readonly known: readonly string[] }
  | { readonly kind: "message" };

/** A `/name` is a bare word after the slash — `/usr/bin/thing` is a path someone typed. */
const COMMAND = /^\/([a-zA-Z0-9][a-zA-Z0-9_-]*)(?:\s+([\s\S]*))?$/;

/**
 * Read a user's line as a skill invocation, or as an ordinary message.
 *
 * An UNKNOWN skill is its own answer rather than falling through to a message. A
 * user who typed `/lnit` meant a skill, and passing the typo through would send
 * the model an instruction-shaped string that nobody resolved.
 */
export function resolveSkillCommand(catalog: SkillCatalog, line: string): SkillCommand {
  const matched = COMMAND.exec(line.trim());
  if (!matched) return { kind: "message" };
  const [, name = "", rest = ""] = matched;

  const skill = catalog.skills.find((one) => one.name === name);
  if (!skill) {
    return { kind: "unknown-skill", name, known: catalog.skills.map((one) => one.name) };
  }
  return { kind: "skill", skill, rest: rest.trim() };
}
