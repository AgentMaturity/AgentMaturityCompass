import { describe, expect, it } from "vitest";
import { MAX_PATCH_SECTIONS, parsePatch, patchPaths } from "../src/tools/builtin/applyPatchParse.js";
import { applyHunks, joinText, splitText } from "../src/tools/builtin/applyPatchPlan.js";

/** The Codex apply_patch grammar is parsed closed (SH-TOOLS-01): every marker form, and every refusal. */
const patch = (body: string): string => `*** Begin Patch\n${body}\n*** End Patch\n`;

describe("parsePatch", () => {
  it("parses add, delete, update with move, hunks with hints and end-of-file anchors", () => {
    const sections = parsePatch(patch([
      "*** Add File: a/new.txt", "+one", "+two",
      "*** Delete File: old.txt",
      "*** Update File: src/x.ts", "*** Move to: src/y.ts",
      "@@ function f()", " keep", "-old", "+new", "*** End of File",
      "@@", " tail", "+more"
    ].join("\n")));
    expect(sections).toEqual([
      { kind: "add", path: "a/new.txt", lines: ["one", "two"] },
      { kind: "delete", path: "old.txt" },
      { kind: "update", path: "src/x.ts", moveTo: "src/y.ts", hunks: [
        { contextHint: "function f()", eof: true, lines: [{ op: " ", text: "keep" }, { op: "-", text: "old" }, { op: "+", text: "new" }] },
        { contextHint: null, eof: false, lines: [{ op: " ", text: "tail" }, { op: "+", text: "more" }] }
      ] }
    ]);
  });

  it("accepts CRLF patches, a blank hunk line as empty context, and a first hunk without @@", () => {
    const sections = parsePatch("*** Begin Patch\r\n*** Update File: f\r\n a\r\n\r\n+b\r\n*** End Patch\r\n");
    expect(sections[0]).toMatchObject({ kind: "update", hunks: [{ lines: [{ op: " ", text: "a" }, { op: " ", text: "" }, { op: "+", text: "b" }] }] });
  });

  it.each([
    ["no begin marker", "*** Update File: f\n a\n*** End Patch", /must start with/],
    ["no end marker", "*** Begin Patch\n*** Delete File: f", /must end with/],
    ["text after the end", patch("*** Delete File: f") + "trailing", /text after/],
    ["text outside a section", patch("hello"), /outside a section/],
    ["absolute path", patch("*** Delete File: /etc/passwd"), /workspace-relative/],
    ["windows absolute path", patch("*** Delete File: C:\\x"), /workspace-relative/],
    ["dot-dot segment", patch("*** Delete File: ../x"), /must not contain/],
    ["duplicate path", patch("*** Delete File: f\n*** Delete File: f"), /appears twice/],
    ["move onto a named path", patch("*** Delete File: g\n*** Update File: f\n*** Move to: g\n a"), /appears twice/],
    ["move to itself", patch("*** Update File: f\n*** Move to: f\n a"), /own path/],
    ["bad hunk prefix", patch("*** Update File: f\n@@\n*oops"), /must start with/],
    ["add line without plus", patch("*** Add File: f\nline"), /must start with "\+"/],
    ["update without hunks", patch("*** Update File: f"), /no hunks/],
    ["empty hunk", patch("*** Update File: f\n@@\n@@\n a"), /empty hunk/],
    ["end of file without a hunk", patch("*** Update File: f\n*** End of File\n a"), /follows no hunk/],
    ["no sections", "*** Begin Patch\n*** End Patch\n", /no sections/]
  ])("refuses %s", (_label, text, reason) => {
    expect(() => parsePatch(text)).toThrow(reason);
  });

  it("refuses more than the section cap and an oversized patch", () => {
    const many = Array.from({ length: MAX_PATCH_SECTIONS + 1 }, (_, i) => `*** Delete File: f${i}`).join("\n");
    expect(() => parsePatch(patch(many))).toThrow(/more than/);
    expect(() => parsePatch(patch(`*** Add File: big\n+${"x".repeat(2_000_001)}`))).toThrow(/exceeds/);
  });
});

describe("patchPaths", () => {
  it("projects every source and move-to path, and nothing for a patch that does not parse", () => {
    expect(patchPaths(patch("*** Add File: a\n+x\n*** Update File: b\n*** Move to: c\n y"))).toEqual(["a", "b", "c"]);
    expect(patchPaths("not a patch")).toEqual([]);
    expect(patchPaths(undefined)).toEqual([]);
  });
});

describe("applyHunks", () => {
  const hunk = (lines: string, hint: string | null = null, eof = false) =>
    ({ contextHint: hint, eof, lines: lines.split("\n").map((line) => ({ op: line[0] as " " | "+" | "-", text: line.slice(1) })) });

  it("applies two hunks in order and keeps the file's form", () => {
    const plan = applyHunks("a\nb\nc\nd\n", [hunk(" a\n-b\n+B"), hunk(" c\n-d\n+D\n+E")], "f");
    expect(plan).toMatchObject({ after: "a\nB\nc\nD\nE\n", notes: [], removed: 2, added: 3 });
  });

  it("refuses an ambiguous hunk with the count and a hunk that does not match", () => {
    expect(() => applyHunks("x\nx\n", [hunk("-x\n+y")], "f")).toThrow(/matches 2 places/);
    expect(() => applyHunks("x\n", [hunk("-z\n+y")], "f")).toThrow(/does not match the file/);
  });

  it("falls back to trailing-whitespace-insensitive matching once, uniquely, and says so", () => {
    const plan = applyHunks("line  \nother\n", [hunk(" line\n-other\n+changed")], "f");
    expect(plan.after).toBe("line  \nchanged\n");
    expect(plan.notes).toEqual(["hunk 1 matched ignoring trailing whitespace"]);
    expect(() => applyHunks("line \nline\t\n", [hunk("-line\n+x")], "f")).toThrow(/matches 2 places/);
  });

  it("anchors an end-of-file hunk at the end only, and appends when it has no old lines", () => {
    expect(() => applyHunks("tail\nmore\n", [hunk("-tail\n+T", null, true)], "f")).toThrow(/at its end/);
    expect(applyHunks("a\ntail\n", [hunk("-tail\n+T", null, true)], "f").after).toBe("a\nT\n");
    expect(applyHunks("a\n", [hunk("+b", null, true)], "f").after).toBe("a\nb\n");
    expect(() => applyHunks("a\nb\n", [hunk("+c")], "f")).toThrow(/no context/);
  });

  it("uses the @@ hint to pick among repeated context", () => {
    const text = "fn a() {\n  x\n}\nfn b() {\n  x\n}\n";
    expect(applyHunks(text, [hunk("-  x\n+  y", "fn b() {")], "f").after).toBe("fn a() {\n  x\n}\nfn b() {\n  y\n}\n");
    expect(() => applyHunks(text, [hunk("-  x\n+  y", "fn c() {")], "f")).toThrow(/was not found/);
  });

  it("preserves CRLF, a BOM and a missing final newline", () => {
    expect(applyHunks("a\r\nb\r\n", [hunk("-b\n+c")], "f").after).toBe("a\r\nc\r\n");
    expect(applyHunks("\uFEFFa\nb\n", [hunk("-a\n+A")], "f").after).toBe("\uFEFFA\nb\n");
    expect(applyHunks("a\nb", [hunk("-b\n+c")], "f").after).toBe("a\nc");
    expect(applyHunks("", [hunk("+only", null, true)], "f").after).toBe("only\n");
    const { lines, form } = splitText("x\r\ny");
    expect(joinText(lines, form)).toBe("x\r\ny");
  });
});
