import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { initWorkspaceWithoutActionPolicy } from "./helpers/actionPolicyFixtures.js";

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
  it("still reads the line-parser descriptions skills were written with when YAML cannot (skeptic: regression)", () => {
    expect(parseSkillFrontmatter("name: deploy\ndescription: Deploy: ships the app to prod")).toEqual({ fields: { name: "deploy", description: "Deploy: ships the app to prod" } });
    expect(parseSkillFrontmatter("name: x\ndescription: *important* tool")).toEqual({ fields: { name: "x", description: "*important* tool" } });
    expect(parseSkillFrontmatter("name: x\ndescription: #1 helper\ndisallowed-tools: [bash]")).toEqual({ fields: { name: "x", description: "#1 helper", disallowedTools: ["bash"] } });
    expect(parseSkillFrontmatter("name: x\ndescription: `code` and @mentions\narguments:\n  - a")).toEqual({ fields: { name: "x", description: "`code` and @mentions", argumentNames: ["a"] } });
    // The fallback does not reopen what both readers refuse: a repeated key, a block list under a broken line.
    expect(parseSkillFrontmatter("name: a\ndescription: *x\nname: b")).toMatchObject({ reason: expect.stringContaining("not valid YAML") });
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
    expect(() => renderSkillBody("$ARGUMENTS", { rest: "x".repeat(20_000), workspace: "/ws" })).toThrow(/exceed/);
    expect(() => renderSkillBody("$1", { rest: Array.from({ length: 40 }, (_, i) => `w${i}`).join(" "), workspace: "/ws" })).toThrow(/more than 32/);
  });
  it("tokenizes only when a placeholder needs words, never refuses the prompt itself, and leaves a bare /name's body as written (skeptic: regression)", () => {
    const forty = Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ");
    // No placeholder: apostrophes, 40 words and 17 KB pass through untouched.
    for (const rest of ["don't write anything, just summarise", forty, "y".repeat(17_000)]) {
      expect(renderSkillBody("Read only.", { rest, workspace: "/ws" })).toMatchObject({ substituted: false, text: "Read only.", argumentsText: rest });
    }
    // $ARGUMENTS needs no words: an unbalanced quote is inserted as typed; the byte cap still bounds what is substituted.
    expect(renderSkillBody("Fix: $ARGUMENTS", { rest: "the user's login bug", workspace: "/ws" }).text).toBe("Fix: the user's login bug");
    expect(renderSkillBody("Fix: $ARGUMENTS", { rest: forty, workspace: "/ws" }).text).toBe(`Fix: ${forty}`);
    // $1 needs words: quotes that do not balance fall back to whitespace words instead of refusing.
    expect(renderSkillBody("First: $0, second: $1", { rest: "fix the user's bug", workspace: "/ws" }).text).toBe("First: fix, second: the");
    // A bare /awk keeps the author's $1.
    expect(renderSkillBody("Run awk '{print $1}' then $ARGUMENTS", { rest: "", workspace: "/ws" })).toMatchObject({ substituted: false, text: "Run awk '{print $1}' then $ARGUMENTS" });
    const root = workspace();
    skillDir(root, "readonly", "name: readonly\ndescription: no writes", "Read only.");
    expect(prepareSkillTurn({ workspace: root, prompt: "/readonly don't write anything, just summarise" })).toMatchObject({ ok: true, prompt: "don't write anything, just summarise" });
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
  it("states the rendered digest when only path placeholders were resolved, and says no argument was inserted", () => {
    const root = workspace();
    skillDir(root, "paths", "name: paths\ndescription: read a file", "Read ${AMC_SKILL_DIR}/notes.md first.");
    const prepared = prepareSkillTurn({ workspace: root, prompt: "/paths go" });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const rendering = renderSkillBody(prepared.loaded!.body, { rest: "go", skillDirectory: prepared.loaded!.directory!, workspace: root });
    expect(rendering.substituted).toBe(false);
    expect(rendering.text).toContain(`Read ${prepared.loaded!.directory!}/notes.md first.`);
    const text = renderSkillContext(prepared.loaded!, rendering);
    expect(text).toContain(`placeholders were resolved (no operator argument was inserted); the rendered text below has sha256 ${rendering.renderedSha256}.`);
    expect(text).not.toContain("Operator-supplied arguments");
    // A bare /paths leaves the body as written, so the frame names only the file's digest.
    expect(renderSkillContext(prepared.loaded!, renderSkillBody(prepared.loaded!.body, { rest: "", workspace: root }))).not.toContain("rendered text");
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
    const tool = (name: string) => defineTool({ name, description: name, actionClass: "READ_ONLY", parameters: { type: "object" }, body: () => ({ ok: true, output: "" }) });
    for (const name of ["fs.read", "fs.write"]) registry.define(tool(name));
    expect(applySkillToolRestriction(registry, turn, "default")).toBeUndefined();
    expect([...registry.visible("default").keys()]).toEqual(["fs.read"]);
    // S8, in the run path's real order: the kernel defines `delegate` AFTER the skill restricted the registry. A delegated
    // child would compose its own toolset without the skill, so the name is denied before it exists.
    for (const name of ["delegate", "workflow"]) registry.define(tool(name));
    expect([...registry.visible("default").keys()]).toEqual(["fs.read"]);
    // The Code Mode transport is refused with a reason, not a throw that would leave the toolset open.
    skillDir(root, "nocode", "name: nocode\ndescription: x\ndisallowed-tools: [run_code]", "Body.");
    expect(applySkillToolRestriction(registry, prepareSkillTurn({ workspace: root, prompt: "/nocode" }), "default")).toContain("disallows run_code, the Code Mode transport");
    // Any other restriction failure is a refusal too, never a throw that skips the caller's close-the-toolset path.
    const throwing = { visible: () => new Map([["fs.write", {}]]), restrict: () => { throw new Error("boom"); } };
    expect(applySkillToolRestriction(throwing, turn, "default")).toContain("could not be applied (boom)");
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
  it("agent-loop run --delegate cannot hand a skill's disallowed tool back through a delegated child (S8)", async () => {
    const root = workspace();
    const home = realpathSync(mkdtempSync(join(tmpdir(), "amc-skill-home-"))); directories.push(home);
    const controls = realpathSync(mkdtempSync(join(tmpdir(), "amc-skill-controls-"))); directories.push(controls);
    process.env["AMC_CONTROL_CHECKPOINT_DIR"] = controls; process.env["AMC_VAULT_PASSPHRASE"] = "skill-delegate-fixture";
    initWorkspaceWithoutActionPolicy({ workspacePath: root, trustBoundaryMode: "isolated" }); // with the default policy every EXECUTE is simulated
    initBudgets(root, "default"); writeRuntimeFirewallPolicy({ workspace: root, mode: "observe" });
    const tools = loadToolsConfig(root);
    initToolsConfig(root, { ...tools, tools: { ...tools.tools, allowedTools: [...tools.tools.allowedTools, { name: "delegate", actionClass: "READ_ONLY" }] } });
    skillDir(root, "readonly", "name: readonly\ndescription: no writes\ndisallowed-tools: [fs.write]", "Read only.");
    const childWrite = JSON.stringify({ tool: "fs.write", arguments: { path: "workspace/output/child.txt", content: "written by child" } });
    const delegateCall = JSON.stringify({ tool: "delegate", arguments: { runAs: "writer", goal: childWrite } });
    const cwd = process.cwd(); process.chdir(root);
    try {
      const invoke = async (prompt: string) => {
        const out: string[] = [], errors: string[] = [], failures: number[] = [];
        const program = new Command(); program.exitOverride();
        registerAgentCommands(program, { log: line => out.push(line), error: line => errors.push(line), fail: () => failures.push(1) });
        await program.parseAsync(["node", "amc", "agent-loop", "run", prompt, "--tools", "workspace", "--delegate", "--credentials-home", home, "--json"]);
        return { out, errors, failures };
      };
      // Control: without the skill the stub parent delegates and the stub child writes the file.
      const control = await invoke(delegateCall);
      expect(control.failures, control.errors.join("\n")).toEqual([]);
      expect(existsSync(join(root, "workspace", "output", "child.txt"))).toBe(true);
      rmSync(join(root, "workspace", "output", "child.txt"));
      // With the skill, `delegate` is withheld: the turn runs, nothing writes.
      const guarded = await invoke(`/readonly ${delegateCall}`);
      expect(guarded.failures, guarded.errors.join("\n")).toEqual([]);
      expect(JSON.parse(guarded.out.at(-1)!)).toMatchObject({ endings: [{ turn: 1 }] });
      expect(existsSync(join(root, "workspace", "output", "child.txt"))).toBe(false);
    } finally { process.chdir(cwd); delete process.env["AMC_CONTROL_CHECKPOINT_DIR"]; delete process.env["AMC_VAULT_PASSPHRASE"]; }
  }, 120_000);
});
