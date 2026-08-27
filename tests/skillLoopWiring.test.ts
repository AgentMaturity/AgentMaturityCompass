import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { prepareSkillTurn, workspaceSkillRoots } from "../src/skills/skillTurn.js";
import { agentPromptProfile } from "../src/prompt/agentPromptProfile.js";

/**
 * `/name` reaching the agent loop (plan P6.2).
 *
 * The verify line is "a skill loads on /name". Resolution happens BEFORE the
 * turn is composed, because the system prompt is assembled and recorded once at
 * the top of `runComposedTurn` -- a skill discovered later would not be in the
 * prompt the signed `system/prompt` row commits to.
 */
const PASS = "skill-turn-test-passphrase";
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(skills: Record<string, string> = {}): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-skill-turn-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  for (const [name, body] of Object.entries(skills)) {
    const skillDir = join(dir, ".amc", "skills", name);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), body, "utf8");
  }
  return dir;
}

const skill = (name: string, body: string) =>
  `---\nname: ${name}\ndescription: the ${name} skill\n---\n\n${body}\n`;

describe("a turn that starts with /name loads that skill", () => {
  it("replaces the prompt with the rest and contributes the skill", () => {
    const dir = workspace({ lint: skill("lint", "Run the linter.") });

    const prepared = prepareSkillTurn({ workspace: dir, prompt: "/lint src/foo.ts" });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.prompt, "the skill name is consumed, the request survives")
      .toBe("src/foo.ts");
    expect(prepared.contextPlugins.map((p) => p.name)).toEqual(["skill:lint"]);
    expect(prepared.loaded?.name).toBe("lint");
    expect(prepared.loaded?.digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps a bare /name usable, with no request after it", () => {
    const dir = workspace({ lint: skill("lint", "Run the linter.") });

    const prepared = prepareSkillTurn({ workspace: dir, prompt: "/lint" });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    // The skill's own body IS the instruction; an empty user turn would give the
    // model a loaded skill and nothing to do with it.
    expect(prepared.prompt.length).toBeGreaterThan(0);
    expect(prepared.contextPlugins).toHaveLength(1);
  });

  it("leaves an ordinary prompt completely alone", () => {
    const dir = workspace({ lint: skill("lint", "Run the linter.") });

    const prepared = prepareSkillTurn({ workspace: dir, prompt: "please lint this" });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.prompt).toBe("please lint this");
    expect(prepared.contextPlugins, "no skill is loaded for a plain message").toEqual([]);
    expect(prepared.loaded).toBeUndefined();
  });
});

describe("an unknown skill stops the turn", () => {
  it("refuses rather than sending the typo to the model", () => {
    // A user who typed `/lnit` meant a skill. Running the turn anyway would
    // spend a request on an instruction-shaped string nobody resolved, and the
    // model would most likely apologise for a command it never had.
    const dir = workspace({ lint: skill("lint", "Run the linter.") });

    const prepared = prepareSkillTurn({ workspace: dir, prompt: "/lnit now" });

    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;
    expect(prepared.reason).toContain("lnit");
    expect(prepared.reason, "and says what there is").toContain("lint");
  });

  it("says so when there are no skills at all", () => {
    const dir = workspace();

    const prepared = prepareSkillTurn({ workspace: dir, prompt: "/lint" });

    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;
    expect(prepared.reason).toMatch(/no skills/i);
  });

  it("reports a malformed skill instead of hiding it behind 'unknown'", () => {
    // The worst version of this is an operator who wrote a skill, typed its
    // name, and was told it does not exist.
    const dir = workspace({ lint: "no frontmatter\n" });

    const prepared = prepareSkillTurn({ workspace: dir, prompt: "/lint" });

    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;
    expect(prepared.reason).toMatch(/frontmatter/i);
    expect(prepared.reason, "and names the file").toContain("SKILL.md");
  });
});

describe("where skills are looked for", () => {
  it("reads the workspace layer", () => {
    const dir = workspace();
    expect(workspaceSkillRoots(dir).some((r) => r.includes(join(".amc", "skills")))).toBe(true);
  });
});

describe("loading a skill does not silently drop the workspace's own instructions", () => {
  it("keeps the default instruction context alongside a skill", () => {
    // `agentPromptProfile` resolves `options.contextPlugins ?? defaultContextPlugins(...)`,
    // so SUPPLYING plugins REPLACES the defaults -- and the default is the
    // AGENTS.md / CLAUDE.md loader. Handing skills in through that door would
    // have removed the workspace's own instructions every time a skill loaded,
    // and nothing would have said so. `extraContextPlugins` adds instead.
    const dir = workspace({ lint: skill("lint", "Run the linter.") });
    const prepared = prepareSkillTurn({ workspace: dir, prompt: "/lint" });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    const withSkill = agentPromptProfile({
      workspace: dir,
      agentId: "default",
      extraContextPlugins: prepared.contextPlugins
    });
    const without = agentPromptProfile({ workspace: dir, agentId: "default" });

    const names = withSkill.contextPlugins.map((p) => p.name);
    expect(names, "the skill is there").toContain("skill:lint");
    for (const base of without.contextPlugins.map((p) => p.name)) {
      expect(names, `${base} survived`).toContain(base);
    }
  });

  it("still lets a caller REPLACE the defaults deliberately", () => {
    // The existing meaning of `contextPlugins` is unchanged: a caller that wants
    // the defaults gone can still say so, and a pinned system prompt relies on
    // exactly that.
    const dir = workspace();
    const profile = agentPromptProfile({ workspace: dir, agentId: "default", contextPlugins: [] });
    expect(profile.contextPlugins).toEqual([]);
  });
});
