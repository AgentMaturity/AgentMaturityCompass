import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, expect, test } from "vitest";
import { caseNames, FIXTURES } from "./fixtures.js";

const scratch = mkdtempSync(join(tmpdir(), "amc-verifier-fixtures-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]));
}

test("regenerating the fixtures is byte-identical to spec/fixtures/v1", () => {
  const run = spawnSync(process.execPath, [join(FIXTURES, "generate.mjs"), "--out", scratch], { encoding: "utf8", timeout: 60_000 });
  expect(run.status, run.stderr).toBe(0);
  const generated = caseNames(scratch);
  // No committed case the generator no longer writes, and no generated case left uncommitted.
  expect(caseNames()).toEqual(generated);
  for (const name of generated) {
    const fresh = files(join(scratch, name)).map(path => relative(scratch, path)).sort();
    expect(files(join(FIXTURES, name)).map(path => relative(FIXTURES, path)).sort(), name).toEqual(fresh);
    for (const path of fresh) expect(readFileSync(join(FIXTURES, path)).equals(readFileSync(join(scratch, path))), path).toBe(true);
  }
});

test("every fixture key is marked TEST ONLY and no private key is committed", () => {
  for (const name of caseNames()) {
    const list = JSON.parse(readFileSync(join(FIXTURES, name, "trust-list.json"), "utf8")) as { list: { entries: Array<{ subject: string }> } };
    for (const entry of list.list.entries) expect(entry.subject.startsWith("TEST ONLY"), `${name}: ${entry.subject}`).toBe(true);
    for (const path of files(join(FIXTURES, name))) expect(readFileSync(path, "utf8")).not.toMatch(/PRIVATE KEY/);
  }
});
