import { z } from "zod";
import { defineTool } from "../tools/toolRegistry.js";
import type { ToolDefinition } from "../tools/toolTypes.js";
import { receiptedBody, type NativeReceiptRecorder } from "../tools/builtin/nativeToolBreadth/nativeReceipt.js";
import { NativeToolRefusal } from "../tools/builtin/nativeToolBreadth/originPolicy.js";
import { buildSkillCatalog, type Skill, type SkillCatalog } from "./skillCatalog.js";
import { renderSkillContext } from "./skillPrompt.js";

/**
 * `skill.load` — the model picks a skill from the advertised catalog
 * (DXC-29, PXA-30, PI-037).
 *
 * ADVERTISED, NOT INJECTED. The catalog's names and one-line descriptions are
 * the tool's description, so the model sees what exists on every request
 * without every body sitting in the prompt. A skill marked
 * `disable-model-invocation: true` is neither listed nor loadable here; it
 * still loads on the operator's `/name`.
 *
 * GOVERNED. READ_ONLY like `fs.read`, so it runs only when the signed tools
 * policy lists it. The catalog is re-read on each call and the body returned
 * in the same attributed frame `/name` uses (name, source file, sha256), and
 * the `NATIVE_SKILL_LOAD` receipt records that digest, so the log names the
 * exact bytes the model was handed. The text stays workspace content, not the
 * operator's instructions.
 */

const MAX_ADVERTISED = 40;
const MAX_DESCRIPTION = 200;
const argsSchema = z.object({ name: z.string().min(1).max(128) }).strict();

const offered = (catalog: SkillCatalog): readonly Skill[] => catalog.skills.filter((skill) => skill.disableModelInvocation !== true);

/** The tool description: what it does, then the catalog it can load from. */
export function describeSkillCatalog(catalog: SkillCatalog): string {
  const skills = offered(catalog);
  const head = "Load an installed skill's instructions by name. The text is workspace content, attributed to its file and digest.";
  if (skills.length === 0) return `${head} No skills are installed.`;
  const listed = skills.slice(0, MAX_ADVERTISED).map((skill) => `- ${skill.name}: ${skill.description.slice(0, MAX_DESCRIPTION)}`);
  const more = skills.length > MAX_ADVERTISED ? [`(${skills.length - MAX_ADVERTISED} more not listed)`] : [];
  return [`${head} Available skills:`, ...listed, ...more].join("\n");
}

export function skillLoadTool(options: { readonly roots: readonly string[]; readonly record: NativeReceiptRecorder }): ToolDefinition {
  return defineTool({
    name: "skill.load",
    actionClass: "READ_ONLY",
    description: describeSkillCatalog(buildSkillCatalog(options.roots)),
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "A skill name from the list in this tool's description." } },
      required: ["name"],
      additionalProperties: false
    },
    body: receiptedBody("NATIVE_SKILL_LOAD", options.record, async (execution, allow) => {
      const { name } = argsSchema.parse(execution.arguments);
      const catalog = buildSkillCatalog(options.roots);
      const skill = offered(catalog).find((one) => one.name === name);
      if (!skill) {
        const broken = catalog.problems.find((one) => one.name === name);
        const known = offered(catalog).map((one) => one.name);
        throw new NativeToolRefusal("skill.load", broken
          ? `skill "${name}" could not be loaded: ${broken.reason}`
          : `no loadable skill named "${name}"; available: ${known.length === 0 ? "none" : known.join(", ")}`);
      }
      if (execution.effectiveMode === "SIMULATE") return { ok: true, output: `[amc: SIMULATE skill.load ${skill.name}; not loaded]` };
      allow({ skill: skill.name, skillDigest: skill.digest, sourcePath: skill.sourcePath });
      return { ok: true, output: renderSkillContext(skill) };
    })
  });
}
