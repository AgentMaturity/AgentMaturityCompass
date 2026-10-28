/**
 * P2-19: the experimental AMC-to-OWASP Agentic Top 10 (ASI) crosswalk. Every entry is experimental with a rationale and
 * names a real Layer 0 control; every ASI id is mapped (here or through P1-48's reused mapping) or listed as a gap.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { describe, expect, test } from "vitest";

const CONTROLS = join("catalog", "layers", "l0-baseline", "controls");
const crosswalk = JSON.parse(readFileSync(join("docs", "standards", "crosswalks", "owasp-asi-2026.json"), "utf8")) as {
  framework: string; support: string; satisfiesTargets: boolean; review: { status: string; expert: string | null };
  reused: { scenarios: string; controls: string[] };
  entries: Array<{ control: string; framework: string; clause: string; relation: string; rationale: string; support: string }>;
  gaps: Array<{ clause: string; reason: string }>;
};
const ASI = Array.from({ length: 10 }, (_, index) => `ASI${String(index + 1).padStart(2, "0")}`);
const control = (id: string) => YAML.parse(readFileSync(join(CONTROLS, `${id}.yaml`), "utf8")) as {
  id: string; crosswalk: Array<{ framework: string; clause: string }> };

describe("OWASP ASI 2026 crosswalk", () => {
  test("is experimental, unreviewed and never satisfies a target", () => {
    expect(crosswalk).toMatchObject({ framework: "owasp-asi-2026", support: "experimental", satisfiesTargets: false, review: { status: "pending", expert: null } });
  });

  test("every entry is experimental, uses the P1-09 relation vocabulary, has a rationale and names a real Layer 0 control", () => {
    expect(crosswalk.entries.length).toBeGreaterThan(0);
    for (const entry of crosswalk.entries) {
      expect(entry, entry.control).toMatchObject({ framework: "owasp-asi-2026", support: "experimental" });
      expect(["equivalent", "partial", "conflicting"]).toContain(entry.relation);
      expect(entry.rationale.trim().length, entry.control).toBeGreaterThan(20);
      expect(ASI).toContain(entry.clause);
      expect(control(entry.control).id).toBe(entry.control);
    }
  });

  test("P1-48's mapping is reused, not restated", () => {
    for (const id of crosswalk.reused.controls) {
      expect(control(id).crosswalk.some((row) => row.framework === "owasp-asi-2026"), id).toBe(true);
      expect(crosswalk.entries.some((entry) => entry.control === id), id).toBe(false);
    }
    const cases = JSON.parse(readFileSync(crosswalk.reused.scenarios, "utf8")) as { cases: Array<{ owaspAsi: string[] }> };
    expect(cases.cases.flatMap((item) => item.owaspAsi).every((id) => ASI.includes(id))).toBe(true);
  });

  test("every ASI id is either mapped or listed as a gap, never both", () => {
    const reused = crosswalk.reused.controls.flatMap((id) => control(id).crosswalk.filter((row) => row.framework === "owasp-asi-2026").map((row) => row.clause));
    const mapped = new Set([...reused, ...crosswalk.entries.map((entry) => entry.clause)]);
    const gaps = new Set(crosswalk.gaps.map((gap) => gap.clause));
    for (const id of ASI) expect(mapped.has(id) !== gaps.has(id), id).toBe(true);
    for (const gap of crosswalk.gaps) expect(gap.reason.trim().length, gap.clause).toBeGreaterThan(20);
  });
});
