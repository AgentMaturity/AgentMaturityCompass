import { dirname, resolve } from "node:path";
import { z } from "zod";
import { checkHarnessComparison } from "./harnessComparison.js";
import { comparisonFilePinSchema, harnessComparisonManifestSchema, type HarnessComparisonManifest } from "./harnessComparisonSchema.js";
import { comparisonSha256, readComparisonFile, resolveComparisonPin } from "./harnessComparisonArtifacts.js";
import { experimentGateSchema } from "../experiments/experimentSchema.js";

const COMPARISON_CAMPAIGN_VERSION = "comparison-campaign/1" as const;
const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
export const comparisonCampaignSchema = z.object({
  schemaVersion: z.literal(COMPARISON_CAMPAIGN_VERSION), id, description: z.string().min(1).max(4096),
  cohort: z.enum(["native-task-execution", "improvement-loop"]),
  evidenceClass: z.enum(["scripted-conformance", "model-quality", "human-usability", "platform"]),
  executor: z.enum(["runHarnessComparison", "runExecutedExperimentAsync"]),
  targets: z.array(id).min(2).max(16), repetitions: z.number().int().min(3).max(100),
  order: z.literal("rotate-targets-by-repetition"),
  tasks: z.array(z.object({ id, scenario: z.string().min(1).max(64) }).strict()).min(1).max(100),
  /** Null is an unavailable installed cohort, never an all-zero placeholder digest. */
  manifest: comparisonFilePinSchema.nullable(), preparationInputs: z.array(comparisonFilePinSchema).max(64),
  blockers: z.array(z.string().min(1).max(2048)).max(64),
  workspaceTaskIds: z.array(id).max(100), requireComponentsUsed: z.boolean(),
  behavioralGate: z.object({ minRepetitions: z.number().int().min(3).max(100), minPassRateLowerBound: z.number().finite().min(0).max(1) }).strict(),
  comparisons: z.array(z.object({ baseline: id, candidate: id, policy: experimentGateSchema }).strict()).min(1).max(32)
}).strict().superRefine((spec, ctx) => {
  const reject = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (new Set(spec.targets).size !== spec.targets.length || new Set(spec.tasks.map(t => t.id)).size !== spec.tasks.length) reject("Campaign identities must be unique.");
  if (spec.repetitions % spec.targets.length !== 0) reject("Complete target-order rotations are required for balanced positions.");
  if (spec.repetitions < spec.behavioralGate.minRepetitions) reject("Repetitions are below the preregistered stability floor.");
  if (spec.targets.length * spec.tasks.length * spec.repetitions > 2000) reject("Campaign exceeds the existing 2,000-trial runner limit.");
  if (spec.workspaceTaskIds.some(task => !spec.tasks.some(row => row.id === task))) reject("Unknown workspace task.");
  const pairs = spec.comparisons.map(row => `${row.baseline}/${row.candidate}`);
  if (new Set(pairs).size !== pairs.length || spec.comparisons.some(row => row.baseline === row.candidate || !spec.targets.includes(row.baseline) || !spec.targets.includes(row.candidate))) reject("Comparisons require unique, distinct declared target pairs.");
  for (const row of spec.comparisons) {
    if (Object.values(row.policy).some(value => typeof value === "number" && !Number.isFinite(value))) reject("Gate thresholds must be finite.");
  }
  if ((spec.cohort === "native-task-execution") !== (spec.executor === "runHarnessComparison")) reject("Cohort and existing executor do not match.");
});
export type ComparisonCampaign = z.infer<typeof comparisonCampaignSchema>;

export function loadComparisonCampaign(campaignPath: string) {
  const path = resolve(campaignPath), bytes = readComparisonFile(path);
  return { spec: comparisonCampaignSchema.parse(JSON.parse(bytes.toString("utf8"))), campaignSha256: comparisonSha256(bytes), base: dirname(path) };
}

/** Read-only preparation: no executor construction, installation, model, output directory or result write. */
export function checkComparisonCampaign(campaignPath: string, options: { analysisOnly?: boolean } = {}) {
  const { spec, campaignSha256, base } = loadComparisonCampaign(campaignPath);
  const problems = [...spec.blockers], warnings: string[] = [];
  let manifest: HarnessComparisonManifest | null = null;
  let trials: ReturnType<typeof checkHarnessComparison>["trials"] = [];
  const inspect = (read: () => void) => { try { read(); } catch (error) { problems.push(error instanceof Error ? error.message : String(error)); } };
  for (const pin of spec.preparationInputs) inspect(() => { resolveComparisonPin(pin, base); });
  if (!spec.manifest) problems.push("Installed cohort manifest unavailable; reviewed source revisions do not establish artifact or model readiness.");
  else inspect(() => {
    const manifestPath = resolveComparisonPin(spec.manifest!, base);
    const manifestBytes = readComparisonFile(manifestPath);
    if (comparisonSha256(manifestBytes) !== spec.manifest!.sha256) throw new Error("Campaign manifest changed after pin verification.");
    manifest = harnessComparisonManifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
    if (manifest.id !== spec.id) problems.push("Campaign and manifest identities differ.");
    if (JSON.stringify(manifest.targets.map(t => t.id)) !== JSON.stringify(spec.targets)) problems.push("Manifest target order differs from the preregistered campaign.");
    if (manifest.repetitions !== spec.repetitions) problems.push("Manifest repetitions differ from the campaign.");
    if (JSON.stringify(manifest.tasks.map(t => ({ id: t.id, scenario: t.scenario }))) !== JSON.stringify(spec.tasks)) problems.push("Manifest task/scenario order differs from the campaign.");
    if (manifest.lanes.some(lane => spec.evidenceClass === "scripted-conformance" ? lane.kind !== "keyless-conformance" : spec.evidenceClass === "model-quality" ? lane.kind === "keyless-conformance" : true)) problems.push("Evidence classes cannot be pooled; human/platform studies need separately qualified collection.");
    const readiness = checkHarnessComparison({ manifestPath });
    if (readiness.manifestSha256 !== spec.manifest!.sha256) problems.push("Campaign manifest changed during readiness admission.");
    // Archived analysis needs no credential. Every pin/environment/binding check still applies.
    problems.push(...readiness.problems.filter(problem => !options.analysisOnly || problem !== "Required named live credentials are unavailable."));
    warnings.push(...readiness.warnings); trials = readiness.trials;
  });
  if (spec.cohort === "improvement-loop") problems.push("Improvement-loop execution needs the WP04 admitted baseline/candidate executor and a separately pinned Harness² substrate; no task-runner substitution is admitted.");
  return { schemaVersion: COMPARISON_CAMPAIGN_VERSION, campaignId: spec.id, campaignSha256,
    status: problems.length ? "blocked" as const : "ready" as const, problems, warnings,
    state: "prepared-not-executed" as const, credentialsChecked: options.analysisOnly !== true, trials, manifest: manifest as HarnessComparisonManifest | null,
    plannedTrials: spec.targets.length * spec.tasks.length * spec.repetitions,
    limitations: ["Readiness checks file pins and declarations only; listeners, containment, effective permissions and served model identities are not probed.",
      "No provider credentials are read from the ambient environment. A live lane remains blocked until a separately authorized readiness invocation supplies its named credentials."] };
}
