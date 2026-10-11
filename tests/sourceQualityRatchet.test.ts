import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  baseCheck, baselineEntries, compareToBaseline, configSha256, duplicateFindings, knipFindings, parseBaseline,
  ratchet, serializeBaseline, trendRow
} from "../scripts/source-quality.mjs";

type Scan = "duplicates" | "dead-code";
const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, "fixtures/source-quality", name), "utf8"));
const DRIFT = "Source-quality config or tool version changed; regenerate the baseline in a reviewed PR with --rebaseline --reason";
const REASON = "initial baseline (D-11)";

function current(scan: Scan, findings: string[], extra: Record<string, unknown> = {}) {
  return {
    version: scan === "duplicates" ? "5.4.0" : "6.39.0", configSha256: "a".repeat(64), findings,
    commit: "c".repeat(40), user: "Test User", date: "2026-10-11", ...extra
  };
}
function baselineFor(scan: Scan, findings: string[]) {
  return ratchet(scan, current(scan, findings), null, { rebaseline: true, reason: REASON }).baseline;
}
function withDuplicate(report: any, first: string, second: string, fragment: string) {
  const row = structuredClone(report.duplicates[0]);
  row.firstFile.name = first;
  row.secondFile.name = second;
  row.fragment = fragment;
  return { ...report, duplicates: [...report.duplicates, row] };
}
const ids = (rows: Array<{ id: string }>) => rows.map(row => row.id);

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("source-quality ratchet", () => {
  it("passes when the current findings equal the baseline", () => {
    for (const [scan, findings] of [
      ["duplicates", duplicateFindings(fixture("jscpd-report.json"))],
      ["dead-code", knipFindings(fixture("knip-report.json"))]
    ] as Array<[Scan, string[]]>) {
      const baseline = baselineFor(scan, findings);
      expect(compareToBaseline(scan, findings, baseline)).toEqual({ newIds: [], staleIds: [], accepted: [] });
      const result = ratchet(scan, current(scan, findings), baseline);
      expect(result.exitCode).toBe(0);
      expect(result.changed).toBe(false);
      expect(result.summary).toEqual({ scan, baseline: findings.length, current: findings.length, new: 0, stale: 0, accepted: 0 });
    }
  });

  it("fails on one new duplicate pair and names both paths", () => {
    const report = fixture("jscpd-report.json");
    const baseline = baselineFor("duplicates", duplicateFindings(report));
    const findings = duplicateFindings(withDuplicate(report, "cli/newCommand.ts", "studio/newRoute.ts", "const added = 1;\nexport { added };"));
    expect(compareToBaseline("duplicates", findings, baseline).newIds).toHaveLength(1);
    const result = ratchet("duplicates", current("duplicates", findings), baseline);
    expect(result.exitCode).toBe(1);
    expect(result.summary.new).toBe(1);
    const message = result.messages.join("\n");
    expect(message).toContain("cli/newCommand.ts");
    expect(message).toContain("studio/newRoute.ts");
    expect(message).toContain("--accept");
  });

  it("counts a further copy of an already-recorded clone in the same pair as new", () => {
    const report = fixture("jscpd-report.json");
    const baseline = baselineFor("duplicates", duplicateFindings(report));
    const again = { ...report, duplicates: [...report.duplicates, structuredClone(report.duplicates[1])] };
    expect(compareToBaseline("duplicates", duplicateFindings(again), baseline).newIds).toHaveLength(1);
  });

  it("fails on a fixed finding until --shrink removes exactly that id", () => {
    const report = fixture("jscpd-report.json");
    const baseline = baselineFor("duplicates", duplicateFindings(report));
    const fixed = { ...report, duplicates: report.duplicates.slice(1) };
    const findings = duplicateFindings(fixed);
    const result = ratchet("duplicates", current("duplicates", findings), baseline);
    expect(result.exitCode).toBe(1);
    expect(result.changed).toBe(false);
    expect(result.messages.join("\n")).toContain("baseline is stale: run `npm run quality:baseline -- duplicates --shrink`");
    const { staleIds } = compareToBaseline("duplicates", findings, baseline);
    expect(staleIds).toHaveLength(1);

    const shrunk = ratchet("duplicates", current("duplicates", findings), baseline, { shrink: true });
    expect(shrunk.exitCode).toBe(0);
    expect(shrunk.changed).toBe(true);
    expect(ids(shrunk.baseline.duplicates)).toEqual(ids(baseline.duplicates).filter(id => id !== staleIds[0]));
    expect(ratchet("duplicates", current("duplicates", findings), shrunk.baseline).exitCode).toBe(0);
  });

  it("ignores a Knip finding that only moved to another line", () => {
    const report = fixture("knip-report.json");
    const baseline = baselineFor("dead-code", knipFindings(report));
    const shifted = structuredClone(report);
    shifted.issues[1].exports[0] = { ...shifted.issues[1].exports[0], line: 300, col: 3, pos: 12000 };
    expect(compareToBaseline("dead-code", knipFindings(shifted), baseline)).toEqual({ newIds: [], staleIds: [], accepted: [] });
  });

  it("treats a moved file in a duplicate pair as a new finding (documented behaviour)", () => {
    const report = fixture("jscpd-report.json");
    const baseline = baselineFor("duplicates", duplicateFindings(report));
    const moved = structuredClone(report);
    moved.duplicates[0].firstFile.name = "a4/routerMoved.ts";
    const { newIds, staleIds } = compareToBaseline("duplicates", duplicateFindings(moved), baseline);
    expect(newIds).toHaveLength(1);
    expect(staleIds).toHaveLength(1);
  });

  it("accepts a new finding only with a recorded reason of at least 20 characters", () => {
    const report = fixture("knip-report.json");
    const baseline = baselineFor("dead-code", knipFindings(report));
    const grown = structuredClone(report);
    grown.issues[1].exports.push({ name: "laterExport", line: 280, col: 17, pos: 11000 });
    const findings = knipFindings(grown);
    const [id] = compareToBaseline("dead-code", findings, baseline).newIds;
    expect(id).toMatch(/^[0-9a-f]{64}$/);

    expect(() => ratchet("dead-code", current("dead-code", findings), baseline, { accept: id })).toThrow(/--reason/);
    expect(() => ratchet("dead-code", current("dead-code", findings), baseline, { accept: id, reason: "too short reason" }))
      .toThrow(/at least 20 characters/);
    expect(() => ratchet("dead-code", current("dead-code", findings), baseline, { accept: ids(baseline.deadCode)[0], reason: "already recorded in the baseline" }))
      .toThrow(/not a new dead-code finding/);
    expect(() => ratchet("dead-code", current("dead-code", findings, { user: "" }), baseline, { accept: id, reason: "kept for the P0-14 compose verify profile" }))
      .toThrow(/git config user.name/);

    const accepted = ratchet("dead-code", current("dead-code", findings), baseline, { accept: id, reason: "kept for the P0-14 compose verify profile" });
    expect(accepted.exitCode).toBe(0);
    expect(accepted.changed).toBe(true);
    expect(accepted.baseline.deadCode).toEqual(baseline.deadCode);
    expect(accepted.baseline.accepted).toEqual([
      { id, scan: "dead-code", reason: "kept for the P0-14 compose verify profile", acceptedBy: "Test User", date: "2026-10-11" }
    ]);
    expect(accepted.summary).toMatchObject({ new: 0, stale: 0, accepted: 1 });

    // An accepted finding that disappears is stale like any other entry.
    const stale = ratchet("dead-code", current("dead-code", knipFindings(report)), accepted.baseline);
    expect(stale.exitCode).toBe(1);
    expect(stale.summary.stale).toBe(1);
    const shrunk = ratchet("dead-code", current("dead-code", knipFindings(report)), accepted.baseline, { shrink: true });
    expect(shrunk.baseline.accepted).toEqual([]);
    expect(shrunk.exitCode).toBe(0);
  });

  it("--shrink with new and stale findings removes the stale ids and adds nothing", () => {
    const report = fixture("jscpd-report.json");
    const baseline = baselineFor("duplicates", duplicateFindings(report));
    const mixed = withDuplicate({ ...report, duplicates: report.duplicates.slice(1) }, "cli/newCommand.ts", "studio/newRoute.ts", "const added = 1;");
    const findings = duplicateFindings(mixed);
    const { newIds, staleIds } = compareToBaseline("duplicates", findings, baseline);
    expect(newIds).toHaveLength(1);
    expect(staleIds).toHaveLength(1);

    const shrunk = ratchet("duplicates", current("duplicates", findings), baseline, { shrink: true });
    expect(ids(shrunk.baseline.duplicates)).toEqual(ids(baseline.duplicates).filter(id => !staleIds.includes(id)));
    expect(ids(shrunk.baseline.duplicates)).not.toContain(newIds[0]);
    expect(shrunk.baseline.accepted).toEqual([]);
    expect(shrunk.exitCode).toBe(1);
    expect(shrunk.summary).toMatchObject({ new: 1, stale: 0 });
  });

  it("fails with the drift message when .jscpd.json or a tool version changes", () => {
    const root = mkdtempSync(join(tmpdir(), "amc-source-quality-ratchet-"));
    roots.push(root);
    const config = JSON.stringify({ minTokens: 50, minLines: 5 }, null, 2);
    writeFileSync(join(root, ".jscpd.json"), config);
    const before = configSha256(root, "duplicates");
    writeFileSync(join(root, ".jscpd.json"), config.replaceAll("\n", "\r\n"));
    expect(configSha256(root, "duplicates")).toBe(before);
    writeFileSync(join(root, ".jscpd.json"), config.replace("50", "70"));
    const after = configSha256(root, "duplicates");
    expect(after).not.toBe(before);

    const findings = duplicateFindings(fixture("jscpd-report.json"));
    const baseline = ratchet("duplicates", current("duplicates", findings, { configSha256: before }), null, { rebaseline: true, reason: REASON }).baseline;
    expect(baseline.config.jscpdSha256).toBe(before);
    for (const changed of [{ configSha256: after }, { version: "5.5.0" }]) {
      for (const options of [{}, { shrink: true }]) {
        const result = ratchet("duplicates", current("duplicates", findings, changed), baseline, options);
        expect(result.exitCode).toBe(1);
        expect(result.changed).toBe(false);
        expect(result.messages).toContain(DRIFT);
      }
    }
    // A knip.json change is not drift for the duplicate scan.
    expect(ratchet("duplicates", current("duplicates", findings, { configSha256: before }), { ...baseline, config: { ...baseline.config, knipSha256: "f".repeat(64) } }).exitCode).toBe(0);

    const rebased = ratchet("duplicates", current("duplicates", findings, { configSha256: after }), baseline, { rebaseline: true, reason: "jscpd minTokens raised by D-11 follow-up" });
    expect(rebased.exitCode).toBe(0);
    expect(rebased.baseline.config.jscpdSha256).toBe(after);
    expect(() => ratchet("duplicates", current("duplicates", findings), baseline, { rebaseline: true })).toThrow(/--reason/);
  });

  it("keeps still-current accepted findings and their reasons across a rebaseline", () => {
    const report = fixture("knip-report.json");
    const baseline = baselineFor("dead-code", knipFindings(report).slice(1));
    const findings = knipFindings(report);
    const [id] = compareToBaseline("dead-code", findings, baseline).newIds;
    const accepted = ratchet("dead-code", current("dead-code", findings), baseline, { accept: id, reason: "kept for the P0-14 compose verify profile" }).baseline;
    const rebased = ratchet("dead-code", current("dead-code", findings, { version: "6.40.0" }), accepted, { rebaseline: true, reason: "knip 6.40.0 upgrade (Dependabot)" }).baseline;
    expect(rebased.accepted).toEqual(accepted.accepted);
    expect(ids(rebased.deadCode)).not.toContain(id);
    expect(rebased.tools).toEqual({ jscpd: "", knip: "6.40.0" });
  });

  it("refuses malformed tool reports", () => {
    expect(() => knipFindings({})).toThrow(/valid issue report/);
    expect(() => knipFindings({ issues: [{ exports: [] }] })).toThrow(/file identity/);
    expect(() => duplicateFindings({})).toThrow(/no source evidence/);
    expect(() => duplicateFindings({ duplicates: [], statistics: { total: { sources: 0 } } })).toThrow(/no source evidence/);
  });

  it("writes a sorted, LF, one-entry-per-line baseline and refuses a hand-made acceptance without a reason", () => {
    const findings = knipFindings(fixture("knip-report.json"));
    const baseline = baselineFor("dead-code", findings);
    const text = serializeBaseline(baseline);
    expect(text).not.toContain("\r");
    expect(text.endsWith("}\n")).toBe(true);
    expect(parseBaseline(text)).toEqual(baseline);
    for (const entry of baseline.deadCode) expect(text).toContain(`    ${JSON.stringify(entry)}`);
    const keys = baseline.deadCode.map((entry: { file: string; kind: string; id: string }) => `${entry.file}\0${entry.kind}\0${entry.id}`);
    expect(keys).toEqual([...keys].sort());
    expect(baselineEntries("dead-code", findings)).toEqual(baseline.deadCode);

    const handMade = { ...baseline, accepted: [{ id: "b".repeat(64), scan: "dead-code", reason: "ok", acceptedBy: "x", date: "2026-10-11" }] };
    expect(() => parseBaseline(JSON.stringify(handMade))).toThrow(/recorded reason/);
    const duplicated = { ...baseline, deadCode: [...baseline.deadCode, baseline.deadCode[0]] };
    expect(() => parseBaseline(JSON.stringify(duplicated))).toThrow(/malformed/);
    expect(() => parseBaseline(JSON.stringify({ ...baseline, v: 2 }))).toThrow(/malformed/);
  });

  it("prints one trend row for both scans", () => {
    const row = trendRow("2026-10-11", "0123456789abcdef", [
      { scan: "duplicates", baseline: 10, current: 11, new: 1, stale: 0, accepted: 0 },
      { scan: "dead-code", baseline: 20, current: 19, new: 0, stale: 2, accepted: 1 }
    ]);
    expect(row).toBe("| 2026-10-11 | 0123456789ab | 10 / 20 | 11 / 19 | 1 / 0 | 0 / 2 | 0 / 1 |");
  });

  it("refuses baseline entries missing from the base branch's baseline unless accepted (temp git repo)", () => {
    const root = mkdtempSync(join(tmpdir(), "amc-source-quality-base-"));
    roots.push(root);
    const git = (...args: string[]) => {
      const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout.trim();
    };
    const commit = (baseline: unknown) => {
      if (baseline === null) writeFileSync(join(root, "README.md"), "fixture\n");
      else {
        mkdirSync(join(root, "scripts/quality"), { recursive: true });
        writeFileSync(join(root, "scripts/quality/source-quality-baseline.json"), typeof baseline === "string" ? baseline : serializeBaseline(baseline));
      }
      git("add", "-A");
      git("commit", "-q", "-m", "fixture");
    };
    git("init", "-q", "-b", "main");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.invalid");
    git("config", "commit.gpgsign", "false");
    const findings = knipFindings(fixture("knip-report.json"));
    const base = baselineFor("dead-code", findings.slice(1));
    const handAdded = { ...base, deadCode: baselineEntries("dead-code", findings) };
    const [addedId] = compareToBaseline("dead-code", findings, base).newIds;

    // One-time bootstrap: the base has no baseline file at all.
    commit(null);
    git("checkout", "-q", "-b", "feature");
    expect(baseCheck(root, "dead-code", handAdded, { base: "main" })).toMatchObject({ exitCode: 0, messages: [expect.stringMatching(/one-time bootstrap/)] });

    git("checkout", "-q", "main");
    commit(base);
    git("checkout", "-q", "-B", "feature");
    expect(baseCheck(root, "dead-code", base, { base: "main" })).toEqual({ exitCode: 0, messages: [] });
    const refused = baseCheck(root, "dead-code", handAdded, { base: "main" });
    expect(refused.exitCode).toBe(1);
    expect(refused.messages.join("\n")).toContain(addedId);
    expect(refused.messages.join("\n")).toContain("--accept");
    expect(baseCheck(root, "dead-code", { ...base, deadCode: base.deadCode.slice(1) }, { base: "main" }).exitCode).toBe(0);
    const accepted = { ...base, accepted: [{ id: addedId, scan: "dead-code", reason: "kept for the P0-14 compose verify profile", acceptedBy: "Test", date: "2026-10-11" }] };
    expect(baseCheck(root, "dead-code", accepted, { base: "main" }).exitCode).toBe(0);
    // A reviewed rebaseline after tool or config drift may add entries.
    expect(baseCheck(root, "dead-code", { ...handAdded, tools: { ...handAdded.tools, knip: "6.40.0" } }, { base: "main" }).exitCode).toBe(0);

    // The merge-base decides: main shrinking after the fork does not fail the branch's older entries.
    git("checkout", "-q", "main");
    commit({ ...base, deadCode: base.deadCode.slice(1) });
    git("checkout", "-q", "feature");
    expect(baseCheck(root, "dead-code", base, { base: "main" }).exitCode).toBe(0);

    // Without origin/main the default base is int; without either it fails closed unless overridden.
    git("branch", "int", "main");
    expect(baseCheck(root, "dead-code", handAdded).exitCode).toBe(1);
    git("branch", "-D", "int");
    expect(baseCheck(root, "dead-code", base)).toMatchObject({ exitCode: 1, messages: [expect.stringMatching(/Cannot read .* int/)] });
    expect(baseCheck(root, "dead-code", base, { allowMissingBase: true })).toMatchObject({ exitCode: 0, messages: [expect.stringMatching(/--allow-missing-base/)] });
    expect(baseCheck(root, "dead-code", base, { base: "no-such-ref" }).exitCode).toBe(1);

    // An unreadable base baseline is not the bootstrap case.
    git("checkout", "-q", "main");
    commit("{ not json");
    git("checkout", "-q", "-b", "after-garbage");
    expect(baseCheck(root, "dead-code", base, { base: "main" })).toMatchObject({ exitCode: 1, messages: [expect.stringMatching(/Cannot read/)] });
  });

  it("commits a valid baseline under 1 MB for the current configs", () => {
    const text = readFileSync("scripts/quality/source-quality-baseline.json", "utf8");
    expect(Buffer.byteLength(text)).toBeLessThan(1_000_000);
    const baseline = parseBaseline(text);
    expect(serializeBaseline(baseline)).toBe(text);
    expect(baseline.config).toEqual({ jscpdSha256: configSha256(".", "duplicates"), knipSha256: configSha256(".", "dead-code") });
    expect(baseline.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("refuses an acceptance without a reason before scanning", () => {
    const result = spawnSync(process.execPath, ["scripts/source-quality.mjs", "dead-code", "--accept", "b".repeat(64)], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--reason/);
    const unknown = spawnSync(process.execPath, ["scripts/source-quality.mjs", "dead-code", "--waive"], { encoding: "utf8" });
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toMatch(/waive/);
  });
});
