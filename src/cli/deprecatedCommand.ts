/**
 * Runtime deprecation notices for superseded CLI commands (P5.3).
 *
 * `amc wrap` and `amc supervise` are earlier generations of what `amc adapters
 * run` now does. Both already said so — in their `--help` description. That is
 * the one place a user running them in a script or a CI step never looks, so in
 * practice the deprecation had been announced to nobody.
 *
 * WHY STDERR, NOT STDOUT. These commands wrap another process and relay its
 * output. Anything written to stdout lands in the middle of the wrapped agent's
 * own output, where a consumer parsing that stream would read a deprecation
 * notice as agent data. A warning that corrupts the thing it is attached to is
 * worse than no warning.
 *
 * WHY ONCE PER PROCESS. A wrapped run can invoke the same path repeatedly;
 * repeating the notice would train the reader to filter it out.
 *
 * These are ALIASES, not removals — ADR-2's rule for a shipped surface. The
 * command still does exactly what it did; it just says what to move to.
 */

/** Commands already warned in this process. */
const announced = new Set<string>();

export interface DeprecatedCommandNotice {
  /** The command the user typed, e.g. "amc wrap". */
  readonly used: string;
  /** What to use instead, e.g. "amc adapters run". */
  readonly prefer: string;
  /** Why the replacement is not merely a rename. */
  readonly because: string;
}

/**
 * Render the notice. Exported separately from the writing so a test can assert
 * the text without capturing streams.
 */
export function deprecatedCommandMessage(notice: DeprecatedCommandNotice): string {
  return `[amc] ${notice.used} is deprecated and will be removed in a future release. `
    + `Use ${notice.prefer} instead — ${notice.because}`;
}

/**
 * Announce a deprecated command once, on stderr.
 *
 * Returns whether it wrote, so a caller can tell "suppressed as duplicate" from
 * "never reached" — and so the once-per-process rule is testable rather than
 * asserted.
 */
export function warnDeprecatedCommand(notice: DeprecatedCommandNotice): boolean {
  if (announced.has(notice.used)) {
    return false;
  }
  announced.add(notice.used);
  process.stderr.write(`${deprecatedCommandMessage(notice)}\n`);
  return true;
}

/**
 * The superseded commands, declared here rather than at each call site.
 *
 * Keeping the text here is not only tidiness: `src/cli.ts` is under a
 * descending line ratchet, and a five-line object literal per call site would
 * have grown a 24,000-line file to announce a deprecation. One line each.
 */
const NOTICES: Record<string, DeprecatedCommandNotice> = {
  "amc wrap": {
    used: "amc wrap",
    prefer: "amc adapters run",
    because: "it mints a lease, routes through the gateway and captures OBSERVED evidence, where wrap captures less."
  },
  "amc supervise": {
    used: "amc supervise",
    prefer: "amc adapters run",
    because: "supervise injects routing env vars without a lease, so its evidence is not OBSERVED."
  }
};

/** Announce a known superseded command by name. */
export function warnSupersededCommand(used: keyof typeof NOTICES | string): boolean {
  const notice = NOTICES[used];
  if (!notice) {
    return false;
  }
  return warnDeprecatedCommand(notice);
}

/** The commands this module knows are superseded. */
export function supersededCommandNames(): string[] {
  return Object.keys(NOTICES);
}

/** Test-only: forget what has been announced. */
export function resetDeprecationNoticesForTest(): void {
  announced.clear();
}
