import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const repoRoot = resolve(__dirname, "..");
const script = join(repoRoot, "scripts/check-no-fabrication.mjs");
const trees: string[] = [];

interface Allowlist {
  permanent?: Array<{ file: string; rule: string; reason: string }>;
  pending?: Array<{ file: string; rule: string; owner: string; reason: string }>;
  pathPresence?: string[];
  pathPresenceBaseline?: number;
}

function tree(files: Record<string, string>, allowlist: Allowlist = {}): string {
  const root = mkdtempSync(join(tmpdir(), "amc-no-fabrication-"));
  trees.push(root);
  const list = { permanent: [], pending: [], pathPresence: [], pathPresenceBaseline: 0, ...allowlist };
  const all = { ...files, "scripts/no-fabrication-allowlist.json": JSON.stringify(list) };
  for (const [file, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return root;
}

function run(root: string, ...flags: string[]) {
  const result = spawnSync(process.execPath, [script, "--root", root, ...flags], { encoding: "utf8", timeout: 120_000 });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

afterEach(() => {
  for (const root of trees.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("P0-16 check-no-fabrication guard", () => {
  test("R1: Math.random in a score module fails", () => {
    const result = run(tree({ "src/score/x.ts": "export const s = Math.random() * 100;\n" }));
    expect(result.status).toBe(1);
    expect(result.output).toContain("src/score/x.ts:1 R1");
  });

  test("R1: an id marker on the previous line passes", () => {
    const result = run(tree({ "src/score/x.ts": "// amc-allow-random: id\nexport const s = Math.random() * 100;\n" }));
    expect(result.status).toBe(0);
  });

  test("R2: a pseudoRandom identifier fails", () => {
    const result = run(tree({ "src/domains/y.ts": "export function pseudoRandomScore() {}\n" }));
    expect(result.status).toBe(1);
    expect(result.output).toContain("src/domains/y.ts:1 R2");
  });

  const pathScorer = 'import { existsSync } from "node:fs";\nimport { join } from "node:path";\nexport const has = (root: string) => existsSync(join(root, "src/ledger"));\n';

  test("R3: path-presence scoring fails", () => {
    const result = run(tree({ "src/score/z.ts": pathScorer }));
    expect(result.status).toBe(1);
    expect(result.output).toContain("src/score/z.ts:3 R3");
  });

  test("R3: a file listed in pathPresence passes", () => {
    const result = run(tree({ "src/score/z.ts": pathScorer }, { pathPresence: ["src/score/z.ts"], pathPresenceBaseline: 1 }));
    expect(result.status).toBe(0);
  });

  test("R4: certification wording in a template literal fails", () => {
    const result = run(tree({ "src/mcp/t.ts": "export const md = (ok: boolean) => `**Certified:** ✅ ${ok ? \"Yes\" : \"No\"}`;\n" }));
    expect(result.status).toBe(1);
    expect(result.output).toContain("src/mcp/t.ts:1 R4");
  });

  test("R4: a detection regex passes", () => {
    const result = run(tree({ "src/mcp/t.ts": "export const claims = (reply: string) => /certified/i.test(reply);\n" }));
    expect(result.status).toBe(0);
  });

  test("R4: a comment mentioning certified passes", () => {
    const result = run(tree({ "src/mcp/t.ts": "// Never print certified: AMC output is evidence of conformity.\nexport const x = 1;\n" }));
    expect(result.status).toBe(0);
  });

  test("R4: 'Certification Readiness: yes' fails", () => {
    const result = run(tree({ "src/mcp/t.ts": 'export const line = "Certification Readiness: yes";\n' }));
    expect(result.status).toBe(1);
    expect(result.output).toContain("src/mcp/t.ts:1 R4");
  });

  test("R4: dashboard html is scanned line by line", () => {
    const result = run(tree({ "src/dashboard/templates/index.html": "<p>ok</p>\n<span>L5 Certified</span>\n" }));
    expect(result.status).toBe(1);
    expect(result.output).toContain("src/dashboard/templates/index.html:2 R4");
  });

  test("a stale permanent entry fails", () => {
    const result = run(tree(
      { "src/score/x.ts": "export const s = 1;\n" },
      { permanent: [{ file: "src/score/x.ts", rule: "R1", reason: "was random" }] }
    ));
    expect(result.status).toBe(1);
    expect(result.output).toContain("stale allowlist entry");
  });

  test("a pending entry without an owning issue key fails", () => {
    const result = run(tree(
      { "src/mcp/t.ts": 'export const line = "MCP-Certified";\n' },
      { pending: [{ file: "src/mcp/t.ts", rule: "R4", owner: "someone", reason: "later" }] }
    ));
    expect(result.status).toBe(1);
    expect(result.output).toContain("owner must be an issue key");
  });

  test("pathPresence with 25 files against a baseline of 24 fails", () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 25; i += 1) files[`src/score/p${i}.ts`] = 'export const p = "src/ledger";\n';
    const result = run(tree(files, { pathPresence: Object.keys(files), pathPresenceBaseline: 24 }));
    expect(result.status).toBe(1);
    expect(result.output).toContain("pathPresence has 25 files; pathPresenceBaseline is 24");
  });

  test("pathPresence below its baseline asks for the baseline to be lowered", () => {
    const result = run(tree({ "src/score/p.ts": 'export const p = "src/ledger";\n' }, { pathPresence: ["src/score/p.ts"], pathPresenceBaseline: 2 }));
    expect(result.status).toBe(1);
    expect(result.output).toContain("lower pathPresenceBaseline from 2 to 1");
  });

  test("a missing allowlist exits 2", () => {
    const root = tree({ "src/score/x.ts": "export const s = 1;\n" });
    rmSync(join(root, "scripts/no-fabrication-allowlist.json"));
    const result = run(root);
    expect(result.status).toBe(2);
    expect(result.output).toContain("cannot read scripts/no-fabrication-allowlist.json");
  });

  const wording = { "src/mcp/t.ts": 'export const line = "MCP-Certified";\n' };

  test("--strict fails while a pending entry remains", () => {
    const allowlist = { pending: [{ file: "src/mcp/t.ts", rule: "R4", owner: "P0-21", reason: "removed by P0-21" }] };
    expect(run(tree(wording, allowlist)).status).toBe(0);
    const strict = run(tree(wording, allowlist), "--strict");
    expect(strict.status).toBe(1);
    expect(strict.output).toContain("pending allowlist entry");
  });

  test("--strict passes with no pending entries", () => {
    const result = run(tree({ "src/mcp/t.ts": "export const x = 1;\n" }), "--strict");
    expect(result.status).toBe(0);
  });

  test("--json reports counts per rule and the marker count", () => {
    const result = run(tree({ "src/shield/a.ts": "export const s = Math.random(); // amc-allow-random: fuzz-input\n" }), "--json");
    expect(result.status).toBe(0);
    const report = JSON.parse(result.output);
    expect(report.markers).toBe(1);
    expect(Object.keys(report.rules)).toEqual(["R1", "R2", "R3", "R4"]);
  });

  test("the real repository passes (non-strict)", () => {
    const result = run(repoRoot);
    expect(result.output).toContain("no-fabrication");
    expect(result.status).toBe(0);
  }, 120_000);
});
