import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// On windows-latest, GNU tar under Git Bash reads "D:" in D:\a\...\x.tar.gz as a remote host ("tar (child): Cannot
// connect to D: resolve failed"). This Mac/Linux stand-in puts tar, zip and unzip on PATH behind a guard that refuses
// an absolute or drive-letter argument the same way, then runs the real packager and verifier end to end.
const dir = mkdtempSync(join(tmpdir(), "amc-archive-relative-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const repo = resolve(".");
const version = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")).version as string;

function guardedBin(): string {
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  for (const tool of ["tar", "zip", "unzip"]) {
    const real = spawnSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();
    expect(real, `${tool} must be installed`).not.toBe("");
    writeFileSync(join(bin, tool), `#!/bin/sh
for a in "$@"; do
  case "$a" in /*|[A-Za-z]:*) echo "${tool} (child): Cannot connect to \${a%%:*}: resolve failed" >&2; exit 2;; esac
done
exec "${real}" "$@"
`, { mode: 0o755 });
  }
  return bin;
}

function standInNpmTarball(): string {
  const src = join(dir, "src");
  for (const file of ["package/package.json", "package/dist/cli.js", "package/scripts/postinstall.js", "package/LICENSE"]) {
    mkdirSync(join(src, file, ".."), { recursive: true });
    writeFileSync(join(src, file), "{}\n");
  }
  const name = `agent-maturity-compass-${version}.tgz`;
  expect(spawnSync("tar", ["-czf", name, "package"], { cwd: src }).status).toBe(0);
  return join(src, name);
}

describe.skipIf(process.platform === "win32")("desktop archives", () => {
  it("are made and verified with relative archive paths only (no drive letter reaches tar, zip or unzip)", () => {
    const env = {
      ...process.env,
      PATH: `${guardedBin()}:${process.env.PATH}`,
      AMC_DESKTOP_NPM_TARBALL: standInNpmTarball(),
      AMC_DESKTOP_PACKAGE_OUT: join(dir, "out")
    };
    const pack = spawnSync(process.execPath, ["scripts/package-desktop-installers.mjs"], { cwd: repo, env, encoding: "utf8" });
    expect(pack.stderr).not.toMatch(/Cannot connect/);
    expect(pack.status, pack.stderr).toBe(0);
    const verify = spawnSync(process.execPath, ["scripts/verify-desktop-installers.mjs"], { cwd: repo, env, encoding: "utf8" });
    expect(verify.status, verify.stderr).toBe(0);
    expect(JSON.parse(verify.stdout)).toMatchObject({ status: "passed", packageCount: 3 });
  }, 180_000);
});
