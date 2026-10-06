#!/usr/bin/env node
/**
 * Decision D-15 (snapshot on edit). Run this before a plan issue edits a file that a restoration
 * parity test freezes:
 *
 *   node scripts/snapshot-plan-edit.mjs --issue <KEY> --base <rev> <path>...
 *
 * For each path it archives the file's bytes at <rev> to unused-code/plan-edits/<KEY>/<path>.landed
 * and registers it in unused-code/plan-edits/manifest.json, which tests/helpers/landedSource.ts
 * reads. The first issue to edit a file archives it; a path already registered is refused.
 *
 * Build outputs under dist/ that a restoration.json pins in `compiledContracts` are not in git, so
 * they are archived from disk and only when their bytes equal the pin. Registering src/X.ts also
 * registers its pinned dist/X.d.ts and dist/X.js, so run this before rebuilding dist/.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const MANIFEST = "unused-code/plan-edits/manifest.json";
const ISSUE_KEY = /^P[0-3]-[0-9]{2}$/;
const USAGE = "Usage: node scripts/snapshot-plan-edit.mjs --issue <KEY> --base <rev> <path>...";
const EMPTY = { schemaVersion: 1, decision: "D-15", files: [] };
// package.json is archived like any other frozen file: the P0-01 package-entries pin reads its landed bytes.
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

function git(cwd, args, encoding = "utf8") {
  return spawnSync("git", args, { cwd, encoding, maxBuffer: 256 * 1024 * 1024 });
}
function gitText(cwd, args) {
  const result = git(cwd, args);
  if (result.error || result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.error?.message ?? result.stderr.trim()}`);
  return result.stdout.trim();
}

/**
 * Build outputs pinned by `compiledContracts` in the tracked restoration manifests.
 * @param {string} root repository root
 * @returns {Map<string, string[]>} dist path to every sha256 pinned for it
 */
export function compiledPins(root) {
  const pins = new Map();
  for (const file of gitText(root, ["ls-files", "--", "unused-code/*restoration.json"]).split("\n").filter(Boolean)) {
    for (const { file: path, sha256: pin } of JSON.parse(readFileSync(join(root, file), "utf8")).compiledContracts ?? []) {
      pins.set(path, [...(pins.get(path) ?? []), pin]);
    }
  }
  return pins;
}

const builtOutputs = path => (/^src\/.+\.ts$/.test(path) && !path.endsWith(".d.ts")
  ? [".d.ts", ".js"].map(ext => path.replace(/^src\//, "dist/").replace(/\.ts$/, ext))
  : []);

function landedBytesAt(root, base, baseCommit, path, pins) {
  const pinned = pins.get(path);
  if (pinned) {
    const bytes = existsSync(join(root, path)) ? readFileSync(join(root, path)) : undefined;
    if (!bytes || pinned.some(pin => pin !== sha256(bytes))) {
      throw new Error(`${path} on disk is not the pinned build (${pinned.join(", ")}); snapshot before rebuilding dist/, or build ${base} first`);
    }
    return bytes;
  }
  const shown = git(root, ["cat-file", "blob", `${baseCommit}:${path}`], "buffer");
  if (shown.status !== 0) throw new Error(`${path} is not present at ${base} (${baseCommit}) as a file`);
  return shown.stdout;
}

/** Archives each path's bytes at `base` and returns the new entries plus any warnings. */
function snapshotPlanEdit({ cwd, issue, base, paths }) {
  if (!issue || !base || paths.length === 0) throw new Error(USAGE);
  if (!ISSUE_KEY.test(issue)) throw new Error(`Issue key must match ${ISSUE_KEY}: ${issue}`);
  const root = gitText(cwd, ["rev-parse", "--show-toplevel"]);
  const baseCommit = gitText(root, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`]);
  const manifestFile = join(root, MANIFEST);
  const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : EMPTY;
  const committedShown = git(root, ["show", `HEAD:${MANIFEST}`]);
  const committed = new Set((committedShown.status === 0 ? JSON.parse(committedShown.stdout).files : []).map(row => JSON.stringify(row)));
  const foreign = manifest.files.filter(row => row.issue !== issue && !committed.has(JSON.stringify(row)));
  const warnings = foreign.length
    ? [`uncommitted manifest entries from another issue: ${foreign.map(row => `${row.path} (${row.issue})`).join(", ")}`]
    : [];
  const pins = compiledPins(root);
  const registered = path => manifest.files.find(row => row.path === path);
  const requested = paths.map(input => {
    const path = relative(root, resolve(cwd, input)).split(sep).join("/");
    if (!path || isAbsolute(path) || path === ".." || path.startsWith("../")) throw new Error(`Path is outside the repository: ${input}`);
    if (registered(path)) throw new Error(`${path} is already registered; the first issue's snapshot stays: ${JSON.stringify(registered(path))}`);
    return path;
  });
  const outputs = requested.flatMap(builtOutputs).filter(path => pins.has(path) && !requested.includes(path) && !registered(path));
  const entries = [...requested, ...new Set(outputs)].map(path => {
    const bytes = landedBytesAt(root, base, baseCommit, path, pins);
    return { path, issue, baseCommit, archivePath: `unused-code/plan-edits/${issue}/${path}.landed`, sha256: sha256(bytes), bytes };
  });
  const duplicate = entries.find((entry, index) => entries.findIndex(other => other.path === entry.path) !== index);
  if (duplicate) throw new Error(`${duplicate.path} is listed twice`);
  for (const entry of entries) {
    mkdirSync(dirname(join(root, entry.archivePath)), { recursive: true });
    writeFileSync(join(root, entry.archivePath), entry.bytes);
  }
  const rows = entries.map(({ bytes: _bytes, ...row }) => row);
  const files = [...manifest.files, ...rows].sort((a, b) => (a.path < b.path ? -1 : 1));
  mkdirSync(dirname(manifestFile), { recursive: true });
  writeFileSync(manifestFile, JSON.stringify({ ...manifest, files }, null, 2) + "\n");
  return { entries: rows, warnings };
}

/** True when Node runs this file as the entry point, also through a symlinked path. */
function invokedDirectly() {
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  try {
    const { values, positionals } = parseArgs({ options: { issue: { type: "string" }, base: { type: "string" } }, allowPositionals: true });
    const { entries, warnings } = snapshotPlanEdit({ cwd: process.cwd(), issue: values.issue, base: values.base, paths: positionals });
    for (const warning of warnings) console.warn("Warning: " + warning);
    for (const entry of entries) console.log(`Archived ${entry.path} at ${entry.baseCommit} to ${entry.archivePath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
