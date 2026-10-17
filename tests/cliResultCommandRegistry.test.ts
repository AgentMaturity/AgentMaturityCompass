import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NON_RESULT_COMMANDS, RESULT_COMMANDS, RESULT_COMMAND_BY_PATH } from "../src/cli/resultCommandRegistry.js";
import type { CliCommandInventoryEntry } from "../src/cliUx.js";

const projectRoot = resolve(process.cwd());
const hooksUrl = pathToFileURL(join(projectRoot, "dist/cli/claimLabelHooks.js")).href;
const outputUrl = pathToFileURL(join(projectRoot, "dist/cli/claimOutput.js")).href;
const roots: string[] = [];
const resultKeywords = /score|level|verdict|complian|certif|passport|attest|assurance|bundle|readiness|benchmark|badge|leaderboard/i;
const fallbackLine = "Claim: not labelled — treat as self-reported";
const emptyClaimLine = "Claim: Self-reported · Result: not evaluated (no evidence events were recorded) · Evidence: incomplete · Enforcement: none · Review: pending · Applicability: applicable";

function child(args: string[], strict: boolean) {
  const major = process.versions.node.split(".")[0];
  if (major !== "22" && major !== "24") {
    throw new Error(`CLI qualification requires Node 22 or 24 before importing the native CLI; got ${process.version}`);
  }
  const root = mkdtempSync(join(tmpdir(), "amc-result-command-registry-"));
  roots.push(root);
  const cwd = join(root, "workspace");
  const home = join(root, "home");
  mkdirSync(cwd);
  mkdirSync(home);
  return spawnSync(process.execPath, args, {
    cwd,
    env: {
      PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`,
      HOME: home,
      NO_COLOR: "1",
      AMC_CONTROL_CHECKPOINT_DIR: join(root, "checkpoints"),
      AMC_CLAIM_LABELS_STRICT: strict ? "1" : "0"
    },
    encoding: "utf8",
    timeout: 20_000,
    maxBuffer: 8 * 1024 * 1024
  });
}

function hookCommand(body: string, options: { strict?: boolean; args?: string[] } = {}) {
  // Actual built hooks and output helpers run in another process: exitCode cannot leak into Vitest.
  const script = `
    import { createRequire } from "node:module";
    import { installClaimLabelHooks } from ${JSON.stringify(hooksUrl)};
    import { emitClaimResult, unverifiedClaim } from ${JSON.stringify(outputUrl)};
    const { Command } = createRequire(${JSON.stringify(hooksUrl)})("commander");
    const program = new Command().name("amc");
    program.command("score").command("fail-secure")
      .option("--json")
      .action((opts) => { ${body} });
    installClaimLabelHooks(program);
    await program.parseAsync(["node", "amc", "score", "fail-secure", ...${JSON.stringify(options.args ?? [])}]);
  `;
  return child(["--input-type=module", "--eval", script], options.strict ?? true);
}

function completed(result: ReturnType<typeof child>) {
  expect(result.error, `${result.stdout}\n${result.stderr}`).toBeUndefined();
  expect(result.signal, `${result.stdout}\n${result.stderr}`).toBeNull();
}

afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("result command registry covers the built CLI", () => {
  let inventory: CliCommandInventoryEntry[];

  beforeAll(() => {
    const result = child([join(projectRoot, "dist/cli.js"), "commands", "--json"], true);
    completed(result);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const document = JSON.parse(result.stdout) as { total: number; commands: CliCommandInventoryEntry[] };
    expect(Array.isArray(document.commands)).toBe(true);
    expect(document.total).toBe(document.commands.length);
    expect(document.commands.length).toBeGreaterThan(0);
    inventory = document.commands;
  });

  it("has unique canonical paths and exactly one classification for every keyword description", () => {
    const runtimePaths = inventory.map((command) => command.path);
    expect(new Set(runtimePaths).size).toBe(runtimePaths.length);
    const classifiedPaths = [...RESULT_COMMANDS, ...NON_RESULT_COMMANDS].map((command) => command.path);
    expect(RESULT_COMMANDS.length).toBeGreaterThan(0);
    expect(NON_RESULT_COMMANDS.length).toBeGreaterThan(0);
    expect(new Set(classifiedPaths).size, "duplicate paths within or across the two registries").toBe(classifiedPaths.length);
    for (const path of classifiedPaths) {
      expect(path, "registry paths must be nonempty canonical command names").toBe(path.trim());
      expect(path.length).toBeGreaterThan(0);
      expect(runtimePaths, `registry path absent from the built CLI: ${path}`).toContain(path);
    }
    const keywordCommands = inventory.filter((command) => resultKeywords.test(command.description));
    expect(keywordCommands.length).toBeGreaterThan(0);
    const missing = keywordCommands.filter((command) => !classifiedPaths.includes(command.path));
    expect(missing.map(({ path, description }) => ({ path, description })), "keyword results need a result registration or explicit exclusion").toEqual([]);
  });

  it("keeps the hook index complete and supplies an explicit reason for every exclusion", () => {
    expect(RESULT_COMMAND_BY_PATH.size).toBe(RESULT_COMMANDS.length);
    for (const command of RESULT_COMMANDS) {
      expect(RESULT_COMMAND_BY_PATH.get(command.path)).toBe(command);
      expect(command.producer.trim().length, command.path).toBeGreaterThan(0);
    }
    for (const command of NON_RESULT_COMMANDS) {
      expect(typeof command.reason, command.path).toBe("string");
      expect(command.reason.trim().length, `exclusion needs a reason: ${command.path}`).toBeGreaterThan(0);
    }
  });

  it("installs a postAction hook in the actual CLI entrypoint without changing its inventory output", () => {
    const cliPath = join(projectRoot, "dist/cli.js");
    const cliUrl = pathToFileURL(cliPath).href;
    const script = `
      import { createRequire } from "node:module";
      const { Command } = createRequire(${JSON.stringify(cliUrl)})("commander");
      const hook = Command.prototype.hook;
      let postActions = 0;
      Command.prototype.hook = function (event, listener) {
        if (event === "postAction") postActions++;
        return hook.call(this, event, listener);
      };
      process.argv = [process.execPath, ${JSON.stringify(cliPath)}, "commands", "--json"];
      process.once("beforeExit", () => process.stderr.write("CLAIM_LABEL_POST_ACTION_HOOKS=" + postActions + "\\n"));
      await import(${JSON.stringify(cliUrl)});
    `;
    const result = child(["--input-type=module", "--eval", script], true);
    completed(result);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const count = /CLAIM_LABEL_POST_ACTION_HOOKS=(\d+)/.exec(result.stderr);
    expect(count, result.stderr).not.toBeNull();
    expect(Number(count?.[1])).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(result.stdout).commands).toEqual(inventory);
  });
});

describe("built claim label hooks", () => {
  it("fails a successful unlabelled result with exit 70 and a stderr diagnostic in strict mode", () => {
    const result = hookCommand('console.log("Fixture result");');
    completed(result);
    expect(result.status).toBe(70);
    expect(result.stdout).toBe("Fixture result\n");
    expect(result.stderr).toBe("amc: score fail-secure printed a result without a claim label\n");
  });

  it("adds the self-reported fallback line to successful unlabelled text outside strict mode", () => {
    const result = hookCommand('console.log("Fixture result");', { strict: false });
    completed(result);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`Fixture result\n${fallbackLine}\n`);
    expect(result.stderr).toBe("");
  });

  it("leaves an existing command failure and its exit 2 unchanged", () => {
    const result = hookCommand('console.error("Fixture refused"); process.exitCode = 2;');
    completed(result);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("Fixture refused\n");
  });

  it("accepts the canonical claim printed on real stdout in strict mode", () => {
    const result = hookCommand('emitClaimResult("Fixture result", { value: 17 }, unverifiedClaim("registry-contract-fixture", 0), opts);');
    completed(result);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`Fixture result\n${emptyClaimLine}\n`);
    expect(result.stderr).toBe("");
  });

  it("accepts one JSON document with claim fields and preserves its result fields in strict mode", () => {
    const result = hookCommand('emitClaimResult("Fixture result", { value: 17, details: { retained: true } }, unverifiedClaim("registry-contract-fixture", 0), opts);', { args: ["--json"] });
    completed(result);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain(fallbackLine);
    expect(JSON.parse(result.stdout)).toEqual({
      value: 17,
      details: { retained: true },
      claimKind: "self_reported",
      statusDimensions: {
        applicability: { state: "applicable" },
        evidence: "incomplete",
        result: "not_evaluated",
        enforcement: { state: "none" },
        review: "pending"
      },
      claimLabel: emptyClaimLine
    });
  });
});
