/**
 * P3-20 ROI worksheet in Activate's value view: V = (h_before − h_after) × r + n_prevented × c_finding − (p + i + m),
 * each input a range with its source, V a range. A missing or invalid input is named and never read as zero.
 */
import { describe, expect, test } from "vitest";
import { ROI_FORMULA, roiWorksheet, type RoiInput } from "../../src/a4/a4Value.js";

const at = (low: number, high: number, source = "partner P1-29 baseline fixture"): RoiInput => ({ low, high, source });
/** A fixture partner workflow: 1200→700 reviewer hours a year at 80–100 USD, 3–5 prevented findings at 2–4 kUSD. */
const partner = { h_before: at(1100, 1200), h_after: at(600, 700), r: at(80, 100), n_prevented: at(3, 5), c_finding: at(2000, 4000),
  p: at(6000, 6000), i: at(2000, 3000), m: at(3650, 3650, "budgetCostUsdPerDay × 365") };

describe("ROI worksheet (P3-20)", () => {
  test("evaluates V as a range from every input's range, labelled self_reported, with the inputs it used", () => {
    const sheet = roiWorksheet(partner);
    expect(sheet).toMatchObject({ status: "evaluated", formula: ROI_FORMULA, claimKind: "self_reported", reasonCodes: [] });
    // low: (1100 − 700) × 80 + 3 × 2000 − (6000 + 3000 + 3650) = 32000 + 6000 − 12650; high: (1200 − 600) × 100 + 5 × 4000 − (6000 + 2000 + 3650).
    expect(sheet.value).toEqual({ low: 25_350, high: 68_350, unit: "usd_per_year" });
    expect(sheet.inputs.m).toEqual(partner.m);
    expect(Object.keys(sheet.inputs)).toEqual(["h_before", "h_after", "r", "n_prevented", "c_finding", "p", "i", "m"]);
  });

  test("names each missing input and never evaluates with it as zero", () => {
    const { r: _r, i: _i, ...rest } = partner;
    const sheet = roiWorksheet(rest);
    expect(sheet).toMatchObject({ status: "not_evaluated", value: null, reasonCodes: ["ROI_INPUT_MISSING:r", "ROI_INPUT_MISSING:i"] });
    expect(sheet.inputs.r).toBeNull();
    // Activate answers only the cost cap today, so the view's worksheet names the seven partner inputs.
    expect(roiWorksheet({ m: partner.m }).reasonCodes).toHaveLength(7);
  });

  test("refuses an inverted, negative or non-finite range", () => {
    expect(roiWorksheet({ ...partner, r: at(100, 80) }).reasonCodes).toEqual(["ROI_INPUT_INVALID:r"]);
    expect(roiWorksheet({ ...partner, p: at(-1, 0) }).reasonCodes).toEqual(["ROI_INPUT_INVALID:p"]);
    expect(roiWorksheet({ ...partner, h_after: at(Number.NaN, 1) }).value).toBeNull();
  });
});
