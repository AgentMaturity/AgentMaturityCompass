#!/usr/bin/env node
/**
 * Catalog changelog guard (P1-34, docs/catalog/GOVERNANCE.md). When this branch changes the catalog digest,
 * catalog/CHANGELOG.md must gain exactly one appended entry naming the new catalog version and digest and every added,
 * changed or retired control; earlier text is never edited. Compares the catalog and changelog at the merge base with
 * --base-ref (default as check:freeze: the PR base, the pushed range's start, else origin/main) with the working tree.
 * On failure prints the entry the change calls for. Reads dist/ (build first).
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
  const tmp = mkdtempSync(join(tmpdir(), "amc-catalog-base-"));
  try {
    const untar = spawnSync("tar", ["-x", "-C", tmp], { input: git(root, ["archive", "--format=tar", mergeBase, "catalog"]) });
    if (untar.status !== 0) throw new Error(`tar failed: ${untar.stderr.toString().trim()}`);
    const before = loadCatalog({ root: join(tmp, "catalog") });
    const after = loadCatalog({ root: join(root, "catalog") });
    const result = checkCatalogChangelog({
      previousLock: buildCatalogLock(before), currentLock: buildCatalogLock(after),
      previousControls: [...before.controls.values()], currentControls: [...after.controls.values()],
      previousText: has(CHANGELOG) ? git(root, ["show", `${mergeBase}:${CHANGELOG}`]).toString("utf8") : "",
      currentText: existsSync(join(root, CHANGELOG)) ? readFileSync(join(root, CHANGELOG), "utf8") : ""
    });
    if (values.json) {
      console.log(JSON.stringify({ baseRef, mergeBase, ...result }, null, 2));
    } else if (result.ok) {
      console.log(`Catalog changelog guard passed against ${baseRef} (${mergeBase.slice(0, 12)}): catalog ${result.expected?.catalog.version} ${result.expected?.catalog.digest}.`);
    } else {
      for (const issue of result.issues) console.error(`Catalog changelog guard: ${issue.code}${issue.side ? ` (${issue.side})` : ""}; see docs/catalog/GOVERNANCE.md.`);
      if (result.expected) {
        const entry = { entryVersion: 1, catalog: result.expected.catalog,
          controls: result.expected.controls.map((c) => ({ ...c, reason: "<why>", reviewRecordIds: [] })) };
        console.error(`This change calls for this entry at the end of ${CHANGELOG} (fill in each reason, and review record ids for reviewed or qualified content):\n`
          + "```amc-catalog-change\n" + canonicalize(entry) + "\n```");
      }
    }
    return result.ok ? 0 : 1;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (isEntrypoint(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
