import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../dist/workspace.js";
import { openLedger } from "../dist/ledger/ledger.js";
import { initBudgets } from "../dist/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../dist/runtime/firewall.js";
import { agentToolset } from "../dist/agent/agentToolset.js";
import { insideWorkspace } from "../dist/tools/builtin/fsTools.js";
import { walkWorkspace } from "../dist/tools/builtin/workspaceWalk.js";
import { protectedPathReason } from "../dist/toolhub/protectedPaths.js";
import { pathAllowedByPatterns } from "../dist/toolhub/toolhubValidators.js";

/**
 * `.amc` and `.git` are protected by NAME, and on a case-insensitive volume
 * (the macOS and Windows default) `.AMC` is the same directory. The grep and
 * glob `path` argument is model-chosen, so an exact-case segment test let a
 * prompt-injected `grep {path:".AMC/studio"}` print the Studio admin token.
 */
const PASS = "protected-segment-case-passphrase";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  dirs.push(dir);
  return dir;
}

/** Measured, not assumed from the platform: APFS and NTFS can both be formatted either way. */
function caseInsensitive(dir: string): boolean {
  writeFileSync(join(dir, "case-probe"), "");
  return existsSync(join(dir, "CASE-PROBE"));
}

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = tempDir("amc-segcase-");
  initWorkspace({ workspacePath: dir, agentId: "payments-agent", trustBoundaryMode: "isolated" });
  const ledger = openLedger(dir);
  ledger.startSession({ sessionId: "segcase-session", runtime: "amc", binaryPath: "test", binarySha256: "test" });
  ledger.close();
  initBudgets(dir, "payments-agent");
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  mkdirSync(join(dir, ".amc", "studio"), { recursive: true });
  writeFileSync(join(dir, ".amc", "studio", "canary.txt"), "AMC-CANARY-SECRET\n");
  mkdirSync(join(dir, ".git"), { recursive: true });
  writeFileSync(join(dir, ".git", "config"), "[remote] url = GIT-CANARY-SECRET\n");
  writeFileSync(join(dir, "visible.txt"), "VISIBLE-CANARY\n");
  mkdirSync(join(dir, "pkg", ".amc"), { recursive: true });
  writeFileSync(join(dir, "pkg", ".amc", "nested.txt"), "AMC-CANARY-SECRET\n");
  return dir;
}

describe("protected segments compare case-insensitively", () => {
  it("refuses every spelling of .amc and .git in the pure segment logic, on any filesystem", () => {
    const dir = tempDir("amc-segcase-pure-");
    for (const path of [".AMC", ".Amc", ".AMC/studio/admin.token", "pkg/.Amc/x", ".GIT", ".Git/config"]) {
      expect(() => insideWorkspace(dir, path), path).toThrow(/protected directory/);
    }
    for (const path of [".AMC", ".Amc/x", ".AMC/studio/admin.token"]) {
      expect(protectedPathReason(dir, join(dir, path)), path).not.toBeNull();
    }
    // A real `.AMC` directory (a distinct directory on a case-sensitive volume) is still never walked.
    mkdirSync(join(dir, ".AMC"), { recursive: true });
    writeFileSync(join(dir, ".AMC", "x.txt"), "x");
    mkdirSync(join(dir, "Pkg", ".Git"), { recursive: true });
    writeFileSync(join(dir, "Pkg", ".Git", "y.txt"), "y");
    expect(walkWorkspace(dir, { maxFiles: 100, maxFileBytes: 1000, path: ".AMC" }).files).toEqual([]);
    expect(walkWorkspace(dir, { maxFiles: 100, maxFileBytes: 1000 }).files).not.toContain("Pkg/.Git/y.txt");
    expect(walkWorkspace(dir, { maxFiles: 100, maxFileBytes: 1000 }).files.some((file) => /\.amc/i.test(file))).toBe(false);
    // An operator's deny glob holds against another spelling of the same name.
    expect(pathAllowedByPatterns(dir, join(dir, "SECRETS", "a.txt"), [], ["**/secrets/**"]).ok).toBe(false);
  });

  it("refuses .AMC, .Amc, .GIT and a nested .amc through the native toolset, where the volume folds case", async () => {
    const dir = workspace();
    if (!caseInsensitive(dir)) return; // the pure test above covers case-sensitive volumes
    const toolset = agentToolset({ workspace: dir, agentId: "payments-agent", sessionId: "segcase-session" });
    let step = 0;
    const run = async (toolName: string, args: Record<string, unknown>) => {
      step += 1;
      const outcome = await toolset.seam.execute({
        callId: `c${step}`, toolName, rawArguments: JSON.stringify(args), sessionId: "segcase-session",
        turn: 1, step, parentToken: null, signal: new AbortController().signal
      });
      return String(outcome.content);
    };
    try {
      // The control: the same search outside the protected set does run and find its canary.
      expect(await run("grep", { pattern: "CANARY", path: "." })).toContain("VISIBLE-CANARY");
      // Refusals echo the requested path, so each call names what its leak would look like.
      const calls: [string, Record<string, unknown>, RegExp][] = [
        ["grep", { pattern: "CANARY", path: ".AMC/studio" }, /CANARY-SECRET/],
        ["grep", { pattern: "CANARY", path: ".Amc" }, /CANARY-SECRET/],
        ["grep", { pattern: "CANARY", path: ".GIT" }, /CANARY-SECRET/],
        ["grep", { pattern: "CANARY", path: "pkg/.AMC" }, /CANARY-SECRET/],
        ["glob", { pattern: "**", path: ".AMC" }, /canary\.txt|tools\.yaml/],
        ["glob", { pattern: "**", path: ".Git" }, /config/],
        ["fs.read", { path: ".AMC/studio/canary.txt" }, /CANARY-SECRET/],
        ["fs.read", { path: ".GIT/config" }, /CANARY-SECRET/]
      ];
      for (const [toolName, args, leak] of calls) {
        const content = await run(toolName, args);
        expect(content, `${toolName} ${JSON.stringify(args)}`).not.toMatch(leak);
      }
    } finally {
      await toolset.close();
    }
  });
});
