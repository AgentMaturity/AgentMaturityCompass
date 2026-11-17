import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

// website/install-source.sh against a throwaway git repository and a fake corepack (no network, no real build).
// The real build was proven in a sandbox HOME through heavy.sh; this pins the install, update and failure paths.
const script = resolve("website/install-source.sh");
const ps1 = resolve("website/install-source.ps1");
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const git = (cwd: string, ...args: string[]) =>
  spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args], { cwd, encoding: "utf8" });

function sandbox(engines = ">=20") {
  const dir = mkdtempSync(join(tmpdir(), "amc-install-source-"));
  dirs.push(dir);
  const home = join(dir, "home");
  const repo = join(dir, "repo");
  const bin = join(dir, "bin");
  for (const path of [home, repo, bin]) mkdirSync(path);
  writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "fake", engines: { node: engines } }));
  git(repo, "init", "-q");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "one");
  const calls = join(dir, "corepack.log");
  // "pnpm run build" writes a dist/cli.js that prints its version; a FAIL file in the repo makes the build fail.
  writeFileSync(join(bin, "corepack"), `#!/bin/sh
echo "$*" >> "${calls}"
[ -f FAIL ] && exit 1
if [ "$2" = run ]; then mkdir -p dist; printf '#!/usr/bin/env node\\nconsole.log("9.9.9")\\n' > dist/cli.js; chmod +x dist/cli.js; fi
exit 0
`, { mode: 0o755 });
  const nodeDir = dirname(process.execPath);
  const run = (...args: string[]) => runIn(home, `${bin}:${nodeDir}:/usr/bin:/bin`, ...args);
  const runIn = (cwd: string, path: string, ...args: string[]) => spawnSync("/bin/sh", [script, "--repo", repo, ...args], {
    cwd, env: { HOME: home, PATH: path, SHELL: "/bin/zsh" }, encoding: "utf8"
  });
  const commit = (name: string, file = "x") => { writeFileSync(join(repo, file), name); git(repo, "add", "."); git(repo, "commit", "-qm", name); return git(repo, "rev-parse", "HEAD").stdout.trim(); };
  const head = () => git(repo, "rev-parse", "HEAD").stdout.trim();
  return { dir, bin, nodeDir, home, repo, calls, run, runIn, commit, head, prefix: join(home, ".amc-source") };
}

describe.skipIf(process.platform === "win32")("source installer (website/install-source.sh)", () => {
  it("installs from the lockfile with Corepack's pnpm, links amc, adds one PATH line and prints the commit", () => {
    const s = sandbox();
    const first = s.run();
    expect(first.status, first.stderr).toBe(0);
    expect(readFileSync(s.calls, "utf8")).toBe("pnpm install --frozen-lockfile\npnpm run build\n");
    expect(readlinkSync(join(s.prefix, "current"))).toBe(`builds/${s.head()}`);
    expect(spawnSync(join(s.prefix, "bin", "amc"), ["--version"], { encoding: "utf8" }).stdout.trim()).toBe("9.9.9");
    expect(first.stdout).toContain(`AMC 9.9.9 is installed from commit ${s.head()}`);
    expect(first.stdout).toMatch(/Using Node\.js v\d+/);
    expect(first.stdout).toContain(`added one line to ${join(s.home, ".zshrc")}`);
    expect(first.stdout).toContain("type: amc");

    const again = s.run();
    expect(again.status).toBe(0);
    expect(again.stdout).toContain("is already installed; nothing to build.");
    const profile = readFileSync(join(s.home, ".zshrc"), "utf8");
    expect(profile.match(/AMC source install/g)).toHaveLength(1);
    expect(profile).toContain('export PATH="$HOME/.amc-source/bin:$PATH" # AMC source install');
  });

  it("an update keeps the previous build, and a failed build leaves it in use and exits non-zero", () => {
    const s = sandbox();
    const one = s.head();
    expect(s.run().status).toBe(0);
    const two = s.commit("two");
    expect(s.run().status).toBe(0);
    expect(readlinkSync(join(s.prefix, "current"))).toBe(`builds/${two}`);
    expect(existsSync(join(s.prefix, "builds", one))).toBe(true);

    const broken = s.commit("broken", "FAIL");
    const failed = s.run();
    expect(failed.status).toBe(1);
    expect(failed.stderr).toContain(`the build of ${broken} failed`);
    expect(failed.stderr).toContain(`Your previous AMC, commit ${two}, is still installed and works.`);
    expect(readlinkSync(join(s.prefix, "current"))).toBe(`builds/${two}`);
    expect(existsSync(join(s.prefix, "builds", broken))).toBe(false);

    git(s.repo, "rm", "-q", "FAIL");
    git(s.repo, "commit", "-qm", "fixed");
    const three = s.head();
    expect(s.run().status).toBe(0);
    // Only the new build and the one it replaced are kept.
    expect(existsSync(join(s.prefix, "builds", one))).toBe(false);
    expect(existsSync(join(s.prefix, "builds", two))).toBe(true);
    expect(readlinkSync(join(s.prefix, "current"))).toBe(`builds/${three}`);
  });

  it("never runs a node from the current folder, at install time or through the amc launcher", () => {
    const s = sandbox();
    const project = join(s.dir, "project");
    const planted = join(s.dir, "planted-node-ran");
    mkdirSync(project);
    writeFileSync(join(project, "node"), `#!/bin/sh\ntouch "${planted}"\nexit 1\n`, { mode: 0o755 });
    // An empty PATH entry (the leading ":") means the current folder.
    const installed = s.runIn(project, `:${s.bin}:${s.nodeDir}:/usr/bin:/bin`);
    expect(installed.status, installed.stderr).toBe(0);
    expect(installed.stdout).toContain(`Using Node.js v${process.versions.node} (${join(s.nodeDir, "node")})`);
    const launcher = readFileSync(join(s.prefix, "bin", "amc"), "utf8");
    expect(launcher).toContain(`\nt='${join(s.prefix, "current", "dist", "amc.js")}'; [ -f "$t" ] || t='${join(s.prefix, "current", "dist", "cli.js")}'\nexec '${join(s.nodeDir, "node")}' "$t" "$@"\n`);
    expect(launcher.match(/^.*\bnode\b.*$/gm)!.every((line) => line.includes(`'${join(s.nodeDir, "node")}`) || line.includes("Node.js"))).toBe(true);
    const amc = spawnSync(join(s.prefix, "bin", "amc"), ["--version"], { cwd: project, env: { PATH: `:${s.nodeDir}:/usr/bin:/bin` }, encoding: "utf8" });
    expect(amc.stdout.trim()).toBe("9.9.9");
    expect(existsSync(planted)).toBe(false);
  });

  it("the amc launcher runs the fast-start entry dist/amc.js when the build has one, and dist/cli.js otherwise", () => {
    const s = sandbox();
    expect(s.run().status).toBe(0);
    const amc = () => spawnSync(join(s.prefix, "bin", "amc"), ["--version"], { encoding: "utf8" }).stdout.trim();
    // The fake build writes only cli.js, as a build of an older ref would.
    expect(amc()).toBe("9.9.9");
    writeFileSync(join(s.prefix, "current", "dist", "amc.js"), 'console.log("fast " + process.argv.slice(2).join(" "))\n');
    expect(amc()).toBe("fast --version");
  });

  it("says the pinned Node.js is gone, and how to fix it, when it was removed after install", () => {
    const s = sandbox();
    const nodeDir = join(s.dir, "fnm_multishells", "123_456", "bin");
    mkdirSync(nodeDir, { recursive: true });
    symlinkSync(process.execPath, join(nodeDir, "node"));
    expect(s.runIn(s.home, `${s.bin}:${nodeDir}:/usr/bin:/bin`).status).toBe(0);
    rmSync(join(s.dir, "fnm_multishells"), { recursive: true });
    const amc = spawnSync(join(s.prefix, "bin", "amc"), ["--version"], { env: { PATH: "/usr/bin:/bin" }, encoding: "utf8" });
    expect(amc.status).toBe(1);
    expect(amc.stderr).toBe(`The Node.js AMC was installed with is gone: ${join(nodeDir, "node")}\n`
      + "Run the AMC install command again to use the Node.js you have now.\n");
  });

  it("refuses a Node.js older than package.json engines.node before any build", () => {
    const s = sandbox(">=99");
    const result = s.run();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/AMC needs Node\.js 99 or newer, and the one found on this computer is Node\.js v\d+/);
    expect(existsSync(s.calls)).toBe(false);
    expect(existsSync(join(s.prefix, "current"))).toBe(false);
  });

  it.each([
    [["--repo", "http://example.com/x.git"], "--repo must be an https URL or a folder that exists"],
    [["--repo", "git@github.com:a/b.git"], "--repo must be an https URL or a folder that exists"],
    [["--ref", "-c"], "--ref must be a branch, a tag or a full commit id"],
    [["--ref", "a:b"], "--ref must be a branch, a tag or a full commit id"],
    [["--ref", "a..b"], "--ref must be a branch, a tag or a full commit id"]
  ])("refuses %j", (args, message) => {
    const s = sandbox();
    const result = spawnSync("/bin/sh", [script, ...args], { env: { HOME: s.home, PATH: "/usr/bin:/bin" }, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
    expect(existsSync(s.prefix)).toBe(false);
  });

  it("is safe to pipe: strict mode, one function called on the last line, no sudo, eval or second download", () => {
    const text = readFileSync(script, "utf8");
    expect(text).toContain("set -eu");
    expect(text.trimEnd().split("\n").at(-1)).toBe('amc_source_install "$@"');
    expect(text).toMatch(/^amc_source_install\(\) \{$/m);
    for (const banned of [/\bsudo\b/, /\beval\b/, /\bcurl\b[^\n]*\|\s*sh/, /npm install -g/]) {
      expect(text.replace(/^#.*$/gm, "")).not.toMatch(banned);
    }
  });
});

it("labels the PowerShell twin untested in its header and its help, and calls one function on the last line", () => {
  const text = readFileSync(ps1, "utf8");
  expect(text.slice(0, 300)).toContain("UNTESTED");
  expect(text).toContain("UNTESTED on a real Windows machine");
  expect(text).toContain("pnpm install --frozen-lockfile");
  expect(text.trimEnd().split("\n").at(-1)).toBe("Install-AmcSource @args");
});

it("writes amc.cmd with the checked ASCII Node.js path in quotes and a gone-check, never a bare node, and checks the version through amc.cmd", () => {
  const text = readFileSync(ps1, "utf8");
  expect(text).toContain('"@`"$NodeCmd`" `"%~dp0..\\current\\dist\\cli.js`" %*"');
  // The fast-start entry when the build has it; a build of an older ref has only cli.js.
  expect(text).toContain('"@if not exist `"%~dp0..\\current\\dist\\amc.js`" goto slow",\n    "@`"$NodeCmd`" `"%~dp0..\\current\\dist\\amc.js`" %*",\n    "@exit /b %errorlevel%",\n    ":slow",');
  expect(text).toContain('"@if not exist `"$NodeCmd`" goto gone"');
  expect(text).toContain("$NodeCmd = $Node.Source -replace '%', '%%'");
  expect(text).not.toMatch(/@node\b/);
  // cmd reads amc.cmd in the console code page: a non-ASCII node path is refused, never written as "?".
  expect(text).toContain("if ($Node.Source -notmatch '^[\\x20-\\x7E]+$')");
  // The install-time check runs the launcher itself, so a broken amc.cmd fails at install, not later.
  expect(text).toContain('$Version = (& (Join-Path $Bin "amc.cmd") --version 2>$null)');
});
