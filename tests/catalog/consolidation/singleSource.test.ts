/**
 * P1-53: one source for regulated status. The rubric questions live only in the catalog questionnaire, a rubric score
 * is self-reported and never certification-ready, and the cross-framework map reports no coverage.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import YAML from "yaml";
import { defaultCatalogRoot, loadCatalog } from "../../../src/catalog/loader.js";
import { validateCatalog } from "../../../src/catalog/validate.js";
import { STATIONS } from "../../../src/catalog/schema.js";
import { questionIds } from "../../../src/diagnostic/questionBank.js";
import { getDomainPackQuestions, listDomainPacks, scoreDomainPack } from "../../../src/score/domainPacks.js";
import { generateFrameworkReport, listFrameworkCrosswalks, listSupportedFrameworks } from "../../../src/score/crossFrameworkMapping.js";
import { sha256Hex } from "../../../src/utils/hash.js";
import { canonicalize } from "../../../src/utils/json.js";

const QUESTIONNAIRE = "questionnaires/domain-rubrics.yaml";

/** Ids and weights by station, captured from main before P1-53 moved the rubrics (base cafe5751f). */
const GOLDEN: Record<string, Array<[string, number]>> = {
  health: [["HC-1", 20], ["HC-2", 25], ["HC-3", 20], ["HC-4", 15], ["HC-5", 10], ["HC-6", 10], ["HC-7", 8], ["HC-8", 8], ["HC-9", 8]],
  education: [["ED-1", 18], ["ED-2", 18], ["ED-3", 16], ["ED-4", 16], ["ED-5", 16], ["ED-6", 16]],
  environment: [["ENV-1", 18], ["ENV-2", 16], ["ENV-3", 18], ["ENV-4", 18], ["ENV-5", 15], ["ENV-6", 15]],
  mobility: [["MOB-1", 18], ["MOB-2", 16], ["MOB-3", 18], ["MOB-4", 18], ["MOB-5", 15], ["MOB-6", 15],
    ["SC-1", 30], ["SC-2", 25], ["SC-3", 20], ["SC-4", 15], ["SC-5", 10], ["SC-6", 15], ["SC-7", 10], ["SC-8", 10]],
  governance: [["GOV-1", 18], ["GOV-2", 18], ["GOV-3", 16], ["GOV-4", 18], ["GOV-5", 15], ["GOV-6", 15]],
  technology: [["TECH-1", 18], ["TECH-2", 18], ["TECH-3", 18], ["TECH-4", 16], ["TECH-5", 15], ["TECH-6", 15]],
  wealth: [["WLT-1", 18], ["WLT-2", 18], ["WLT-3", 18], ["WLT-4", 16], ["WLT-5", 15], ["WLT-6", 15],
    ["FIN-1", 25], ["FIN-2", 20], ["FIN-3", 20], ["FIN-4", 20], ["FIN-5", 15], ["FIN-6", 15], ["FIN-7", 15], ["FIN-8", 10]]
};
/** sha256 of canonicalize({ station: DomainQuestion[] }) for all seven stations on main before P1-53. */
const GOLDEN_CONTENT_SHA256 = "a91b85c636cca68d2f23f01ed39627a8a36c55d447da944126d3b05895caa202";

const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

/** A copy of the shipped catalog with the questionnaire rewritten by `edit`. */
function catalogWithQuestionnaire(edit: (doc: { items: Array<Record<string, unknown>> }) => void): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-p1-53-catalog-"));
  dirs.push(dir);
  const root = join(dir, "catalog");
  cpSync(defaultCatalogRoot(), root, { recursive: true });
  const doc = YAML.parse(readFileSync(join(root, QUESTIONNAIRE), "utf8")) as { items: Array<Record<string, unknown>> };
  edit(doc);
  writeFileSync(join(root, QUESTIONNAIRE), YAML.stringify(doc));
  return root;
}

describe("domain rubrics read from the catalog (P1-53)", () => {
  it("scoreDomainPack with every answer at 5 is self-reported and never certification-ready, for all seven stations", () => {
    for (const station of STATIONS) {
      const answers = Object.fromEntries(getDomainPackQuestions(station).map((q) => [q.id, 5]));
      const result = scoreDomainPack(station, answers) as ReturnType<typeof scoreDomainPack> & { certificationReadiness?: unknown };
      expect(result.claimKind).toBe("self_reported");
      expect(result.certificationReadiness ?? false).toBe(false);
      expect(result.score).toBe(100);
    }
  });

  it("getDomainPackQuestions keeps main's ids, order, weights and content", () => {
    const now = Object.fromEntries(listDomainPacks().map(({ pack }) => [pack, getDomainPackQuestions(pack).map((q) => [q.id, q.weight])]));
    expect(now).toEqual(GOLDEN);
    const content = Object.fromEntries(listDomainPacks().map(({ pack }) => [pack, getDomainPackQuestions(pack)]));
    expect(sha256Hex(canonicalize(content))).toBe(GOLDEN_CONTENT_SHA256);
    expect(listDomainPacks().map((p) => p.questionCount)).toEqual(Object.values(GOLDEN).map((rows) => rows.length));
  });

  it("the questionnaire loads with zero errors: 61 self-reported items, none mapped, the only copy of the questions", () => {
    const cat = loadCatalog();
    expect(cat.issues).toEqual([]);
    expect(validateCatalog(cat).errors).toEqual([]);
    const items = cat.questionnaires?.get("domain-rubrics")?.items ?? [];
    expect(items).toHaveLength(61);
    expect(items.every((i) => i.claimKind === "self_reported" && i.legacyRef.verified === false && i.source === "domain_rubric")).toBe(true);
    expect(items.flatMap((i) => i.mapsTo)).toEqual([]);
    // The question text exists in the catalog file and nowhere in the rubric module.
    const source = readFileSync("src/score/domainPacks.ts", "utf8");
    for (const item of items) expect(source).not.toContain(item.text);
  });

  it("refuses a questionnaire item that claims more than self-reported, trusts its legacy citation, or maps to no control", () => {
    const codes = (root: string) => validateCatalog(loadCatalog({ root })).errors.map((e) => `${e.code} ${e.path}`);
    expect(codes(catalogWithQuestionnaire((d) => { d.items[0]!.claimKind = "observed"; }))).toContain("CAT_SCHEMA items.0.claimKind");
    expect(codes(catalogWithQuestionnaire((d) => { (d.items[0]!.legacyRef as { verified: boolean }).verified = true; })))
      .toContain("CAT_SCHEMA items.0.legacyRef.verified");
    expect(codes(catalogWithQuestionnaire((d) => { d.items[1]!.mapsTo = ["L0-ZZZ-99"]; }))).toContain("CAT_QUESTIONNAIRE_MAPPING items.1.mapsTo");
    expect(codes(catalogWithQuestionnaire((d) => { d.items[1]!.id = d.items[0]!.id; }))).toContain("CAT_DUPLICATE_ID items");
    expect(codes(catalogWithQuestionnaire((d) => { d.items[0]!.weight = 0; }))).toContain("CAT_SCHEMA items.0.weight");
  });
});

describe("cross-framework map reports no coverage (P1-53)", () => {
  // Every question id and every module the legacy table names; the table itself is not exported.
  const table = readFileSync("src/score/crossFrameworkMapping.ts", "utf8");
  const listed = (field: string) => [...table.matchAll(new RegExp(`${field}: \\[([^\\]]*)\\]`, "g"))]
    .flatMap((m) => [...(m[1] ?? "").matchAll(/'([^']+)'/g)].map((q) => q[1]!));
  const everyQid = [...new Set([...questionIds, ...listed("amcQIDs")])];
  const everyModule = [...new Set(listed("amcModules"))];

  it("with every question passed and every module active, all ten frameworks report 0 coverage and only not_evaluated controls", () => {
    expect(everyModule.length).toBeGreaterThan(20);
    const frameworks = listSupportedFrameworks();
    expect(frameworks).toHaveLength(10);
    for (const { framework, controlCount } of frameworks) {
      const report = generateFrameworkReport(framework, { passedQIDs: everyQid, activeModules: everyModule });
      expect(report.coveragePercent).toBe(0);
      expect(report.targetMet).toBe(false);
      expect(report.coveredControls).toEqual([]);
      expect(report.automatedControls).toEqual([]);
      expect(report.manualControls).toEqual([]);
      expect(report.controls).toHaveLength(controlCount);
      expect(report.controls.every((c) => c.status === "not_evaluated")).toBe(true);
      expect(report.deprecation.removalOwner).toBe("P2-29");
      expect(report).not.toHaveProperty("certificationReadiness");
    }
  });

  it("listFrameworkCrosswalks lists catalog crosswalks as information and never marks anything passed", () => {
    const cat = loadCatalog();
    for (const framework of cat.vocabulary?.frameworks ?? []) {
      const rows = listFrameworkCrosswalks(framework);
      const expected = [...cat.controls.values()].flatMap((c) => c.crosswalk.filter((x) => x.framework === framework)).length;
      expect(rows).toHaveLength(expected);
      for (const row of rows) {
        expect(row.status).toBe("not_evaluated");
        expect(JSON.stringify(row)).not.toMatch(/"(passed|covered|pass|satisfied)"/i);
        expect(cat.controls.get(row.controlId)?.crosswalk.some((x) => x.framework === framework && x.clause === row.clause)).toBe(true);
      }
    }
    expect(listFrameworkCrosswalks("atlas").length).toBeGreaterThan(0);
    expect(listFrameworkCrosswalks("NIST_AI_RMF")).toEqual([]);
  });
});
