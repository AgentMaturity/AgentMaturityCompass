import { describe, expect, it } from "vitest";
import { PromptAssemblyRegistry } from "../src/prompt/assembly/promptRegistry.js";
import { skillContextPlugin, SKILL_CONTEXT_ORDER } from "../src/skills/skillPrompt.js";
import { ContextPluginHost } from "../src/prompt/context/contextHost.js";
import type { Skill } from "../src/skills/skillCatalog.js";

/**
 * A loaded skill enters the prompt as UNTRUSTED, ATTRIBUTED text.
 *
 * Both halves matter and neither is cosmetic.
 *
 * UNTRUSTED: a SKILL.md is a workspace file, and the prompt spine already
 * refuses to interpolate workspace-authored instruction text --
 * `PromptContext.literal` exists for exactly that, naming `AGENTS.md` as its
 * case. A skill registered as a `PromptSection` instead would be interpolated,
 * which hands anyone who can write a skill file the ability to name a prompt
 * variable, and would also throw `unknown-variable` on any skill that merely
 * DOCUMENTS a `{{placeholder}}`.
 *
 * ATTRIBUTED: the operator's persona is deployment-authored and a skill is not.
 * Blending them would let a skill file shipped in a cloned repository speak in
 * the operator's voice.
 */
const skill = (over: Partial<Skill> = {}): Skill => ({
  name: "lint",
  description: "run the linter",
  body: "Run the linter and fix what it reports.",
  sourcePath: "/ws/.amc/skills/lint/SKILL.md",
  digest: "a".repeat(64),
  ...over
});

/**
 * Assembles through the REAL path: a context plugin, hosted, registered by
 * `ContextHost`. Registering on the bare registry would test a door the loop
 * does not use -- and the literal flag this whole file is about is stamped by
 * the host, not by the plugin.
 */
async function assembleWith(one: Skill) {
  const registry = new PromptAssemblyRegistry();
  registry.section({ name: "persona", order: 0, text: "You are a careful agent." });
  const host = new ContextPluginHost([skillContextPlugin(one)]);
  await host.refresh({ turn: 1, step: 1 });
  host.register(registry);
  return registry.assemble({});
}

describe("a skill is contributed as a literal context", () => {
  it("goes in as a context, never as a section", async () => {
    const assembly = await assembleWith(skill());

    // Asserted as "not among the sections" rather than by listing them: the
    // registry always contributes `harness:identity`, and a test that pinned the
    // exact list would fail for reasons that have nothing to do with skills.
    expect(assembly.sections.map((s) => s.name), "no skill reaches the system prompt")
      .not.toContain("skill:lint");
    expect(assembly.contexts.map((c) => c.name)).toContain("skill:lint");
  });

  it("marks the text literal, so a skill may document a {{placeholder}}", async () => {
    // Not a convenience. Interpolating it would let a skill file name a prompt
    // variable, and would break every skill whose instructions happen to show a
    // template example.
    const assembly = await assembleWith(skill({ body: "Use {{model_name}} in your report." }));

    const context = assembly.contexts.find((c) => c.name === "skill:lint");
    expect(context?.literal, "workspace text is data, not a template").toBe(true);
    expect(context?.text).toContain("{{model_name}}");
  });

  it("does not throw on a skill body full of braces", async () => {
    // The denial-of-service the literal flag also prevents: an un-literal
    // context containing `{{anything}}` fails assembly and blocks every request
    // in the session.
    await expect(assembleWith(skill({ body: "{{a}} {{b}} {{unknown_thing}}" }))).resolves.toBeDefined();
  });
});

describe("a skill speaks in its own name, not the operator's", () => {
  it("attributes the text to the skill and its file", async () => {
    const assembly = await assembleWith(skill());
    const text = assembly.contexts.find((c) => c.name === "skill:lint")?.text ?? "";

    // The HEADING, not merely the substring "lint" -- which the source path also
    // contains, so an earlier version of this assertion passed with the heading
    // deleted entirely. Mutation testing found it.
    expect(text, "declares itself a skill, by name").toContain("# Skill: lint");
    expect(text, "and says these are not the operator's own instructions")
      .toContain("not the operator's own instructions");
    expect(text, "names where it came from").toContain("/ws/.amc/skills/lint/SKILL.md");
    expect(text, "and carries its digest").toContain("a".repeat(64));
  });

  it("renders after the operator's persona", async () => {
    // Order is the same argument the assembly module already makes about
    // identity: material that appears before the instructions it qualifies is
    // material a later section can talk over. A skill qualifies the job, so it
    // comes after the voice that set it.
    expect(SKILL_CONTEXT_ORDER).toBeGreaterThan(0);
  });

  it("keeps the skill body verbatim", async () => {
    // Attribution must not become editing: what the operator wrote is what the
    // model gets, framed rather than rewritten.
    const body = "Line one.\n\n  indented line\n\nLine three.";
    const assembly = await assembleWith(skill({ body }));
    expect(assembly.contexts.find((c) => c.name === "skill:lint")?.text).toContain(body);
  });
});
