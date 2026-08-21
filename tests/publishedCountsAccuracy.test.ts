import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * G5: every count AMC published about itself had at least two live values —
 * 15 adapters against a "14 Framework Adapters" heading in the same README,
 * 244 questions against 138/67/111/240 across the docs, 143 registered packs
 * against "142" in three places, 1,121 test files against a badge saying 1,087.
 *
 * For a product whose thesis is that documented claims drift from provable
 * reality, publishing drifted claims is a live counter-example. Counts are now
 * generated from the repository and gated in CI.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const readme = readFileSync(join(repoRoot, "README.md"), "utf8");

describe("published counts", () => {
  it("README no longer contradicts itself about adapters", () => {
    // The heading said 14 while three other lines said 15.
    expect(readme).not.toContain("## 14 Framework Adapters");
    const marked = [...readme.matchAll(/<!-- amc:count:adapters -->(\d+)<!-- \/amc:count -->/g)]
      .map((m) => m[1]);
    expect(marked.length).toBeGreaterThan(1);
    // Every marked occurrence must carry the same value.
    expect(new Set(marked).size).toBe(1);
  });

  it("marked counts are machine-checkable, not prose", () => {
    for (const key of ["adapters", "assurancePacksRegistered", "testFiles", "diagnosticQuestions"]) {
      expect(readme).toContain(`<!-- amc:count:${key} -->`);
    }
  });

  it("the question-bank export is complete", () => {
    const exported = JSON.parse(
      readFileSync(join(repoRoot, "docs/AMC_QUESTION_BANK_FULL.json"), "utf8")
    ) as { questionCount: number; questions: unknown[] };
    // It called itself FULL while holding 111 of 244 questions.
    expect(exported.questions.length).toBe(exported.questionCount);
    expect(exported.questionCount).toBeGreaterThan(200);
  });

  it("the licence contradiction is surfaced rather than hidden", () => {
    const rfc = readFileSync(join(repoRoot, "docs/AMC_STANDARD_RFC.md"), "utf8");
    // LICENSE and package.json say MIT; the RFC said Apache 2.0 with no explanation.
    expect(rfc).toMatch(/UNRESOLVED/);
    expect(rfc).toMatch(/MIT/);
  });
});
