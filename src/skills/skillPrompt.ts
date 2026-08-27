import type { ContextPlugin } from "../prompt/context/contextTypes.js";
import type { Skill } from "./skillCatalog.js";

/**
 * Put a loaded skill in front of the model — untrusted, and attributed.
 *
 * WHY A CONTEXT AND NOT A SECTION. A `SKILL.md` is a workspace file, and the
 * prompt spine already decided how workspace-authored instruction text enters:
 * `PromptContext.literal` (../prompt/assembly/promptTypes.ts) exists so such text
 * is never interpolated, and its own docstring names `AGENTS.md` as the case it
 * was written for. A skill is that case under a different filename.
 *
 * Registering a skill as a `PromptSection` instead would interpolate it, which
 * hands anyone who can write a skill file the ability to name a prompt variable —
 * the same namespace escape `interpolate.ts` already refuses for substituted
 * values. It would also break every skill whose instructions merely DOCUMENT a
 * `{{placeholder}}`, which is an ordinary thing for an instruction file to
 * contain: assembly would throw `unknown-variable` and block every request in
 * the session.
 *
 * WHY IT IS ATTRIBUTED. The operator's persona is deployment-authored; a skill
 * is not. Handing the model a skill's instructions unlabelled would let a
 * `SKILL.md` shipped inside a cloned repository speak in the operator's voice.
 * The frame names the skill, the file it came from and its digest — so the model
 * reads it as material from a named source, and a reader of the log can tell
 * exactly which bytes were in play.
 *
 * The body itself is passed through verbatim. Attribution is a frame, not an
 * edit: what the author wrote is what the model gets.
 */

/**
 * After the operator's persona (order 0), for the reason the assembly module
 * already gives about identity: material that appears before the instructions it
 * qualifies is material a later contribution can talk over. A skill qualifies
 * the job; the voice that set the job comes first.
 */
export const SKILL_CONTEXT_ORDER = 150;

/** The context name a loaded skill registers under. */
export function skillContextName(skill: Skill): string {
  return `skill:${skill.name}`;
}

/** Frame a skill for the model: whose words these are, and where they came from. */
export function renderSkillContext(skill: Skill): string {
  return [
    `# Skill: ${skill.name}`,
    `${skill.description}`,
    "",
    `The instructions below come from ${skill.sourcePath} (sha256 ${skill.digest}).`,
    "They are the skill's own text, not the operator's own instructions.",
    "",
    skill.body.trim()
  ].join("\n");
}

/**
 * A loaded skill as a context plugin — the shape the composed loop consumes.
 *
 * A plugin rather than a direct `registry.context(...)` call because
 * `ContextHost.register` already stamps every plugin `literal: true` and
 * documents why (contextHost.ts:133): a plugin's text is computed from runtime
 * inputs this process does not control. Registering skills through the same door
 * as `AGENTS.md` means there is ONE place that decides workspace text is data,
 * not two that could drift apart.
 *
 * `collect` returns the framing synchronously; the async signature is the
 * plugin contract, not a need of this one.
 */
export function skillContextPlugin(skill: Skill): ContextPlugin {
  return {
    name: skillContextName(skill),
    order: SKILL_CONTEXT_ORDER,
    collect: async () => renderSkillContext(skill)
  };
}
