#!/usr/bin/env node
/**
 * Reachability check for a source module.
 *
 * Reports every importer of a file, split by whether the importer is itself
 * reachable from a real entry point (CLI, API router, studio server) or only
 * from a barrel/test. A module with no importers, or one reachable only from a
 * barrel that nothing consumes, is dead for product purposes.
 *
 * Usage: node scripts/dev/reachability.mjs src/foo/bar.ts [...more]
 */
import { execFileSync } from "node:child_process";
import { basename, extname } from "node:path";

function grepImporters(stem) {
  // Match `from "...<stem>.js"` / `import("...<stem>.js")` across sources.
  const pattern = `(from|import\\()\\s*['"\`][^'"\`]*/${stem}\\.js['"\`]`;
  try {
    const out = execFileSync(
      "grep",
      ["-rEl", pattern, "src", "tests", "scripts", "api"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

const BARRELS = new Set(["index.ts"]);
const results = [];

for (const file of process.argv.slice(2)) {
  const stem = basename(file, extname(file));
  const importers = grepImporters(stem).filter((f) => f !== file);
  const barrels = importers.filter((f) => BARRELS.has(basename(f)));
  const tests = importers.filter((f) => f.startsWith("tests/"));
  const real = importers.filter(
    (f) => !BARRELS.has(basename(f)) && !f.startsWith("tests/")
  );
  const verdict =
    real.length > 0 ? "REACHABLE" : barrels.length > 0 ? "BARREL-ONLY" : tests.length > 0 ? "TEST-ONLY" : "DEAD";
  results.push({ file, verdict, real, barrels, tests });
}

for (const r of results) {
  console.log(`${r.verdict.padEnd(12)} ${r.file}`);
  if (r.real.length) console.log(`             product: ${r.real.join(", ")}`);
  if (r.barrels.length) console.log(`             barrels: ${r.barrels.join(", ")}`);
  if (r.tests.length) console.log(`             tests:   ${r.tests.length} file(s)`);
}
const dead = results.filter((r) => r.verdict === "DEAD" || r.verdict === "TEST-ONLY");
console.log(`\n${dead.length}/${results.length} candidates are DEAD or TEST-ONLY`);
