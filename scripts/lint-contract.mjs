#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "amc-lint-contract-"));
const config = join(root, ".oxlintrc.json");
const cli = join(root, "node_modules/oxlint/bin/oxlint");
function lint(file) {
  const result = spawnSync(process.execPath, [cli, "--type-aware", "--deny-warnings", "-c", config, "--format", "json", file],
    { cwd: scratch, encoding: "utf8", timeout: 60_000 });
  assert.ifError(result.error);
  return { status: result.status, report: JSON.parse(result.stdout) };
}
try {
  writeFileSync(join(scratch, "tsconfig.json"), JSON.stringify({
    compilerOptions: { target: "ES2022", strict: true, noEmit: true, types: [], lib: ["ES2022", "DOM"] },
    include: ["*.ts"]
  }));
  const bad = join(scratch, "bad.ts");
  writeFileSync(bad, `export {};
const unsafeHandler: string = "alert('unsafe')";
setTimeout(unsafeHandler, 0);
new Promise<void>(async resolve => { resolve(); });
function swallowedFailure() { try { throw new Error("failure"); } finally { return true; } }
swallowedFailure();
`);
  const negative = lint(bad);
  assert.equal(negative.status, 1, "Unsafe fixtures must fail the real linter");
  for (const rule of ["no-implied-eval", "no-async-promise-executor", "no-unsafe-finally"]) {
    assert(negative.report.diagnostics.some(diagnostic => diagnostic.code.includes(rule)), `Missing diagnostic: ${rule}`);
  }
  const good = join(scratch, "good.ts");
  writeFileSync(good, `export {};
setTimeout(() => {}, 0);
new Promise<void>(resolve => { resolve(); });
function preservedFailure() { try { throw new Error("failure"); } finally { console.log("cleanup"); } }
`);
  const positive = lint(good);
  assert.equal(positive.status, 0, "Safe counterparts must pass");
  assert.equal(positive.report.diagnostics.length, 0);
  console.log("Lint contract passed: three unsafe patterns rejected; safe counterparts accepted.");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
