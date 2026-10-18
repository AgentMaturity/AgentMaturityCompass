/**
 * `amc catalog compile` (P1-10; named freeze exception): a deployment profile against the shipped catalog in, a signed
 * experimental control plan out. Exit codes: 0 ready, 2 blocked, 1 error or refusal. Writes plan.json, plan.sig.json,
 * plan.diff.md and catalog.lock.json, never under .amc/; only `--request-review` asks the approval engine to record a
 * request there. `--activate <approvalRequestId>` (P1-12) then makes the plan the workspace's active compiled policy,
 * once that review approved exactly this plan. A plan is evidence-of-conformity planning, never a compliance claim.
 */
import { readFileSync } from "node:fs";
import { cliInitiator } from "../approvals/approvalEngine.js";
import { dirname, join, resolve } from "node:path";
import chalk from "chalk";
import type { Command } from "commander";
import { assertCompilerOutputOutsideSignedConfigTree } from "./compiler/outputPath.js";
import { writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { loadTrustContext } from "../trust/trustContext.js";
import { activateControlPlan } from "./compiler/activate.js";
import { compilePlan, parseDeploymentProfile } from "./compiler/compile.js";
import { renderPlanDiffMarkdown } from "./compiler/diff.js";
import { signPlan } from "./compiler/sign.js";
import type { CompiledPlan, SignedPlan } from "./compiler/types.js";
import { loadAdmittedCatalog } from "./admission/gate.js";
import { renderCatalogCheck, runCatalogCheck } from "./admission/index.js";
import { compileInputs } from "./compileInputs.js";
import { verifyCatalogLock } from "./lockfile.js";

interface CompileFlags { profile: string; previous?: string; lock?: string; out?: string; json?: boolean; requestReview?: boolean; allowWeakening?: boolean; activate?: string }

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** plan.json and the plan.sig.json beside it, each read once; signPlan verifies them before using either. */
function readSignedPlan(planPath: string): SignedPlan {
  const rest = readJson(join(dirname(planPath), "plan.sig.json")) as Omit<SignedPlan, "plan">;
  return { ...rest, plan: readJson(planPath) as CompiledPlan };
}

/** Compile, sign and write the plan files, and activate when asked; runCatalogCompile prints what this returns. */
export function compileCatalogPlan(workspace: string, opts: CompileFlags) {
  if (opts.activate && opts.requestReview) throw new Error("--activate needs a review that was already approved; it cannot be combined with --request-review");
  const profile = parseDeploymentProfile(readJson(resolve(workspace, opts.profile)));
  const ref = profile.operatingProfile;
  if (ref && sha256Hex(readFileSync(resolve(workspace, ref.path))) !== ref.sha256) {
    throw new Error(`operating profile ${ref.path} does not match the sha256 the deployment profile records`);
  }
  // P1-33: a pack's declared reviewed support stands only where its recomputed admission admits it.
  const catalog = loadAdmittedCatalog();
  if (opts.lock) {
    const check = verifyCatalogLock(readJson(resolve(workspace, opts.lock)), catalog);
    if (!check.ok) {
      throw new Error(`the catalog does not match --lock: ${check.mismatches.slice(0, 5).map((m) => `${m.path} expected ${m.expected}, found ${m.actual}`).join("; ")}`);
    }
  }
  const previous = opts.previous ? readSignedPlan(resolve(workspace, opts.previous)) : null;
  const now = new Date();
  // P1-10F: the same workspace inputs A4 Adapt compiles with: the verified .amc/tools.yaml, or with none the built-in
  // default list; one that does not verify refuses.
  const inputs = compileInputs(workspace);
  const visibleToolsSource = inputs.signedTools ? { source: "signed-tools-yaml" as const, sha256: inputs.signedTools.sha256 } : { source: "defaults" as const };
  const plan = compilePlan({ profile, catalog, asOf: now.toISOString(), ...inputs,
    ...(profile.mergeExceptions?.length ? { mergeExceptionTrust: loadTrustContext({ now }) } : {}) });
  const outDir = resolve(workspace, opts.out ?? join("amc-control-plans", plan.profile.profileId, plan.digest.slice("sha256:".length, "sha256:".length + 12)));
  try {
    assertCompilerOutputOutsideSignedConfigTree(workspace, outDir);
  } catch (error) {
    // A file-system failure (ENOENT, ENOTDIR, EACCES...) is not the .amc boundary: report it as it is.
    if ((error as NodeJS.ErrnoException).code !== undefined) throw error;
    throw new Error(`Refusing to write a control plan under ${join(resolve(workspace), ".amc")}: .amc/** is reserved for signed configs.`);
  }
  const { signed, weakenings } = signPlan({
    workspace, plan, previous, allowWeakening: opts.allowWeakening, reviewAgentId: opts.requestReview ? profile.deployment.agentIds[0] : null,
    initiator: cliInitiator()
  });
  const files: Record<string, string> = {
    "plan.json": json(plan),
    "plan.sig.json": json({ compiledAt: signed.compiledAt, diff: signed.diff, signature: signed.signature, review: signed.review }),
    "plan.diff.md": renderPlanDiffMarkdown(signed.diff),
    "catalog.lock.json": json(plan.lock)
  };
  for (const [name, text] of Object.entries(files)) writeFileAtomic(join(outDir, name), text, 0o644);
  const activated = opts.activate ? activateControlPlan({ workspace, signed, approvalRequestId: opts.activate,
    reviewAgentId: profile.deployment.agentIds[0] ?? "", allowWeakening: opts.allowWeakening }) : null;
  return { plan, signed, weakenings, outDir, files: Object.keys(files), activated, visibleToolsSource };
}

export function runCatalogCompile(workspace: string, opts: CompileFlags): number {
  const { plan, signed, weakenings, outDir, files, activated, visibleToolsSource } = compileCatalogPlan(workspace, opts);
  const count = (a: string) => plan.requirements.filter((r) => r.applicability === a).length;
  if (opts.json) {
    console.log(JSON.stringify({ status: plan.status, digest: plan.digest, policyDigest: plan.runtimePolicy.policyDigest, outDir,
      files, review: signed.review, weakenings, activation: activated, visibleToolsSource, claim: "experimental plan; no compliance claim" }, null, 2));
  } else {
    console.log((plan.status === "ready" ? chalk.green : chalk.yellow)(`Control plan ${plan.status}: ${outDir}`));
    console.log(`  ${plan.digest}; ${count("applicable")} applicable, ${count("unresolved")} unresolved, ${count("not_applicable")} not applicable`);
    for (const r of plan.requirements.filter((x) => x.applicability === "unresolved")) console.log(chalk.yellow(`  unresolved ${r.controlId}: missing ${r.missingFacts.join(", ")}`));
    for (const c of plan.conflicts.filter((x) => x.resolution === "unresolved")) console.log(chalk.yellow(`  unresolved conflict ${c.parameter}: ${JSON.stringify(c.values)}`));
    for (const c of plan.conflicts.filter((x) => x.mergeKey && x.resolution !== "unresolved")) console.log(chalk.gray(`  station merge ${c.mergeKey}: ${c.resolution}, chosen ${c.chosenControlId}`));
    for (const e of plan.mergeExceptionRejected ?? []) console.log(chalk.yellow(`  rejected station exception ${e.id} (${e.mergeKey}): ${e.reason}`));
    for (const u of plan.unsupported) console.log(chalk.gray(`  unsupported ${u.controlId} (${u.reason}): ${u.detail}`));
    console.log(visibleToolsSource.source === "defaults"
      ? chalk.yellow("  visible tools: the built-in default list (no .amc/tools.yaml)")
      : `  visible tools: the signed .amc/tools.yaml (sha256 ${visibleToolsSource.sha256.slice(0, 12)}); once active, a different tools.yaml refuses every call until you recompile and reactivate`);
    for (const w of weakenings) console.log(chalk.yellow(`  weakens (allowed) ${w}`));
    console.log(`  review: pending${signed.review.approvalRequestId ? ` (approval request ${signed.review.approvalRequestId})` : "; no approval requested (--request-review)"}`);
    if (activated) {
      console.log(chalk.green(`  activated as the workspace's compiled policy (revision ${activated.revision}); new native sessions enforce it in the tool pipeline`));
      for (const w of activated.weakenings) console.log(chalk.yellow(`  activation weakens (allowed) ${w}`));
    }
    console.log(chalk.gray("Experimental: a plan is not a compliance claim. Signed as CONTROL_PLAN; checked against this workspace's keys the signature is a local audit trail."));
  }
  return plan.status === "ready" ? 0 : 2;
}

interface CheckFlags { pack?: string; catalog?: string; json?: boolean; write?: boolean }

/** `amc catalog check` (P1-33; named freeze exception): exit 0 when every declared support is admissible, 1 otherwise. */
async function runCatalogCheckCommand(opts: CheckFlags): Promise<number> {
  const result = await runCatalogCheck({ catalogRoot: opts.catalog, packId: opts.pack, write: opts.write });
  if (opts.json) console.log(JSON.stringify({ ...result, claim: "admission reports: evidence of conformity planning; a met record criterion shows signed records exist, not that the content is right" }, null, 2));
  else for (const line of renderCatalogCheck(result)) console.log(line.startsWith("REFUSED") ? chalk.red(line) : line);
  return result.exitCode;
}

export function registerCatalogCommands(program: Command): void {
  const catalog = program.command("catalog").description("Regulated Control Catalog (experimental): check pack admission and compile deployment profiles into control plans");
  catalog
    .command("check")
    .description("Check each pack's declared support against the ten admission criteria (exit 0 when every declared support is admissible, 1 otherwise)")
    .option("--pack <id>", "Check one pack")
    .option("--catalog <dir>", "Catalog root (default: the shipped catalog)")
    .option("--json", "Output as JSON")
    .option("--write", "Write each report to <catalog>/admission/<pack-id>-<version>.json (never edits a pack)", false)
    .action(async (opts: CheckFlags) => {
      try {
        process.exitCode = await runCatalogCheckCommand(opts);
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });
  catalog
    .command("compile")
    .description("Compile a deployment profile against the catalog into a signed, experimental control plan (exit 0 ready, 2 blocked, 1 error)")
    .requiredOption("--profile <file>", "Deployment profile JSON (docs/catalog/COMPILER.md)")
    .option("--previous <plan.json>", "The last plan.json; it and the plan.sig.json beside it must verify")
    .option("--lock <catalog.lock.json>", "Refuse to compile unless the loaded catalog matches this lockfile")
    .option("--out <dir>", "Output directory (default amc-control-plans/<profileId>/<first 12 hex of digest>/; never under .amc/)")
    .option("--request-review", "Create an approval request bound to the plan digest", false)
    .option("--allow-weakening", "Sign or activate a plan that weakens the previous or active plan or applies reviewer exceptions, after review", false)
    .option("--activate <approvalRequestId>", "Make the plan the workspace's active compiled policy, once this plan review approved exactly this plan")
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
