import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import { DETECTOR_SET_DIGEST, protectedWalk } from "../../src/dataflow/detectors.js";

/**
 * P2-02 detector quality report: the labelled synthetic corpus (tests/fixtures/dataflow/detector-quality-corpus.json) is
 * walked as an opted-in path walks it, and each replaced region is scored against the planted values: a planted value is
 * found when a region of its class covers it or lies inside it (a phone span starts after its `+` or `(`), and a region
 * that matches no planted value of its class that way is a false positive. An encoded value is planted as written.
 * Per-class precision and recall go to dataflow-detectors.json (AMC_DETECTOR_QUALITY_REPORT, else the temp directory),
 * with what the detectors do not cover. Every planted card number, SSN and MRN must be found. Detection is never complete.
 */
interface Planted { readonly value: string; readonly dataClass: string; readonly kind: string }
const corpus = JSON.parse(readFileSync(join(__dirname, "../fixtures/dataflow/detector-quality-corpus.json"), "utf8")) as {
  readonly schema: string; readonly requiredRecall: Readonly<Record<string, number>>;
  readonly samples: readonly { readonly id: string; readonly text: string; readonly planted: readonly Planted[] }[]; readonly notCovered: readonly string[];
};
const matches = (region: { readonly dataClass: string; readonly raw: string }, planted: Planted) =>
  region.dataClass === planted.dataClass && (region.raw.includes(planted.value) || planted.value.includes(region.raw));
const ratio = (numerator: number, denominator: number) => denominator === 0 ? null : Number((numerator / denominator).toFixed(4));

function score() {
  const classes = new Map<string, { planted: number; found: number; regions: number; truePositiveRegions: number; falsePositiveSamples: string[] }>();
  const kinds = new Map<string, { planted: number; found: number; missedSamples: string[] }>();
  const of = (dataClass: string) => classes.get(dataClass) ?? classes.set(dataClass, { planted: 0, found: 0, regions: 0, truePositiveRegions: 0, falsePositiveSamples: [] }).get(dataClass)!;
  for (const sample of corpus.samples) {
    const regions: { dataClass: string; raw: string }[] = [];
    protectedWalk({ budget: 16_777_216, replace: (finding, raw) => { regions.push({ dataClass: finding.dataClass, raw }); return "<r>"; } }).text(sample.text);
    for (const planted of sample.planted) {
      const found = regions.some(region => matches(region, planted));
      const entry = of(planted.dataClass); entry.planted += 1; if (found) entry.found += 1;
      const kind = kinds.get(planted.kind) ?? kinds.set(planted.kind, { planted: 0, found: 0, missedSamples: [] }).get(planted.kind)!;
      kind.planted += 1; if (found) kind.found += 1; else kind.missedSamples.push(sample.id);
    }
    for (const region of regions) {
      const entry = of(region.dataClass); entry.regions += 1;
      if (sample.planted.some(planted => matches(region, planted))) entry.truePositiveRegions += 1;
      else if (!entry.falsePositiveSamples.includes(sample.id)) entry.falsePositiveSamples.push(sample.id);
    }
  }
  return {
    schema: "amc.dataflow-detectors-report/v1", support: "experimental", completeDetection: false, detectorSetDigest: DETECTOR_SET_DIGEST,
    corpus: { schema: corpus.schema, samples: corpus.samples.length, negatives: corpus.samples.filter(sample => sample.planted.length === 0).length,
      planted: corpus.samples.reduce((sum, sample) => sum + sample.planted.length, 0) },
    classes: Object.fromEntries([...classes].sort(([a], [b]) => a.localeCompare(b)).map(([dataClass, entry]) => [dataClass, {
      planted: entry.planted, found: entry.found, falseNegatives: entry.planted - entry.found, regions: entry.regions,
      falsePositives: entry.regions - entry.truePositiveRegions, falsePositiveSamples: entry.falsePositiveSamples,
      precision: ratio(entry.truePositiveRegions, entry.regions), recall: ratio(entry.found, entry.planted) }])),
    kinds: Object.fromEntries([...kinds].sort(([a], [b]) => a.localeCompare(b)).map(([kind, entry]) => [kind, { ...entry, recall: ratio(entry.found, entry.planted) }])),
    notCovered: corpus.notCovered
  };
}

describe("the detector quality report", () => {
  const report = score();
  test("writes per-class precision and recall to dataflow-detectors.json, with what is not covered", () => {
    const path = process.env.AMC_DETECTOR_QUALITY_REPORT ?? join(tmpdir(), "amc-detector-quality", "dataflow-detectors.json");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(report);
    expect(report.completeDetection).toBe(false);
    expect(report.notCovered.length).toBeGreaterThan(0);
    for (const entry of Object.values(report.classes)) {
      expect(entry.recall === null || (entry.recall >= 0 && entry.recall <= 1)).toBe(true);
      expect(entry.precision === null || (entry.precision >= 0 && entry.precision <= 1)).toBe(true);
    }
  });
  test("every planted card number, SSN and MRN is found", () => {
    for (const [kind, required] of Object.entries(corpus.requiredRecall)) {
      expect(report.kinds[kind], kind).toMatchObject({ recall: required, missedSamples: [] });
      expect(report.kinds[kind]!.planted, kind).toBeGreaterThan(0);
    }
  });
  test("no negative sample is flagged, and the report holds no planted value", () => {
    const negatives = new Set(corpus.samples.filter(sample => sample.planted.length === 0).map(sample => sample.id));
    for (const entry of Object.values(report.classes)) expect(entry.falsePositiveSamples.filter(id => negatives.has(id))).toEqual([]);
    const text = JSON.stringify(report);
    for (const sample of corpus.samples) for (const planted of sample.planted) expect(text).not.toContain(planted.value);
  });
});
