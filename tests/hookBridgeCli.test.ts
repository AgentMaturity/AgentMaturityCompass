import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerHookIntegrationCommands } from "../src/adapters/hookIntegrationCli.js";
import { installHookIntegration } from "../src/adapters/hookIntegration.js";
import { writeStudioState } from "../src/studio/studioState.js";
import { initWorkspace } from "../src/workspace.js";

/** `amc connect hooks …` in process: the Bridge a hook names is this workspace's own Studio, never a guessed port. */
const roots: string[] = [];
const cwd = process.cwd();
afterEach(() => {
  process.chdir(cwd);
  process.exitCode = undefined;
  vi.restoreAllMocks();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-hook-bridge-cli-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated", witnessing: false });
  process.chdir(root);
  return root;
}

async function run(args: string[]): Promise<{ out: string; error: unknown }> {
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => { lines.push(stripVTControlCharacters(parts.join(" "))); });
  const program = new Command().exitOverride();
  registerHookIntegrationCommands(program.command("connect"), () => undefined);
  try {
    await program.parseAsync(["node", "amc", "connect", "hooks", ...args]);
    return { out: lines.join("\n"), error: null };
  } catch (error) {
    return { out: lines.join("\n"), error };
  }
}

const runningStudio = (ws: string, apiPort: number) => writeStudioState(ws, { pid: process.pid, startedTs: 1, apiPort, gatewayPort: 3210, proxyPort: 0,
  dashboardPort: 4173, host: "127.0.0.1", currentAgent: "default", vaultUnlocked: true, untrustedConfig: false, logFile: "x" });

describe("connect hooks install names this workspace's Bridge", () => {
  it("refuses without a running Studio here or --bridge-url, instead of writing port 3212", async () => {
    workspace();
    const { error } = await run(["install", "--provider", "claude-code", "--dry-run"]);
    expect(String(error)).toContain("Start AMC here first: amc up");
  });

  it("writes the running Studio's port into the hook", async () => {
    const ws = workspace();
    runningStudio(ws, 63742);
    const { out, error } = await run(["install", "--provider", "codex", "--dry-run", "--json"]);
    expect(error).toBeNull();
    expect(out).toContain("would-create");
  });

  it("status reports a hook that sends to another port than this workspace's Studio, with the fix", async () => {
    const ws = workspace();
    installHookIntegration({ workspace: ws, provider: "claude-code", agentId: "default", bridgeBase: "http://127.0.0.1:3212" });
    runningStudio(ws, 63742);
    const { out } = await run(["status", "--provider", "claude-code"]);
    expect(out).toContain("this workspace's Studio listens on http://127.0.0.1:63742");
    expect(out).toContain("amc connect hooks install --provider claude-code --mode observe");
    expect(process.exitCode).toBe(1);
    const health = await run(["health", "--provider", "claude-code"]);
    expect(health.out).toContain("listens on http://127.0.0.1:63742");
  });
});
