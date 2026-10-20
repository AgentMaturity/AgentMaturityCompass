import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { renderPendingCalibrationTable } from "../../../scripts/gen-judge-calibration.mjs";
import { REGULATED_SCENARIO_DISPOSITIONS } from "../../../src/assurance/executed/registry.js";

const index = JSON.parse(readFileSync(new URL("../../../docs/assurance/calibration/index.json", import.meta.url), "utf8"));
describe("P2-27 public calibration status", () => {
  test("actual deterministic renderer covers119 exact IDs and matches the public pending document", () => {
    const rendered = renderPendingCalibrationTable(index, REGULATED_SCENARIO_DISPOSITIONS);
    expect(rendered).toBe(readFileSync(new URL("../../../docs/assurance/JUDGE_CALIBRATION.md", import.meta.url), "utf8"));
    expect(renderPendingCalibrationTable(index, [...REGULATED_SCENARIO_DISPOSITIONS].reverse())).toBe(rendered);
    for (const row of REGULATED_SCENARIO_DISPOSITIONS) expect(rendered).toContain(`| \`${row.packId}\` | \`${row.id}\` | \`not_evaluated\` |`);
    expect(rendered).toContain("No calibrated model, numeric error rate");
  });
  test.each([
    { state: "pass" }, { humanLabels: "approved" }, { expertMinimumAndTolerances: "approved" },
    { sidPublicationApproval: "approved" }, { calibrations: [{ falsePositiveRate: 0, humanReviewed: true }] }
  ])("refuses substituted measured or approval claims %j", change => {
    expect(() => renderPendingCalibrationTable({ ...index, ...change }, REGULATED_SCENARIO_DISPOSITIONS)).toThrow(/Only the explicit pending/);
  });
  test("missing or duplicate canonical rows cannot produce a complete pending inventory", () => {
    expect(() => renderPendingCalibrationTable(index, REGULATED_SCENARIO_DISPOSITIONS.slice(1))).toThrow(/exact119|exact 119/);
    const duplicate = [...REGULATED_SCENARIO_DISPOSITIONS]; duplicate[0] = duplicate[1]!;
    expect(() => renderPendingCalibrationTable(index, duplicate)).toThrow(/exact119|exact 119/);
  });
});
