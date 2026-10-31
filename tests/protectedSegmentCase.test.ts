import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../dist/workspace.js";
import { openLedger } from "../dist/ledger/ledger.js";
import { initBudgets } from "../dist/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../dist/runtime/firewall.js";
import { agentToolset } from "../dist/agent/agentToolset.js";
import { insideWorkspace } from "../src/tools/builtin/fsTools.js";
import { walkWorkspace } from "../src/tools/builtin/workspaceWalk.js";
import { protectedPathReason } from "../src/toolhub/protectedPaths.js";
import { pathAllowedByPatterns } from "../src/toolhub/toolhubValidators.js";
import { admissibleConfigFile } from "../src/experiments/configFile.js";

// The pure path logic is imported from source; the toolset runs from dist because grep and glob run in a built worker.
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

  it("refuses the Windows and Unicode aliases of .amc and .git in the pure segment logic", () => {
    // Windows drops trailing dots and spaces, reads `name:stream` as `name` and answers 8.3 short names; NFKC folds
    // fullwidth letters. None of these can be created on this host, so the segment logic is asserted directly.
    const dir = tempDir("amc-segcase-alias-");
    const aliases = [".amc.", ".amc ", ".git...", ".amc::$DATA", ".git:hooks", "AMC~1", "GIT~1/config", "AM1F2A~1",
      "\uFF0E\uFF41\uFF4D\uFF43", ".\uFF27IT", "pkg/.amc./x"];
    for (const path of aliases) {
      expect(() => insideWorkspace(dir, path), JSON.stringify(path)).toThrow(/protected directory/);
    }
    for (const path of [".amc.", ".amc::$DATA", "AMC~1", "AMC~1/vault.amcvault", "\uFF0E\uFF41\uFF4D\uFF43/x"]) {
      expect(protectedPathReason(dir, join(dir, path)), JSON.stringify(path)).not.toBeNull();
    }
    for (const path of [".amc.", "AMC~1"]) {
      mkdirSync(join(dir, path), { recursive: true });
      writeFileSync(join(dir, path, "x.txt"), "x");
      expect(walkWorkspace(dir, { maxFiles: 100, maxFileBytes: 1000 }).files.some((file) => file.startsWith(path)), path).toBe(false);
    }
    // Ordinary names stay usable.
    expect(insideWorkspace(dir, "src/amc.ts").rel).toBe("src/amc.ts");
    expect(protectedPathReason(dir, join(dir, ".amcx", "y"))).toBeNull();
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

  it("refuses a protected directory reached under another name, by identity", () => {
    // `.amc` and `.git` linked to directories elsewhere in the workspace: the real path names `state/` and `gitdir/`,
    // which no name check knows, so only the identity of the protected directories refuses them.
    const dir = tempDir("amc-segcase-linked-");
    mkdirSync(join(dir, "state"), { recursive: true });
    writeFileSync(join(dir, "state", "vault.amcvault"), "v");
    mkdirSync(join(dir, "gitdir", "hooks"), { recursive: true });
    writeFileSync(join(dir, "gitdir", "config"), "c");
    writeFileSync(join(dir, "visible.txt"), "x");
    symlinkSync(join(dir, "state"), join(dir, ".amc"));
    symlinkSync(join(dir, "gitdir"), join(dir, ".git"));
    for (const path of ["state/vault.amcvault", "state", "gitdir/config", "gitdir/hooks/pre-commit", ".amc/vault.amcvault"]) {
      expect(() => insideWorkspace(dir, path), path).toThrow(/protected directory/);
    }
    expect(insideWorkspace(dir, "visible.txt").rel).toBe("visible.txt");
    expect(walkWorkspace(dir, { maxFiles: 100, maxFileBytes: 1000 }).files).toEqual(["visible.txt"]);
    expect(() => walkWorkspace(dir, { maxFiles: 100, maxFileBytes: 1000, path: "gitdir" })).not.toThrow();
    expect(walkWorkspace(dir, { maxFiles: 100, maxFileBytes: 1000, path: "gitdir" }).files).toEqual([]);
    expect(protectedPathReason(dir, join(dir, "state", "vault.amcvault"))).not.toBeNull();
  });

  it("folds the workspace prefix in the floor's name check, and refuses a path the fold places outside", () => {
    // No `.amc` exists, so identity cannot decide: the name check alone must hold against a re-cased workspace prefix.
    const dir = tempDir("amc-segcase-prefix-");
    const recasedRoot = dir.toUpperCase();
    expect(protectedPathReason(dir, join(recasedRoot, ".amc", "vault.amcvault"))).not.toBeNull();
    expect(protectedPathReason(dir, join(recasedRoot, "AMC~1", "x"))).not.toBeNull();
    expect(pathAllowedByPatterns(dir, join(recasedRoot, ".amc", "x"), [], []).ok).toBe(false);
    expect(pathAllowedByPatterns(dir, join(recasedRoot, "src", "x.ts"), [], []).ok).toBe(true);
    // Outside the workspace even after folding: not "clear", refused by containment.
    const outside = pathAllowedByPatterns(dir, join(tmpdir(), "elsewhere", ".amc", "x"), [], []);
    expect(outside).toMatchObject({ ok: false, reason: expect.stringMatching(/outside the workspace/) });
  });

  it("refuses a segment whose fold changes the path's structure (full-width solidus or dots)", () => {
    // NFKC folds `／` to `/` and `．` to `.`: a fold applied to a whole path would split it differently than the filesystem does.
    const dir = tempDir("amc-segcase-structure-");
    for (const path of ["a\uFF0Fb", "\uFF0E\uFF0E", "\uFF0E", "x/\uFF0E\uFF0E/y", "a\uFF3Cb"]) {
      expect(() => insideWorkspace(dir, path), JSON.stringify(path)).toThrow(/protected directory|separator or dot/);
    }
    for (const path of ["a\uFF0Fb", "\uFF0E\uFF0E/sub"]) {
      expect(protectedPathReason(dir, join(dir, path)), JSON.stringify(path)).not.toBeNull();
    }
    expect(protectedPathReason(dir, join(dir, "src", "a.ts"))).toBeNull();
  });

  it("decides the toolhub floor by identity, so a re-cased absolute path to .amc is refused", () => {
    const dir = tempDir("amc-segcase-identity-");
    mkdirSync(join(dir, ".amc"), { recursive: true });
    writeFileSync(join(dir, ".amc", "vault.amcvault"), "v");
    if (!caseInsensitive(dir)) return;
    // Every segment re-cased: `relative` from the workspace leaves it, so only the identity of `.amc` can refuse it.
    const recased = join(dir, ".amc", "vault.amcvault").toUpperCase();
    expect(protectedPathReason(dir, recased)).not.toBeNull();
    expect(pathAllowedByPatterns(dir, recased, [], []).ok).toBe(false);
    expect(protectedPathReason(dir, join(dir, "visible.txt").toUpperCase())).toBeNull();
  });

  it("refuses an experiment config file named through .AMC, where the volume folds case", () => {
    const dir = tempDir("amc-segcase-config-");
    mkdirSync(join(dir, ".amc"), { recursive: true });
    writeFileSync(join(dir, ".amc", "secret.yaml"), "k: v\n");
    writeFileSync(join(dir, "candidate.yaml"), "k: v\n");
    expect(admissibleConfigFile(dir, "candidate.yaml")).not.toBeNull();
    expect(admissibleConfigFile(dir, ".amc/secret.yaml")).toBeNull();
    if (!caseInsensitive(dir)) return;
    for (const path of [".AMC/secret.yaml", ".Amc/secret.yaml"]) {
      expect(admissibleConfigFile(dir, path), path).toBeNull();
    }
  });
});
