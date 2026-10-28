/**
 * The DeepSeek Harness releases AMC has qualified for enforcement at DSH's `tools/pre-execute` (P2-17). None yet: the
 * pinned contract (docs/source-reviews/P2-17-dsh-plugin.md, DSH 0.2.1-rc.2) has no installed conformance run, so
 * control denies every DSH call. Add a version only with a passing conformance receipt for it and its manifest entry.
 */
export const QUALIFIED_DSH_VERSIONS: readonly string[] = [];

/** Why control refuses every call from this DSH, or null. */
export function dshVersionRefusal(version: string): string | null {
  return QUALIFIED_DSH_VERSIONS.includes(version) ? null : `AMC has not qualified DSH ${version}; control denies the call.`;
}
