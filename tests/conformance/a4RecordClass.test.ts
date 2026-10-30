import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { conformanceResultsV1Schema } from "../../src/contracts/index.js";
import { DOUBLES, outcomeOf, runConformance } from "./runConformance.js";

const double = (mode: string) => `${process.execPath} ${DOUBLES}/a4RecordDouble.mjs ${mode} {record} --trust-list {trustList} --trust-root {trustRoot}`;
const FIXTURES = ["valid", "second-vote-lands", "builder-approved-own-revision", "stale-approval", "dangling-evidence-ref",
  "deleted-evidence-ref", "tampered-transition"];

describe("a4-record class (P3-24)", () => {
  test("the manifest runs exactly P1-63's seven fixtures, all normative, under the fixture trust list", () => {
    const manifest = JSON.parse(readFileSync("spec/conformance/v1/a4-record.json", "utf8")) as { class: string; cases: Array<{ name: string; normative: boolean; record: string }> };
    expect(manifest.class).toBe("a4-record");
    expect(manifest.cases.map(item => item.name)).toEqual(FIXTURES);
    for (const item of manifest.cases) {
      expect(item.normative).toBe(true);
      expect(item.record).toBe(`tests/fixtures/contracts/a4-record/${item.name}.json`);
    }
  });

  test("AMC's own `amc a4 verify` passes every case and is conformant, reported under its own class", () => {
    const { status, results } = runConformance("a4-record", double("correct"));
    expect(results?.cases.filter(item => item.outcome !== "pass")).toEqual([]);
    expect(conformanceResultsV1Schema.parse(results)).toMatchObject({ class: "a4-record", conformant: true, summary: { normativePassed: 7, normativeTotal: 7 } });
    expect(status).toBe(0);
  }, 300_000);

  test.each([
    ["ignore-sod", "A4R-003"],
    ["count-stale", "A4R-004"],
    ["no-codes", "A4R-004"],
    ["unlisted-member", "A4R-001"]
  ])("%s fails %s and is not conformant", (mode, id) => {
    const { status, results } = runConformance("a4-record", double(mode));
    expect(outcomeOf(results, id)).toBe("fail");
    expect(results?.conformant).toBe(false);
    expect(status).toBe(1);
  }, 300_000);

  test("the verifier class does not list the A4 fixtures", () => {
    expect(readFileSync("spec/conformance/v1/verifier.json", "utf8")).not.toContain("a4-record");
  });

  test("the committed AMC a4-record results are conformant under the current fixture set", () => {
    const committed = conformanceResultsV1Schema.parse(JSON.parse(readFileSync("spec/conformance/results/amc-a4-verify-1.2.0.json", "utf8")));
    const { raw } = runConformance("a4-record", double("correct"), ["--cases", "A4R-001"]);
    expect(committed).toMatchObject({ class: "a4-record", conformant: true });
    expect(committed.fixtureSetDigest).toBe((raw as { fixtureSetDigest: string }).fixtureSetDigest);
  }, 300_000);
});
