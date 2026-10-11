#!/usr/bin/env node
/**
 * P0-34: pack the publish file set exactly as `npm publish` would (lifecycle scripts off), refuse private trees, key
 * material, vault data and env files, secret-scan the tarball with `amc release scan`, and report its size, file
 * count and SHA-256. Needs a built dist/. `--out <file>` also writes the report.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.mjs";

const PRIVATE_ROOT = /^(?:AMC_OS|tests|src|research|plans)\//;
const CODE = /\.[cm]?js$|\.d\.[cm]?ts$|\.map$/;

/** Paths the tarball must never contain. A module whose name mentions vault (dist/vault/vault.js) is code, not data. */
export function forbiddenPackPaths(paths) {
  return paths.filter((path) => {
    const base = path.split("/").pop() ?? "";
    return PRIVATE_ROOT.test(path) || /(?:^|\/)\.amc\//.test(path) || /(?:^|\/)secrets\//.test(path)
      || /\.(?:pem|key|amcvault)$/.test(base) || /^\.env(?:\.|$)/.test(base) || (/vault/i.test(base) && !CODE.test(base));
  });
}

function run(command, args, env) {
  return spawnSync(command, args, { encoding: "utf8", env, maxBuffer: 256 * 1024 * 1024 });
}

export function checkPackContents(root = process.cwd()) {
  const dir = mkdtempSync(join(tmpdir(), "amc-pack-contents-"));
  try {
    const env = { ...process.env, npm_config_cache: join(dir, "npm-cache") };
    const packed = run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", dir], env);
    if (packed.status !== 0) throw new Error(`npm pack failed: ${packed.stderr}`);
    const [info] = JSON.parse(packed.stdout);
    const tarball = join(dir, info.filename);
    const scan = run(process.execPath, [join(root, "dist", "cli.js"), "release", "scan", "--in", tarball, "--out", join(dir, "scan.json")], env);
    return {
      tarball: info.filename,
      sha256: createHash("sha256").update(readFileSync(tarball)).digest("hex"),
      size: info.size,
      unpackedSize: info.unpackedSize,
      files: info.entryCount,
      forbidden: forbiddenPackPaths(info.files.map((file) => file.path)),
      secretScan: scan.status === 0 ? "PASS" : `FAIL: ${`${scan.stdout}${scan.stderr}`.trim().slice(-2000)}`
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (isEntrypoint(import.meta.url)) {
  const report = checkPackContents();
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const outIndex = process.argv.indexOf("--out");
  if (outIndex > 0) writeFileSync(resolve(process.argv[outIndex + 1]), json);
  process.stdout.write(json);
  if (report.forbidden.length || report.secretScan !== "PASS") process.exitCode = 1;
}
