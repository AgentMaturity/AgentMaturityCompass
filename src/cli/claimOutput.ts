/**
 * Claim labels on CLI results (P0-22). A registered result command (src/cli/resultCommandRegistry.ts) prints
 * the canonical claim line right after its result title, or adds the claim fields to its `--json` output; the
 * postAction hook in src/cli/claimLabelHooks.ts checks that it did. See docs/CLAIM_KINDS.md, "CLI and reports".
 */
import { envelopeForLegacyResult, envelopeForPathPresence, envelopeForSelfAssessment } from "../claims/eligibility/adapters.js";
import {
  envelopeForAggregate, envelopeForAssuranceReport, envelopeForExecutedTest, envelopeForStoredRun, envelopeForUnverifiedResult,
  isLegacyAmcVersion
} from "../claims/eligibility/adapters/results.js";
import { formatClaimLabel, renderClaimLabel } from "../claims/eligibility/render.js";
import type { ClaimEnvelope, ClaimKind, StatusDimensions } from "../claims/eligibility/types.js";
import { sealedRunReportVerifies } from "../diagnostic/reportSeal.js";
import { loadRunReport } from "../diagnostic/runReportResolution.js";
import { latestRunForAgent } from "../governor/actionPolicyEngine.js";
import { assuranceReportClaim } from "../migration/legacy/classify.js";
import { controlSurfaceScopeMessage, detectControlSurfaceScope } from "../score/controlSurfaceScope.js";
import type { AssuranceReport, DiagnosticReport } from "../types.js";

export const CLAIM_LEGEND_FOOTER =
  "Claim kinds: synthetic example · self-reported · observed · independently reviewed (see docs/CLAIM_KINDS.md)";

let labelled = false;

/** Called before each action, so a label from an earlier action never counts for the next one. */
export function resetClaimLabelRecord(): void {
  labelled = false;
}

export function claimLabelRecorded(): boolean {
  return labelled;
}

/**
 * Text mode prints the claim line; `--json` output carries the same claim through withClaimFields instead.
 * `stderr` is for machine formats such as CSV on stdout, where an extra line would corrupt the data.
 */
export function printClaimResult(envelope: ClaimEnvelope, opts: { json?: boolean; stderr?: boolean }): void {
  if (opts.json) return;
  const line = formatClaimLabel(renderClaimLabel(envelope), "cli");
  if (opts.stderr) process.stderr.write(`${line}\n`);
  else console.log(line);
  labelled = true;
}

export interface ClaimFields {
  claimKind: ClaimKind;
  statusDimensions: StatusDimensions;
  claimLabel: string;
}

/** Additive: the result's own fields stay as they were. A JSON array takes the fields on each item instead. */
export function withClaimFields<T extends object & { length?: never }>(result: T, envelope: ClaimEnvelope): T & ClaimFields {
  labelled = true;
  return { ...result, claimKind: envelope.claimKind, statusDimensions: envelope.statusDimensions,
    claimLabel: renderClaimLabel(envelope).line };
}

/** Rendered text whose first non-empty line is its title: the claim line goes right after that line. */
export function printTitledResult(text: string, claim: ClaimEnvelope): void {
  const lines = text.split("\n");
  lines.splice(lines.findIndex((line) => line.trim().length > 0) + 1, 0, formatClaimLabel(renderClaimLabel(claim), "cli"));
  console.log(lines.join("\n"));
  labelled = true;
}

/** A JSON array result: each row carries its own claim fields; an empty list makes no claim and needs none. */
export function withClaimFieldsEach<T extends object & { length?: never }>(rows: readonly T[],
  claimFor: (row: T) => ClaimEnvelope): Array<T & ClaimFields> {
  labelled = true;
  return rows.map((row) => withClaimFields(row, claimFor(row)));
}

/**
 * Prints a rendered report; it counts as labelled only when it carries its claim label: a line starting with it
 * (text or Markdown), the Studio markup (HTML) or a `claimLabel` field (JSON).
 */
export function printLabelledReport(text: string): void {
  console.log(text);
  if (/(?:^|\n)[ \t]*(?:\*\*Claim:\*\* |Claim: )|<strong>Claim:<\/strong> |"claimLabel": "Claim: /.test(text)) labelled = true;
}

export function printClaimLegendFooter(): void {
  console.log(CLAIM_LEGEND_FOOTER);
}

/**
 * The common result head: `--json` prints the result with its claim fields and returns true (the caller returns);
 * text mode prints the title and then the claim line.
 */
export function emitClaimResult<T extends object & { length?: never }>(title: string, result: T, claim: ClaimEnvelope,
  opts: { json?: boolean }): boolean {
  if (opts.json) {
    console.log(JSON.stringify(withClaimFields(result, claim), null, 2));
    return true;
  }
  console.log(title);
  printClaimResult(claim, opts);
  return false;
}

type UnverifiedOptions = Omit<Parameters<typeof envelopeForUnverifiedResult>[0], "producer" | "recordCount" | "now">;

/** Records AMC did not observe or verify (see envelopeForUnverifiedResult): self-reported. */
export function unverifiedClaim(producer: string, recordCount: number, options: UnverifiedOptions = {}): ClaimEnvelope {
  return envelopeForUnverifiedResult({ producer, recordCount, ...options, now: Date.now() });
}

/** Questionnaire and answer-file results: self-reported, level 1 at most. */
export function selfAnswerClaim(producer: string, answers: readonly number[], regulated = false): ClaimEnvelope {
  return envelopeForSelfAssessment({ producer, answers, regulated, now: Date.now() });
}

/** The control-surface scorers: a file found is a path-presence result, nothing found is not evaluated. */
export function controlSurfaceClaim(producer: string, result: { score: number; level: number }, root = process.cwd()): ClaimEnvelope {
  const found = result.score > 0;
  return envelopeForPathPresence({ producer, found, level: result.level, evidenceRefs: found ? [root] : [], now: Date.now() });
}

/** Outside an AMC checkout a control-surface scorer is not applicable; prints that and returns true. */
export function printControlSurfaceSkip(producer: string, opts: { json?: boolean }, root = process.cwd()): boolean {
  const scope = detectControlSurfaceScope(root);
  if (scope.applicable) return false;
  const claim = unverifiedClaim(producer, 0, { applicability: { state: "not_applicable", rationale: "not an AMC source checkout" } });
  emitClaimResult(controlSurfaceScopeMessage(root, scope), { applicable: false, reason: scope.reason }, claim, opts);
  return true;
}

type ExecutedTestOptions = Omit<Parameters<typeof envelopeForExecutedTest>[0], "producer" | "measured" | "result" | "now">;

/** Tests AMC executed against the agent (see envelopeForExecutedTest); a fresh in-process result has no seal to check. */
export function executedTestClaim(producer: string, measured: number, result: "pass" | "fail" | "not_evaluated",
  options: Partial<ExecutedTestOptions> = {}): ClaimEnvelope {
  return envelopeForExecutedTest({ producer, measured, result, sealVerified: null, ...options, now: Date.now() });
}

/** A fleet, leaderboard or report total: no more than its weakest member (see envelopeForAggregate). */
export function aggregateClaim(producer: string, members: readonly ClaimEnvelope[]): ClaimEnvelope {
  return envelopeForAggregate(producer, members, Date.now());
}

/** A fleet dashboard: each agent's latest run, seal-checked; an unreadable run counts as not evaluated. */
export function fleetHealthClaim(health: { agents: readonly { agentId: string; runId: string | null }[] },
  workspace = process.cwd()): ClaimEnvelope {
  const members = health.agents.flatMap((agent) => {
    if (!agent.runId) return [];
    try {
      return [runClaimEnvelope(loadRunReport(workspace, agent.runId, agent.agentId), workspace)];
    } catch {
      return [unverifiedClaim(`diagnostic:${agent.agentId}`, 0)];
    }
  });
  return aggregateClaim("fleet:health", members);
}

/** An organisation rollup over agents: each agent's latest run, seal-checked. */
export function latestRunsClaim(producer: string, agentIds: readonly string[], workspace = process.cwd()): ClaimEnvelope {
  return aggregateClaim(producer, agentIds.flatMap((agentId) => {
    const report = latestRunForAgent(workspace, agentId);
    return report ? [runClaimEnvelope(report, workspace)] : [];
  }));
}

/**
 * A certificate, passport, bundle or attestation: the claim of the run it carries (seal-checked, legacy below AMC
 * 1.2.0), else a legacy envelope when it records an AMC version below 1.2.0, else self-reported. Verifying the
 * artifact's signature proves integrity only; it never raises the kind.
 */
export function artifactClaim(producer: string, artifact: { run?: DiagnosticReport | null; sealVerified?: boolean;
  amcVersion?: string | null; recordCount?: number } = {}): ClaimEnvelope {
  const now = Date.now();
  if (artifact.run) return envelopeForStoredRun(artifact.run, { sealVerified: artifact.sealVerified === true, now });
  if (artifact.amcVersion !== undefined && isLegacyAmcVersion(artifact.amcVersion)) {
    return envelopeForLegacyResult({ producer, version: artifact.amcVersion ?? "none", method: "runtime_observation",
      status: "NOT_EVALUATED", level: null, eventCount: artifact.recordCount ?? 1, now });
  }
  return unverifiedClaim(producer, artifact.recordCount ?? 1);
}

/**
 * An assurance run: `fresh` when this process produced it; a run read back from disk is seal-checked. A 1.x run (no
 * evidenceStatus) graded a canned reply, so it is a legacy synthetic example whatever its seal says (P1-35).
 */
export function assuranceClaim(report: AssuranceReport, fresh: boolean, workspace = process.cwd()): ClaimEnvelope {
  return assuranceReportClaim(report, () => {
    const sealVerified = fresh ? null : sealedRunReportVerifies(workspace, report as unknown as Record<string, unknown>);
    return envelopeForAssuranceReport(report, { sealVerified, now: Date.now() });
  }, Date.now());
}

/** A run named by id (certificates, badges, bundles): its seal-checked claim, or not evaluated when it cannot be read. */
export function runIdClaim(runId: string | null | undefined, agentId?: string, workspace = process.cwd()): ClaimEnvelope {
  if (!runId) return unverifiedClaim("diagnostic", 0);
  try {
    return runClaimEnvelope(loadRunReport(workspace, runId, agentId), workspace);
  } catch {
    return unverifiedClaim(`diagnostic:${runId}`, 0);
  }
}

/** A diagnostic run's envelope after checking its seal against the workspace's auditor keys. */
export function runClaimEnvelope(report: DiagnosticReport, workspace = process.cwd(), now = Date.now()): ClaimEnvelope {
  const sealVerified = sealedRunReportVerifies(workspace, report as unknown as Record<string, unknown>);
  return envelopeForStoredRun(report, { sealVerified, now });
}
