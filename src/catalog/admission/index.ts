/**
 * Pack admission checker v1 (P1-33; docs/catalog/ADMISSION.md): one report per pack with each of the ten criteria met,
 * not met or not evaluated, and a decision. Declared experimental is admitted when P1-09 validation passes; reviewed
 * only when all ten are met; qualified never, until a qualification rule exists; retired is reported, never admitted.
 * The checker reads YAML and never writes it: promotion is a human-reviewed change. Record criteria read P1-34's verified
 * results only, so nothing here can make support stronger than signed, pinned review records allow.
 */
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { REGULATORY_REGISTER } from "../../compliance/regulatory/index.js";
import { amcVersion } from "../../version.js";
import { catalogDigest, packDigest } from "../digest.js";
import { gitAuthorsOf, readGovernance } from "../governance/index.js";
import { effectiveSupport, packSignoffs, type ReviewAuthority } from "../governance/support.js";
import { defaultCatalogRoot, loadCatalog, type LoadedCatalog } from "../loader.js";
import type { CatalogIssue } from "../schema.js";
import { validateCatalog } from "../validate.js";
import { CRITERIA, NOT_EVALUATED_CODES, type PackContext } from "./criteria.js";
import { runFixtures, type GuardHarness } from "./fixtureRunner.js";
import { parseAdmissionReport, reportDigest, sortedCriterion, writeAdmissionReport } from "./report.js";
import type { AdmissionReport, CriterionResult } from "./types.js";

export type { AdmissionReport, CriterionResult } from "./types.js";

export interface AdmissionOptions {
  packId: string;
  /** Loads the catalog; called twice, so criterion 1 can compare two fresh loads. */
  load: () => LoadedCatalog;
  /** Review records, roster and governance lists for effectiveSupport and packSignoffs (trust is never an input). */
  authority: ReviewAuthority;
  /** The directory a pack's coverageDoc resolves against; the catalog root's parent by default. */
  repoRoot?: string;
  /** Guard harnesses by `setup.harness` name; evidence fixtures always run through evaluateControl. */
  harnesses?: Readonly<Record<string, GuardHarness>>;
}

/** The pack's own P1-09 errors: its files, its controls and their fixtures, and catalog-wide files. */
function packErrors(cat: LoadedCatalog, dir: string, controls: readonly string[]): CatalogIssue[] {
  const mine = (i: CatalogIssue) => (i.controlId !== null && controls.includes(i.controlId)) || i.file.startsWith(`layers/${dir}/`)
    || controls.some((id) => i.file.startsWith(`fixtures/${id}/`)) || !/^(layers|fixtures)\//.test(i.file);
  return validateCatalog(cat).errors.filter(mine);
}

const summary = (c: CriterionResult): string => {
  const codes = [...new Set(c.findings.filter((f) => f.severity === "error" || NOT_EVALUATED_CODES.has(f.code)).map((f) => f.code))];
  return `criterion ${c.criterion} ${c.status === "not_met" ? "not met" : "not evaluated"}: ${codes.join(", ") || c.title}`;
};

function decide(declared: AdmissionReport["pack"]["declaredSupport"], criteria: CriterionResult[], validation: CatalogIssue[]) {
  const open = criteria.filter((c) => c.status !== "met").map(summary);
  const invalid = validation.map((e) => `P1-09 validation: ${e.code} ${e.file}${e.path ? ` ${e.path}` : ""}: ${e.message}`);
  const maxAdmissibleSupport = open.length === 0 && invalid.length === 0 ? "reviewed" as const : "experimental" as const;
  if (declared === "retired") return { maxAdmissibleSupport, decision: "refuse" as const, reasons: ["retired: reported, never admitted to new plans"] };
  if (declared === "experimental") {
    const unreviewed = criteria[8]!.status === "met" ? "" : ", unreviewed";
    return { maxAdmissibleSupport, decision: invalid.length === 0 ? "admit" as const : "refuse" as const,
      reasons: [...invalid, `experimental${unreviewed}: admitted as experimental only`, ...open.map((o) => `not admissible as reviewed: ${o}`)] };
  }
  const reasons = [...(declared === "qualified" ? ["qualification rule not defined"] : []), ...invalid, ...open];
  return { maxAdmissibleSupport, decision: reasons.length === 0 ? "admit" as const : "refuse" as const, reasons };
}

/** Checks one pack and returns its report; nothing is written. */
export async function checkPackAdmission(opts: AdmissionOptions): Promise<AdmissionReport> {
  const cat = opts.load();
  const second = opts.load();
  const entry = cat.packs.get(opts.packId);
  if (!entry) throw new Error(`no pack ${opts.packId} in the catalog at ${cat.root}`);
  const { manifest, file, dir } = entry;
  const members = manifest.controls.flatMap((id) => cat.controls.get(id) ?? []);
  const controls = members.filter((c) => c.mandatory);
  const digest = packDigest(cat, manifest);
  const { run, outcomes } = await runFixtures(cat, controls, opts.harnesses);
  const ctx: PackContext = {
    cat, second, manifest, file, controls, run, outcomes, records: opts.authority.records, repoRoot: opts.repoRoot ?? dirname(cat.root),
    support: new Map(controls.map((c) => [c.id, effectiveSupport(c, opts.authority)])),
    signoffs: packSignoffs({ id: manifest.id, version: manifest.version, digest, stations: manifest.stations }, members, opts.authority)
  };
  const criteria = CRITERIA.map((check) => sortedCriterion(check(ctx)));
  const body: Omit<AdmissionReport, "digest"> = {
    reportVersion: 1,
    checker: { name: "amc-catalog-check", version: amcVersion },
    checkedAt: new Date().toISOString(),
    catalog: { id: cat.manifest?.id ?? "(not loaded)", version: cat.manifest?.version ?? "(not loaded)", digest: catalogDigest(cat) },
    pack: { id: manifest.id, version: manifest.version, digest, declaredSupport: manifest.support },
    criteria,
    fixtureRun: run,
    ...decide(manifest.support, criteria, packErrors(cat, dir, manifest.controls))
  };
  return { ...body, digest: reportDigest(body) };
}

/**
 * The review authority for a catalog on disk: its review records and governance lists, and git authors from the
 * repository at `repoRoot`. The D-08 roster does not exist yet, so it is empty and no reviewer counts (Needs-Sid).
 */
export function catalogReviewAuthority(cat: LoadedCatalog, repoRoot: string): ReviewAuthority {
  const governance = readGovernance(cat.root);
  const authorsOf = (id: string): readonly string[] => {
    const file = cat.controlFiles.get(id) ?? cat.packs.get(id)?.file;
    if (!file) throw new Error(`${id} has no file; refusing to judge reviewer independence without its authors`);
    return gitAuthorsOf(repoRoot, relative(repoRoot, join(cat.root, file)));
  };
  return { records: governance.reviews, experts: new Map(), authorsOf, f5Confirmations: governance.f5Confirmations,
    reverify: governance.reverify, register: REGULATORY_REGISTER };
}

export interface CatalogCheckProblem { code: string; severity: "error" | "warning"; file: string; message: string }
export interface CatalogCheckResult { reports: AdmissionReport[]; problems: CatalogCheckProblem[]; written: string[]; exitCode: 0 | 1 }

/** Committed reports that are malformed (error), stale or for no pack version in the catalog (warnings). */
function committedReportProblems(cat: LoadedCatalog): CatalogCheckProblem[] {
  const dir = join(cat.root, "admission");
  if (!lstatSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e): CatalogCheckProblem[] => {
    const rel = `admission/${e.name}`;
    if (!e.isFile() || !e.name.endsWith(".json")) return [{ code: "ADM_REPORT_MALFORMED", severity: "error", file: rel, message: "not a regular .json file" }];
    const parsed = parseAdmissionReport(readFileSync(join(dir, e.name), "utf8"), rel);
    if ("error" in parsed) return [{ code: "ADM_REPORT_MALFORMED", severity: "error", file: rel, message: parsed.error }];
    const manifest = cat.packs.get(parsed.report.pack.id)?.manifest;
    if (!manifest || manifest.version !== parsed.report.pack.version) {
      return [{ code: "ADM_REPORT_ORPHAN", severity: "warning", file: rel, message: "no pack version in the catalog matches it" }];
    }
    return parsed.report.pack.digest === packDigest(cat, manifest) ? []
      : [{ code: "ADM_REPORT_STALE", severity: "warning", file: rel, message: "the pack changed since; run amc catalog check --write" }];
  });
}

/** A pack's declared support is admissible when the checker admits it; a retired declaration claims nothing. */
const admissible = (r: AdmissionReport): boolean => r.decision === "admit" || r.pack.declaredSupport === "retired";

/**
 * `amc catalog check` and `npm run check:catalog-admission`: every pack (or one), with reports written under the
 * catalog's admission/ folder when asked. Exit 1 when a pack's declared support is not admissible (a reviewed or
 * qualified claim it does not meet, or a pack failing P1-09 validation) or a committed report is malformed. An
 * experimental draft is reported, never failed for being experimental.
 */
export async function runCatalogCheck(opts: { catalogRoot?: string; packId?: string; write?: boolean; harnesses?: Readonly<Record<string, GuardHarness>> } = {}): Promise<CatalogCheckResult> {
  const root = resolve(opts.catalogRoot ?? defaultCatalogRoot());
  const cat = loadCatalog({ root });
  if (opts.packId && !cat.packs.has(opts.packId)) throw new Error(`no pack ${opts.packId} in the catalog at ${root}`);
  const authority = catalogReviewAuthority(cat, dirname(root));
  const reports: AdmissionReport[] = [];
  for (const packId of opts.packId ? [opts.packId] : [...cat.packs.keys()].sort()) {
    reports.push(await checkPackAdmission({ packId, load: () => loadCatalog({ root }), authority, harnesses: opts.harnesses }));
  }
  const written = opts.write ? reports.map((r) => writeAdmissionReport(root, r)) : [];
  const problems = committedReportProblems(cat);
  return { reports, problems, written, exitCode: reports.every(admissible) && !problems.some((p) => p.severity === "error") ? 0 : 1 };
}

/** Plain lines for a check result; no claim word, and a met record criterion is never presented as proof. */
export function renderCatalogCheck(result: CatalogCheckResult): string[] {
  const lines: string[] = [];
  for (const r of result.reports) {
    const by = (status: string) => r.criteria.filter((c) => c.status === status).map((c) => c.criterion).join(", ") || "none";
    const verdict = !admissible(r) ? "REFUSED" : r.pack.declaredSupport === "retired" ? "reported" : `admitted as ${r.pack.declaredSupport}`;
    lines.push(`${verdict === "REFUSED" ? "REFUSED " : ""}${r.pack.id} ${r.pack.version} (declares ${r.pack.declaredSupport}): ${verdict === "REFUSED" ? "not admitted" : verdict}`);
    for (const reason of r.reasons) lines.push(`  ${reason}`);
    lines.push(`  met: ${by("met")}; not met: ${by("not_met")}; not evaluated: ${by("not_evaluated")}; report ${r.digest}`);
  }
  for (const p of result.problems) lines.push(`${p.severity} ${p.code} ${p.file}: ${p.message}`);
  for (const rel of result.written) lines.push(`wrote ${rel}`);
  lines.push("A met record criterion shows that signed records exist, not that the content is right. Nothing here edits a pack.");
  return lines;
}

