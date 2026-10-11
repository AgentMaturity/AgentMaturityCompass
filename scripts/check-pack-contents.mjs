#!/usr/bin/env node
/**
 * P0-34: pack the publish file set exactly as `npm publish` would (lifecycle scripts off), refuse private trees, key
 * material, vault data and env files, secret-scan the tarball with `amc release scan`, and report its size, file
 * count and SHA-256. Needs a built dist/. `--tarball <file>` checks that file instead of packing (the gated release
 * tarball); `--out <file>` also writes the report.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
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

/** Packs the publish file set, or with `given` checks that exact tarball (P0-34: the gated release artifact). */
export function checkPackContents(root = process.cwd(), given = undefined) {
  const dir = mkdtempSync(join(tmpdir(), "amc-pack-contents-"));
  try {
    const env = { ...process.env, npm_config_cache: join(dir, "npm-cache") };
    let tarball;
    let paths;
    let unpackedSize = null;
    if (given) {
      tarball = resolve(given);
      const listed = run("tar", ["-tzf", tarball], env);
      if (listed.status !== 0) throw new Error(`tar -tzf ${tarball} failed: ${listed.stderr}`);
      paths = listed.stdout.split("\n").filter((path) => path && !path.endsWith("/")).map((path) => path.replace(/^package\//, ""));
    } else {
      const packed = run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", dir], env);
      if (packed.status !== 0) throw new Error(`npm pack failed: ${packed.stderr}`);
      const [info] = JSON.parse(packed.stdout);
      tarball = join(dir, info.filename);
      paths = info.files.map((file) => file.path);
      unpackedSize = info.unpackedSize;
    }
    const scan = run(process.execPath, [join(root, "dist", "cli.js"), "release", "scan", "--in", tarball, "--out", join(dir, "scan.json")], env);
    const bytes = readFileSync(tarball);
    return {
      tarball: basename(tarball),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      size: bytes.length,
      unpackedSize,
      files: paths.length,
      forbidden: forbiddenPackPaths(paths),
      secretScan: scan.status === 0 ? "PASS" : `FAIL: ${`${scan.stdout}${scan.stderr}`.trim().slice(-2000)}`
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (isEntrypoint(import.meta.url)) {
  const at = process.argv.indexOf("--tarball");
  const report = checkPackContents(process.cwd(), at > 0 ? process.argv[at + 1] : undefined);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const outIndex = process.argv.indexOf("--out");
  if (outIndex > 0) writeFileSync(resolve(process.argv[outIndex + 1]), json);
  process.stdout.write(json);
  if (report.forbidden.length || report.secretScan !== "PASS") process.exitCode = 1;
}
