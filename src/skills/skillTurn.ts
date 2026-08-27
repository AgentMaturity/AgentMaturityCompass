import { join } from "node:path";
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

/** Where skills are looked for, in ascending precedence. */
export function workspaceSkillRoots(workspace: string, amcHome?: string): string[] {
  const roots: string[] = [];
  // The shared layer first, so a workspace can override it. A user's own skills
  // are theirs; a repository's are the repository's, and the repository is the
  // more specific answer for work done inside it.
  if (amcHome !== undefined && amcHome.length > 0) roots.push(join(amcHome, "skills"));
  roots.push(join(workspace, ".amc", "skills"));
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
  const catalog = buildSkillCatalog(workspaceSkillRoots(init.workspace, init.amcHome));
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
