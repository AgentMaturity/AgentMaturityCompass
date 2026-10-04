// Mutation check: apply one mutation at a time, run the named tests, restore the file byte-for-byte.
// Run from the repo root: node AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/apply/mobility/mutate.mjs <mutations.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const [specPath, outPath] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const results = [];
const run = (tests) => {
  const r = spawnSync("npx", ["vitest", "run", ...tests], { encoding: "utf8" });
  const line = (r.stdout + r.stderr).split("\n").find((l) => /^\s+Tests\s/.test(l)) ?? "no summary";
  return { exit: r.status, summary: line.trim() };
};
for (const m of spec) {
  const original = readFileSync(m.file, "utf8");
  if (!original.includes(m.find)) throw new Error(`${m.name}: pattern not found in ${m.file}`);
  writeFileSync(m.file, original.replace(m.find, m.replace));
  const red = run(m.tests);
  writeFileSync(m.file, original);
  const green = run(m.tests);
  results.push({ guard: m.guard, mutation: m.name, file: m.file, red, restoredGreen: green });
  console.log(m.name, "| mutated:", red.summary, "| restored:", green.summary);
}
writeFileSync(outPath, JSON.stringify(results, null, 2) + "\n");
