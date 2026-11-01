import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, test, vi } from "vitest";
import { getWorkspaceScope } from "../src/enforce/evidenceEmitter.js";

/**
 * `amc demo run` against a running gateway called runDemo outside any workspace scope, so its bridge residency check
 * and lease verification fell back to the process cwd instead of the workspace the CLI issued the lease for.
 */
const seen: Array<string | undefined> = [];
vi.mock("../src/demo/demoRun.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/demo/demoRun.js")>()),
  startDemoUpstream: async () => ({ baseUrl: "http://127.0.0.1:1", close: async () => {} }),
  runDemo: async () => {
    seen.push(getWorkspaceScope());
    return { durationMs: 1, requestsSent: 0 };
  }
}));
vi.mock("../src/leases/leaseCli.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/leases/leaseCli.js")>()),
  ensureLeaseRevocationStore: () => {},
  issueLeaseForCli: () => ({ token: "demo-lease" })
}));

const cwd = process.cwd();
let dir = "";
afterEach(() => {
  process.chdir(cwd);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("amc demo run against a running gateway", () => {
  test("runs the scripted traffic inside the CLI workspace scope", async () => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-demo-scope-")));
    process.chdir(dir);
    vi.stubGlobal("fetch", async () => new Response("{}"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { registerLateStageCliCommands } = await import("../src/cli-late-stage-commands.js");
    const program = new Command("amc").exitOverride();
    const demo = program.command("demo");
    registerLateStageCliCommands({
      program, activeAgent: () => "default", demo, dashboard: program.command("dashboard"),
      watch: program.command("watch"), monitor: program.command("monitor"), integrations: program.command("integrations"),
      openExternalUrl: () => false
    });
    await program.parseAsync(["node", "amc", "demo", "run", "--gateway", "http://127.0.0.1:2", "--json"]);
    expect(seen).toEqual([resolve(dir)]);
  });
});
