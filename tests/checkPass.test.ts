import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { inCheckPass, readFileInPass } from "../src/utils/checkPass.js";
import { writeFileAtomic } from "../src/utils/fs.js";

const roots: string[] = [];
afterEach(() => { while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true }); });

describe("check pass (P2-08 gate dedupe)", () => {
  test("a nested repeat is answered once per outermost call; every outermost call runs again", () => {
    let runs = 0;
    const leaf = inCheckPass((n: number, opts: { flag?: boolean } = {}) => { runs++; return n + (opts.flag ? 1 : 0); });
    const outer = inCheckPass(() => leaf(1) + leaf(1) + leaf(1, { flag: true }) + leaf(1, { flag: true }) + leaf(2));
    expect(outer()).toBe(1 + 1 + 2 + 2 + 2);
    expect(runs).toBe(3);
    outer();
    expect(runs).toBe(6);
    leaf(1); leaf(1);
    expect(runs).toBe(8);
  });

  test("a failure is never reused and a write by this process ends reuse", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-check-pass-")); roots.push(dir);
    let runs = 0, fail = true;
    const leaf = inCheckPass(() => { runs++; if (fail) { fail = false; throw new Error("refused"); } return runs; });
    const outer = inCheckPass(() => {
      expect(() => leaf()).toThrow("refused");
      const first = leaf(), again = leaf();
      writeFileAtomic(join(dir, "x"), "x");
      return [first, again, leaf()];
    });
    expect(outer()).toEqual([2, 2, 3]);
  });

  test("a pass read is answered again only while the file's stat identity is unchanged", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-check-pass-")), path = join(dir, "f"); roots.push(dir);
    writeFileSync(path, "one");
    const outer = inCheckPass(() => {
      const first = readFileInPass(path).toString(), same = readFileInPass(path).toString();
      writeFileSync(path, "three"); // an outside writer: size and ctime change
      return [first, same, readFileInPass(path).toString()];
    });
    expect(outer()).toEqual(["one", "one", "three"]);
    expect(readFileInPass(path).toString()).toBe("three");
  });
});

describe("check pass reuse never outlives what it answered (security review)", () => {
  test("a caller mutating a returned value cannot change a later answer in the same pass", () => {
    const history = inCheckPass(() => ["key-a"]);
    const outer = inCheckPass(() => {
      const first = history(); first.push("attacker-key");
      return history();
    });
    expect(outer()).toEqual(["key-a"]);
  });

  test("a raw node:fs write inside a caller callback ends reuse", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-check-pass-")), path = join(dir, "state"); roots.push(dir);
    writeFileSync(path, "one");
    const check = inCheckPass(() => readFileSync(path, "utf8"));
    const outer = inCheckPass((callback: () => void) => { const before = check(); callback(); return [before, check()]; });
    expect(outer(() => writeFileSync(path, "two"))).toEqual(["one", "two"]);
  });

  test("an AMC_* environment change inside the pass ends reuse", () => {
    const check = inCheckPass(() => process.env.AMC_NO_SIGN ?? "unset");
    const outer = inCheckPass(() => { const before = check(); process.env.AMC_NO_SIGN = "1"; return [before, check()]; });
    try { expect(outer()).toEqual(["unset", "1"]); } finally { delete process.env.AMC_NO_SIGN; }
  });
});
