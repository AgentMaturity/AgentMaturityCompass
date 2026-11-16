/**
 * Control mode after an agent updates itself: the Claude Code now on PATH, and doctor rows for each control
 * installation (releaseQualification.ts words them). Reads only; control stays fail-closed.
 */
import { findClaudeCode, measureClaudeCode } from "../adapters/hookProviders/claudeCode.js";
import { qualifiedReleases, releaseName, UNQUALIFIED_RELEASE_MARK, unqualifiedReleaseIssue } from "../adapters/hookProviders/releaseQualification.js";
import { getHookIntegrationStatus } from "../adapters/hookIntegration.js";

/** The Claude Code on PATH now, when it is not a qualified release (the case a self-update leaves behind), or null. */
export function claudeCodeOnPathIssue(searchPath = process.env.PATH ?? ""): string | null {
  const binary = findClaudeCode(searchPath);
  const install = binary ? measureClaudeCode(binary) : null;
  return install ? unqualifiedReleaseIssue("claude-code", install.version) : null;
}

/** Doctor rows: one per control installation of Claude Code or pi, WARN when its release is not qualified. Reads only. */
export function hookReleaseDoctorChecks(workspace: string): Array<{ id: string; status: "PASS" | "WARN"; message: string; fixHint?: string }> {
  const rows: Array<{ id: string; status: "PASS" | "WARN"; message: string; fixHint?: string }> = [];
  for (const provider of ["claude-code", "pi"] as const) {
    let status: ReturnType<typeof getHookIntegrationStatus>;
    try { status = getHookIntegrationStatus({ workspace, provider, readonly: true }); } catch { continue; }
    if (status.mode !== "control") continue;
    const onPath = provider === "claude-code" ? claudeCodeOnPathIssue() : null;
    const issue = onPath ?? status.issues.find((item) => item.includes(UNQUALIFIED_RELEASE_MARK)) ?? null;
    rows.push(issue
      ? { id: `hook-release-${provider}`, status: "WARN", message: issue, fixHint: `Run: amc connect hooks install --provider ${provider} --mode observe` }
      : { id: `hook-release-${provider}`, status: "PASS", message: `${releaseName(provider)} control hooks: the bound release is one AMC has qualified (${qualifiedReleases(provider).join(", ")})` });
  }
  return rows;
}
