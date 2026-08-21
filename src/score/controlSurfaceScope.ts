/**
 * Scope guard for control-surface scorers.
 *
 * A family of `score*` modules grades a directory by checking whether specific
 * AMC source files exist (`src/score/evidenceCoverageGap.ts`,
 * `src/diagnostic/questionBank.ts`, ...). Because the CLI passes
 * `process.cwd()`, pointing them at a customer's project measured whether that
 * project *is AMC's own source tree* — every external agent scored ~0, and AMC
 * scored itself high.
 *
 * These scorers are only meaningful against an AMC source checkout, where they
 * report which AMC controls are present. This guard makes that scope explicit
 * so the CLI and API refuse to emit a number for a directory the scorer cannot
 * actually assess, instead of returning a misleadingly low one.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

export interface ControlSurfaceScope {
  /** True when `root` looks like an AMC source checkout. */
  applicable: boolean;
  /** Human-readable explanation, suitable for CLI output. */
  reason: string;
}

/** Markers that identify an AMC source checkout rather than an arbitrary project. */
const AMC_SOURCE_MARKERS = [
  "src/score",
  "src/diagnostic",
  "src/ledger"
] as const;

/**
 * Determines whether control-surface scoring can say anything about `root`.
 *
 * Requires the AMC source markers *and* an `amc`-named package, so an unrelated
 * project that happens to use a `src/score` directory is not mistaken for one.
 */
export function detectControlSurfaceScope(root: string): ControlSurfaceScope {
  const missing = AMC_SOURCE_MARKERS.filter((marker) => !existsSync(join(root, marker)));

  if (missing.length === 0) {
    return {
      applicable: true,
      reason: "AMC source checkout detected; reporting AMC control coverage."
    };
  }

  return {
    applicable: false,
    reason:
      `This scorer grades AMC's own control surface by looking for AMC source files ` +
      `(missing here: ${missing.join(", ")}). It cannot assess an arbitrary project or a ` +
      `deployed agent, and a low score here would say nothing about your agent. ` +
      `To assess a real agent, use evidence-based scoring: 'amc run' (or 'amc score').`
  };
}

/** Formats the guard result for CLI output. */
export function controlSurfaceScopeMessage(root: string, scope: ControlSurfaceScope): string {
  return `Not applicable to ${root}\n${scope.reason}`;
}

/**
 * CLI guard shared by every `amc score` subcommand backed by a control-surface
 * scorer.
 *
 * Returns true when the command should stop: the message has already been
 * printed in whichever format the caller asked for. Four subcommands had
 * hand-copied this same block, so a fix to the wording or the JSON shape had to
 * be applied four times to avoid drift.
 */
export function reportControlSurfaceScopeSkip(
  root: string,
  opts: { json?: boolean },
  write: (line: string) => void
): boolean {
  const scope = detectControlSurfaceScope(root);
  if (scope.applicable) return false;
  write(
    opts.json
      ? JSON.stringify({ applicable: false, reason: scope.reason }, null, 2)
      : controlSurfaceScopeMessage(root, scope)
  );
  return true;
}

/**
 * Existence check for a single piece of candidate evidence.
 *
 * Scorers test lists that mix three kinds of path:
 *
 *   ".amc/tool_allowlist.json"   the assessed workspace — real evidence
 *   "ACTION_POLICY.md"           the assessed repo's own docs — real evidence
 *   "src/enforce/allowlist.ts"   AMC's own source tree — evidence only that
 *                                the directory being scanned is AMC itself
 *
 * The third kind inflated AMC's self-score and deducted from every other
 * project for the crime of not being AMC. Outside an AMC checkout those
 * candidates no longer count; the first two still do, so genuine evidence is
 * unaffected. Inside an AMC checkout behaviour is identical to existsSync.
 */
export function evidencePathExists(root: string, relPath: string): boolean {
  if (relPath.startsWith("src/") && !detectControlSurfaceScope(root).applicable) {
    return false;
  }
  return existsSync(join(root, relPath));
}

/**
 * Whether a criterion can be judged at all against `root`.
 *
 * A criterion whose every candidate path lives under `src/` can only ever be
 * met by AMC's own source tree. Against a real agent it is not "failed" — it is
 * unmeasurable, and counting it as a miss silently caps the achievable score.
 * ISO 42001 was pinned at 5 of 8 controls for every external agent this way.
 *
 * Callers exclude unassessable criteria from the denominator and report them
 * separately, so a score always states what it was computed over.
 */
export function criterionAssessable(root: string, paths: readonly string[]): boolean {
  return paths.some((p) => !p.startsWith("src/")) || detectControlSurfaceScope(root).applicable;
}

/** Result of judging one criterion, including whether it could be judged. */
export interface CriterionOutcome {
  met: boolean;
  assessable: boolean;
}

/** Judges one criterion's candidate paths against `root`. */
export function assessCriterion(root: string, paths: readonly string[]): CriterionOutcome {
  return {
    met: paths.some((p) => evidencePathExists(root, p)),
    assessable: criterionAssessable(root, paths)
  };
}

/**
 * Scores a set of criteria over only those that could be assessed.
 *
 * Returns 0 with `assessed: 0` when nothing was measurable, so a caller can
 * distinguish "no controls" from "nothing we could check here".
 */
export function scoreAssessableCriteria(
  outcomes: readonly CriterionOutcome[]
): { score: number; assessed: number; total: number; notAssessable: number } {
  const assessable = outcomes.filter((o) => o.assessable);
  const passed = assessable.filter((o) => o.met).length;
  return {
    score: assessable.length === 0 ? 0 : Math.round((passed / assessable.length) * 100),
    assessed: assessable.length,
    total: outcomes.length,
    notAssessable: outcomes.length - assessable.length
  };
}

/**
 * Explains criteria that were skipped rather than failed.
 *
 * Excluding unassessable criteria from the denominator stops them depressing
 * the score, but it must not make them disappear: a report showing 1 gap out
 * of 7 criteria, silently having judged only 1, tells the operator nothing
 * about the other 6. This note is the visible half of that trade.
 */
export function notAssessableNote(notAssessable: number, total: number): string | null {
  if (notAssessable <= 0) return null;
  return (
    `${notAssessable} of ${total} criteria could not be assessed from this workspace — ` +
    `their evidence is AMC's own source modules, which no external agent can provide. ` +
    `They are excluded from the score rather than counted as failures.`
  );
}
