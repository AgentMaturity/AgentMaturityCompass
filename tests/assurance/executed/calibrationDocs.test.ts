import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { afterAll, describe, expect, test } from "vitest";
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


// Display-data contracts use synthetic statistics only, without human/model provenance or admission authority.
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as generator from "../../../scripts/gen-judge-calibration.mjs";
import { canonicalize } from "../../../src/utils/json.js";
import { sha256Hex } from "../../../src/utils/hash.js";
import { wilson95, admitRegulatedJudgeResult } from "../../../src/assurance/judges/calibration.js";
const hash = (x: unknown): string => sha256Hex(Buffer.from(canonicalize(x), "utf8"));
const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
function displayRow(changes: Record<string, unknown> = {}) {
  const value = { calibrationId: "fixture-display", scenarioId: REGULATED_SCENARIO_DISPOSITIONS[0]!.id,
    provider: "openai", judge: { model: "fixture-model|<script>", temperature: 0,
      promptSha256: "1".repeat(64), rubricSha256: "2".repeat(64) },
    goldSet: { sha256: "3".repeat(64), items: 20 }, confusion: { tp: 8, fp: 2, tn: 7, fn: 3 },
    falsePositiveRate: 2 / 9, falseNegativeRate: 3 / 11,
    interval95: { fpr: wilson95(2, 9), fnr: wilson95(3, 11) },
    calibratedAt: "2020-01-01T00:00:00.000Z", expiresAt: "2021-01-01T00:00:00.000Z",
    sourceRecordSha256: "4".repeat(64), ...changes };
  return { ...value, projectionSha256: hash(value) };
}
const displayIndex = (rows: unknown[] = [displayRow()]) => ({ version: 1, kind: "documentation_display", rows });
const render = (display: unknown) => renderPendingCalibrationTable(index, REGULATED_SCENARIO_DISPOSITIONS, display);
describe("P2-27 historical calibration display data, never native authority", () => {
  test("empty display data leaves every canonical scenario pending", () => {
    expect(render(displayIndex([]))).toBe(renderPendingCalibrationTable(index, REGULATED_SCENARIO_DISPOSITIONS));
    expect(displayIndex([])).toEqual({ version: 1, kind: "documentation_display", rows: [] });
  });
  test("real renderer projects submitted historical statistics and preserves the other118 pending IDs", () => {
    const row = displayRow(), output = render(displayIndex());
    expect(output).toContain("recorded_display_only");
    expect(output).toContain("Native origin is not authenticated by this documentation check");
    expect(output).toContain("does not grant calibration, review or publication authority");
    expect(output).toContain(String(2 / 9)); expect(output).toContain(String(3 / 11));
    expect(output).toContain("2020-01-01T00:00:00.000Z"); expect(output).toContain(row.sourceRecordSha256);
    expect(output).not.toContain("<script>"); expect(output).toContain("&lt;script&gt;");
    for (const scenario of REGULATED_SCENARIO_DISPOSITIONS.slice(1))
      expect(output).toContain(`| \`${scenario.packId}\` | \`${scenario.id}\` | \`not_evaluated\` |`);
    expect(admitRegulatedJudgeResult(row).outcome).toBe("not_evaluated");
    expect(admitRegulatedJudgeResult(row).authorityStatus).toBe("unavailable");
  });
  test.each([
    { falsePositiveRate: 0 }, { falseNegativeRate: 0 }, { goldSet: { sha256: "3".repeat(64), items: 21 } },
    { interval95: { fpr: [0, 0], fnr: wilson95(3, 11) } },
    { confusion: { tp: 0, fp: 0, tn: 0, fn: 0 }, goldSet: { sha256: "3".repeat(64), items: 0 } },
    { expiresAt: "2019-01-01T00:00:00.000Z" }, { scenarioId: "unknown-scenario" },
    { publicationApproval: "approved" }, { goldSet: { sha256: "3".repeat(64), items: 20, path: "/private/gold.json" } }
  ])("rejects inconsistent or overclaimed data even with a recomputed content digest %j", change => {
    expect(() => render(displayIndex([displayRow(change)]))).toThrow();
  });
  test("rejects a corrupt digest, duplicate identities and index authority flags", () => {
    expect(() => render(displayIndex([{ ...displayRow(), projectionSha256: "0".repeat(64) }]))).toThrow();
    expect(() => render(displayIndex([displayRow(), displayRow()]))).toThrow();
    expect(() => render({ ...displayIndex(), approved: true })).toThrow();
  });
  test("generation and read-only check share the measured renderer and refuse drift without overwriting", () => {
    const generate = (generator as unknown as { generateCalibrationDocumentation?: (root: string, check: boolean) => void }).generateCalibrationDocumentation;
    expect(typeof generate).toBe("function");
    const root = mkdtempSync(join(tmpdir(), "amc-calibration-display-")); roots.push(root);
    const dir = join(root, "docs/assurance/calibration"); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.json"), JSON.stringify(index));
    writeFileSync(join(dir, "display-index.json"), JSON.stringify(displayIndex()));
    generate!(root, false);
    const output = join(root, "docs/assurance/JUDGE_CALIBRATION.md");
    expect(readFileSync(output, "utf8")).toBe(render(displayIndex()));
    expect(() => generate!(root, true)).not.toThrow();
    writeFileSync(output, "tampered documentation");
    expect(() => generate!(root, true)).toThrow(/stale/);
    expect(readFileSync(output, "utf8")).toBe("tampered documentation");
    writeFileSync(join(dir, "display-index.json"), '{"version":1,"version":1,"kind":"documentation_display","rows":[]}');
    expect(() => generate!(root, false)).toThrow(/duplicate/);
    expect(readFileSync(output, "utf8")).toBe("tampered documentation");
    expect(existsSync(join(dir, "index.json"))).toBe(true);
  });
});
