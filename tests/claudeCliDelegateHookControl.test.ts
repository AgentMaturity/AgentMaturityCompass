/**
 * AXR-10: a delegated Claude Code child's own tool calls meet AMC's hook control. The runner refuses to spawn unless the
 * workspace's signed Claude Code control hook is installed and its lease admitted for the governing agent (or the
 * caller chose observe-only), and starts the child in the workspace so Claude Code loads that hook. The stand-in
 * `claude` behaves as Claude Code does for one Bash call: it runs the installed SessionStart and PreToolUse hooks and
 * runs the command only if the PreToolUse hook lets it.
 */
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
let workspace = "";
let close: () => Promise<void> = async () => {};

beforeAll(async () => {
  const port = await freePort();
  workspace = claudeWorkspace({ bridgeBase: `http://127.0.0.1:${port}`, register: false });
  const bridge = await startBridgeServer({ workspace, host: "127.0.0.1", port, gatewayBaseUrl: "http://127.0.0.1:1" });
  close = () => bridge.close();
});
afterEach(() => {
  process.env.PATH = priorPath;
});
afterAll(async () => {
  await close();
  removeFixtureWorkspaces();
});

/** A stand-in `claude` (run by this Node, the binary the installation bound) that makes one Bash call under the installed hooks. */
function fakeClaude(dir: string): { readonly sawFile: string } {
  const bin = join(dir, ".fake-bin");
  mkdirSync(bin, { recursive: true });
  const configDir = join(dir, ".fixture-home", ".claude");
  mkdirSync(configDir, { recursive: true });
  const payloads = join(bin, "payloads.json");
  writeFileSync(payloads, JSON.stringify({ configDir, sessionStart: recorded("SessionStart-startup", dir), preToolUse: recorded("PreToolUse-bash", dir) }));
  const sawFile = join(bin, "saw.txt");
  const script = join(bin, "claude");
  writeFileSync(script, `#!${process.execPath}
const fs = require("node:fs"), path = require("node:path"), cp = require("node:child_process");
if (process.argv[2] === "--version") { console.log("2.1.296 (Claude Code)"); process.exit(0); }
const ws = process.cwd();
fs.writeFileSync(${JSON.stringify(sawFile)}, JSON.stringify({ cwd: ws, argv: process.argv.slice(2) }));
const settings = JSON.parse(fs.readFileSync(path.join(ws, ".claude", "settings.local.json"), "utf8"));
const fixtures = JSON.parse(fs.readFileSync(${JSON.stringify(payloads)}, "utf8"));
const env = { ...process.env, CLAUDE_PID: String(process.pid), CLAUDE_CONFIG_DIR: fixtures.configDir, CLAUDE_PROJECT_DIR: ws };
const run = (event, payload) => {
  const handler = settings.hooks[event][0].hooks[0];
  return cp.spawnSync(handler.command, handler.args, { input: JSON.stringify(payload), env, cwd: ws, encoding: "utf8" });
};
run("SessionStart", fixtures.sessionStart);
const pre = run("PreToolUse", fixtures.preToolUse);
if (pre.status === 2 || /"permissionDecision"\\s*:\\s*"deny"/.test(pre.stdout)) {
  console.log("BLOCKED " + (pre.stdout + pre.stderr).replace(/\\s+/g, " ").trim());
} else {
  cp.execSync(fixtures.preToolUse.tool_input.command, { cwd: ws });
  console.log("RAN");
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

const runner = (dir: string, observeOnly?: boolean) => claudeCliForeignRunner({
  workspace: dir, gatewayBase: "http://127.0.0.1:3210", providerRoute: "/anthropic", model: "claude-opus-4-6", timeoutMs: 60_000,
  ...(observeOnly === undefined ? {} : { observeOnly })
});

describe("a delegated Claude Code child under AMC's hook control", () => {
  test("its denied Bash call is blocked by the control hook, and the decision is in the ledger", async () => {
    rmSync(join(workspace, "out.txt"), { force: true });
    const { sawFile } = fakeClaude(workspace);
    const result = await runner(workspace)(ctx());
    expect(result.ok, result.ok ? "" : result.reason).toBe(true);
    expect(result.ok && result.text).toMatch(/^BLOCKED /);
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
});
