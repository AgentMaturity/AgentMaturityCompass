import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { CLAIM_KINDS } from "../../src/claims/eligibility/types.js";
import { ALLOWED_TRANSITIONS } from "../../src/actions/receiptStates.js";
import { LEVEL_BANDS, LEVEL_SEMANTICS } from "../../src/diagnostic/levelSemantics.js";

// P1-30: the Core Spec's normative tables are generated from the code they describe (gap G6).
interface SpecSources {
  levels: ReadonlyArray<{ level: number; name: string; requires: string }>;
  bands: Readonly<Record<string, readonly [number, number]>>;
  claimKinds: readonly string[];
  bannedPatterns: readonly RegExp[];
  schemaIds: readonly string[];
  receiptTransitions: Readonly<Record<string, readonly string[]>>;
}
interface SyncModule {
  SPEC_LICENCE_LINE: string;
  REGION_NAMES: readonly string[];
  specFiles(root: string): string[];
  loadSources(root: string): Promise<SpecSources>;
  checkSpec(root: string, sources: SpecSources): string[];
}

const root = process.cwd();
const load = async () => (await import("../../scripts/check-spec-sync.mjs")) as SyncModule;
const schemaIds = (): string[] =>
  (JSON.parse(readFileSync(resolve(root, "spec/schemas/index.json"), "utf8")) as { schemas: Array<{ $id: string }> })
    .schemas.map((row) => row.$id);

describe("AMC Core Spec sync (P1-30)", () => {
  test("spec/ holds chapters 1-10, both annexes, the changelog and the RFC process", () => {
    for (const path of ["spec/README.md", "spec/CHANGELOG.md", "spec/rfcs/README.md", "spec/rfcs/0000-template.md",
      "spec/annex/eu-ai-act-levels.md", "spec/annex/legacy-1x.md"]) {
      expect(existsSync(resolve(root, path)), path).toBe(true);
    }
    expect(existsSync(resolve(root, "spec/core"))).toBe(true);
  });

  test("every generated region matches its source and every spec file carries the licence line", async () => {
    const sync = await load();
    expect(sync.checkSpec(root, await sync.loadSources(root))).toEqual([]);
    for (const file of sync.specFiles(root)) {
      expect(readFileSync(file, "utf8").split("\n", 1)[0], file).toBe(sync.SPEC_LICENCE_LINE);
    }
    expect(sync.specFiles(root).filter((file) => file.includes("/spec/core/"))).toHaveLength(10);
  });

  test("the sources are the code's own exports", async () => {
    const sources = await (await load()).loadSources(root);
    expect(sources.levels).toEqual(LEVEL_SEMANTICS);
    expect(sources.bands).toEqual(LEVEL_BANDS);
    expect(sources.claimKinds).toEqual(CLAIM_KINDS);
    expect(sources.schemaIds).toEqual(schemaIds());
    expect(sources.receiptTransitions).toEqual(ALLOWED_TRANSITIONS);
  });

  test("every $id the spec cites exists in spec/schemas/index.json", async () => {
    const sync = await load();
    const known = new Set(schemaIds());
    const cited = sync.specFiles(root).flatMap((file) =>
      readFileSync(file, "utf8").match(/https:\/\/agentmaturity\.co\/spec\/schemas\/v\d\/[a-z0-9.-]+\.schema\.json/g) ?? []);
    expect(cited.length).toBeGreaterThan(0);
    expect(cited.filter((id) => !known.has(id))).toEqual([]);
  });

  // Mutation check (P1-30): a level definition changed in the code without regenerating fails the check.
  test("a changed level definition, claim kind, schema $id or receipt transition makes the check fail", async () => {
    const sync = await load();
    const sources = await sync.loadSources(root);
    const levels = sources.levels.map((row) => (row.level === 3 ? { ...row, requires: `${row.requires} (changed)` } : row));
    expect(sync.checkSpec(root, { ...sources, levels }).join("\n")).toMatch(/amc:spec:levels.*stale/);
    const bands = { ...sources.bands, L5: [4.8, 5] as const };
    expect(sync.checkSpec(root, { ...sources, bands }).join("\n")).toMatch(/amc:spec:levels.*stale/);
    expect(sync.checkSpec(root, { ...sources, claimKinds: [...sources.claimKinds, "certified"] }).join("\n"))
      .toMatch(/amc:spec:claim-kinds.*stale/);
    expect(sync.checkSpec(root, { ...sources, schemaIds: sources.schemaIds.slice(1) }).join("\n"))
      .toMatch(/amc:spec:schema-ids.*stale/);
    const receiptTransitions = { ...sources.receiptTransitions, started: ["completed", "outcome_unknown", "cancelled"] };
    expect(sync.checkSpec(root, { ...sources, receiptTransitions }).join("\n")).toMatch(/amc:spec:receipt-states.*stale/);
  });

  test("the check refuses a missing licence line, an unknown $id, a missing region and an unknown region", async () => {
    const sync = await load();
    const sources = await sync.loadSources(root);
    const dir = mkdtempSync(join(tmpdir(), "amc-spec-sync-"));
    try {
      mkdirSync(join(dir, "spec/core"), { recursive: true });
      writeFileSync(join(dir, "spec/README.md"), "# no licence line\n\nhttps://agentmaturity.co/spec/schemas/v1/not-a-record.schema.json\n");
      writeFileSync(join(dir, "spec/core/01-scope.md"),
        `${sync.SPEC_LICENCE_LINE}\n<!-- amc:spec:made-up -->\nx\n<!-- /amc:spec:made-up -->\n`);
      const failures = sync.checkSpec(dir, sources).join("\n");
      expect(failures).toContain("spec/README.md: first line must be");
      expect(failures).toContain("cites https://agentmaturity.co/spec/schemas/v1/not-a-record.schema.json");
      expect(failures).toContain("unknown generated region amc:spec:made-up");
      for (const name of sync.REGION_NAMES) expect(failures).toContain(`amc:spec:${name} is missing`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the Pages build renders every spec file and points links at rendered pages or GitHub", async () => {
    const pagesModule = (await import("../../scripts/build-pages-site.mjs")) as {
      specPages(specRoot: string): Map<string, string>;
      rewriteSpecLinks(html: string, source: string, pages: Map<string, string>): string;
    };
    const pages = pagesModule.specPages(resolve(root, "spec"));
    const sync = await load();
    for (const file of sync.specFiles(root)) expect(pages.has(file.slice(resolve(root, "spec").length + 1)), file).toBe(true);
    expect(pages.get("rfcs/README.md")).toBe("rfcs/index.html");
    const html = '<a href="../ACCEPTANCE_RULES.md">a</a> <a href="10-versioning.md#x">b</a> <a href="../conformance/v1/README.md">c</a> <a href="https://e.test/a.md">d</a>';
    expect(pagesModule.rewriteSpecLinks(html, "core/04-evidence-model.md", pages)).toBe(
      '<a href="../acceptance-rules.html">a</a> <a href="10-versioning.html#x">b</a> ' +
      '<a href="https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/spec/conformance/v1/README.md">c</a> <a href="https://e.test/a.md">d</a>');
  });

  test("every region name is generated somewhere in the spec", async () => {
    const sync = await load();
    const text = sync.specFiles(root).map((file) => readFileSync(file, "utf8")).join("\n");
    for (const name of sync.REGION_NAMES) expect(text, name).toContain(`<!-- amc:spec:${name} -->`);
  });
});
