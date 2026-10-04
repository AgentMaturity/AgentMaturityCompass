import { join, relative, resolve, sep } from "node:path";
import YAML from "yaml";
import { ensureDir, writeFileAtomic } from "../../utils/fs.js";
import { assertIndustryPackAccess } from "../industryPackEntitlement.js";
import { composeBlueprint, type ComposeOptions } from "./blueprintCompose.js";
import { blueprintPresetId, toAgentPreset } from "./blueprintPreset.js";
import type { AgentBlueprint, BlueprintRequest } from "./blueprintTypes.js";

export interface RenderOptions extends ComposeOptions {
  readonly outDir: string;
  readonly workspacePath?: string;
}

export interface RenderResult {
  readonly blueprint: AgentBlueprint;
  /** yaml, json, summary -- in that order. */
  readonly files: readonly string[];
}

export function blueprintBasename(blueprint: AgentBlueprint): string {
  return blueprint.packId === undefined ? blueprint.station : `${blueprint.station}-${blueprint.packId}`;
}

/** `.amc/` is signed policy; the generator proposes, the operator registers. */
function assertOutsideAmc(outDir: string, workspace: string): void {
  const inWorkspaceAmc = !relative(join(workspace, ".amc"), outDir).startsWith("..");
  const anySegment = outDir.split(sep).includes(".amc");
  if (inWorkspaceAmc || anySegment) {
    throw new Error(`blueprint render refuses to write under .amc/ (${outDir}); registering into .amc/agents.yaml is a separate signed operator step`);
  }
}

export function renderBlueprintSummary(blueprint: AgentBlueprint): string {
  const presetYaml = YAML.stringify({ presets: [toAgentPreset(blueprint, { model: "<model>", providerId: "<providerId>" })] });
  const lines: string[] = [
    `# Blueprint: ${blueprint.name}`,
    "",
    `- Station: \`${blueprint.station}\`${blueprint.packId ? ` / pack \`${blueprint.packId}\`` : ""}`,
    `- Station profile: \`${blueprint.profile.ruleId}\` (tier ${blueprint.profile.tier}, source ${blueprint.profile.source})`,
    `- Forbidden classes: ${[...blueprint.profile.zeroQuotaClasses, ...blueprint.profile.forbiddenClasses].map((c) => `\`${c}\``).join(", ") || "none"}`,
    `- EU AI Act classification (pack-declared): ${blueprint.classification.join("; ")}`,
    `- Rendered from: ${blueprint.renderedFrom.packIds.join(", ")} (${blueprint.renderedFrom.questionCount} questions; ${blueprint.guardrails.length} guardrails, selection ${blueprint.guardrailSelection.mode})`,
    "",
    "## Tool scope",
    "",
    `- Classes: ${blueprint.toolScope.classes.map((c) => `\`${c}\``).join(", ")}`,
    `- Allowlist patterns: ${blueprint.toolScope.allowlist.length === 0 ? "(operator must fill)" : blueprint.toolScope.allowlist.join(", ")}`,
    "",
    "## Approvals",
    "",
    `- Gated classes: ${blueprint.approvals.gatedClasses.join(", ") || "none"}`,
    `- Required approvals: ${blueprint.approvals.requiredApprovals} (distinct users: ${blueprint.approvals.requireDistinctUsers}; roles ${blueprint.approvals.rolesAllowed.join("/") || "n/a"}; TTL ${blueprint.approvals.ttlMinutes} min)`,
    `- Exec ticket required for: ${blueprint.approvals.requireExecTicketFor.join(", ") || "none"}`,
    "",
    "## Budget (daily)",
    "",
    `- ${blueprint.budget.basis}`,
    `- LLM requests ${blueprint.budget.daily.maxLlmRequests}, tokens ${blueprint.budget.daily.maxLlmTokens}, cost USD ${blueprint.budget.daily.maxCostUsd}`,
    `- Tool executes: ${Object.entries(blueprint.budget.daily.maxToolExecutes).map(([c, n]) => `${c}=${n}`).join(", ")}`,
    "",
    "## Assurance packs that must pass before promotion",
    "",
    ...blueprint.requiredAssurancePacks.map((packId) => `- \`${packId}\``),
    "",
    "## Evidence outputs",
    "",
    `- Ledger receipts: ${blueprint.evidence.receipts.join(", ")}`,
    `- Binder sections: ${blueprint.evidence.binderSections.join(", ")}`,
    "",
    "## Guardrails",
    "",
    ...blueprint.guardrails.map((g) => `- **${g.id}** (${g.derivedFrom.regulatoryRef}): ${g.text}`),
    ...(blueprint.guardrailSelection.omittedQuestionIds.length > 0
      ? ["", `Omitted at station level (render the pack for all of them): ${blueprint.guardrailSelection.omittedQuestionIds.join(", ")}`]
      : []),
    "",
    "## Risk statements (pack keyRisks; not guardrails)",
    "",
    ...blueprint.riskStatements.map((risk) => `- ${risk}`),
    "",
    "## Sources",
    "",
    "All sources are cited from the industry pack as shipped; none was retrieved by this render (verified: false).",
    "",
    ...blueprint.sources.map((source) => `- ${source.title} -- cited by ${source.citedBy.join(", ")}`),
    "",
    "## Registration (operator step; this command never writes .amc/)",
    "",
    "Review the files, fill the allowlist, then append the preset below to `.amc/agents.yaml` through `savePresets()` so it is validated and signed:",
    "",
    "```yaml",
    presetYaml.trimEnd(),
    "```",
    "",
    `Preset id: \`${blueprintPresetId(blueprint)}\`. The runtime approval policy, action policy, budgets and tool allowlist still apply; a preset cannot widen them.`
  ];
  return lines.join("\n") + "\n";
}

export function renderBlueprintFiles(request: BlueprintRequest, options: RenderOptions): RenderResult {
  const workspace = resolve(options.workspacePath ?? process.cwd());
  assertIndustryPackAccess(workspace);
  const outDir = resolve(options.outDir);
  assertOutsideAmc(outDir, workspace);

  const blueprint = composeBlueprint(request, { profileSource: options.profileSource });
  const base = join(outDir, blueprintBasename(blueprint));
  const files = [`${base}.blueprint.yaml`, `${base}.blueprint.json`, `${base}.summary.md`];

  ensureDir(outDir);
  writeFileAtomic(files[0]!, YAML.stringify(blueprint), 0o644);
  writeFileAtomic(files[1]!, JSON.stringify(blueprint, null, 2) + "\n", 0o644);
  writeFileAtomic(files[2]!, renderBlueprintSummary(blueprint), 0o644);
  return { blueprint, files };
}
