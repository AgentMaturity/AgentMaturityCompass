import { readdirSync } from "node:fs";
import { join } from "node:path";
import { getPublicKeyHistory } from "../../crypto/keys.js";
import { getAgentPaths } from "../../fleet/paths.js";
import { checkDigestSignature, loadTrustContext, type TrustContext } from "../../trust/index.js";
import { pathExists, readUtf8 } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import {
  conformanceExportSchema, type ConformanceCounts, type ConformanceExport, type ConformanceRequirement, type ConformanceStatus
} from "./conformanceSchema.js";

/** The JSON export: the sealed run, pretty-printed; `parseConformanceExport` reads it back. */
export function renderConformanceJson(run: ConformanceExport): string {
  return `${JSON.stringify(run, null, 2)}\n`;
}

export function parseConformanceExport(text: string): ConformanceExport {
  return conformanceExportSchema.parse(JSON.parse(text));
}

export interface ConformanceVerification {
  ok: boolean;
  errors: string[];
  /** The parsed object that was checked; a caller uses it instead of reading the file again. */
  run: ConformanceExport | null;
}

/**
 * Verifies an export without trusting any of its own claims: the schema; the seal hash over the object as given
 * (every field but the seal, so an added field breaks it); the seal signature, found among this workspace's auditor
 * keys and admitted for artifact-seal by `trust` (P0-09: a workspace key only locates the signer, the trust context
 * decides); and the status, id lists and counts recomputed from the requirement statuses. The status rule lives in
 * conformanceRun.ts; it is repeated here as a check, not as a second definition.
 */
export function verifyConformanceExport(candidate: unknown, opts: { workspace: string; trust: TrustContext }): ConformanceVerification {
  const parsed = conformanceExportSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`), run: null };
  }
  const run = parsed.data;
  const errors: string[] = [];
  const digest = sha256Hex(canonicalize({ ...(candidate as Record<string, unknown>), reportJsonSha256: "", runSealSig: "" }));
  if (digest !== run.reportJsonSha256) errors.push("reportJsonSha256 does not match the run");
  let auditorKeys: string[] = [];
  try {
    auditorKeys = getPublicKeyHistory(opts.workspace, "auditor");
  } catch (error) {
    errors.push(`auditor keys could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  const check = checkDigestSignature({ signature: "conformance run runSealSig", purpose: "artifact-seal", digestHex: digest,
    signatureB64: run.runSealSig, candidates: auditorKeys, context: opts.trust, claimedSignedAt: run.generatedTs });
  if (!check.verified) errors.push("runSealSig does not verify under any auditor key of this workspace");
  else if (check.admission.status !== "admitted") {
    errors.push(`the sealing key is not admitted for artifact-seal (${check.admission.status}${check.admission.detail ? `: ${check.admission.detail}` : ""})`);
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
  return { ok: errors.length === 0, errors, run };
}

export const NO_VERIFIED_CONFORMANCE_RUN = "no verified conformance run";

export interface BinderConformanceRun {
  section: {
    status: ConformanceStatus | null;
    conformanceRunId: string | null;
    station: string | null;
    counts: ConformanceCounts | null;
    reportJsonSha256: string | null;
    notes: string[];
  };
  /** The run that verified, for the binder's checks/ and summaries/ copies; null whenever the section's status is. */
  run: ConformanceExport | null;
}

/**
 * The audit binder's conformanceRun section for one agent. Each run file under the agent's reports/conformance/ is
 * read once and verified under `trust` (default: the operator's pinned trust, P0-09); the newest one fills the section
 * and is returned for the binder's copies, so nothing is read twice. Fails closed: no agent scope, no run, a trust
 * context that cannot load, or any run file that does not verify gives status null and "no verified conformance
 * run", never a pass. Notes never carry error text, which can name local paths a binder must not hold.
 */
export function binderConformanceRun(workspace: string, agentId: string | null, trust?: TrustContext): BinderConformanceRun {
  const none = (...notes: string[]): BinderConformanceRun => ({ run: null, section: { status: null, conformanceRunId: null,
    station: null, counts: null, reportJsonSha256: null, notes: [NO_VERIFIED_CONFORMANCE_RUN, ...notes] } });
  if (agentId === null) return none("conformance runs are agent-scoped and this binder's scope is not an agent");
  const dir = join(getAgentPaths(workspace, agentId).reportsDir, "conformance");
  if (!pathExists(dir)) return none();
  let context: TrustContext;
  try {
    context = trust ?? loadTrustContext();
  } catch {
    return none("the operator's pinned trust could not be loaded");
  }
  const verified: ConformanceExport[] = [];
  let failed = 0;
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
    let candidate: unknown;
    try {
      candidate = JSON.parse(readUtf8(join(dir, file))) as unknown;
    } catch {
      failed += 1;
      continue;
    }
    const result = verifyConformanceExport(candidate, { workspace, trust: context });
    if (result.ok && result.run?.agentId === agentId) verified.push(result.run);
    else failed += 1;
  }
  if (failed > 0) return none(`${failed} conformance run file(s) did not verify under pinned trust`);
  const run = verified.sort((a, b) => b.generatedTs - a.generatedTs)[0];
  if (!run) return none();
  return { run, section: { status: run.status, conformanceRunId: run.conformanceRunId, station: run.station, counts: run.counts,
    reportJsonSha256: run.reportJsonSha256, notes: [`weakest claim kind: ${run.claimKind}`] } };
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
    (row) => `| \`${row.id}\` | ${row.status} | ${row.claimKind} | ${row.observed ?? "—"} | ${row.reason.replaceAll("|", "\\|")} | ${evidenceSummary(row).replaceAll("|", "\\|")} |`
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
    `- Claim kind: ${run.claimKind} (the weakest requirement's); applicability: ${run.statusDimensions.applicability.state}`,
    `- Maximum evidence age: ${run.freshness.maxEvidenceAgeMs} ms before \`${new Date(run.freshness.nowTs).toISOString()}\``,
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
    "| Requirement | Status | Claim | Observed | Reason | Evidence |",
    "|---|---|---|---|---|---|",
    ...requirementRows(run.requirements),
    ""
  ].join("\n");
}
