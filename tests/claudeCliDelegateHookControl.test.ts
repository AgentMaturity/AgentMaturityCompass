/**
 * AXR-10: a delegated Claude Code child's own tool calls meet AMC's hook control. The runner refuses to spawn unless the
 * workspace's signed Claude Code control hook is installed and its lease admitted for the governing agent (or the
 * caller chose observe-only), and starts the child in the workspace so Claude Code loads that hook. The stand-in
 * `claude` behaves as Claude Code does for one Bash call: it runs the installed SessionStart and PreToolUse hooks and
 * runs the command only if the PreToolUse hook lets it.
 */
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { claudeCliForeignRunner } from "../src/agent/providers/claudeCliProvider.js";
import type { SubagentRunContext } from "../src/agent/subagentSpawn.js";
import { startBridgeServer } from "../src/bridge/bridgeServer.js";
import { openLedger } from "../src/ledger/ledger.js";
import { agentId, claudeWorkspace, recorded } from "./helpers/claudeCodeHookFixtures.js";
import { controlledWorkspace, freePort, removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

const priorPath = process.env.PATH;
const priorConfigDir = process.env.CLAUDE_CONFIG_DIR;
let workspace = "";
let close: () => Promise<void> = async () => {};

beforeAll(async () => {
  const port = await freePort();
  workspace = claudeWorkspace({ bridgeBase: `http://127.0.0.1:${port}`, register: false });
  const bridge = await startBridgeServer({ workspace, host: "127.0.0.1", port, gatewayBaseUrl: "http://127.0.0.1:1" });
  close = () => bridge.close();
  // This machine's own Claude Code settings are not the fixture's.
  process.env.CLAUDE_CONFIG_DIR = join(workspace, ".fixture-home", ".claude");
  mkdirSync(process.env.CLAUDE_CONFIG_DIR, { recursive: true });
});
afterEach(() => {
  process.env.PATH = priorPath;
});
afterAll(async () => {
  if (priorConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = priorConfigDir;
  await close();
  removeFixtureWorkspaces();
});

/**
 * A stand-in `claude` (run by this Node, the binary the installation bound) that makes one tool call under the installed
 * hooks (SessionStart, UserPromptSubmit, then PreToolUse): the recorded Bash call, or a Read of `readPath` (its own tool_use_id). It records its working directory,
 * arguments and environment, and runs the call only if the PreToolUse hook lets it.
 */
function fakeClaude(dir: string, readPath?: string): { readonly sawFile: string } {
  const bin = join(dir, ".fake-bin");
  mkdirSync(bin, { recursive: true });
  const configDir = join(dir, ".fixture-home", ".claude");
  mkdirSync(configDir, { recursive: true });
  const payloads = join(bin, "payloads.json");
  // Each run is a new turn of the session: its own prompt_id.
  const turn = { prompt_id: randomUUID() };
  const preToolUse = readPath === undefined ? { ...recorded("PreToolUse-bash", dir), ...turn }
    : { ...recorded("PreToolUse-read", dir), ...turn, tool_input: { file_path: readPath }, tool_use_id: `toolu_01AmcScriptedRead${Date.now()}` };
  writeFileSync(payloads, JSON.stringify({ configDir, sessionStart: recorded("SessionStart-startup", dir),
    prompt: { ...recorded("UserPromptSubmit-prompt", dir), ...turn }, preToolUse }));
  const sawFile = join(bin, "saw.txt");
  const script = join(bin, "claude");
  writeFileSync(script, `#!${process.execPath}
const fs = require("node:fs"), path = require("node:path"), cp = require("node:child_process");
if (process.argv[2] === "--version") { console.log("2.1.296 (Claude Code)"); process.exit(0); }
const ws = process.cwd();
fs.writeFileSync(${JSON.stringify(sawFile)}, JSON.stringify({ cwd: ws, argv: process.argv.slice(2), env: process.env }));
const settings = JSON.parse(fs.readFileSync(path.join(ws, ".claude", "settings.local.json"), "utf8"));
const fixtures = JSON.parse(fs.readFileSync(${JSON.stringify(payloads)}, "utf8"));
const env = { ...process.env, CLAUDE_PID: String(process.pid), CLAUDE_CONFIG_DIR: fixtures.configDir, CLAUDE_PROJECT_DIR: ws };
const run = (event, payload) => {
  const handler = settings.hooks[event][0].hooks[0];
  return cp.spawnSync(handler.command, handler.args, { input: JSON.stringify(payload), env, cwd: ws, encoding: "utf8" });
};
run("SessionStart", fixtures.sessionStart);
const prompt = run("UserPromptSubmit", fixtures.prompt);
if (prompt.status !== 0) {
  console.log("PROMPT BLOCKED " + (prompt.stdout + prompt.stderr).replace(/\\s+/g, " ").trim());
  process.exit(0);
}
const pre = run("PreToolUse", fixtures.preToolUse);
if (pre.status === 2 || /"permissionDecision"\\s*:\\s*"deny"/.test(pre.stdout)) {
  console.log("BLOCKED " + (pre.stdout + pre.stderr).replace(/\\s+/g, " ").trim());
} else {
  const input = fixtures.preToolUse.tool_input;
  console.log("RAN " + (input.file_path ? fs.readFileSync(input.file_path, "utf8") : cp.execSync(input.command, { cwd: ws, encoding: "utf8" })).trim());
}
`);
  chmodSync(script, 0o755);
  process.env.PATH = `${bin}:${priorPath ?? ""}`;
  return { sawFile };
}

const ctx = (over: Partial<SubagentRunContext> = {}): SubagentRunContext => ({
  continuable: false,
  toolsetAgentId: agentId,
  identity: { governedAs: agentId, runAs: "delegate", depth: 1, parent: agentId },
  childSessionId: `claude-child-${Math.random().toString(16).slice(2)}`,
  goal: "write a file",
  ...over
});

const runner = (dir: string, observeOnly?: boolean, managedSettingsDir: string | null = null) => claudeCliForeignRunner({
  workspace: dir, gatewayBase: "http://127.0.0.1:3210", providerRoute: "/anthropic", model: "claude-opus-4-6", timeoutMs: 60_000,
  managedSettingsDir, ...(observeOnly === undefined ? {} : { observeOnly })
});

/** Spawning is refused, naming `pattern`, and nothing is started. */
async function refusedWith(pattern: RegExp, managedSettingsDir: string | null = null): Promise<void> {
  const { sawFile } = fakeClaude(workspace);
  rmSync(sawFile, { force: true });
  const result = await runner(workspace, undefined, managedSettingsDir)(ctx());
  expect(result.ok ? "" : result.reason).toMatch(pattern);
  expect(existsSync(sawFile), "nothing was started").toBe(false);
}

describe("a delegated Claude Code child under AMC's hook control", () => {
  test("its denied Bash call is blocked by the control hook, and the decision is in the ledger", async () => {
    rmSync(join(workspace, "out.txt"), { force: true });
    const { sawFile } = fakeClaude(workspace);
    const result = await runner(workspace)(ctx());
    expect(result.ok, result.ok ? "" : result.reason).toBe(true);
    expect(result.ok && result.text).toMatch(/^BLOCKED /);
    // AMC's verified deny, not the fail-closed deny of a forwarder that could not verify the Bridge's answer (WP35c).
    expect(result.ok && result.text).toMatch(/AMC policy denied the action: AMC allows a Claude Code Bash command only in its pure form/);
    expect(existsSync(join(workspace, "out.txt")), "the command never ran").toBe(false);
    expect(JSON.parse(readFileSync(sawFile, "utf8")).cwd, "started in the workspace, where the hook is installed").toBe(realpathSync(workspace));
    const ledger = openLedger(workspace);
    try {
      // The Bridge (the parent's side) evaluated the child's call under the signed policies and recorded its deny.
      const rows = ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE meta_json LIKE '%\"claude-code\"%' AND meta_json LIKE '%deny%'").all();
      expect(rows.length, "the Bridge recorded the deny").toBeGreaterThan(0);
    } finally {
      ledger.close();
    }
  }, 120_000);

  test("its allowed call runs, verified without the vault passphrase, which never reaches the child", async () => {
    // WP35c: the forwarder in the child checks the Bridge's signed decision with public keys only; the parent holds the vault.
    expect(process.env.AMC_VAULT_PASSPHRASE, "the parent holds the vault passphrase").toBeTruthy();
    const { sawFile } = fakeClaude(workspace, join(realpathSync(workspace), "workspace", "public.txt"));
    const result = await runner(workspace)(ctx());
    expect(result.ok, result.ok ? "" : result.reason).toBe(true);
    expect(result.ok && result.text.trim(), "the allowed call ran").toBe("RAN public fixture");
    const childEnv = (JSON.parse(readFileSync(sawFile, "utf8")) as { env: Record<string, string> }).env;
    for (const secret of ["AMC_VAULT_PASSPHRASE", "AMC_VAULT_PASSPHRASE_FILE", "AMC_CREDENTIALS_FILE"]) {
      expect(childEnv[secret], `${secret} is not in the child's environment`).toBeUndefined();
    }
    expect(Object.values(childEnv), "the passphrase is under no other name").not.toContain(process.env.AMC_VAULT_PASSPHRASE);
  }, 120_000);

  test("without an installed control hook, the child is not spawned", async () => {
    const bare = controlledWorkspace(agentId);
    const { sawFile } = fakeClaude(bare);
    const result = await runner(bare)(ctx());
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.reason).toMatch(/control hook is not installed/);
    expect(existsSync(sawFile), "nothing was started").toBe(false);
  }, 60_000);

  test("a control hook installed for another agent does not admit this one", async () => {
    const { sawFile } = fakeClaude(workspace);
    rmSync(sawFile, { force: true });
    const result = await runner(workspace)(ctx({ toolsetAgentId: "someone-else" }));
    expect(result.ok ? "" : result.reason).toMatch(/governs claude-controlled, not someone-else/);
    expect(existsSync(sawFile)).toBe(false);
  }, 60_000);

  test("observe-only is an explicit choice that spawns without the control hook", async () => {
    const bare = controlledWorkspace(agentId);
    const { sawFile } = fakeClaude(bare);
    await runner(bare, true)(ctx());
    expect(existsSync(sawFile), "the child was started").toBe(true);
  }, 60_000);

  describe("Claude Code settings that keep AMC's control hook from running refuse the spawn", () => {
    const projectSettings = () => join(workspace, ".claude", "settings.json");
    afterEach(() => rmSync(projectSettings(), { force: true }));

    test("disableAllHooks in the project settings", async () => {
      writeFileSync(projectSettings(), JSON.stringify({ disableAllHooks: true }));
      await refusedWith(/disableAllHooks is true/);
    }, 60_000);

    test("allowManagedHooksOnly without managed settings delivering AMC's hook", async () => {
      const managed = join(workspace, ".fixture-managed");
      mkdirSync(managed, { recursive: true });
      writeFileSync(join(managed, "managed-settings.json"), JSON.stringify({ allowManagedHooksOnly: true }));
      try {
        await refusedWith(/allowManagedHooksOnly is true/, managed);
      } finally {
        rmSync(managed, { recursive: true, force: true });
      }
    }, 60_000);

    test("a foreign PreToolUse hook", async () => {
      writeFileSync(projectSettings(), JSON.stringify({ hooks: { PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: "/bin/true" }] }] } }));
      await refusedWith(/PreToolUse hook .* that is not AMC's/);
    }, 60_000);

    test("an enabled plugin", async () => {
      writeFileSync(projectSettings(), JSON.stringify({ enabledPlugins: { "some-plugin@market": true } }));
      await refusedWith(/enabled plugin/);
    }, 60_000);
  });
});
