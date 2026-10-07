#!/usr/bin/env node
/**
 * Citation check (P0-25). Runs lintCitations (src/compliance/citations/lint.ts)
 * over the built package and compares the ratcheted findings with
 * scripts/citations-baseline.json. Build first: it reads dist/.
 *
 * Exits 1 on any zero-tolerance finding (whatever the baseline says), on a
 * ratcheted count per rule and file above its baseline, on a baseline entry
 * with counts but no issue key or reason, and on an unknown flag. Prints
 * `citations: errors=<n> ratcheted=<n> baseline=<n>` and per-rule totals on
 * every run; --json prints the summary and every finding instead.
 * --update-baseline --reason "<text>" rewrites the baseline to the current
 * ratcheted counts (refused while a zero-tolerance finding remains).
 *
 * Usage: node scripts/check-citations.mjs [--json] [--update-baseline --reason "<text>"]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_BASELINE_PATH = join(root, "scripts/citations-baseline.json");
const USAGE = 'usage: node scripts/check-citations.mjs [--json] [--update-baseline --reason "<text>"]';
const ISSUE_KEY = /^P\d-\d{2}$/;

/** Mirrors CITATION_RULES in src/compliance/citations/lint.ts (tests/citations/checkCitationsCli.test.ts pins the match). */
export const RULES = {
  CIT001: { name: "superseded-as-live", zeroTolerance: true, issue: "P0-24" },
  CIT002: { name: "framework-id", zeroTolerance: false, issue: "P0-24" },
  CIT003: { name: "pack-reference", zeroTolerance: true, issue: "P0-25" },
  CIT004: { name: "record-incomplete", zeroTolerance: false, issue: "P1-09" },
  CIT005: { name: "status-type", zeroTolerance: true, issue: "P0-25" },
};

/** Strict argv parsing: unknown flags, stray values and missing values are errors. */
export function parseArgs(argv) {
  const opts = { json: false, updateBaseline: false, reason: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--json") opts.json = true;
    else if (flag === "--update-baseline") opts.updateBaseline = true;
    else if (flag === "--reason") {
      const value = argv[i + 1];
      if (value === undefined || value.trim() === "" || value.startsWith("--")) return { error: "--reason needs a value" };
      opts.reason = value.trim();
      i += 1;
    } else return { error: `unknown argument ${JSON.stringify(flag)}; ${USAGE}` };
  }
  if (opts.updateBaseline && !opts.reason) return { error: `--update-baseline requires --reason "<text>"; ${USAGE}` };
  if (opts.reason && !opts.updateBaseline) return { error: `--reason is only valid with --update-baseline; ${USAGE}` };
  return { opts };
}

async function loadDist(rel) {
  const path = join(root, "dist", rel);
  if (!existsSync(path)) throw new Error(`Build first: dist/${rel} not found (pnpm run build).`);
  return import(pathToFileURL(path).href);
}

/** "MAP 2.3 — data provenance & privacy" -> id and label. */
function splitAnchor(text) {
  const at = text.indexOf(" — ");
  return at < 0 ? { id: text.trim(), label: "" } : { id: text.slice(0, at).trim(), label: text.slice(at + 3).trim() };
}

/** Collects every citation, framework id and pack reference in the built package and lints them. */
export async function collectFindings() {
  const [lint, fw, assurance, maps, industry, rubric, registry, audit, cross, register, us, eu, intl] = await Promise.all([
    "compliance/citations/lint.js", "compliance/citations/frameworkIds.js", "assurance/packs/index.js",
    "compliance/builtInMappings.js", "domains/industryPacks.js", "score/domainPacks.js", "domains/domainRegistry.js",
    "domains/industryPackAudit.js", "score/crossFrameworkMapping.js", "compliance/regulatory/index.js",
    "domains/packs/catalogueUs.js", "domains/packs/catalogueEu.js", "domains/packs/catalogueIntl.js",
  ].map(loadDist));

  const records = [
    ...us.US_INSTRUMENTS.map((record) => ({ file: "src/domains/packs/catalogueUs.ts", record })),
    ...eu.EU_INSTRUMENTS.map((record) => ({ file: "src/domains/packs/catalogueEu.ts", record })),
    ...intl.INTL_INSTRUMENTS.map((record) => ({ file: "src/domains/packs/catalogueIntl.ts", record })),
  ];
  const textRefs = [];
  const packRefs = [];
  const frameworkIds = [];

  const PACKS_FILE = "src/domains/industryPacks.ts";
  const industryIds = new Set();
  for (const pack of industry.listIndustryPacks()) {
    industryIds.add(pack.id);
    for (const text of pack.regulatoryBasis) textRefs.push({ file: PACKS_FILE, location: `pack ${pack.id} regulatoryBasis`, text, mustResolve: true });
    for (const q of pack.questions) {
      if (q.regulatoryRef?.trim()) textRefs.push({ file: PACKS_FILE, location: `pack ${pack.id} question ${q.id}`, text: q.regulatoryRef, mustResolve: true });
    }
  }
  for (const { pack } of rubric.listDomainPacks()) {
    for (const q of rubric.getDomainPackQuestions(pack)) {
      textRefs.push({ file: "src/score/domainPacks.ts", location: `rubric ${pack} question ${q.id}`, text: q.regulatoryRef, mustResolve: true });
    }
  }
  for (const [domain, meta] of Object.entries(registry.DOMAIN_REGISTRY)) {
    const file = "src/domains/domainRegistry.ts";
    for (const text of meta.regulatoryBasis) textRefs.push({ file, location: `domain ${domain} regulatoryBasis`, text, mustResolve: true });
    for (const id of meta.assurancePacks) packRefs.push({ file, location: `domain ${domain} assurancePacks`, id, match: "exact" });
  }
  for (const mapping of maps.builtInComplianceMappings) {
    const file = "src/compliance/builtInMappings.ts";
    textRefs.push({ file, location: `mapping ${mapping.id} description`, text: mapping.description, mustResolve: false });
    for (const req of mapping.evidenceRequirements) {
      if (req.type === "requires_assurance_pack") packRefs.push({ file, location: `mapping ${mapping.id} requires_assurance_pack`, id: req.packId, match: "exact" });
    }
    for (const id of mapping.related.packs) packRefs.push({ file, location: `mapping ${mapping.id} related.packs`, id, match: "normalized" });
  }
  audit.INDUSTRY_PACK_AUDIT_ANCHORS.forEach((anchors, index) => {
    const file = "src/domains/industryPackAudit.ts";
    for (const [key, text] of Object.entries(anchors)) textRefs.push({ file, location: `anchors[${index}].${key}`, text, mustResolve: false });
    frameworkIds.push({ file, location: `anchors[${index}].nist`, framework: "nist-ai-rmf", ...splitAnchor(anchors.nist) });
    frameworkIds.push({ file, location: `anchors[${index}].iso`, framework: "iso-42001", ...splitAnchor(anchors.iso) });
  });
  // gapControls lists every control as "<id> (<name>)" when nothing is covered.
  for (const control of cross.generateFrameworkReport("MITRE_ATLAS", { passedQIDs: [], activeModules: [] }).gapControls) {
    const match = /^(\S+) \((.*)\)$/.exec(control);
    frameworkIds.push({ file: "src/score/crossFrameworkMapping.ts", location: "MITRE_ATLAS", framework: "atlas", id: match?.[1] ?? control, label: match?.[2] ?? "" });
  }
  // Unprefixed register affectedPacks name industry packs, or assurance packs where no industry pack exists.
  for (const entry of register.REGULATORY_REGISTER.entries) {
    for (const id of entry.affectedPacks ?? []) {
      if (id.includes(":") || industryIds.has(id)) continue;
      packRefs.push({ file: "src/compliance/regulatory/register.json", location: `entry ${entry.id} affectedPacks`, id, match: "exact" });
    }
  }

  const ids = (table) => table.entries.map((entry) => entry.id);
  return lint.lintCitations({
    records, textRefs, frameworkIds, packRefs,
    knownPackIds: assurance.listAssurancePacks().map((pack) => pack.id),
    referenceTables: {
      atlas: ids(fw.FRAMEWORK_REFERENCE_TABLES.atlas),
      nistAiRmf: ids(fw.FRAMEWORK_REFERENCE_TABLES.nistAiRmf),
      iso42001AnnexA: ids(fw.FRAMEWORK_REFERENCE_TABLES.iso42001AnnexA),
    },
  });
}

/** Problems that make a baseline unusable: a rule with counts but no issue key or reason. */
export function baselineProblems(baseline) {
  const problems = [];
  if (typeof baseline !== "object" || baseline === null || typeof baseline.rules !== "object" || baseline.rules === null) {
    return ["baseline must be an object with a rules object"];
  }
  for (const [rule, entry] of Object.entries(baseline.rules)) {
    if (!(rule in RULES)) problems.push(`unknown rule ${rule}`);
    const total = Object.values(entry?.counts ?? {}).reduce((sum, n) => sum + n, 0);
    if (total > 0 && !ISSUE_KEY.test(entry.issue ?? "")) problems.push(`${rule} has counts but no issue key (P<n>-<nn>)`);
    if (total > 0 && !(typeof entry.reason === "string" && entry.reason.trim())) problems.push(`${rule} has counts but no reason`);
  }
  return problems;
}

/** Compares findings with the baseline. Zero-tolerance findings always fail. */
export function evaluate(findings, baseline) {
  const counts = {};
  for (const f of findings) {
    if (f.zeroTolerance) continue;
    counts[f.rule] ??= {};
    counts[f.rule][f.file] = (counts[f.rule][f.file] ?? 0) + 1;
  }
  const over = [];
  const under = [];
  const rules = {};
  let baselineTotal = 0;
  for (const [rule, meta] of Object.entries(RULES)) {
    const base = baseline.rules?.[rule]?.counts ?? {};
    const now = counts[rule] ?? {};
    for (const file of new Set([...Object.keys(base), ...Object.keys(now)])) {
      const n = now[file] ?? 0;
      const b = base[file] ?? 0;
      if (n > b) over.push({ rule, file, count: n, baseline: b });
      else if (n < b) under.push({ rule, file, count: n, baseline: b });
    }
    const ruleBaseline = Object.values(base).reduce((sum, n) => sum + n, 0);
    baselineTotal += ruleBaseline;
    rules[rule] = {
      name: meta.name,
      zeroTolerance: meta.zeroTolerance,
      findings: findings.filter((f) => f.rule === rule).length,
      zeroToleranceFindings: findings.filter((f) => f.rule === rule && f.zeroTolerance).length,
      baseline: ruleBaseline,
    };
  }
  const zero = findings.filter((f) => f.zeroTolerance);
  const ratcheted = findings.length - zero.length;
  return { ok: zero.length === 0 && over.length === 0, errors: zero.length + over.length, ratcheted, baseline: baselineTotal, rules, zero, over, under, counts };
}

function readBaseline(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function buildBaseline(counts, reason, today) {
  const rules = Object.fromEntries(Object.entries(RULES).map(([rule, meta]) =>
    [rule, { zeroTolerance: meta.zeroTolerance, issue: meta.issue, reason, counts: Object.fromEntries(Object.entries(counts[rule] ?? {}).sort()) }]));
  return { rules, reason, updatedAt: today };
}

/**
 * @param {string[]} argv
 * @param {{ findings?: object[]; baselinePath?: string; log?: (line: string) => void; error?: (line: string) => void }} deps
 *   `findings` skips loading dist/ (tests inject them).
 */
export async function main(argv = process.argv.slice(2), deps = {}) {
  const log = deps.log ?? ((line) => console.log(line));
  const error = deps.error ?? ((line) => console.error(line));
  const baselinePath = deps.baselinePath ?? DEFAULT_BASELINE_PATH;
  const parsed = parseArgs(argv);
  if (parsed.error) {
    error(`citations: ${parsed.error}`);
    return 1;
  }
  const { opts } = parsed;
  let findings;
  try {
    findings = deps.findings ?? await collectFindings();
  } catch (err) {
    error(`citations: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  let baseline = { rules: {} };
  if (!opts.updateBaseline || existsSync(baselinePath)) {
    try {
      baseline = readBaseline(baselinePath);
    } catch (err) {
      error(`citations: cannot read baseline ${baselinePath}: ${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
  }
  const result = evaluate(findings, baseline);

  if (opts.updateBaseline) {
    if (result.zero.length > 0) {
      error(`citations: refusing --update-baseline: ${result.zero.length} zero-tolerance finding(s) must be fixed, not baselined`);
      for (const f of result.zero) error(`  FAIL ${f.rule} ${f.file} ${f.location}: ${f.message}`);
      return 1;
    }
    const next = buildBaseline(result.counts, opts.reason, new Date().toISOString().slice(0, 10));
    writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`);
    log(`citations: baseline updated (${result.baseline} -> ${result.ratcheted} ratcheted findings): ${baselinePath}`);
    return 0;
  }

  const problems = baselineProblems(baseline);
  if (opts.json) {
    log(JSON.stringify({
      ok: result.ok && problems.length === 0, errors: result.errors + problems.length, ratcheted: result.ratcheted, baseline: result.baseline,
      rules: result.rules, baselineProblems: problems, overBaseline: result.over, belowBaseline: result.under, findings,
    }, null, 2));
  } else {
    log(`citations: errors=${result.errors + problems.length} ratcheted=${result.ratcheted} baseline=${result.baseline}`);
    for (const [rule, r] of Object.entries(result.rules)) {
      log(`  ${rule} ${r.name}: findings=${r.findings} zero-tolerance=${r.zeroToleranceFindings} baseline=${r.baseline}`);
    }
    for (const p of problems) error(`  FAIL baseline: ${p}`);
    for (const f of result.zero) error(`  FAIL ${f.rule} ${f.file} ${f.location}: ${f.message}`);
    for (const o of result.over) {
      error(`  FAIL ${o.rule} ${o.file}: ${o.count} > baseline ${o.baseline}`);
      for (const f of findings) if (!f.zeroTolerance && f.rule === o.rule && f.file === o.file) error(`    ${f.location}: ${f.message}`);
    }
    if (result.under.length > 0) {
      const list = result.under.map((u) => `${u.rule} ${u.file}: ${u.count} < ${u.baseline}`).join(", ");
      log(`  below baseline (${list}); lock it in: node scripts/check-citations.mjs --update-baseline --reason "<what improved>"`);
    }
  }
  return result.ok && problems.length === 0 ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
