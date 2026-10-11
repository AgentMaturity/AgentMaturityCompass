/**
 * The Pi releases AMC has qualified for enforcement at Pi's tool_call hook (P1-22): the `pi` CLI of
 * @earendil-works/pi-coding-agent at these versions, run through tests/conformance/piToolCall.conformance.test.ts.
 * Package integrity and per-case results: qualification/2026-10-12-P1-22/pi-conformance.json. Add a version only with a
 * passing conformance receipt for it.
 */
export const QUALIFIED_PI_VERSIONS: readonly string[] = ["1.0.2", "1.0.4"];

/** What AMC's Pi extension sends when it cannot read Pi's version. */
export const UNKNOWN_PI_VERSION = "unknown";

/** A qualified version can carry the "enforced at Pi's tool_call hook" claim; no other can. */
export function isQualifiedPiVersion(version: string): boolean {
  return QUALIFIED_PI_VERSIONS.includes(version);
}

/** Why control refuses every call from this Pi, or null. An unreadable version is outside the qualified set too. */
export function piVersionRefusal(version: string): string | null {
  if (isQualifiedPiVersion(version)) return null;
  return version === UNKNOWN_PI_VERSION
    ? "AMC could not read Pi's version, so it cannot be a qualified one; control denies the call."
    : `AMC has not qualified Pi ${version}`;
}
