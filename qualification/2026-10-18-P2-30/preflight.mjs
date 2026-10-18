// P2-30 dependency preflight. No production catalog or source files are modified.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../../dist/catalog/loader.js";
import { catalogDigest } from "../../dist/catalog/digest.js";
import { controlRecordSchema, packManifestSchema } from "../../dist/catalog/schema.js";
import { validateCatalog } from "../../dist/catalog/validate.js";
import { getIndustryPacksByStation } from "../../dist/domains/industryPacks.js";
import * as deep from "../../dist/domains/deepIndustryPacks.js";

const started = performance.now();
const out = dirname(fileURLToPath(import.meta.url));
const clone = join(out, "../..");
process.chdir(clone);
const git = (...args) => execFileSync("git", args, { encoding: "utf8", cwd: clone }).trimEnd();
const base = loadCatalog();
const baselineValidation = validateCatalog(base);
const probe = join(out, "probe-catalog");
mkdirSync(probe, { recursive: true });
for (const file of ["catalog.yaml", "vocabulary.yaml", "producers.yaml", "publisher-hosts.yaml"]) {
  copyFileSync(join(clone, "catalog", file), join(probe, file));
}
const requestedPaths = [
  "stations/technology/overlay.yaml",
  "stations/technology/promotion.yaml",
  "stations/technology/question-dispositions.yaml",
  "stations/technology/profile.platform-agent.json",
  "instruments/us-ftc-act.yaml",
  "fixtures/technology/L1-TECH-01/positive/valid.json"
];
for (const file of requestedPaths) {
  mkdirSync(dirname(join(probe, file)), { recursive: true });
  writeFileSync(join(probe, file), "{}\n");
}
const issues = loadCatalog({ root: probe }).issues;
for (const file of requestedPaths) {
  assert(issues.some((issue) => issue.file === file && issue.code === "CAT_STRAY_FILE"), file);
}
const manifest = base.packs.get("amc.l1.wealth.us").manifest;
const canonicalManifest = { ...manifest, id: "overlay.technology", stations: ["technology"] };
assert(packManifestSchema.safeParse(canonicalManifest).success);
const metadata = packManifestSchema.safeParse({ ...canonicalManifest, instruments: [], profiles: [], promotion: "promotion.yaml" });
assert.equal(metadata.success, false);
const record = base.controls.get("L1-WLT-US-01");
const fixturePath = controlRecordSchema.safeParse({
  ...record,
  tests: [{ ...record.tests[0], fixtures: { positive: [requestedPaths.at(-1).slice("fixtures/".length)], negative: [] } }]
});
assert.equal(fixturePath.success, false);
const packs = getIndustryPacksByStation("technology");
const questions = packs.flatMap((pack) => pack.questions);
const deepQuestions = deep.getAllDeepIndustryQuestions().filter((question) => question.id.startsWith("technology-deep-"));
assert.equal(questions.length, 75);
assert.equal(deepQuestions.length, 0);
const absent = ["TECH-CI-16", "TECH-CI-17", "TECH-CI-18", "TECH-OS-16", "TECH-OS-17", "TECH-OS-18", "TECH-OS-20", "TECH-INF-17", "TECH-PP-16", "TECH-PP-20"];
assert(absent.every((id) => !questions.some((question) => question.id === id)));
const report = {
  status: "blocked_before_implementation",
  clone,
  branch: git("branch", "--show-current"),
  head: git("rev-parse", "HEAD"),
  int: git("rev-parse", "int"),
  statusPorcelain: git("status", "--porcelain"),
  trackedDiff: git("diff", "--name-only"),
  baselineCatalogDigest: catalogDigest(base),
  baselineCatalogErrors: baselineValidation.errors,
  requestedLayoutRejections: issues,
  packMetadataErrors: metadata.error.issues,
  fixturePathErrors: fixturePath.error.issues,
  questions: {
    specPackCount: 77, actualPackCount: questions.length,
    specDeepCount: 16, actualDeepCount: deepQuestions.length,
    deepStationApiPresent: typeof deep.getDeepQuestionsByStation === "function",
    packQuestionIds: questions.map((question) => question.id),
    absentDispositionIds: absent,
    differingMeanings: questions.filter((question) => ["TECH-CI-15", "TECH-PP-15"].includes(question.id))
      .map(({ id, question }) => ({ id, question }))
  },
  absentSpecPaths: ["src/domains/packs/stations/technology.ts", "src/domains/deep/technology.ts", "docs/industries/technology.md", "tests/industryGuides.test.ts", "tests/deepIndustryPacksStations.test.ts"]
    .filter((file) => !existsSync(join(clone, file))),
  reservedDependencies: [
    { path: "src/catalog/schema.ts", reason: "Strict P1-09 schema rejects ancillary overlay metadata and station-prefixed fixture references; P2-30 prohibits editing it." },
    { path: "src/catalog/loader.ts", reason: "Requested station, instrument and nested fixture paths are outside the admitted tree." },
    { path: "src/catalog/validate.ts", reason: "Control membership requires layers/<pack>/controls and fixtures require <controlId>/<polarity>." }
  ],
  oracleOrFixtureClaims: "not evaluated; no Technology overlay, signature oracle or enforcement result was implemented",
  durationMs: Math.round(performance.now() - started)
};
writeFileSync(join(out, "preflight.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ status: report.status, layoutRejections: issues.length, actualPackQuestions: questions.length, actualDeepQuestions: deepQuestions.length, baselineCatalogErrors: baselineValidation.errors.length, receipt: relative(clone, join(out, "preflight.json")) }, null, 2));
