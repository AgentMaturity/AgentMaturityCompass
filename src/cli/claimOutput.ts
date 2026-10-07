/**
 * Claim labels on CLI results (P0-22). A registered result command (src/cli/resultCommandRegistry.ts) prints
 * the canonical claim line right after its result title, or adds the claim fields to its `--json` output; the
 * postAction hook in src/cli/claimLabelHooks.ts checks that it did. See docs/CLAIM_KINDS.md, "CLI and reports".
 */
import { envelopeForPathPresence, envelopeForSelfAssessment } from "../claims/eligibility/adapters.js";
import { envelopeForAggregate, envelopeForStoredRun, envelopeForUnverifiedResult } from "../claims/eligibility/adapters/results.js";
import { formatClaimLabel, renderClaimLabel } from "../claims/eligibility/render.js";
import type { ClaimEnvelope, ClaimKind, StatusDimensions } from "../claims/eligibility/types.js";
import { sealedRunReportVerifies } from "../diagnostic/reportSeal.js";
import { controlSurfaceScopeMessage, detectControlSurfaceScope } from "../score/controlSurfaceScope.js";
import type { DiagnosticReport } from "../types.js";

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

/** Prints a rendered report; it counts as labelled only when a line of the report starts with its claim label. */
export function printLabelledReport(text: string): void {
  console.log(text);
  if (/(?:^|\n)[ \t]*(?:\*\*Claim:\*\* |Claim: )|<strong>Claim:<\/strong> /.test(text)) labelled = true;
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

/** A fleet, leaderboard or report total: no more than its weakest member (see envelopeForAggregate). */
export function aggregateClaim(producer: string, members: readonly ClaimEnvelope[]): ClaimEnvelope {
  return envelopeForAggregate(producer, members, Date.now());
}

/** A diagnostic run's envelope after checking its seal against the workspace's auditor keys. */
export function runClaimEnvelope(report: DiagnosticReport, workspace = process.cwd(), now = Date.now()): ClaimEnvelope {
  const sealVerified = sealedRunReportVerifies(workspace, report as unknown as Record<string, unknown>);
  return envelopeForStoredRun(report, { sealVerified, now });
}
