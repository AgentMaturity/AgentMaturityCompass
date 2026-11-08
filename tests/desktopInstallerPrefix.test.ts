import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

// A read-only global npm folder (EACCES, exit 243, no hint) stopped non-root Linux installs (D7). root can write anywhere.
const nonRootPosix = process.platform !== "win32" && process.getuid?.() !== 0;
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) { chmodSync(join(dir, "prefix", "lib", "node_modules"), 0o755); rmSync(dir, { recursive: true, force: true }); } });

/** A temp dir with a fake global npm prefix whose lib/node_modules is read-only, and a bin dir of fake tools. */
function sandbox(): { dir: string; bin: string; log: string } {
  const dir = mkdtempSync(join(tmpdir(), "amc-installer-prefix-"));
  dirs.push(dir);
  const bin = join(dir, "bin");
  mkdirSync(bin);
  mkdirSync(join(dir, "prefix", "lib", "node_modules"), { recursive: true });
  chmodSync(join(dir, "prefix", "lib", "node_modules"), 0o555);
  const log = join(dir, "npm.log");
  writeFileSync(join(bin, "npm"), `#!/bin/sh\n[ "$1" = prefix ] && { printf '%s\\n' "${join(dir, "prefix")}"; exit 0; }\necho "$*" >>"${log}"\n`, { mode: 0o755 });
  return { dir, bin, log };
}

/** The archive's install.sh, generated from the packager's own template literal (the desktopLauncherRuntime seam). */
function archiveInstaller(dir: string): string {
  const template = readFileSync(resolve("scripts/package-desktop-installers.mjs"), "utf8")
    .match(/function writeUnixInstaller\(targetDir, tarballName, tarballDigest\) \{\n {2}const script = `([\s\S]*?)`;\n/)?.[1];
  expect(template).toBeDefined();
  writeFileSync(join(dir, "amc.tgz"), "packaged amc");
  const digest = createHash("sha256").update("packaged amc").digest("hex");
  const path = join(dir, "install.sh");
  writeFileSync(path, new Function("tarballName", "tarballDigest", `return \`${template}\`;`)("amc.tgz", digest), { mode: 0o755 });
  return path;
}

const run = (script: string, bin: string, env: Record<string, string> = {}) =>
  spawnSync("/bin/sh", [script], { env: { PATH: `${bin}:/usr/bin:/bin`, HOME: "/nonexistent-home", ...env }, encoding: "utf8" });

describe.skipIf(!nonRootPosix)("archive installer without root (LIVE-DEPLOY-05, D7)", () => {
  it("refuses a read-only global npm folder before npm runs, naming the folder and the AMC_INSTALL_PREFIX rerun", () => {
    const { dir, bin, log } = sandbox();
    const result = run(archiveInstaller(dir), bin);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(join(dir, "prefix", "lib", "node_modules"));
    expect(result.stderr).toContain('AMC_INSTALL_PREFIX="$HOME/.local" sh ./install.sh');
    expect(result.stderr).toMatch(/sudo[\s\S]*postinstall and the native build as root/);
    expect(existsSync(log)).toBe(false);
  });

  it("installs into AMC_INSTALL_PREFIX and prints the PATH line before the Run line", () => {
    const { dir, bin, log } = sandbox();
    const prefix = join(dir, "user-prefix");
    const result = run(archiveInstaller(dir), bin, { AMC_INSTALL_PREFIX: prefix });
    expect(result.status).toBe(0);
    expect(readFileSync(log, "utf8")).toContain(`install -g --prefix ${prefix}`);
    const pathLine = result.stdout.indexOf(`export PATH="${prefix}/bin:$PATH"`);
    expect(pathLine).toBeGreaterThanOrEqual(0);
    expect(pathLine).toBeLessThan(result.stdout.indexOf("Run: amc --version"));
  });
});

/** website/install.sh with test mode off: fake node (major for -p, full for --version), npm and a curl that leaves a marker. */
function hosted(nodeMajor: string, { writable }: { writable: boolean }) {
  const { dir, bin } = sandbox();
  if (writable) chmodSync(join(dir, "prefix", "lib", "node_modules"), 0o755);
  writeFileSync(join(bin, "node"), `#!/bin/sh\n[ "$1" = -p ] && { echo ${nodeMajor}; exit 0; }\necho v${nodeMajor}.19.0\n`, { mode: 0o755 });
  const marker = join(dir, "curl-called");
  writeFileSync(join(bin, "curl"), `#!/bin/sh\ntouch "${marker}"\nexit 1\n`, { mode: 0o755 });
  const result = run(resolve("website/install.sh"), bin, { TMPDIR: dir });
  return { result, downloaded: existsSync(marker), dir };
}

describe.skipIf(!nonRootPosix)("hosted installer prerequisites (LIVE-DEPLOY-05, LIVE-DEPLOY-12)", () => {
  it("refuses a read-only global npm folder before any download", () => {
    const { result, downloaded, dir } = hosted("22", { writable: false });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(join(dir, "prefix", "lib", "node_modules"));
    expect(result.stderr).toContain('AMC_INSTALL_PREFIX="$HOME/.local" sh -c "$(curl -fsSL https://agentmaturity.co/install.sh)"');
    expect(downloaded).toBe(false);
  });

  it("warns that Node 20 reached end of life and continues to the download", () => {
    const { result, downloaded } = hosted("20", { writable: true });
    expect(`${result.stdout}${result.stderr}`).toContain("Node 20 reached end of life on 2026-04-30; use Node 22 or 24 LTS");
    expect(downloaded).toBe(true);
    expect(result.status).toBe(1);
    const current = hosted("22", { writable: true });
    expect(`${current.result.stdout}${current.result.stderr}`).not.toContain("end of life");
  });
});
