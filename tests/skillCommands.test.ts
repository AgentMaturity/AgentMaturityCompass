import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";
import { buildSkillCatalog, resolveSkillCommand } from "../src/skills/skillCatalog.js";
import { parseSkillFrontmatter } from "../src/skills/skillFrontmatter.js";
import { renderSkillBody, tokenizeSkillArguments } from "../src/skills/skillArguments.js";
import { applySkillToolRestriction, prepareSkillTurn } from "../src/skills/skillTurn.js";
import { renderSkillContext } from "../src/skills/skillPrompt.js";
import { ToolRegistry, defineTool } from "../src/tools/toolRegistry.js";
import { initWorkspace } from "../src/workspace.js";
import { registerAgentCommands } from "../src/cli-agent-commands.js";

/** SH-EXT-05: command files, YAML frontmatter fields, $ARGUMENTS and disallowed-tools. */
const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function workspace(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-skill-commands-")));
  directories.push(root);
  mkdirSync(join(root, ".amc", "skills"), { recursive: true });
  mkdirSync(join(root, ".amc", "commands", "ops"), { recursive: true });
  return root;
}
const file = (front: string, body: string) => `---\n${front}\n---\n${body}\n`;
const skillDir = (root: string, name: string, front: string, body: string, siblings: Record<string, string> = {}) => {
  mkdirSync(join(root, ".amc", "skills", name), { recursive: true });
  writeFileSync(join(root, ".amc", "skills", name, "SKILL.md"), file(front, body));
  for (const [sibling, text] of Object.entries(siblings)) writeFileSync(join(root, ".amc", "skills", name, sibling), text);
};

describe("frontmatter", () => {
  it("reads YAML block lists, booleans and the Claude field names", () => {
    const parsed = parseSkillFrontmatter(["name: deploy", "description: ship it", "argument-hint: '[env] [tag]'", "arguments:", "  - env", "  - tag",
      "disallowed-tools:", "  - bash", "  - fs.write", "allowed-tools: fs.read, grep", "model: claude-x", "user-invocable: false", "disable-model-invocation: true"].join("\n"));
    expect(parsed).toEqual({ fields: { name: "deploy", description: "ship it", argumentHint: "[env] [tag]", argumentNames: ["env", "tag"], disallowedTools: ["bash", "fs.write"],
      allowedTools: ["fs.read", "grep"], model: "claude-x", userInvocable: false, disableModelInvocation: true } });
  });
  it("reports a list that cannot be read instead of restricting nothing", () => {
    expect(parseSkillFrontmatter("name: a\ndescription: b\ndisallowed-tools: { bash: true }")).toEqual({ reason: "disallowed-tools must be a list or a string" });
    expect(parseSkillFrontmatter("name: a\ndescription: b\ndisallowed-tools:\n  - 'has space'")).toEqual({ reason: "disallowed-tools contains an item that is not a tool name" });
    expect(parseSkillFrontmatter("name: a\nname: b")).toMatchObject({ reason: expect.stringContaining("not valid YAML") });
    expect(parseSkillFrontmatter("- a\n- b")).toEqual({ reason: "frontmatter must be a YAML mapping" });
  });
});

describe("command files", () => {
  it("discovers <name>.md and <ns>/<name>.md beside the skills root, with a default description", () => {
    const root = workspace();
    writeFileSync(join(root, ".amc", "commands", "review.md"), file("description: review a file\nargument-hint: '[path]'", "Review $0 carefully."));
    writeFileSync(join(root, ".amc", "commands", "ops", "deploy.md"), file("", "Deploy to $ARGUMENTS.\nSecond line."));
    writeFileSync(join(root, ".amc", "commands", "ops", "notes.txt"), "not a command");
    skillDir(root, "lint", "name: lint\ndescription: run the linter", "Lint.");
    const catalog = buildSkillCatalog([join(root, ".amc", "skills")]);
    expect(catalog.problems).toEqual([]);
    expect(catalog.skills.map(skill => [skill.name, skill.kind, skill.description])).toEqual([["lint", "skill", "run the linter"], ["ops:deploy", "command", "Deploy to $ARGUMENTS."], ["review", "command", "review a file"]]);
    expect(catalog.skills.find(skill => skill.name === "review")?.argumentHint).toBe("[path]");
    expect(resolveSkillCommand(catalog, "/ops:deploy staging now")).toMatchObject({ kind: "skill", rest: "staging now" });
    expect(resolveSkillCommand(catalog, "/ops:deplo")).toMatchObject({ kind: "unknown-skill", name: "ops:deplo" });
    expect(resolveSkillCommand(catalog, "/usr/bin/thing")).toEqual({ kind: "message" });
  });
  it("refuses a frontmatter name that disagrees with the file, a collision with a skill in the same layer, and a bad name", () => {
    const root = workspace();
    writeFileSync(join(root, ".amc", "commands", "lint.md"), file("description: x", "Lint again."));
    writeFileSync(join(root, ".amc", "commands", "other.md"), file("name: different\ndescription: x", "Body."));
    writeFileSync(join(root, ".amc", "commands", "ops", `${"a".repeat(65)}.md`), file("description: x", "Body."));
    skillDir(root, "lint", "name: lint\ndescription: run the linter", "Lint.");
    const catalog = buildSkillCatalog([join(root, ".amc", "skills")]);
    expect(catalog.skills.map(skill => skill.name)).toEqual([]);
    expect(catalog.problems.map(problem => [problem.name, problem.reason])).toEqual([
      ["lint", "command name collides with a skill in the same layer"],
      [`ops:${"a".repeat(65)}`, "command name must be a slash-command segment, or ns:name, of at most 64 characters each"],
      ["other", "frontmatter name \"different\" does not match its file \"other\""]]);
  });
  it("a later layer's command overrides an earlier layer's skill of the same name", () => {
    const lower = workspace(), upper = workspace();
    skillDir(lower, "deploy", "name: deploy\ndescription: lower", "Lower.");
    writeFileSync(join(upper, ".amc", "commands", "deploy.md"), file("description: upper", "Upper."));
    const catalog = buildSkillCatalog([join(lower, ".amc", "skills"), join(upper, ".amc", "skills")]);
    expect(catalog.skills.map(skill => [skill.name, skill.description])).toEqual([["deploy", "upper"]]);
  });
});

describe("$ARGUMENTS", () => {
  it.each([
    ["a b", ["a", "b"]], ["\"error handling\" src/x.ts", ["error handling", "src/x.ts"]], ["'it''s' x", ["its", "x"]],
    ["say \"a \\\"quoted\\\" word\"", ["say", "a \"quoted\" word"]], ["  ", []], ["a\\ b", ["a b"]]
  ])("tokenizes %j", (rest, words) => { expect(tokenizeSkillArguments(rest)).toEqual(words); });
  it("substitutes in one pass with literal values", () => {
    const rendered = renderSkillBody("All: $ARGUMENTS\nFirst: $0 / $ARGUMENTS[1]\nNamed: $topic\nDir: ${AMC_SKILL_DIR} Ws: ${AMC_WORKSPACE}\nLiteral: \\$HOME $unknown $ARGUMENTSX",
      { rest: "\"$0 twice\" second", argumentNames: ["topic"], skillDirectory: "/ws/.amc/skills/s", workspace: "/ws" });
    expect(rendered.text).toBe("All: \"$0 twice\" second\nFirst: $0 twice / second\nNamed: $0 twice\nDir: /ws/.amc/skills/s Ws: /ws\nLiteral: $HOME $unknown $ARGUMENTSX");
    expect(rendered.substituted).toBe(true);
    expect(renderSkillBody("no placeholders", { rest: "x", workspace: "/ws" })).toMatchObject({ substituted: false, text: "no placeholders" });
    expect(() => renderSkillBody("$ARGUMENTS", { rest: "\"open", workspace: "/ws" })).toThrow(/unterminated quote/);
    expect(() => renderSkillBody("$ARGUMENTS", { rest: "x".repeat(20_000), workspace: "/ws" })).toThrow(/exceed/);
  });
  it("prepares a turn whose frame names the file, the arguments and the rendered text, and lists supporting files", () => {
    const root = workspace();
    skillDir(root, "review", "name: review\ndescription: review something\narguments: [focus]", "Focus on $focus in $1.\nSee checklist.md.", { "checklist.md": "- a\n- b" });
    const prepared = prepareSkillTurn({ workspace: root, prompt: "/review \"error handling\" src/x.ts" });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.prompt).toBe("\"error handling\" src/x.ts");
    const skill = prepared.loaded!;
    expect(skill.siblings).toEqual([{ name: "checklist.md", bytes: 7 }]);
    const text = renderSkillContext(skill, { text: "Focus on error handling in src/x.ts.\nSee checklist.md.", substituted: true, argumentsText: "x", argumentsSha256: "b".repeat(64), renderedSha256: "c".repeat(64) });
    expect(text).toContain(`(sha256 ${skill.digest})`); expect(text).toContain("Operator-supplied arguments (sha256 " + "b".repeat(64));
    expect(text).toContain(`Skill directory: ${join(root, ".amc", "skills", "review")}`); expect(text).toContain("checklist.md (7 bytes)");
    expect(text).toContain("Focus on error handling in src/x.ts.");
    // The plugin the loop consumes renders the same way.
    return prepared.contextPlugins[0]!.collect({ turn: 1, step: 1 } as never).then(rendered => { expect(rendered).toContain("Focus on error handling in src/x.ts."); });
  });
  it("refuses a model-only skill on /name", () => {
    const root = workspace();
    skillDir(root, "hidden", "name: hidden\ndescription: model only\nuser-invocable: false", "Body.");
    expect(prepareSkillTurn({ workspace: root, prompt: "/hidden" })).toMatchObject({ ok: false, reason: expect.stringContaining("model-invoked only") });
  });
});

describe("disallowed-tools", () => {
  it("narrows a real registry and refuses a name that is not registered; allowed-tools never widens", () => {
    const root = workspace();
    skillDir(root, "readonly", "name: readonly\ndescription: no writes\ndisallowed-tools: [fs.write]\nallowed-tools: [bash, fs.write]", "Read only.");
    const turn = prepareSkillTurn({ workspace: root, prompt: "/readonly go" });
    expect(turn.ok && turn.disallowedTools).toEqual(["fs.write"]);
    const registry = new ToolRegistry();
    // S8: a delegated child would compose its own toolset without the skill, so delegation is withheld with the denied tool.
    for (const name of ["fs.read", "fs.write", "delegate", "workflow"]) registry.define(defineTool({ name, description: name, actionClass: "READ_ONLY", parameters: { type: "object" }, body: () => ({ ok: true, output: "" }) }));
    expect(applySkillToolRestriction(registry, turn, "default")).toBeUndefined();
    expect([...registry.visible("default").keys()]).toEqual(["fs.read"]);
    skillDir(root, "typo", "name: typo\ndescription: x\ndisallowed-tools: [Write]", "Body.");
    const wrong = prepareSkillTurn({ workspace: root, prompt: "/typo" });
    expect(applySkillToolRestriction(registry, wrong, "default")).toContain("not registered for this run: Write");
    expect([...registry.visible("default").keys()]).toEqual(["fs.read"]);
  });
});

describe("real surface", () => {
  it("agent-loop run resolves a namespaced command file and refuses a disallowed tool it cannot apply", async () => {
    const root = workspace();
    const home = realpathSync(mkdtempSync(join(tmpdir(), "amc-skill-home-"))); directories.push(home);
    initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
    writeFileSync(join(root, ".amc", "commands", "ops", "deploy.md"), file("description: deploy\ndisallowed-tools: [fs.write]", "Deploy $ARGUMENTS."));
    const cwd = process.cwd(); process.chdir(root);
    try {
      const invoke = async (...args: string[]) => {
        const out: string[] = [], errors: string[] = [], failures: number[] = [];
        const program = new Command(); program.exitOverride();
        registerAgentCommands(program, { log: line => out.push(line), error: line => errors.push(line), fail: () => failures.push(1) });
        await program.parseAsync(["node", "amc", "agent-loop", "run", ...args, "--credentials-home", home, "--json"]);
        return { out, errors, failures };
      };
      const listed = await invoke("x", "--list-skills");
      expect(JSON.parse(listed.out.at(-1)!).skills).toMatchObject([{ name: "ops:deploy", kind: "command", disallowedTools: ["fs.write"] }]);
      // Without workspace tools there is no registry to narrow, so the restriction has nothing to apply to and the turn runs.
      const ran = await invoke("/ops:deploy staging");
      expect(ran.failures).toEqual([]);
      expect(JSON.parse(ran.out.at(-1)!)).toMatchObject({ endings: [{ turn: 1 }] });
      const unknown = await invoke("/ops:deplo");
      expect(unknown.failures).toHaveLength(1); expect(unknown.errors.join("\n")).toContain("no skill named \"ops:deplo\"");
    } finally { process.chdir(cwd); }
  }, 60_000);
});
