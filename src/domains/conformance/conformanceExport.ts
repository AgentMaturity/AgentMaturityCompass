import { sealedRunReportVerifies } from "../../diagnostic/reportSeal.js";
import { conformanceExportSchema, type ConformanceExport, type ConformanceRequirement } from "./conformanceSchema.js";

/** The JSON export: the sealed run, pretty-printed; `parseConformanceExport` reads it back. */
export function renderConformanceJson(run: ConformanceExport): string {
  return `${JSON.stringify(run, null, 2)}\n`;
}

export function parseConformanceExport(text: string): ConformanceExport {
  return conformanceExportSchema.parse(JSON.parse(text));
}

/**
 * Verifies an export without trusting any of its own claims: schema, seal
 * against the workspace auditor keys, and the status recomputed from the
 * requirement statuses. The status rule lives in conformanceRun.ts; it is
 * repeated here as a check, not as a second definition.
 */
export function verifyConformanceExport(workspace: string, candidate: unknown): { ok: boolean; errors: string[] } {
  const parsed = conformanceExportSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
  }
  const run = parsed.data;
  const errors: string[] = [];
  if (!sealedRunReportVerifies(workspace, run as unknown as Record<string, unknown>)) {
    errors.push("seal did not verify against the workspace auditor keys (hash or signature)");
  }
  const failed = run.requirements.filter((row) => row.status === "FAIL").map((row) => row.id);
  const notEvaluated = run.requirements.filter((row) => row.status === "NOT_EVALUATED").map((row) => row.id);
  const expectedStatus = run.requirements.length > 0 && failed.length === 0 && notEvaluated.length === 0 ? "REQUIREMENTS_MET" : "REQUIREMENTS_NOT_MET";
  if (run.status !== expectedStatus) {
    errors.push(`status ${run.status} does not follow from the requirement statuses (expected ${expectedStatus})`);
  }
  if (run.failedRequirementIds.join("\n") !== failed.join("\n")) errors.push("failedRequirementIds do not match the requirements");
  if (run.notEvaluatedRequirementIds.join("\n") !== notEvaluated.join("\n")) errors.push("notEvaluatedRequirementIds do not match the requirements");
  const pass = run.requirements.length - failed.length - notEvaluated.length;
  if (run.counts.total !== run.requirements.length || run.counts.pass !== pass || run.counts.fail !== failed.length || run.counts.notEvaluated !== notEvaluated.length) {
    errors.push("counts do not match the requirements");
  }
  return { ok: errors.length === 0, errors };
}

function evidenceSummary(requirement: ConformanceRequirement): string {
  if (requirement.evidence.length === 0) return "none";
  const byKind = new Map<string, string[]>();
  for (const ref of requirement.evidence) {
    const list = byKind.get(ref.kind) ?? [];
    list.push(ref.id);
    byKind.set(ref.kind, list);
  }
  return [...byKind.entries()]
    .map(([kind, ids]) => (ids.length > 3 ? `${kind} ×${ids.length} (${ids.slice(0, 2).join(", ")}, …)` : `${kind}: ${ids.join(", ")}`))
    .join("; ");
}

function requirementRows(requirements: ConformanceRequirement[]): string[] {
  return requirements.map(
    (row) => `| \`${row.id}\` | ${row.status} | ${row.observed ?? "—"} | ${row.reason.replaceAll("|", "\\|")} | ${evidenceSummary(row).replaceAll("|", "\\|")} |`
  );
}

/** Markdown summary in the shape the audit binder's `summaries/summary.md` uses. */
export function renderConformanceMarkdown(run: ConformanceExport): string {
  const failed = run.requirements.filter((row) => row.status === "FAIL");
  const notEvaluated = run.requirements.filter((row) => row.status === "NOT_EVALUATED");
  const listOrNone = (rows: ConformanceRequirement[]): string =>
    rows.length === 0 ? "- None" : rows.map((row) => `- \`${row.id}\` — ${row.reason}`).join("\n");
  return [
    "# AMC Conformance Run",
    "",
    "_Evidence of conformity within the station's derived requirement set (sector packs, assurance packs, scenario packs). Engineering evidence; not legal advice._",
    "",
    `- Conformance Run ID: \`${run.conformanceRunId}\``,
    `- Station: \`${run.station}\``,
    `- Agent: \`${run.agentId}\``,
    `- Generated: \`${new Date(run.generatedTs).toISOString()}\``,
    `- Status: **${run.status}**`,
    `- Requirements: ${run.counts.total} total — PASS ${run.counts.pass}, FAIL ${run.counts.fail}, NOT_EVALUATED ${run.counts.notEvaluated}`,
    `- Profile: ${run.profile ? `\`${run.profile.id}\` (${run.profile.source})` : "none (registry defaults)"}`,
    "",
    "## Boundary",
    `- Source commit: \`${run.sourceCommit}\` (${run.sourceCommitResolution})`,
    `- Environment: \`${run.environment.platform}/${run.environment.arch}\`, Node \`${run.environment.node}\``,
    `- Assurance runs consumed: ${run.inputs.assuranceRuns.length === 0 ? "none" : run.inputs.assuranceRuns.map((row) => `\`${row.assuranceRunId}\` (session \`${row.sessionId}\`, packs: ${row.packIds.join(", ")})`).join("; ")}`,
    `- Pack responses consumed: ${run.inputs.packResponseCount}`,
    `- Seal: \`${run.reportJsonSha256 || "unsealed"}\``,
    "",
    "## Failed requirements",
    listOrNone(failed),
    "",
    "## Not evaluated requirements",
    listOrNone(notEvaluated),
    "",
    "## Refused inputs",
    run.refusedInputs.length === 0 ? "- None" : run.refusedInputs.map((row) => `- \`${row.source}\` — ${row.reason}`).join("\n"),
    "",
    "## Requirements",
    "| Requirement | Status | Observed | Reason | Evidence |",
    "|---|---|---|---|---|",
    ...requirementRows(run.requirements),
    ""
  ].join("\n");
}
