/**
 * `amc catalog compile` (P1-10; named freeze exception): a deployment profile against the shipped catalog in, a signed
 * experimental control plan out. Exit codes: 0 ready, 2 blocked, 1 error or refusal. Writes plan.json, plan.sig.json,
 * plan.diff.md and catalog.lock.json, never under .amc/; only `--request-review` asks the approval engine to record a
 * request there. A plan is evidence-of-conformity planning, never a compliance claim.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import chalk from "chalk";
import type { Command } from "commander";
import { assertOutsideSignedConfigTree } from "../domains/operatingProfiles/operatingProfileEmit.js";
import { writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { compilePlan, parseDeploymentProfile } from "./compiler/compile.js";
import { renderPlanDiffMarkdown } from "./compiler/diff.js";
import { signPlan } from "./compiler/sign.js";
import type { CompiledPlan, SignedPlan } from "./compiler/types.js";
import { loadCatalog } from "./loader.js";
import { verifyCatalogLock } from "./lockfile.js";

interface CompileFlags { profile: string; previous?: string; lock?: string; out?: string; json?: boolean; requestReview?: boolean; allowWeakening?: boolean }

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** plan.json and the plan.sig.json beside it, each read once; signPlan verifies them before using either. */
function readSignedPlan(planPath: string): SignedPlan {
  const rest = readJson(join(dirname(planPath), "plan.sig.json")) as Omit<SignedPlan, "plan">;
  return { ...rest, plan: readJson(planPath) as CompiledPlan };
}

export function runCatalogCompile(workspace: string, opts: CompileFlags): number {
  const profile = parseDeploymentProfile(readJson(resolve(workspace, opts.profile)));
  const ref = profile.operatingProfile;
  if (ref && sha256Hex(readFileSync(resolve(workspace, ref.path))) !== ref.sha256) {
    throw new Error(`operating profile ${ref.path} does not match the sha256 the deployment profile records`);
  }
  const catalog = loadCatalog();
  if (opts.lock) {
    const check = verifyCatalogLock(readJson(resolve(workspace, opts.lock)), catalog);
    if (!check.ok) {
      throw new Error(`the catalog does not match --lock: ${check.mismatches.slice(0, 5).map((m) => `${m.path} expected ${m.expected}, found ${m.actual}`).join("; ")}`);
    }
  }
  const previous = opts.previous ? readSignedPlan(resolve(workspace, opts.previous)) : null;
  const plan = compilePlan({ profile, catalog, asOf: new Date().toISOString() });
  const outDir = resolve(workspace, opts.out ?? join("amc-control-plans", plan.profile.profileId, plan.digest.slice("sha256:".length, "sha256:".length + 12)));
  try {
    assertOutsideSignedConfigTree(workspace, outDir);
  } catch {
    throw new Error(`Refusing to write a control plan under ${join(resolve(workspace), ".amc")}: .amc/** is reserved for signed configs.`);
  }
  const { signed, weakenings } = signPlan({
    workspace, plan, previous, allowWeakening: opts.allowWeakening, reviewAgentId: opts.requestReview ? profile.deployment.agentIds[0] : null
  });
  const files: Record<string, string> = {
    "plan.json": json(plan),
    "plan.sig.json": json({ compiledAt: signed.compiledAt, diff: signed.diff, signature: signed.signature, review: signed.review }),
    "plan.diff.md": renderPlanDiffMarkdown(signed.diff),
    "catalog.lock.json": json(plan.lock)
  };
  for (const [name, text] of Object.entries(files)) writeFileAtomic(join(outDir, name), text, 0o644);
  const count = (a: string) => plan.requirements.filter((r) => r.applicability === a).length;
  if (opts.json) {
    console.log(JSON.stringify({ status: plan.status, digest: plan.digest, policyDigest: plan.runtimePolicy.policyDigest, outDir,
      files: Object.keys(files), review: signed.review, weakenings, claim: "experimental plan; no compliance claim" }, null, 2));
  } else {
    console.log((plan.status === "ready" ? chalk.green : chalk.yellow)(`Control plan ${plan.status}: ${outDir}`));
    console.log(`  ${plan.digest}; ${count("applicable")} applicable, ${count("unresolved")} unresolved, ${count("not_applicable")} not applicable`);
    for (const r of plan.requirements.filter((x) => x.applicability === "unresolved")) console.log(chalk.yellow(`  unresolved ${r.controlId}: missing ${r.missingFacts.join(", ")}`));
    for (const c of plan.conflicts.filter((x) => x.resolution === "unresolved")) console.log(chalk.yellow(`  unresolved conflict ${c.parameter}: ${JSON.stringify(c.values)}`));
    for (const u of plan.unsupported) console.log(chalk.gray(`  unsupported ${u.controlId} (${u.reason}): ${u.detail}`));
    for (const w of weakenings) console.log(chalk.yellow(`  weakens (allowed) ${w}`));
    console.log(`  review: pending${signed.review.approvalRequestId ? ` (approval request ${signed.review.approvalRequestId})` : "; no approval requested (--request-review)"}`);
    console.log(chalk.gray("Experimental: a plan is not a compliance claim. Signed as CONTROL_PLAN; checked against this workspace's keys the signature is a local audit trail."));
  }
  return plan.status === "ready" ? 0 : 2;
}

export function registerCatalogCommands(program: Command): void {
  const catalog = program.command("catalog").description("Regulated Control Catalog (experimental): compile deployment profiles into control plans");
  catalog
    .command("compile")
    .description("Compile a deployment profile against the catalog into a signed, experimental control plan (exit 0 ready, 2 blocked, 1 error)")
    .requiredOption("--profile <file>", "Deployment profile JSON (docs/catalog/COMPILER.md)")
    .option("--previous <plan.json>", "The last plan.json; it and the plan.sig.json beside it must verify")
    .option("--lock <catalog.lock.json>", "Refuse to compile unless the loaded catalog matches this lockfile")
    .option("--out <dir>", "Output directory (default amc-control-plans/<profileId>/<first 12 hex of digest>/; never under .amc/)")
    .option("--request-review", "Create an approval request bound to the plan digest", false)
    .option("--allow-weakening", "Sign a plan that weakens the previous plan or applies reviewer exceptions, after review", false)
    .option("--json", "Output as JSON")
    .action((opts: CompileFlags) => {
      try {
        process.exitCode = runCatalogCompile(process.cwd(), opts);
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });
}
