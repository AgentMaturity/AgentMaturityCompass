/**
 * `amc export oscal` (P1-28; freeze exception): the shipped catalog, a verified compiled plan and its control results
 * as OSCAL 1.2.3 catalog, profile and assessment results, plus oscal-loss-report.json. Nothing missing is invented:
 * without results no assessment-results file is written. Never writes under .amc/.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import chalk from "chalk";
import { assertSignedPlan } from "../../catalog/compiler/sign.js";
import type { CompiledPlan, SignedPlan } from "../../catalog/compiler/types.js";
import { readSignedControlResults } from "../../catalog/evidence/signedResults.js";
import { loadCatalog, type LoadedCatalog } from "../../catalog/loader.js";
import { verifyCatalogLock } from "../../catalog/lockfile.js";
import { assertOutsideSignedConfigTree } from "../../domains/operatingProfiles/operatingProfileEmit.js";
import { pathExists, writeFileAtomic } from "../../utils/fs.js";
import { parseControlResults, toOscalAssessmentResults } from "./oscalAssessmentResults.js";
import { toOscalCatalog } from "./oscalCatalog.js";
import { OSCAL_VERSION, oscalJson } from "./oscalIds.js";
import { buildLossReport, type OscalLossReport } from "./oscalLoss.js";
import { toOscalProfile } from "./oscalProfile.js";

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

/** plan.json and the plan.sig.json beside it, each read once and verified whole before use; the catalog must match its lock. */
function readVerifiedPlan(workspace: string, planPath: string, cat: LoadedCatalog): SignedPlan {
  const rest = readJson(join(dirname(planPath), "plan.sig.json")) as Omit<SignedPlan, "plan">;
  const signed: SignedPlan = { ...rest, plan: readJson(planPath) as CompiledPlan };
  assertSignedPlan(workspace, signed, `--plan ${planPath}`);
  const check = verifyCatalogLock(signed.plan.lock, cat);
  if (!check.ok) {
    throw new Error(`the shipped catalog differs from the one the plan was compiled against: ${check.mismatches.slice(0, 5).map((m) => `${m.path} expected ${m.expected}, found ${m.actual}`).join("; ")}`);
  }
  return signed;
}

export function runOscalExportCli(opts: { workspace: string; out: string; plan?: string; results?: string }): void {
  if (opts.results && !opts.plan) throw new Error("--results needs --plan: control results are checked against the signed plan they were evaluated under");
  const outDir = resolve(opts.workspace, opts.out);
  try {
    assertOutsideSignedConfigTree(opts.workspace, outDir);
  } catch {
    throw new Error(`Refusing to write OSCAL under ${join(resolve(opts.workspace), ".amc")}: .amc/** is reserved for signed configs.`);
  }
  const cat = loadCatalog();
  const catalog = toOscalCatalog(cat);
  const signed = opts.plan ? readVerifiedPlan(opts.workspace, resolve(opts.workspace, opts.plan), cat) : null;
  const profile = signed ? toOscalProfile(signed, "catalog.json") : null;
  // Read once; the CONTROL_RESULT signature is verified over the same bytes the results are parsed from.
  const resultsFile = signed && opts.results ? readSignedControlResults(opts.workspace, opts.results) : null;
  const results = signed && resultsFile ? parseControlResults(resultsFile.value, signed.plan, cat) : [];
  const assessment = signed && resultsFile ? toOscalAssessmentResults(results, signed.plan, resultsFile.digestSha256) : null;
  const inputs: OscalLossReport["inputs"] = [
    { kind: "catalog", digest: catalog.digest },
    ...(signed ? [{ kind: "plan" as const, digest: signed.plan.digest }] : []),
    ...(resultsFile ? [{ kind: "results" as const, digest: `sha256:${resultsFile.digestSha256}` }] : [])
  ];
  const files: Record<string, object | null> = {
    "catalog.json": catalog.document,
    "profile.json": profile?.document ?? null,
    "assessment-results.json": assessment?.document ?? null,
    "oscal-loss-report.json": buildLossReport(inputs, [...catalog.losses, ...(profile?.losses ?? []), ...(assessment?.losses ?? [])])
  };
  // An older document this export does not replace would read as current, so refuse before writing anything.
  const stale = Object.entries(files).filter(([name, doc]) => doc === null && pathExists(join(outDir, name))).map(([name]) => join(outDir, name));
  if (stale.length > 0) throw new Error(`left from an earlier export and not replaced by this one: ${stale.join(", ")}; remove them or choose another --out`);
  for (const [name, doc] of Object.entries(files)) if (doc) writeFileAtomic(join(outDir, name), oscalJson(doc), 0o644);

  console.log(chalk.green(`OSCAL ${OSCAL_VERSION} export: ${outDir}`));
  for (const [name, doc] of Object.entries(files)) if (doc) console.log(`  ${name}`);
  if (!signed) console.log(chalk.gray("  profile.json not written: no --plan"));
  else if (!profile?.document) console.log(chalk.yellow("  profile.json not written: the plan has no applicable control"));
  if (results.length === 0) console.log(chalk.yellow("  not evaluated: no control results; assessment-results.json not written"));
  else {
    const count = (f: (r: (typeof results)[number]) => boolean) => results.filter(f).length;
    console.log(`  ${results.length} control results: ${count((r) => r.dimensions.result === "pass" && r.claimKind === "observed")} satisfied, `
      + `${count((r) => r.dimensions.result === "fail")} not-satisfied, ${count((r) => r.dimensions.result === "not_evaluated")} not evaluated, `
      + `${count((r) => r.dimensions.result === "pass" && r.claimKind !== "observed")} self-reported passes (observation only, no finding)`);
  }
  if (signed) console.log(chalk.gray("  Plan signature checked against this workspace's auditor keys: a local audit trail, not portable trust."));
  if (resultsFile) {
    const a = resultsFile.admission;
    console.log(chalk.gray(a.status === "admitted" && a.listId
      ? `  Results signature (CONTROL_RESULT) verified; signer pinned for artifact-seal by trust list ${a.listId}.`
      : "  Results signature (CONTROL_RESULT) checked against this workspace's auditor keys: a local audit trail, not portable trust."));
  }
  console.log(chalk.gray("Evidence of conformity, never a compliance statement. Fields OSCAL cannot carry: oscal-loss-report.json (docs/exports/OSCAL.md)."));
}
