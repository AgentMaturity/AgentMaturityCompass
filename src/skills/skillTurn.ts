import { lstatSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { buildSkillCatalog, resolveSkillCommand, type Skill } from "./skillCatalog.js";
import { skillContextPlugin } from "./skillPrompt.js";
import type { ContextPlugin } from "../prompt/context/contextTypes.js";

/**
 * Turn a `/name` into a composed turn (plan P6.2).
 *
 * WHY THIS RUNS BEFORE THE TURN IS COMPOSED. `runComposedTurn` assembles the
 * system prompt once at the top and records it as a signed `system/prompt` row.
 * A skill discovered after that would not be in the prompt the row commits to,
 * so the log would name one prompt and the model would have read another.
 * Resolution therefore happens on the way IN, and its output is a plugin the
 * composition already knows how to take.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: run anything. A skill is text. The catalog
 * reads files and the resolver matches a name; nothing here executes, spawns or
 * fetches, which is what keeps a `SKILL.md` shipped in a cloned repository a
 * prompt-injection question rather than a code-execution one. The injection half
 * is answered in ./skillPrompt.ts by entering as a literal, attributed context.
 */

/** Canonicalize only caller-selected anchors; discovered skill paths must still refuse symlinks. */
function skillAnchor(path: string): string {
  try { return realpathSync(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return resolve(path);
    throw new Error("Skill root discovery is incomplete: a selected workspace or home anchor could not be resolved.");
  }
}

/** Where skills are looked for, in ascending precedence. */
export function workspaceSkillRoots(workspace: string, amcHome?: string): string[] {
  const roots: string[] = [];
  if (amcHome !== undefined && amcHome.length > 0) roots.push(join(skillAnchor(amcHome), "skills"));
  const cwd = skillAnchor(workspace), chain = [cwd];
  let repositoryFound = false, boundaryComplete = false;
  // Never search indefinitely or read ambient skills above the nearest Git root.
  // Without a repository marker, only the explicit workspace is a skill scope.
  for (let cursor = cwd, depth = 0; depth < 64; depth++) {
    try { lstatSync(join(cursor, ".git")); repositoryFound = true; boundaryComplete = true; break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error("Skill root discovery is incomplete: a repository boundary could not be examined.");
    }
    const parent = dirname(cursor);
    if (parent === cursor) { boundaryComplete = true; break; }
    chain.push(parent); cursor = parent;
  }
  if (!boundaryComplete) throw new Error("Skill root discovery is incomplete: the 64-directory ancestor traversal limit was reached.");
  for (const directory of repositoryFound ? chain.reverse() : [cwd]) {
    roots.push(join(directory, ".agents", "skills"), join(directory, ".amc", "skills"));
  }
  return roots;
}

export interface PrepareSkillTurnInit {
  readonly workspace: string;
  readonly prompt: string;
  readonly amcHome?: string;
}

export type PreparedSkillTurn =
  | {
      readonly ok: true;
      /** What the model should be asked. Never empty. */
      readonly prompt: string;
      /** Empty unless a skill loaded. Hand straight to `promptProfile.contextPlugins`. */
      readonly contextPlugins: readonly ContextPlugin[];
      readonly loaded?: Skill;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * Read a user's line, loading a skill when it names one.
 *
 * An unknown name STOPS the turn rather than passing through. A user who typed
 * `/lnit` meant a skill; running anyway spends a request on an
 * instruction-shaped string nobody resolved, and the likeliest outcome is a
 * model apologising for a command it never had.
 *
 * A MALFORMED skill is reported as malformed, not as unknown. The worst version
 * of this failure is an operator who wrote a skill, typed its name, and was told
 * it does not exist.
 */
export function prepareSkillTurn(init: PrepareSkillTurnInit): PreparedSkillTurn {
  let roots: string[];
  try { roots = workspaceSkillRoots(init.workspace, init.amcHome); }
  catch (error) { return { ok: false, reason: error instanceof Error ? error.message : "Skill root discovery is incomplete." }; }
  const catalog = buildSkillCatalog(roots);
  const resolved = resolveSkillCommand(catalog, init.prompt);

  if (resolved.kind === "message") {
    return { ok: true, prompt: init.prompt, contextPlugins: [] };
  }

  if (resolved.kind === "unknown-skill") {
    const broken = catalog.problems.find((one) => one.name === resolved.name);
    if (broken) {
      return {
        ok: false,
        reason: `skill "${resolved.name}" could not be loaded: ${broken.reason} (${broken.sourcePath})`
      };
    }
    const discovery = catalog.problems.find((one) => one.name.startsWith("*"));
    if (discovery) return { ok: false, reason: `skill discovery is incomplete: ${discovery.reason} (${discovery.sourcePath})` };
    return {
      ok: false,
      reason: resolved.known.length === 0
        ? `no skills are installed, so "/${resolved.name}" names nothing`
        : `no skill named "${resolved.name}"; this workspace has: ${resolved.known.join(", ")}`
    };
  }

  return {
    ok: true,
    // A bare `/name` still needs something for the model to act on: the skill's
    // instructions are loaded, but an empty user turn hands it a loaded skill
    // and no request. The description is the skill's own one-line statement of
    // what it does, which is the closest thing to what the user meant.
    prompt: resolved.rest.length > 0 ? resolved.rest : resolved.skill.description,
    contextPlugins: [skillContextPlugin(resolved.skill)],
    loaded: resolved.skill
  };
}
