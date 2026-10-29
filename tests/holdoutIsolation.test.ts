import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { addCaseToCasebook, initCasebook, verifyCasebook } from "../src/casebooks/casebookStore.js";
import { buildHoldoutPartition, holdoutPartitionProblems } from "../src/experiments/holdoutPartition.js";
import { measurementLanguageWarnings } from "../src/experiments/measurementLanguage.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
const savedPassphrase = process.env.AMC_VAULT_PASSPHRASE;
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  if (savedPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = savedPassphrase;
});

const population = [
  ...["a1", "a2", "a3", "a4", "a5"].map((id) => ({ id, stratum: "prompt_error" })),
  ...["b1", "b2"].map((id) => ({ id, stratum: "invalid_schema" })),
  { id: "c1", stratum: "tool_misuse" }
];

describe("seeded stratified holdout partition (H2X-04)", () => {
  test("the same seed over the same population yields the same digest; another seed is a different partition", () => {
    const first = buildHoldoutPartition({ population });
    expect(buildHoldoutPartition({ population: [...population].reverse() })).toEqual(first);
    expect(buildHoldoutPartition({ population, seed: "7" }).digest).not.toBe(first.digest);
    expect(holdoutPartitionProblems(first, population.map((row) => row.id))).toEqual([]);
  });

  test("every stratum of two or more cases holds at least one case out and keeps one in search", () => {
    const partition = buildHoldoutPartition({ population });
    const byName = new Map(partition.strata.map((row) => [row.stratum, row]));
    expect(byName.get("prompt_error")).toMatchObject({ validationIds: expect.any(Array) });
    expect(byName.get("prompt_error")!.validationIds).toHaveLength(2);
    expect(byName.get("prompt_error")!.searchIds).toHaveLength(3);
    expect(byName.get("invalid_schema")!.validationIds).toHaveLength(1);
    expect(byName.get("invalid_schema")!.searchIds).toHaveLength(1);
    // One case cannot be both searched and held out.
    expect(byName.get("tool_misuse")).toEqual({ stratum: "tool_misuse", searchIds: ["c1"], validationIds: [] });
  });

  test("duplicate IDs and bad parameters are refused", () => {
    expect(() => buildHoldoutPartition({ population: [...population, { id: "a1", stratum: "invalid_schema" }] })).toThrow(/Duplicate case ID.*a1/);
    expect(() => buildHoldoutPartition({ population, validationFraction: 1 })).toThrow(/fraction/);
    expect(() => buildHoldoutPartition({ population, seed: " " })).toThrow(/seed/);
  });

  test("a tampered, overlapping or foreign partition is reported", () => {
    const partition = buildHoldoutPartition({ population });
    const moved = { ...partition, strata: partition.strata.map((row) => row.stratum === "invalid_schema"
      ? { ...row, searchIds: [...row.searchIds, ...row.validationIds] } : row) };
    expect(holdoutPartitionProblems(moved).join("; ")).toMatch(/digest does not match.*repeats or overlaps/);
    expect(holdoutPartitionProblems(partition, ["a1"])).toEqual(["partition membership does not match the case population"]);
  });
});

describe("measurement language in agent-facing task text (H2X-29)", () => {
  test("names the measurement terms without refusing", () => {
    expect(measurementLanguageWarnings("case_1 prompt", "Fix the bug. You will be graded against a hidden rubric."))
      .toEqual(["case_1 prompt: agent-facing text uses measurement language (graded, rubric); the solver may learn it is being evaluated."]);
    expect(measurementLanguageWarnings("case_1 prompt", "Upgrade the parser and keep the tests passing.")).toEqual([]);
  });

  test("casebook verify warns about a graded case prompt and stays valid", () => {
    const ws = mkdtempSync(join(tmpdir(), "amc-holdout-casebook-"));
    roots.push(ws);
    process.env.AMC_VAULT_PASSPHRASE = "amc-holdout-casebook-passphrase";
    initWorkspace({ workspacePath: ws, trustBoundaryMode: "isolated" });
    initCasebook(ws, "default", "lint");
    expect(verifyCasebook(ws, "lint", "default")).toMatchObject({ valid: true, warnings: [] });
    const added = addCaseToCasebook({ workspace: ws, agentId: "default", casebookId: "lint", title: "Graded task", description: "Operator note.",
      riskTier: "low", allowedActionClasses: ["READ_ONLY"], prompt: "Summarize the file; you will be graded on accuracy." });
    const verified = verifyCasebook(ws, "lint", "default");
    expect(verified.valid).toBe(true);
    expect(verified.warnings).toEqual([`${added.caseId} prompt: agent-facing text uses measurement language (graded); the solver may learn it is being evaluated.`]);
  });
});
