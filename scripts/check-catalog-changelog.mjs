#!/usr/bin/env node
/**
 * Catalog changelog guard (P1-34, docs/catalog/GOVERNANCE.md). When this branch changes the catalog digest,
 * catalog/CHANGELOG.md must gain exactly one appended entry naming the new catalog version and digest and every added,
 * changed or retired control, or, for a range carrying several catalog changes, one entry per change: the catalog states
 * those entries name are read from the range's commits. Earlier text is never edited. Compares the catalog and changelog
 * at the merge base with --base-ref (default as check:freeze: the PR base, the pushed range's start, else origin/main)
 * with the working tree. On failure prints the entry the failing step calls for. Reads dist/ (build first).
 *
 * Usage: node scripts/check-catalog-changelog.mjs [--base-ref <ref>] [--json]
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { defaultBaseRef } from "./check-freeze.mjs";
import { isEntrypoint } from "./lib/entrypoint.mjs";

const CHANGELOG = "catalog/CHANGELOG.md";

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, maxBuffer: 512 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString().trim()}`);
  return result.stdout;
}

/** The catalog at `rev` as the guard reads it: its lock and control records. */
function catalogStateAt(root, rev, loadCatalog, buildCatalogLock) {
  const tmp = mkdtempSync(join(tmpdir(), "amc-catalog-base-"));
  try {
    const untar = spawnSync("tar", ["-x", "-C", tmp], { input: git(root, ["archive", "--format=tar", rev, "catalog"]) });
    if (untar.status !== 0) throw new Error(`tar failed: ${untar.stderr.toString().trim()}`);
    const catalog = loadCatalog({ root: join(tmp, "catalog") });
    return { lock: buildCatalogLock(catalog), controls: [...catalog.controls.values()] };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * The states, among the commits of mergeBase..HEAD that touch catalog/ (each catalog tree loaded once), whose digests
 * the appended entries name. A tree that does not load holds no usable state; an entry naming no found state fails.
 */
function rangeStates(root, mergeBase, digests, load) {
  const wanted = new Set(digests);
  const states = [];
  const revs = git(root, ["rev-list", "--full-history", `${mergeBase}..HEAD`, "--", "catalog"]).toString().split("\n").filter(Boolean);
  const trees = new Map(revs.length ? git(root, ["rev-parse", ...revs.map((rev) => `${rev}:catalog`)]).toString().trim().split("\n")
    .map((tree, i) => [tree, revs[i]]) : []);
  for (const rev of trees.values()) {
    if (wanted.size === 0) break;
    let state;
    try {
      state = load(rev);
    } catch {
      continue;
    }
    if (wanted.delete(state.lock.catalog.digest)) states.push(state);
  }
  return states;
}

async function main(argv) {
  const { values } = parseArgs({ args: argv, options: { "base-ref": { type: "string" }, json: { type: "boolean" } } });
  const root = process.cwd();
  const dist = (rel) => pathToFileURL(join(root, "dist", rel)).href;
  if (!existsSync(join(root, "dist/catalog/governance/index.js"))) throw new Error("Build first: dist/catalog/governance/index.js not found (pnpm run build).");
  const { loadCatalog } = await import(dist("catalog/loader.js"));
  const { buildCatalogLock } = await import(dist("catalog/lockfile.js"));
  const { checkCatalogChangelog } = await import(dist("catalog/governance/index.js"));
  const { canonicalize } = await import(dist("utils/json.js"));

  const baseRef = values["base-ref"] ?? defaultBaseRef(root);
  const mergeBase = git(root, ["merge-base", git(root, ["rev-parse", "--verify", `${baseRef}^{commit}`]).toString().trim(), "HEAD"]).toString().trim();
  const has = (path) => git(root, ["ls-tree", "--name-only", mergeBase, "--", path]).toString().trim() !== "";
  if (!has("catalog")) {
    console.log(`notice: ${baseRef} (merge base ${mergeBase.slice(0, 12)}) has no catalog/; nothing to compare.`);
    return 0;
  }
  const load = (rev) => catalogStateAt(root, rev, loadCatalog, buildCatalogLock);
  const before = load(mergeBase);
  const after = loadCatalog({ root: join(root, "catalog") });
  const currentLock = buildCatalogLock(after);
  const previousText = has(CHANGELOG) ? git(root, ["show", `${mergeBase}:${CHANGELOG}`]).toString("utf8") : "";
  const currentText = existsSync(join(root, CHANGELOG)) ? readFileSync(join(root, CHANGELOG), "utf8") : "";
  // Digests the appended entries name (canonical JSON puts catalog.digest first); the guard parses the entries itself.
  const named = currentText.startsWith(previousText)
    ? [...currentText.slice(previousText.length).matchAll(/^\{"catalog":\{"digest":"(sha256:[0-9a-f]{64})"/gm)].map((m) => m[1]) : [];
  const result = checkCatalogChangelog({
    previousLock: before.lock, currentLock, previousControls: before.controls, currentControls: [...after.controls.values()],
    previousText, currentText,
    intermediateStates: named.length > 1 ? rangeStates(root, mergeBase, named.slice(0, -1), load) : []
  });
  if (values.json) {
    console.log(JSON.stringify({ baseRef, mergeBase, ...result }, null, 2));
  } else if (result.ok) {
    console.log(`Catalog changelog guard passed against ${baseRef} (${mergeBase.slice(0, 12)}): catalog ${result.expected?.catalog.version} ${result.expected?.catalog.digest}`
      + `${named.length > 1 ? `, ${named.length} appended entries checked step by step` : ""}.`);
  } else {
    for (const issue of result.issues) console.error(`Catalog changelog guard: ${issue.code}${issue.side ? ` (${issue.side})` : ""}; see docs/catalog/GOVERNANCE.md.`);
    if (result.expected) {
      const entry = { entryVersion: 1, catalog: result.expected.catalog,
        controls: result.expected.controls.map((c) => ({ ...c, reason: "<why>", reviewRecordIds: [] })) };
      console.error(`The step to catalog ${entry.catalog.version} calls for this entry in ${CHANGELOG} (fill in each reason, and review record ids for reviewed or qualified content):\n`
        + "```amc-catalog-change\n" + canonicalize(entry) + "\n```");
    }
  }
  return result.ok ? 0 : 1;
}

if (isEntrypoint(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
