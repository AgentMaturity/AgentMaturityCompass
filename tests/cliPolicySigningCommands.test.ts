import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import YAML from "yaml";
import { registerBudgetCommands } from "../src/cli-budget-commands.js";
import { registerToolsCommands } from "../src/cli-tools-commands.js";
import { budgetsPath, budgetsSigPath, defaultBudgets, initBudgets, verifyBudgetsConfigSignature } from "../src/budgets/budgets.js";
import { defaultToolsConfig } from "../src/toolhub/toolsSchema.js";
import { toolsConfigPath, toolsConfigSigPath, verifyToolsConfigSignature } from "../src/toolhub/toolhubValidators.js";
import { initWorkspace } from "../src/workspace.js";

let workspace: string;
let previousCwd: string;
let previousExitCode: typeof process.exitCode;
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "native-budget-command-fixture");
  previousCwd = process.cwd(); previousExitCode = process.exitCode;
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-budget-command-")));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(workspace);
  process.chdir(workspace);
  process.exitCode = 0;
});
afterEach(() => {
  process.chdir(previousCwd); process.exitCode = previousExitCode;
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  rmSync(workspace, { recursive: true, force: true });
});

async function sign(command: string): Promise<Record<string, unknown>> {
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  const program = new Command(); registerBudgetCommands(program); registerToolsCommands(program);
  await program.parseAsync([command, "sign", "--json"], { from: "user" });
  expect(output).toHaveBeenCalledOnce();
  return JSON.parse(String(output.mock.calls[0]?.[0])) as Record<string, unknown>;
}

const policies = [
  {
    command: "budgets", path: budgetsPath, sigPath: budgetsSigPath, verify: verifyBudgetsConfigSignature,
    error: "BUDGET_SIGNING_REFUSED", malformed: "budgets: [",
    invalid: "budgets:\n  version: 1\n  perAgent:\n    default:\n      daily:\n        maxLlmRequests: -1\n",
    reviewed() {
      const config = defaultBudgets(); config.budgets.perAgent.default!.daily.maxLlmRequests = 1;
      return "# Reviewed one-request limit\n" + YAML.stringify(config);
    }
  },
  {
    command: "tools", path: toolsConfigPath, sigPath: toolsConfigSigPath, verify: verifyToolsConfigSignature,
    error: "TOOLS_SIGNING_REFUSED", malformed: "tools: [",
    invalid: "tools:\n  version: 1\n  allowedTools:\n    - name: fs.read\n      actionClass: NOT_A_CLASS\n",
    reviewed() {
      const config = defaultToolsConfig();
      config.tools.allowedTools = [{ name: "fs.read", actionClass: "READ_ONLY", allow: { paths: ["./workspace/reviewed.txt"] } }];
      return "# Reviewed single-file read grant\n" + YAML.stringify(config);
    }
  }
];

describe.each(policies)("reviewed $command signing through the real command registrar", (policy) => {
  it("signs reviewed policy without replacing its bytes, comments or scope", async () => {
    const bytes = policy.reviewed();
    writeFileSync(policy.path(workspace), bytes);
    expect(policy.verify(workspace).valid).toBe(false);
    const result = await sign(policy.command);
    expect(result).toEqual({ ok: true, configPath: policy.path(workspace), sigPath: policy.sigPath(workspace) });
    expect(process.exitCode).toBe(0);
    expect(readFileSync(policy.path(workspace), "utf8")).toBe(bytes);
    expect(policy.verify(workspace).valid).toBe(true);
  });

  it.each([policy.malformed, policy.invalid])("refuses malformed or invalid policy without replacing its existing signature", async (body) => {
    const previousSignature = readFileSync(policy.sigPath(workspace));
    writeFileSync(policy.path(workspace), body);
    expect(await sign(policy.command)).toMatchObject({ ok: false, code: policy.error });
    expect(process.exitCode).toBe(1);
    expect(readFileSync(policy.path(workspace), "utf8")).toBe(body);
    expect(readFileSync(policy.sigPath(workspace))).toEqual(previousSignature);
    expect(policy.verify(workspace).valid).toBe(false);
  });

  it("refuses a missing policy without initializing defaults or a signature", async () => {
    unlinkSync(policy.path(workspace)); unlinkSync(policy.sigPath(workspace));
    expect(await sign(policy.command)).toMatchObject({ ok: false, code: policy.error });
    expect(process.exitCode).toBe(1);
    expect(existsSync(policy.path(workspace))).toBe(false);
    expect(existsSync(policy.sigPath(workspace))).toBe(false);
  });
});
