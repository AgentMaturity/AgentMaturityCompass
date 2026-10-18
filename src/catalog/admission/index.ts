/**
 * Pack admission checker v1 (P1-33; docs/catalog/ADMISSION.md): one report per pack with each of the ten criteria met,
 * not met or not evaluated, a decision and the support it leaves. Declared experimental keeps decision "admit" (the
 * spec's word) with support experimental when P1-09 validation passes: never admitted as reviewed or qualified. Reviewed
 * needs all ten met and a mandatory control; qualified is refused until a rule exists; retired is reported, never admitted.
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
import { runFixtures, runGuardHarnesses, type GuardHarness, type GuardResults } from "./fixtureRunner.js";
import { claimsMore, parseAdmissionReport, reportDigest, sortedCriterion, verdictDiffers, writeAdmissionReport } from "./report.js";
import type { AdmissionReport, CriterionResult } from "./types.js";

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

const STRONGER = new Set(["reviewed", "qualified"]);

function decide(declared: AdmissionReport["pack"]["declaredSupport"], criteria: CriterionResult[], validation: CatalogIssue[], mandatory: number) {
  const open = criteria.filter((c) => c.status !== "met").map(summary);
  const invalid = validation.map((e) => `P1-09 validation: ${e.code} ${e.file}${e.path ? ` ${e.path}` : ""}: ${e.message}`);
  // A pack with no mandatory control has nothing a reviewed claim could stand on (criteria 2 to 8 would check nothing).
  const empty = mandatory === 0 ? ["the pack has no mandatory control"] : [];
  const maxAdmissibleSupport = open.length === 0 && invalid.length === 0 && empty.length === 0 ? "reviewed" as const : "experimental" as const;
  if (declared === "retired") return { maxAdmissibleSupport, decision: "refuse" as const, support: "retired" as const, reasons: ["retired: reported, never admitted to new plans"] };
  if (declared === "experimental") {
    const unreviewed = criteria[8]!.status === "met" ? "" : ", unreviewed";
    return { maxAdmissibleSupport, decision: invalid.length === 0 ? "admit" as const : "refuse" as const, support: "experimental" as const,
      reasons: [...invalid, `experimental${unreviewed}: not admitted as reviewed or qualified`, ...[...empty, ...open].map((o) => `not admissible as reviewed: ${o}`)] };
  }
  const reasons = [...(declared === "qualified" ? ["qualification rule not defined"] : []), ...invalid, ...empty, ...open];
  return reasons.length === 0 ? { maxAdmissibleSupport, decision: "admit" as const, support: "reviewed" as const, reasons }
    : { maxAdmissibleSupport, decision: "refuse" as const, support: "experimental" as const, reasons };
}

/** What a check reads: two independent loads of one catalog, the pack, the review authority and any guard results. */
export interface AdmissionInput {
  cat: LoadedCatalog;
  second: LoadedCatalog;
  packId: string;
  authority: ReviewAuthority;
  repoRoot?: string;
  guards?: GuardResults;
}

/**
 * The admission report of one pack, synchronously (the loader's gate recomputes with it); nothing is written. Every
 * listed control is checked; guard fixtures count only through `guards`.
 */
export function admissionOf(input: AdmissionInput): AdmissionReport {
  const { cat, second, authority } = input;
  const entry = cat.packs.get(input.packId);
  if (!entry) throw new Error(`no pack ${input.packId} in the catalog at ${cat.root}`);
  const { manifest, file, dir } = entry;
  const controls = manifest.controls.flatMap((id) => cat.controls.get(id) ?? []);
  const digest = packDigest(cat, manifest);
  const { run, outcomes } = runFixtures(cat, controls, input.guards);
  const ctx: PackContext = {
    cat, second, manifest, file, controls, run, outcomes, records: authority.records, repoRoot: input.repoRoot ?? dirname(cat.root),
    support: new Map(controls.map((c) => [c.id, effectiveSupport(c, authority)])),
    signoffs: packSignoffs({ id: manifest.id, version: manifest.version, digest, stations: manifest.stations }, controls, authority)
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
    ...decide(manifest.support, criteria, packErrors(cat, dir, manifest.controls), controls.filter((c) => c.mandatory).length)
  };
  return { ...body, digest: reportDigest(body) };
}

/** Checks one pack and returns its report, running any registered guard harnesses first; nothing is written. */
export async function checkPackAdmission(opts: AdmissionOptions): Promise<AdmissionReport> {
  const cat = opts.load();
  const second = opts.load();
  const controls = (cat.packs.get(opts.packId)?.manifest.controls ?? []).flatMap((id) => cat.controls.get(id) ?? []);
  const guards = await runGuardHarnesses(cat, controls, opts.harnesses);
  return admissionOf({ cat, second, packId: opts.packId, authority: opts.authority, repoRoot: opts.repoRoot, guards });
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

interface CatalogCheckProblem { code: string; severity: "error" | "warning"; file: string; message: string }
export interface CatalogCheckResult { reports: AdmissionReport[]; problems: CatalogCheckProblem[]; written: string[]; exitCode: 0 | 1 }

/**
 * Committed reports against this run's recomputation: malformed, or claiming more than the recomputation allows (a
 * forged report, or one computed under trust or records this machine no longer has), is an error; one that differs
 * otherwise, or covers no pack version in the catalog, is a warning (rerun with --write).
 */
function committedReportProblems(cat: LoadedCatalog, reports: readonly AdmissionReport[]): CatalogCheckProblem[] {
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
    const computed = reports.find((r) => r.pack.id === manifest.id);
    if (computed && claimsMore(parsed.report, computed)) {
      return [{ code: "ADM_REPORT_MISMATCH", severity: "error", file: rel,
        message: `it claims ${parsed.report.support} (max ${parsed.report.maxAdmissibleSupport}); recomputed here: ${computed.support} (max ${computed.maxAdmissibleSupport})` }];
    }
    const stale = computed ? verdictDiffers(parsed.report, computed) : parsed.report.pack.digest !== packDigest(cat, manifest);
    return stale ? [{ code: "ADM_REPORT_STALE", severity: "warning", file: rel, message: "it differs from this run's verdict; run amc catalog check --write" }] : [];
  });
}

/** A pack's declared support is admissible when the checker admits it; a retired declaration claims nothing. */
const admissible = (r: AdmissionReport): boolean => r.decision === "admit" || r.pack.declaredSupport === "retired";

/**
 * `amc catalog check` and `npm run check:catalog-admission`: every pack (or one), with reports written under the
 * catalog's admission/ folder when asked. Exit 1 when a pack's declared support is not admissible (a reviewed or
 * qualified claim it does not meet, or a pack failing P1-09 validation) or a committed report is malformed or claims
 * more than the recomputation. An experimental draft is reported, never failed for being experimental.
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
  const problems = committedReportProblems(cat, reports);
  return { reports, problems, written, exitCode: reports.every(admissible) && !problems.some((p) => p.severity === "error") ? 0 : 1 };
}

/** Plain lines for a check result; no claim word, and a met record criterion is never presented as proof. */
export function renderCatalogCheck(result: CatalogCheckResult): string[] {
  const lines: string[] = [];
  for (const r of result.reports) {
    const by = (status: string) => r.criteria.filter((c) => c.status === status).map((c) => c.criterion).join(", ") || "none";
    const head = `${r.pack.id} ${r.pack.version} (declares ${r.pack.declaredSupport}; support ${r.support})`;
    lines.push(!admissible(r) ? `REFUSED ${head}: not admitted` : r.pack.declaredSupport === "retired" ? `${head}: retired, reported`
      : r.support === "reviewed" ? `${head}: admitted as reviewed` : `${head}: not admitted as reviewed or qualified`);
    for (const reason of r.reasons) lines.push(`  ${reason}`);
    lines.push(`  met: ${by("met")}; not met: ${by("not_met")}; not evaluated: ${by("not_evaluated")}; report ${r.digest}`);
  }
  for (const p of result.problems) lines.push(`${p.severity} ${p.code} ${p.file}: ${p.message}`);
  for (const rel of result.written) lines.push(`wrote ${rel}`);
  lines.push("A met record criterion shows that signed records exist, not that the content is right. Nothing here edits a pack.");
  return lines;
}
