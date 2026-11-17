/**
 * `amc budgets init|sign|verify|status|reset` (src/cli-budget-commands.ts) parsed in-process through commander, in a
 * temporary workspace (process.cwd is replaced, never changed). process.exit throws; process.exitCode is restored.
 */
import { appendFileSync, cpSync, mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { Command } from "commander";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { registerBudgetCommands } from "../src/cli-budget-commands.js";
import { budgetsPath, verifyBudgetsConfigSignature } from "../src/budgets/budgets.js";
import { initWorkspaceWithoutActionPolicy } from "./helpers/actionPolicyFixtures.js";

const exitSentinel = new Error("process.exit called");
const roots: string[] = [];
let workspace: string;
let savedExitCode: typeof process.exitCode;
let template: string;

async function run(...args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { out.push(stripVTControlCharacters(a.join(" "))); });
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => { err.push(stripVTControlCharacters(a.join(" "))); });
  const exit = vi.spyOn(process, "exit").mockImplementation(() => { throw exitSentinel; });
  const program = new Command().name("amc").exitOverride();
  registerBudgetCommands(program);
  let exited = false;
  try {
    await program.parseAsync(["node", "amc", "budgets", ...args]);
  } catch (error) {
    if (error !== exitSentinel) throw error;
    exited = true;
  }
  const result = { out, err, exited, exitArg: exit.mock.calls[0]?.[0], exitCode: process.exitCode };
  process.exitCode = savedExitCode;
  vi.mocked(console.log).mockRestore();
  vi.mocked(console.error).mockRestore();
  exit.mockRestore();
  return result;
}

// Setting a workspace up is slow under load: do it once and give each test a copy.
beforeAll(() => {
  template = mkdtempSync(join(tmpdir(), "amc-budget-cli-template-"));
  roots.push(template);
  initWorkspaceWithoutActionPolicy({ workspacePath: template, trustBoundaryMode: "isolated" });
}, 120_000);

beforeEach(() => {
  savedExitCode = process.exitCode;
  workspace = mkdtempSync(join(tmpdir(), "amc-budget-cli-"));
  roots.push(workspace);
  cpSync(template, workspace, { recursive: true });
  vi.spyOn(process, "cwd").mockReturnValue(workspace);
});
afterEach(() => {
  process.exitCode = savedExitCode;
  vi.restoreAllMocks();
});
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("budgets init, verify and sign", () => {
  it("init writes signed budgets for the agent and verify accepts them", async () => {
    const init = await run("init", "--agent", "helper");
    expect(init.out[0]).toBe(`Budgets initialized: ${budgetsPath(workspace)}`);
    expect(init.out[1]).toMatch(/^Signature: .+budgets\.yaml\.sig$/);
    const verify = await run("verify");
    expect(verify.out).toEqual(["Budgets signature valid"]);
    expect(verify.exited).toBe(false);
  });

  it("verify names the reason and exits 1 when the policy was edited after signing", async () => {
    await run("init");
    appendFileSync(budgetsPath(workspace), "\n# edited by hand\n");
    const verify = await run("verify");
    expect(verify.exited).toBe(true);
    expect(verify.exitArg).toBe(1);
    expect(verify.out[0]).toMatch(/^Invalid budgets signature: .+/);
    expect(verify.out[0]).not.toContain("unknown");
  });

  it("sign re-signs the reviewed limits without changing them, in plain and JSON form", async () => {
    await run("init");
    appendFileSync(budgetsPath(workspace), "\n# reviewed\n");
    const plain = await run("sign");
    expect(plain.out[0]).toMatch(/^Reviewed budgets signed: .+budgets\.yaml\.sig$/);
    expect(verifyBudgetsConfigSignature(workspace).valid).toBe(true);
    const json = await run("sign", "--json");
    expect(JSON.parse(json.out[0]!)).toMatchObject({ ok: true, configPath: budgetsPath(workspace) });
    expect(json.exitCode).toBe(savedExitCode);
  });

  it("sign refuses when there is no budgets file, with exit code 1, in plain and JSON form", async () => {
    try { unlinkSync(budgetsPath(workspace)); } catch { /* init may not have written one */ }
    const plain = await run("sign");
    expect(plain.err).toEqual(["Budget signing refused. Review the existing .amc/budgets.yaml limits and local signing access, then retry budgets sign."]);
    expect(plain.exitCode).toBe(1);
    const json = await run("sign", "--json");
    expect(JSON.parse(json.out[0]!)).toEqual({ ok: false, code: "BUDGET_SIGNING_REFUSED", message: plain.err[0] });
    expect(json.exitCode).toBe(1);
  });
});

describe("budgets status", () => {
  it("prints the status JSON and exits normally when nothing blocks", async () => {
    await run("init");
    const status = await run("status", "--agent", "default");
    const parsed = JSON.parse(status.out[0]!) as { ok: boolean; budgetConfigValid: boolean };
    expect(parsed).toMatchObject({ ok: true, budgetConfigValid: true });
    expect(status.err).toEqual([]);
    expect(status.exited).toBe(false);
  });

  it("keeps JSON on stdout and explains the block on stderr, exiting 1, when the signature is invalid", async () => {
    await run("init");
    appendFileSync(budgetsPath(workspace), "\n# tampered\n");
    const status = await run("status", "--agent", "default");
    expect(JSON.parse(status.out[0]!)).toMatchObject({ ok: false, reasons: ["budgets config signature invalid"] });
    expect(status.err[0]).toBe("Budget for agent default is blocking: budgets config signature invalid.");
    expect(status.err.slice(1).every((line) => line.startsWith("Next: "))).toBe(true);
    expect(status.err.length).toBeGreaterThan(1);
    expect(status.exitArg).toBe(1);
  });
});

describe("budgets reset", () => {
  it("asks for --day or --accept-unknown and sets exit code 1 when given neither", async () => {
    const reset = await run("reset", "--agent", "default");
    expect(reset.err).toEqual(["Give --day <yyyy-mm-dd> to record a reset, or --accept-unknown to accept earlier unknown model usage."]);
    expect(reset.exitCode).toBe(1);
    expect(reset.out).toEqual([]);
  });

  it("records a budget-day reset", async () => {
    await run("init");
    const reset = await run("reset", "--agent", "default", "--day", "2026-11-17");
    expect(reset.out[0]).toMatch(/^Budget reset logged: \S+$/);
    expect(reset.exitCode).toBe(savedExitCode);
  });

  it("signs the acceptance of earlier unknown usage into budgets.yaml and keeps the signature valid", async () => {
    await run("init");
    const reset = await run("reset", "--agent", "default", "--accept-unknown");
    expect(reset.out[0]).toMatch(/^Accepted: model requests recorded before \S+ with unknown usage no longer block agent default\.$/);
    expect(reset.out[1]).toMatch(/^Signed into budgets\.perAgent\.\S+\.acceptUnknownUsageBefore in \.amc\/budgets\.yaml\./);
    expect(verifyBudgetsConfigSignature(workspace).valid).toBe(true);
  });

  it("reports why the acceptance could not be signed and sets exit code 1", async () => {
    try { unlinkSync(budgetsPath(workspace)); } catch { /* no budgets file yet */ }
    const reset = await run("reset", "--agent", "default", "--accept-unknown");
    expect(reset.err[0]).toMatch(/^Could not sign the acceptance: .+/);
    expect(reset.exitCode).toBe(1);
  });
});
