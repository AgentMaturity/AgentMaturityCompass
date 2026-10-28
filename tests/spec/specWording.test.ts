import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { describe, expect, test } from "vitest";

// P1-30: the Core Spec follows the truth rules in its own wording (strategy "Don't overclaim", L640).
interface SyncModule { specFiles(root: string): string[] }
const root = process.cwd();
const files = async () => ((await import("../../scripts/check-spec-sync.mjs")) as SyncModule).specFiles(root);

/** Prose with fenced code, inline code, HTML comments and generated regions blanked out. */
function prose(text: string): string {
  return text
    .replace(/<!-- amc:spec:([a-z-]+) -->[\s\S]*?<!-- \/amc:spec:\1 -->/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^```[^\n]*\n[\s\S]*?^```$/gm, "")
    .replace(/`[^`\n]+`/g, "");
}

const BANNED = /\b(certified|compliant|guaranteed|exactly once)\b/gi;
const RFC2119 = /\b(MUST NOT|MUST|SHALL NOT|SHALL|SHOULD NOT|SHOULD|REQUIRED|RECOMMENDED|OPTIONAL|MAY)\b/g;
// Chapters whose text is normative; every other spec file is informative.
const NORMATIVE = new Set(["02-conformance-classes.md", "03-claim-kinds.md", "04-evidence-model.md", "05-control-results.md",
  "06-maturity-levels.md", "07-authorization-and-receipts.md", "08-scoped-attestations.md", "09-verification.md",
  "10-versioning.md"]);

describe("AMC Core Spec wording (P1-30)", () => {
  test("banned words appear only inside quotation marks (the vocabulary's quoted bans) or generated tables", async () => {
    const offences: string[] = [];
    for (const file of await files()) {
      for (const [index, line] of prose(readFileSync(file, "utf8")).split("\n").entries()) {
        const unquoted = line.replace(/"[^"\n]*"/g, "");
        for (const match of unquoted.matchAll(BANNED)) offences.push(`${basename(file)}:${index + 1}: ${match[0]}`);
      }
    }
    expect(offences).toEqual([]);
  });

  test("RFC 2119 keywords appear only in normative chapters", async () => {
    const offences: string[] = [];
    for (const file of await files()) {
      if (NORMATIVE.has(basename(file)) && file.includes("/spec/core/")) continue;
      for (const [index, line] of prose(readFileSync(file, "utf8")).split("\n").entries()) {
        const words = line.replace(/"[^"\n]*"/g, "").match(RFC2119);
        if (words) offences.push(`${basename(file)}:${index + 1}: ${words.join(", ")}`);
      }
    }
    expect(offences).toEqual([]);
  });

  test("normative chapters use RFC 2119 keywords and say which status they carry", async () => {
    const chapters = (await files()).filter((file) => NORMATIVE.has(basename(file)));
    expect(chapters).toHaveLength(NORMATIVE.size);
    for (const file of chapters) {
      const text = readFileSync(file, "utf8");
      expect(text, file).toMatch(/^Status: normative/m);
      expect(prose(text), file).toMatch(RFC2119);
    }
  });

  test("every Annex A row carries the re-verify flag, Art. 13 stays blank and the annex stays experimental", () => {
    const text = readFileSync(resolve(root, "spec/annex/eu-ai-act-levels.md"), "utf8");
    expect(text).toMatch(/^Status: informative, experimental/m);
    expect(text).toMatch(/expert sign-off: open/i);
    const rows = text.split("\n").filter((line) => /^\| Art\. \d/.test(line));
    expect(rows.length).toBeGreaterThanOrEqual(12);
    for (const row of rows) expect(row, row).toContain("to re-verify against the primary source before publishing");
    const art13 = rows.find((row) => row.startsWith("| Art. 13 "));
    expect(art13?.split("|").map((cell) => cell.trim()).slice(2, 5)).toEqual(["", "", ""]);
  });

  test("the scope chapter carries the draft status line", () => {
    const text = readFileSync(resolve(root, "spec/core/01-scope.md"), "utf8");
    expect(text).toContain("Draft. Not a standard. AMC output is evidence of conformity, never proof of compliance.");
  });

  test("the old RFC and rubric carry the superseded banner and no contradictory licence statement", () => {
    for (const path of ["docs/AMC_STANDARD_RFC.md", "docs/OPEN_RUBRIC_STANDARD.md"]) {
      const head = readFileSync(resolve(root, path), "utf8").split("\n").slice(0, 6).join("\n");
      expect(head, path).toContain("Superseded by the AMC Core Spec 1.0 draft in spec/; kept for history");
    }
    expect(readFileSync(resolve(root, "docs/OPEN_RUBRIC_STANDARD.md"), "utf8")).not.toMatch(/proprietary/i);
  });
});
