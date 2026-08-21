import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

/**
 * Three internal documents stayed tracked in a public repository for months
 * after `.gitignore` was widened to exclude them — an ignore rule does not
 * untrack a file that is already in the index, so the rule looked like a fix
 * while changing nothing.
 *
 * These are candid competitive assessments naming a third party, and a
 * reference embedding the author's local filesystem paths. This test asserts
 * the index, not the ignore file, because the index is what actually ships.
 */
const INTERNAL_DOCS = [
  "AMC_COMPLETE_KNOWLEDGE.md",
  "COMPETITIVE_ANALYSIS_G0DM0D3.md",
  "COMPETITIVE_GAP_REPORT_G0DM0D3.md"
];

describe("internal documents are not tracked", () => {
  const tracked = execFileSync("git", ["ls-files"], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  }).split("\n");

  for (const doc of INTERNAL_DOCS) {
    it(`${doc} is absent from the git index`, () => {
      expect(tracked).not.toContain(doc);
    });
  }

  it("catches any new top-level competitive or knowledge dump", () => {
    const strays = tracked.filter((f) =>
      /^(COMPETITIVE_|AMC_COMPLETE_KNOWLEDGE)/.test(f)
    );
    expect(strays).toEqual([]);
  });
});
