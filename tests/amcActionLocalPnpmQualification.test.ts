import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import YAML from "yaml";
import { afterAll, describe, expect, test } from "vitest";

interface Step {
  name: string;
  uses?: string;
  if?: string;
  shell?: string;
  run?: string;
  with?: Record<string, unknown>;
}

interface Action {
  inputs: Record<string, { required: boolean; default: string }>;
  outputs: Record<string, { value: string }>;
  runs: { using: string; steps: Step[] };
}

interface Call {
  tool: string;
  args: string[];
  cwd: string;
  actionPath: string | null;
  stdinSha256?: string;
}

const actionText = readFileSync("amc-action/action.yml", "utf8");
const action = YAML.parse(actionText) as Action;
const install = action.runs.steps.find(step => step.name === "Install AMC CLI");
if (typeof install?.run !== "string") throw new Error("The actual AMC action install run block is required.");
const installBlock = install.run;
const versionExpression = "${{ inputs.amc-version }}";
const inertInstaller = "# Observation-only fixture; installer text is never evaluated.\n";
const roots: string[] = [];
const observations: Array<Record<string, unknown>> = [];
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

// These command observers only record argv/cwd or drain pipeline input. They never install, build, or fetch.
const shim = `#!${process.execPath}
import { appendFileSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { createHash } from "node:crypto";
const tool = basename(process.argv[1]);
const args = process.argv.slice(2);
const stdin = tool === "sh" ? readFileSync(0, "utf8") : null;
const call = { tool, args, cwd: process.cwd(), actionPath: process.env.GITHUB_ACTION_PATH ?? null,
  ...(stdin === null ? {} : { stdinSha256: createHash("sha256").update(stdin).digest("hex") }) };
appendFileSync(process.env.P046_COMMAND_LOG, JSON.stringify(call) + "\\n");
if (tool === "curl") process.stdout.write(${JSON.stringify(inertInstaller)});
const stage = tool === "pnpm" ? args[2] === "install" ? "install" : "build" : tool;
const codes = { install: 41, build: 42, npm: 43, curl: 44, sh: 45 };
process.exit(process.env.P046_FAIL_STAGE === stage ? codes[stage] : 0);
`;

function observe(version: string, failStage = "none", includeActionPath = true) {
  if (!["22", "24"].includes(process.versions.node.split(".")[0]!)) {
    throw new Error("The action shell observer requires a qualified Node 22 or 24 parent runtime.");
  }
  expect(installBlock).toContain(versionExpression);
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-action-observer-")));
  roots.push(root);
  const repository = join(root, "source checkout"), caller = join(root, "unrelated consumer checkout");
  const actionPath = join(repository, "amc-action"), bin = join(root, "observer-bin"), home = join(root, "home");
  for (const dir of [actionPath, caller, bin, home]) mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(join(actionPath, "action.yml"), actionText, { mode: 0o600 });
  for (const tool of ["pnpm", "npm", "curl", "sh"]) writeFileSync(join(bin, tool), shim, { mode: 0o700 });
  const commandLog = join(root, "commands.jsonl");
  const script = installBlock.replaceAll(versionExpression, version);
  const environment = {
    PATH: [bin, dirname(process.execPath), "/usr/bin", "/bin"].join(delimiter),
    HOME: home, CDPATH: caller, P046_COMMAND_LOG: commandLog, P046_FAIL_STAGE: failStage,
    ...(includeActionPath ? { GITHUB_ACTION_PATH: actionPath } : {})
  };
  const result = spawnSync("/bin/bash", ["--noprofile", "--norc", "-c", script], {
    cwd: caller, env: environment, encoding: "utf8", timeout: 10_000, maxBuffer: 64 * 1024
  });
  const calls: Call[] = existsSync(commandLog)
    ? readFileSync(commandLog, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as Call)
    : [];
  observations.push({ version, failStage, includeActionPath, repository, caller, actionPath, calls,
    status: result.status, signal: result.signal, error: result.error?.message ?? null,
    stdout: result.stdout, stderr: result.stderr, actionSha256: sha256(actionText), scriptSha256: sha256(script),
    runtime: process.version, executable: process.execPath, scope: "command observers; no actual installation or build" });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(calls.every(call => call.cwd === caller && call.actionPath === actionPath)).toBe(true);
  return { ...result, calls, repository };
}

afterAll(() => {
  try {
    const evidenceDir = process.env.AMC_P0_46_ACTION_EFFECTS_DIR;
    if (evidenceDir) {
      mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
      writeFileSync(join(evidenceDir, "action-shell-observations.json"), JSON.stringify(observations, null, 2) + "\n", { mode: 0o600 });
    }
  } finally {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  }
});

describe("AMC action local pnpm shell qualification", () => {
  test("preserves local-only pnpm setup, the declared Node 20 default, explicit inputs and outputs", () => {
    expect(action.runs.using).toBe("composite");
    expect(action.runs.steps.slice(0, 3).map(step => step.name)).toEqual(["Set up pnpm", "Set up Node.js", "Install AMC CLI"]);
    expect(action.runs.steps[0]).toMatchObject({ if: "inputs.amc-version == 'local'", uses: "pnpm/action-setup@v4", with: { version: "10.33.0" } });
    expect(action.runs.steps[1]).toMatchObject({ uses: "actions/setup-node@v4", with: { "node-version": "${{ inputs.node-version }}" } });
    expect(install.shell).toBe("bash");
    expect(installBlock.trimStart()).toMatch(/^set -euo pipefail\n/);
    expect(Object.fromEntries(Object.entries(action.inputs).map(([key, value]) => [key, value.default]))).toEqual({
      "agent-id": "default", "target-level": "0", "fail-on-drop": "false", comment: "true", "upload-artifacts": "true",
      "node-version": "20", "amc-version": "1.2.0", "working-directory": ".", "answers-file": ""
    });
    expect(Object.values(action.inputs).every(input => input.required === false)).toBe(true);
    expect(Object.fromEntries(Object.entries(action.outputs).map(([key, value]) => [key, value.value]))).toEqual({
      score: "${{ steps.run-amc.outputs.score }}", level: "${{ steps.run-amc.outputs.level }}",
      passed: "${{ steps.gate.outputs.passed }}", "result-json": "${{ steps.run-amc.outputs.result_path }}"
    });
  });

  test("installs frozen dependencies, builds, then globally installs the action repository from an unrelated caller cwd", () => {
    const result = observe("local");
    expect(result.status).toBe(0);
    expect(result.calls.map(({ tool, args }) => ({ tool, args }))).toEqual([
      { tool: "pnpm", args: ["--dir", result.repository, "install", "--frozen-lockfile"] },
      { tool: "pnpm", args: ["--dir", result.repository, "run", "build"] },
      { tool: "npm", args: ["install", "-g", result.repository] }
    ]);
  });

  test.each([{ stage: "install", status: 41, calls: 1 }, { stage: "build", status: 42, calls: 2 }, { stage: "npm", status: 43, calls: 3 }])(
    "propagates $stage failure and prevents subsequent install commands", ({ stage, status, calls }) => {
      const result = observe("local", stage);
      expect(result.status).toBe(status);
      expect(result.calls).toHaveLength(calls);
      expect(result.calls.map(call => call.tool)).toEqual(["pnpm", "pnpm", "npm"].slice(0, calls));
    }
  );

  test.each(["latest", "1.2.1", "LOCAL", ""])("refuses unsupported input %j before package or release commands", version => {
    const result = observe(version);
    expect(result.status).toBe(1);
    expect(result.calls).toEqual([]);
    expect(result.stderr).toBe("Unsupported AMC release input. This preview action currently verifies only 1.2.0 or local.\n");
  });

  test("refuses a missing action path before executing package commands", () => {
    const result = observe("local", "none", false);
    expect(result.status).not.toBe(0);
    expect(result.calls).toEqual([]);
    expect(result.stderr).toContain("GITHUB_ACTION_PATH: unbound variable");
  });

  test.each([{ stage: "none", status: 0 }, { stage: "curl", status: 44 }, { stage: "sh", status: 45 }])(
    "preserves release 1.2.0 without pnpm and propagates pipeline $stage status", ({ stage, status }) => {
      const result = observe("1.2.0", stage);
      expect(result.status).toBe(status);
      expect(result.calls.map(call => call.tool).sort()).toEqual(["curl", "sh"]);
      expect(result.calls.find(call => call.tool === "curl")?.args).toEqual(["-fsSL", "https://agentmaturity.co/install.sh"]);
      expect(result.calls.find(call => call.tool === "sh")).toMatchObject({ args: [], stdinSha256: sha256(inertInstaller) });
    }
  );
});
