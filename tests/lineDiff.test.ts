import { describe, expect, it } from "vitest";
import { unifiedDiff } from "../src/tools/builtin/lineDiff.js";

/**
 * The bounded line diff fs.write and fs.edit return (P1-36): goldens in the
 * unified format `patch` reads, and a property check that applying the diff to
 * the old text gives the new text, including past the edit-distance bound.
 */

const lines = (...rows: string[]): string => rows.join("\n");
const numbered = (count: number, prefix: string): string =>
  Array.from({ length: count }, (_, index) => `${prefix}${index + 1}\n`).join("");

describe("unifiedDiff goldens", () => {
  it("shows an insert with three lines of context", () => {
    expect(unifiedDiff("f.txt", "a\nb\nc\n", "a\nb\nX\nc\n")).toEqual({
      text: lines("--- a/f.txt", "+++ b/f.txt", "@@ -1,3 +1,4 @@", " a", " b", "+X", " c"),
      hunks: 1,
      truncated: false
    });
  });

  it("shows a delete", () => {
    expect(unifiedDiff("f.txt", "a\nb\nc\n", "a\nc\n").text)
      .toBe(lines("--- a/f.txt", "+++ b/f.txt", "@@ -1,3 +1,2 @@", " a", "-b", " c"));
  });

  it("shows two changes far apart as two hunks", () => {
    const before = numbered(20, "");
    const after = before.replace("2\n", "two\n").replace("18\n", "eighteen\n");
    expect(unifiedDiff("src/n.txt", before, after)).toEqual({
      text: lines("--- a/src/n.txt", "+++ b/src/n.txt",
        "@@ -1,5 +1,5 @@", " 1", "-2", "+two", " 3", " 4", " 5",
        "@@ -15,6 +15,6 @@", " 15", " 16", " 17", "-18", "+eighteen", " 19", " 20"),
      hunks: 2,
      truncated: false
    });
  });

  it("keeps carriage returns as part of each line", () => {
    expect(unifiedDiff("f.txt", "a\r\nb\r\nc\r\n", "a\r\nB\r\nc\r\n").text)
      .toBe(lines("--- a/f.txt", "+++ b/f.txt", "@@ -1,3 +1,3 @@", " a\r", "-b\r", "+B\r", " c\r"));
  });

  it("marks a last line with no trailing newline", () => {
    expect(unifiedDiff("f.txt", "a\nb", "a\nb\n").text).toBe(lines("--- a/f.txt", "+++ b/f.txt",
      "@@ -1,2 +1,2 @@", " a", "-b", "\\ No newline at end of file", "+b"));
    expect(unifiedDiff("f.txt", "a\nb", "a\nc").text).toBe(lines("--- a/f.txt", "+++ b/f.txt",
      "@@ -1,2 +1,2 @@", " a", "-b", "\\ No newline at end of file", "+c", "\\ No newline at end of file"));
  });

  it("numbers an empty side as line 0 and a one-line range without a count", () => {
    expect(unifiedDiff("f.txt", "", "x\n").text).toBe(lines("--- a/f.txt", "+++ b/f.txt", "@@ -0,0 +1 @@", "+x"));
    expect(unifiedDiff("f.txt", "a\nb\nc\n", "a\nb\nX\nc\n", { context: 0 }).text)
      .toBe(lines("--- a/f.txt", "+++ b/f.txt", "@@ -2,0 +3 @@", "+X"));
  });

  it("is empty when nothing changed", () => {
    expect(unifiedDiff("f.txt", "same\n", "same\n")).toEqual({ text: "", hunks: 0, truncated: false });
  });

  it("caps the output at 400 lines with a trailer", () => {
    const diff = unifiedDiff("f.txt", numbered(500, "old"), numbered(500, "new"));
    const shown = diff.text.split("\n");
    expect(diff.truncated).toBe(true);
    expect(diff.hunks).toBe(1);
    expect(shown).toHaveLength(401);
    expect(shown.slice(0, 3)).toEqual(["--- a/f.txt", "+++ b/f.txt", "@@ -1,500 +1,500 @@"]);
    expect(shown[400]).toBe("[amc: diff truncated at 400 of 1003 lines]");
  });

  it("caps the output size even when few lines changed", () => {
    const wide = (tag: string) => Array.from({ length: 300 }, (_, index) => `${tag}${index} ${"x".repeat(500)}\n`).join("");
    const diff = unifiedDiff("f.txt", wide("a"), wide("b"));
    expect(diff.truncated).toBe(true);
    expect(diff.text.length).toBeLessThanOrEqual(100_000 + 100);
    expect(diff.text).toMatch(/\[amc: diff truncated at \d+ of 603 lines\]$/);
  });

  it("does not compute a diff when either side exceeds 50,000 lines", () => {
    expect(unifiedDiff("big.txt", numbered(50_001, ""), "x\n")).toEqual({
      text: "[amc: diff not computed for big.txt: 50001 lines before, 1 after; the limit is 50000 per side]",
      hunks: 0,
      truncated: true
    });
  });
});

/** Apply a unified diff the way `patch` would, checking every context and removed line against the old text. */
function applyDiff(before: string, diff: string): string {
  const old = before.split(/(?<=\n)/).filter(line => line.length > 0);
  const out: string[] = [];
  const rows = diff.split("\n").slice(2);
  let at = 0;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!;
    const header = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@$/.exec(row);
    if (header) {
      const start = Number(header[1]) - (header[2] === "0" ? 0 : 1);
      while (at < start) out.push(old[at++]!);
      continue;
    }
    const noNewline = rows[index + 1] === "\\ No newline at end of file";
    if (noNewline) index++;
    const line = noNewline ? row.slice(1) : `${row.slice(1)}\n`;
    if (row[0] === "+") { out.push(line); continue; }
    expect(old[at], `line ${at + 1}`).toBe(line);
    if (row[0] === " ") out.push(line);
    at++;
  }
  while (at < old.length) out.push(old[at++]!);
  return out.join("");
}

describe("unifiedDiff applies back to the new text", () => {
  // A seeded generator, so a failure names a case that reproduces.
  let seed = 0x1f2e3d4c;
  const random = (bound: number): number => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed % bound;
  };
  const text = (count: number): string[] => Array.from({ length: count }, () => "abcde"[random(5)]!);
  const join = (rows: string[], newline: boolean): string => rows.join("\n") + (newline && rows.length > 0 ? "\n" : "");

  it("for 300 random small edits, with and without a final newline", () => {
    for (let round = 0; round < 300; round++) {
      const a = text(random(30));
      const b = [...a];
      for (let edits = random(6); edits > 0; edits--) {
        const at = random(b.length + 1);
        if (random(2) === 0) b.splice(at, 1); else b.splice(at, 0, "xyz"[random(3)]!);
      }
      const before = join(a, random(4) !== 0);
      const after = join(b, random(4) !== 0);
      const diff = unifiedDiff("f.txt", before, after, { context: random(4) });
      expect(diff.truncated, `round ${round}`).toBe(false);
      expect(applyDiff(before, diff.text), `round ${round}`).toBe(after);
    }
  });

  it("past the edit-distance bound, as one replacing hunk", () => {
    const before = numbered(1_200, "keep-").replace(/keep-(\d*[02468])\n/g, "old-$1\n");
    const after = numbered(1_200, "keep-").replace(/keep-(\d*[02468])\n/g, "new-$1\n");
    const diff = unifiedDiff("f.txt", before, after, { maxOutputLines: 10_000 });
    expect(diff.truncated).toBe(false);
    expect(applyDiff(before, diff.text)).toBe(after);
  });
});
