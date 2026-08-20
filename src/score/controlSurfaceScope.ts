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
