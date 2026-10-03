import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkRegulatoryCurrency, parseRegisterDate } from "../scripts/check-regulatory-currency.mjs";

const SCRIPT = "scripts/check-regulatory-currency.mjs";
const REGISTER_PATH = "src/compliance/regulatoryRegister/register.json";
// Pinned so these tests do not change verdict with the wall clock; the script
// itself (no --as-of) is the dated gate.
const AS_OF = "2026-10-03";
const register = () => JSON.parse(readFileSync(REGISTER_PATH, "utf8"));
const dir = mkdtempSync(join(tmpdir(), "amc-regcurrency-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function runScript(registerObj?: unknown, asOf = AS_OF) {
  const args = [SCRIPT, "--as-of", asOf];
  if (registerObj !== undefined) {
    const path = join(dir, `register-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(path, JSON.stringify(registerObj));
    args.push("--register", path);
  }
  return spawnSync(process.execPath, args, { encoding: "utf8" });
}

describe("check-regulatory-currency script", () => {
  it("passes on the committed register and prints the counts", () => {
    const run = runScript();
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    const r = register();
    const verified = r.entries.filter((e: { verified: boolean }) => e.verified).length;
    expect(run.stdout).toContain(`entries=${r.entries.length} verified=${verified} unverified=${r.entries.length - verified}`);
  });

  it("exits 1 when an entry's lastReviewed lapses past the policy window", () => {
    const r = register();
    r.entries[0].lastReviewed = "2024-01-01";
    const run = runScript(r);
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/lastReviewed 2024-01-01 is \d+ days old; policy window is 90 days/);
  });

  it("goes stale on its own once the window passes", () => {
    const run = runScript(undefined, "2027-06-01");
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("policy window is 90 days");
  });

  it("exits 1 when an entry has no source", () => {
    const r = register();
    r.entries[1].sources = [];
    const run = runScript(r);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("has no source");
  });
});

describe("register validation rules", () => {
  it("requires retrievedAt on every source", () => {
    const r = register();
    delete r.entries[0].sources[0].retrievedAt;
    const result = checkRegulatoryCurrency(r, { asOf: AS_OF });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("lacks a valid retrievedAt");
  });

  it("rejects verified=true over an unverified date", () => {
    const r = register();
    r.entries[0].keyDates[0].verified = false;
    expect(r.entries[0].verified).toBe(true);
    const result = checkRegulatoryCurrency(r, { asOf: AS_OF });
    expect(result.errors.join("\n")).toContain("verified=true but it has unverified");
  });

  it("rejects an unfetched source without a reason", () => {
    const r = register();
    const unfetched = r.entries.flatMap((e: { sources: Array<{ fetched: boolean; note?: string }> }) => e.sources).find((s: { fetched: boolean }) => !s.fetched);
    delete unfetched.note;
    expect(checkRegulatoryCurrency(r, { asOf: AS_OF }).errors.join("\n")).toContain("was not fetched and needs a note");
  });

  it("parses only real calendar dates", () => {
    expect(Number.isNaN(parseRegisterDate("2026-02-30"))).toBe(true);
    expect(Number.isNaN(parseRegisterDate("2023-12"))).toBe(false);
    expect(Number.isNaN(parseRegisterDate("2026-10-03T16:22:05Z"))).toBe(false);
  });
});
