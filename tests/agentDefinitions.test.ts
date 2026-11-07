import { mkdtempSync, mkdirSync, rmSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  agentDefinitionRoots, agentDefinitionsDigest, applyAgentDefinition, readAgentDefinitions, renderAgentDefinitionPreface,
  resolveAgentDefinition, type AgentDefinition
} from "../src/agent/agentDefinitions.js";

/**
 * Custom agent definitions (SH-ORCH-01): `.amc/agents/<name>.md`, narrowing only.
 *
 * A definition is workspace text. It may take capability away from a child —
 * tools, action classes, lifetime, steps — and may never add any, pick a model,
 * or let a role delegate further. Its body is instructions, so it enters the
 * child as attributed material in front of the goal, never as a system prompt.
 */
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function layer(files: Record<string, string>): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-agents-")));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, `${name}.md`), body, "utf8");
  return dir;
}

const definition = (name: string, fields: Record<string, string> = {}, body = "Review carefully.") =>
  `---\nname: ${name}\ndescription: reviews ${name}\n${Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join("\n")}\n---\n\n${body}\n`;

describe("definitions are discovered as flat <name>.md files", () => {
  it("reads name, description, body and the narrowing fields", () => {
    const root = layer({ reviewer: definition("reviewer", { tools: "fs.read, grep", scope: "READ_ONLY", timeoutMs: "60000", maxSteps: "4", model: "inherit" }) });
    const catalog = readAgentDefinitions([root]);
    expect(catalog.problems).toEqual([]);
    const reviewer = catalog.definitions.get("reviewer")!;
    expect(reviewer.tools).toEqual(["fs.read", "grep"]);
    expect(reviewer.scope).toEqual(["READ_ONLY"]);
    expect(reviewer.timeoutMs).toBe(60000);
    expect(reviewer.maxSteps).toBe(4);
    expect(reviewer.body.trim()).toBe("Review carefully.");
    expect(reviewer.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("lets a later layer (the project) win over an earlier one (the user) by name", () => {
    const user = layer({ reviewer: definition("reviewer", {}, "user body") });
    const project = layer({ reviewer: definition("reviewer", {}, "project body") });
    const catalog = readAgentDefinitions([user, project]);
    expect(catalog.definitions.get("reviewer")!.body.trim()).toBe("project body");
    expect(catalog.definitions.get("reviewer")!.sourcePath).toBe(join(project, "reviewer.md"));
  });

  it("names content, not location, in the digest", () => {
    const a = readAgentDefinitions([layer({ reviewer: definition("reviewer") })]);
    const b = readAgentDefinitions([layer({ reviewer: definition("reviewer") })]);
    const c = readAgentDefinitions([layer({ reviewer: definition("reviewer", {}, "changed") })]);
    expect(agentDefinitionsDigest(a.definitions)).toBe(agentDefinitionsDigest(b.definitions));
    expect(agentDefinitionsDigest(a.definitions)).not.toBe(agentDefinitionsDigest(c.definitions));
  });

  it("ignores non-markdown entries and refuses a symlinked definition", () => {
    const target = layer({ real: definition("real") });
    const root = layer({});
    writeFileSync(join(root, "notes.txt"), "not a definition", "utf8");
    mkdirSync(join(root, "sub"));
    symlinkSync(join(target, "real.md"), join(root, "linked.md"));
    const catalog = readAgentDefinitions([root]);
    expect([...catalog.definitions.keys()]).toEqual([]);
    expect(catalog.problems.map(p => p.name)).toEqual(["linked"]);
    expect(catalog.problems[0]!.reason).toMatch(/symbolic-link/);
  });
});

describe("a definition only narrows", () => {
  const refusal = (file: string): string => {
    const catalog = readAgentDefinitions([layer({ role: file })]);
    expect(catalog.definitions.size).toBe(0);
    return catalog.problems[0]?.reason ?? "";
  };

  it("refuses a name that differs from the file name", () => {
    expect(refusal(definition("other"))).toMatch(/does not match its file name/);
  });

  it("refuses a model other than inherit: a definition cannot pick a route", () => {
    expect(refusal(definition("role", { model: "gpt-5" }))).toMatch(/model must be "inherit"/);
  });

  it("refuses unknown fields rather than silently ignoring a misspelt bound", () => {
    expect(refusal(definition("role", { tool: "fs.read" }))).toMatch(/unknown frontmatter field/);
  });

  it("refuses a role that would delegate: its allowlist does not reach its children", () => {
    expect(refusal(definition("role", { tools: "fs.read, delegate" }))).toMatch(/may not name delegate or workflow/);
    expect(refusal(definition("role", { tools: "workflow" }))).toMatch(/may not name delegate or workflow/);
  });

  it("refuses an empty tools list, an unknown action class and a bad step ceiling", () => {
    expect(refusal(definition("role", { tools: " , " }))).toMatch(/lists no names/);
    expect(refusal(definition("role", { scope: "ROOT" }))).toMatch(/unknown action class/);
    expect(refusal(definition("role", { maxSteps: "0" }))).toMatch(/maxSteps/);
    expect(refusal(definition("role", { timeoutMs: "1e3" }))).toMatch(/timeoutMs/);
  });

  it("refuses a body over 16 KiB", () => {
    expect(refusal(definition("role", {}, "x".repeat(16 * 1024 + 1)))).toMatch(/body exceeds/);
  });
});

describe("applying a definition narrows the request before it is signed", () => {
  const role: AgentDefinition = { name: "reviewer", description: "reviews", body: "Be strict.", sourcePath: "/w/.amc/agents/reviewer.md",
    sha256: "a".repeat(64), tools: ["fs.read"], scope: ["READ_ONLY", "WRITE_LOW"], timeoutMs: 5000, maxSteps: 3 };

  it("intersects scope, takes the shorter lifetime and binds the role", () => {
    const applied = applyAgentDefinition({ runAs: "r", goal: "check", delegationScope: ["READ_ONLY", "DEPLOY"],
      stopConditions: ["max-turns:2", "timeout-ms:9000"] }, role);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.request.delegationScope).toEqual(["READ_ONLY"]);
    expect(applied.request.stopConditions).toEqual(["max-turns:2", "timeout-ms:5000"]);
    expect(applied.request.agentDefinition).toEqual({ name: "reviewer", sha256: "a".repeat(64), tools: ["fs.read"], maxSteps: 3 });
  });

  it("keeps the operator's shorter timeout rather than the definition's longer one", () => {
    const applied = applyAgentDefinition({ runAs: "r", goal: "check", stopConditions: ["timeout-ms:1000"] }, role);
    expect(applied.ok && applied.request.stopConditions).toEqual(["timeout-ms:1000"]);
  });

  it("refuses a definition whose scope shares nothing with the operator's", () => {
    const applied = applyAgentDefinition({ runAs: "r", goal: "check", delegationScope: ["DEPLOY"] }, role);
    expect(applied.ok).toBe(false);
    expect(!applied.ok && applied.reason).toMatch(/names no action class the operator permits/);
  });

  it("puts the attributed body in front of the goal, never in a system prompt", () => {
    const applied = applyAgentDefinition({ runAs: "r", goal: "check the ledger" }, role);
    if (!applied.ok) throw new Error(applied.reason);
    expect(applied.request.goal.startsWith(renderAgentDefinitionPreface(role))).toBe(true);
    expect(applied.request.goal).toContain("not the operator's instructions");
    expect(applied.request.goal).toContain(`sha256 ${"a".repeat(64)}`);
    expect(applied.request.goal.endsWith("# Task\ncheck the ledger")).toBe(true);
  });

  it("resolves only names the operator admitted", () => {
    const definitions = new Map([["reviewer", role]]);
    expect(resolveAgentDefinition(definitions, "reviewer").ok).toBe(true);
    const unknown = resolveAgentDefinition(definitions, "hacker");
    expect(!unknown.ok && unknown.reason).toMatch(/no agent definition named "hacker"; admitted: reviewer/);
    const none = resolveAgentDefinition(undefined, "reviewer");
    expect(!none.ok && none.reason).toMatch(/no agent definitions are admitted/);
  });
});

describe("where definitions are looked for", () => {
  it("maps the skill layers to agents directories: the home, then .amc/agents on the repository chain", () => {
    const dir = layer({});
    mkdirSync(join(dir, ".git"));
    const home = layer({});
    const roots = agentDefinitionRoots(dir, home);
    expect(roots).toEqual([join(home, "agents"), join(dir, ".amc", "agents")]);
  });
});
