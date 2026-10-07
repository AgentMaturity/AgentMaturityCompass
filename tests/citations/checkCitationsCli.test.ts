import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "../../scripts/check-citations.mjs";

type Finding = { rule: string; file: string; location: string; message: string; zeroTolerance: boolean };
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const finding = (rule: string, zeroTolerance: boolean, file = "src/a.ts"): Finding =>
  ({ rule, file, location: "loc", message: `${rule} fixture finding`, zeroTolerance });

function baselineFile(rules: Record<string, Record<string, number>>): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-citations-baseline-"));
  dirs.push(dir);
  const path = join(dir, "citations-baseline.json");
  const body = Object.fromEntries(Object.entries(rules).map(([rule, counts]) =>
    [rule, { zeroTolerance: false, issue: "P0-24", reason: "fixture debt", counts }]));
  writeFileSync(path, JSON.stringify({ rules: body, reason: "fixture", updatedAt: "2026-10-07" }));
  return path;
}

async function run(argv: string[], findings: Finding[], baselinePath: string) {
  const out: string[] = [];
  const code = await main(argv, { findings, baselinePath, log: (line: string) => out.push(line), error: (line: string) => out.push(line) });
  return { code, text: out.join("\n") };
}

describe("check-citations CLI", () => {
  it("exits 1 when a ratcheted count rises above its baseline", async () => {
    const path = baselineFile({ CIT004: { "src/a.ts": 1 } });
    const { code, text } = await run([], [finding("CIT004", false), finding("CIT004", false)], path);
    expect(code).toBe(1);
    expect(text).toContain("citations: errors=1 ratcheted=2 baseline=1");
    expect(text).toMatch(/CIT004 src\/a\.ts: 2 > baseline 1/);
  });

  it("exits 0 below the baseline and suggests --update-baseline", async () => {
    const path = baselineFile({ CIT004: { "src/a.ts": 2 } });
    const { code, text } = await run([], [finding("CIT004", false)], path);
    expect(code).toBe(0);
    expect(text).toContain("citations: errors=0 ratcheted=1 baseline=2");
    expect(text).toContain("--update-baseline");
  });

  it("exits 1 on a zero-tolerance finding even when the baseline lists it", async () => {
    const path = baselineFile({ CIT003: { "src/a.ts": 1 } });
    const { code, text } = await run([], [finding("CIT003", true)], path);
    expect(code).toBe(1);
    expect(text).toContain("CIT003 fixture finding");
  });

  it("refuses --update-baseline without --reason", async () => {
    const path = baselineFile({});
    const before = readFileSync(path, "utf8");
    const { code, text } = await run(["--update-baseline"], [finding("CIT004", false)], path);
    expect(code).toBe(1);
    expect(text).toContain("--reason");
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("rejects an unknown flag", async () => {
    const path = baselineFile({});
    const { code, text } = await run(["--frobnicate"], [], path);
    expect(code).toBe(1);
    expect(text).toContain("--frobnicate");
  });

  it("writes current ratcheted counts and the reason with --update-baseline --reason", async () => {
    const path = baselineFile({ CIT004: { "src/a.ts": 3 } });
    const { code } = await run(["--update-baseline", "--reason", "P0-24 fixed two records"], [finding("CIT004", false)], path);
    expect(code).toBe(0);
    const written = JSON.parse(readFileSync(path, "utf8"));
    expect(written.reason).toBe("P0-24 fixed two records");
    expect(written.rules.CIT004).toMatchObject({ zeroTolerance: false, issue: expect.stringMatching(/^P\d-\d{2}$/), reason: "P0-24 fixed two records", counts: { "src/a.ts": 1 } });
    expect(written.rules.CIT003).toMatchObject({ zeroTolerance: true, counts: {} });
  });

  it("refuses a baseline entry with counts but no issue key or reason", async () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-citations-baseline-"));
    dirs.push(dir);
    const path = join(dir, "b.json");
    writeFileSync(path, JSON.stringify({ rules: { CIT004: { zeroTolerance: false, counts: { "src/a.ts": 1 } } }, reason: "x", updatedAt: "2026-10-07" }));
    const { code, text } = await run([], [finding("CIT004", false)], path);
    expect(code).toBe(1);
    expect(text).toMatch(/CIT004.*issue/);
  });

  it("prints a JSON summary with per-rule totals", async () => {
    const path = baselineFile({ CIT004: { "src/a.ts": 1 } });
    const { code, text } = await run(["--json"], [finding("CIT004", false)], path);
    expect(code).toBe(0);
    const summary = JSON.parse(text);
    expect(summary).toMatchObject({ ok: true, errors: 0, ratcheted: 1, baseline: 1 });
    expect(summary.rules.CIT004).toMatchObject({ findings: 1, baseline: 1 });
  });
});
