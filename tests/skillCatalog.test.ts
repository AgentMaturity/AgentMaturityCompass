import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildSkillCatalog,
  resolveSkillCommand,
  skillCatalogDigest
} from "../src/skills/skillCatalog.js";

/**
 * A layered, digest-driven skill catalog (plan P6.2).
 *
 * A SKILL.md is a file in a workspace, which is to say untrusted content that
 * becomes INSTRUCTIONS to the model. That is the whole security question here,
 * and the prompt spine already answers it: `PromptContext.literal` exists so
 * workspace-authored instruction text is never interpolated, and its docstring
 * names `AGENTS.md` as the motivating case. A skill is the same case, so it
 * enters the prompt the same way rather than as a `PromptSection`, which is
 * deployment-authored and always interpolated.
 */
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function layer(skills: Record<string, string>): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-skills-")));
  dirs.push(dir);
  for (const [name, body] of Object.entries(skills)) {
    mkdirSync(join(dir, name), { recursive: true });
    writeFileSync(join(dir, name, "SKILL.md"), body, "utf8");
  }
  return dir;
}

const skill = (name: string, description: string, body: string) =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`;

describe("skills are discovered and described", () => {
  it("reads a skill's frontmatter and body", () => {
    const root = layer({ lint: skill("lint", "run the linter", "Do the linting.") });

    const catalog = buildSkillCatalog([root]);

    expect(catalog.skills.map((s) => s.name)).toEqual(["lint"]);
    expect(catalog.skills[0]?.description).toBe("run the linter");
    expect(catalog.skills[0]?.body.trim()).toBe("Do the linting.");
  });

  it("skips a directory with no SKILL.md rather than inventing one", () => {
    const root = layer({ lint: skill("lint", "d", "b") });
    mkdirSync(join(root, "not-a-skill"), { recursive: true });

    expect(buildSkillCatalog([root]).skills.map((s) => s.name)).toEqual(["lint"]);
  });

  it("reports a malformed skill instead of dropping it silently", () => {
    // A skill that cannot be read is not the same as a skill that is absent. An
    // operator who wrote one and sees nothing needs to be told why.
    const root = layer({ broken: "no frontmatter here at all\n" });

    const catalog = buildSkillCatalog([root]);

    expect(catalog.skills).toEqual([]);
    expect(catalog.problems.map((p) => p.name)).toEqual(["broken"]);
    expect(catalog.problems[0]?.reason).toMatch(/frontmatter/i);
  });

  it("refuses a skill whose frontmatter name disagrees with its directory", () => {
    // The directory is what `/name` resolves against; the frontmatter is what a
    // reader believes. Two answers to "what is this skill called" is one too
    // many, and the mismatch is how a skill gets loaded under a name nobody
    // reviewed.
    const root = layer({ lint: skill("something-else", "d", "b") });

    const catalog = buildSkillCatalog([root]);

    expect(catalog.skills).toEqual([]);
    expect(catalog.problems[0]?.reason).toMatch(/name/i);
  });
});

describe("layers override in order, and say so", () => {
  it("takes the later layer's version of a skill", () => {
    const base = layer({ lint: skill("lint", "base", "base body") });
    const over = layer({ lint: skill("lint", "override", "override body") });

    const catalog = buildSkillCatalog([base, over]);

    expect(catalog.skills).toHaveLength(1);
    expect(catalog.skills[0]?.description).toBe("override");
    expect(catalog.skills[0]?.body.trim()).toBe("override body");
  });

  it("records which layer a loaded skill came from", () => {
    // Provenance is the point of layering. "Which of the three files on disk is
    // the model actually being given" must not need inference.
    const base = layer({ lint: skill("lint", "base", "b") });
    const over = layer({ lint: skill("lint", "override", "o") });

    const catalog = buildSkillCatalog([base, over]);

    expect(catalog.skills[0]?.sourcePath.startsWith(over)).toBe(true);
  });

  it("merges skills that only one layer defines", () => {
    const base = layer({ lint: skill("lint", "d", "b") });
    const over = layer({ test: skill("test", "d", "b") });

    expect(buildSkillCatalog([base, over]).skills.map((s) => s.name).sort()).toEqual(["lint", "test"]);
  });
});

describe("the catalog is digest-driven", () => {
  it("gives every skill a content digest", () => {
    const root = layer({ lint: skill("lint", "d", "b") });
    expect(buildSkillCatalog([root]).skills[0]?.digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes the catalog digest when a skill's content changes", () => {
    // The reason a digest exists at all: a signed run can name exactly which
    // instructions the model was given, and a changed instruction file is a
    // different catalog even under the same names.
    const before = buildSkillCatalog([layer({ lint: skill("lint", "d", "one") })]);
    const after = buildSkillCatalog([layer({ lint: skill("lint", "d", "two") })]);

    expect(skillCatalogDigest(after)).not.toBe(skillCatalogDigest(before));
  });

  it("is stable across layer paths, so a digest names content and not location", () => {
    const a = buildSkillCatalog([layer({ lint: skill("lint", "d", "same") })]);
    const b = buildSkillCatalog([layer({ lint: skill("lint", "d", "same") })]);

    expect(skillCatalogDigest(b)).toBe(skillCatalogDigest(a));
  });
});

describe("a skill loads on /name", () => {
  it("resolves a slash command to its skill", () => {
    const root = layer({ lint: skill("lint", "d", "Do the linting.") });
    const catalog = buildSkillCatalog([root]);

    const resolved = resolveSkillCommand(catalog, "/lint");

    expect(resolved.kind).toBe("skill");
    if (resolved.kind !== "skill") return;
    expect(resolved.skill.name).toBe("lint");
    expect(resolved.rest).toBe("");
  });

  it("keeps the rest of the line as the request", () => {
    const catalog = buildSkillCatalog([layer({ lint: skill("lint", "d", "b") })]);

    const resolved = resolveSkillCommand(catalog, "/lint src/foo.ts and be quick");

    expect(resolved.kind).toBe("skill");
    if (resolved.kind !== "skill") return;
    expect(resolved.rest).toBe("src/foo.ts and be quick");
  });

  it("reports an unknown skill rather than silently treating it as prose", () => {
    // A user who typed `/lnit` meant a skill. Passing the typo through as an
    // ordinary message would send the model a instruction-shaped string nobody
    // resolved.
    const catalog = buildSkillCatalog([layer({ lint: skill("lint", "d", "b") })]);

    const resolved = resolveSkillCommand(catalog, "/lnit");

    expect(resolved.kind).toBe("unknown-skill");
    if (resolved.kind !== "unknown-skill") return;
    expect(resolved.name).toBe("lnit");
    expect(resolved.known).toEqual(["lint"]);
  });

  it("leaves an ordinary message alone", () => {
    const catalog = buildSkillCatalog([layer({ lint: skill("lint", "d", "b") })]);

    expect(resolveSkillCommand(catalog, "please lint this").kind).toBe("message");
    expect(resolveSkillCommand(catalog, "a / in the middle").kind).toBe("message");
  });

  it("does not treat a path as a skill", () => {
    // `/usr/bin/thing` is a path someone typed, not a command.
    const catalog = buildSkillCatalog([layer({ lint: skill("lint", "d", "b") })]);
    expect(resolveSkillCommand(catalog, "/usr/bin/thing").kind).toBe("message");
  });
});
