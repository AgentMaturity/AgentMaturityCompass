/**
 * Control mode refuses every call from a Claude Code or Pi release AMC has not qualified (fail-closed). This names that
 * case in plain words for `hooks status` and `amc doctor`, with observe mode, which keeps recording without deciding.
 */
import { QUALIFIED_PI_VERSIONS } from "../pi/piVersions.js";
import { QUALIFIED_CLAUDE_CODE_VERSIONS } from "./claudeCode.js";

type ReleaseProvider = "claude-code" | "pi";
const NAMES: Readonly<Record<ReleaseProvider, string>> = { "claude-code": "Claude Code", pi: "Pi" };
export const UNQUALIFIED_RELEASE_MARK = "is not a release AMC has qualified";
export const qualifiedReleases = (provider: ReleaseProvider): readonly string[] => (provider === "claude-code" ? QUALIFIED_CLAUDE_CODE_VERSIONS : QUALIFIED_PI_VERSIONS);
export const releaseName = (provider: ReleaseProvider): string => NAMES[provider];

/** The plain-words issue for a release outside the qualified list, or null when it is qualified. */
export function unqualifiedReleaseIssue(provider: ReleaseProvider, version: string): string | null {
  if (qualifiedReleases(provider).includes(version)) return null;
  return `${NAMES[provider]} ${version} ${UNQUALIFIED_RELEASE_MARK} (qualified: ${qualifiedReleases(provider).join(", ")}), so control mode denies every call it makes. `
    + `To keep recording what it does without blocking it, switch to observe mode: amc connect hooks install --provider ${provider} --mode observe`;
}
