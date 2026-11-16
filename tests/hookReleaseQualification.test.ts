/**
 * Watch: control mode after an agent updates itself. A Claude Code or Pi release AMC has not qualified is still denied
 * every call (fail-closed); `hooks status` and `amc doctor` now say so and name observe mode.
 */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { getHookIntegrationStatus, installHookIntegration } from "../src/adapters/hookIntegration.js";
import { QUALIFIED_CLAUDE_CODE_VERSIONS } from "../src/adapters/hookProviders/claudeCode.js";
import { unqualifiedReleaseIssue } from "../src/adapters/hookProviders/releaseQualification.js";
import { piVersionRefusal } from "../src/adapters/pi/piVersions.js";
import { claudeCodeOnPathIssue, hookReleaseDoctorChecks } from "../src/watch/hookReleaseCheck.js";
import { boundClaudeCode, claudeWorkspace } from "./helpers/claudeCodeHookFixtures.js";
import { controlledWorkspace, fakePiPackage, removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

const dirs: string[] = [];
afterEach(() => {
  removeFixtureWorkspaces();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A folder holding a `claude` that reports `version`, as the PATH a self-updated Claude Code leaves. */
function fakeClaudeOnPath(version: string): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-fake-claude-"));
  dirs.push(dir);
  writeFileSync(join(dir, "claude"), `#!/bin/sh\necho "${version} (Claude Code)"\n`);
  chmodSync(join(dir, "claude"), 0o755);
  return dir;
}

describe("release qualification after an update", () => {
  test("Claude Code 2.1.325 and Pi 1.5.2 are qualified; anything else is named with observe mode, and Pi control still refuses it", () => {
    expect(QUALIFIED_CLAUDE_CODE_VERSIONS).toContain("2.1.325");
    expect(unqualifiedReleaseIssue("claude-code", "2.1.325")).toBeNull();
    expect(unqualifiedReleaseIssue("pi", "1.5.2")).toBeNull();
    expect(unqualifiedReleaseIssue("claude-code", "2.1.400")).toMatch(/Claude Code 2\.1\.400 is not a release AMC has qualified.*--provider claude-code --mode observe/);
    expect(piVersionRefusal("1.6.0")).toMatch(/not qualified Pi 1\.6\.0/);
  });

  test("the Claude Code on PATH is checked by the version it reports", () => {
    expect(claudeCodeOnPathIssue(fakeClaudeOnPath("9.9.9"))).toMatch(/Claude Code 9\.9\.9 is not a release/);
    expect(claudeCodeOnPathIssue(fakeClaudeOnPath("2.1.325"))).toBeNull();
    expect(claudeCodeOnPathIssue(join(tmpdir(), "amc-no-such-dir"))).toBeNull();
  });

  test("hooks status and doctor warn about an unqualified bound release and offer observe mode", () => {
    const claude = claudeWorkspace({ version: "2.1.999", register: false });
    expect(getHookIntegrationStatus({ workspace: claude, provider: "claude-code" }).issues.join("\n")).toMatch(/Claude Code 2\.1\.999 is not a release AMC has qualified/);
    const savedPath = process.env.PATH;
    process.env.PATH = fakeClaudeOnPath("2.1.325");
    try {
      expect(hookReleaseDoctorChecks(claude)).toEqual([expect.objectContaining({ id: "hook-release-claude-code", status: "WARN",
        fixHint: "Run: amc connect hooks install --provider claude-code --mode observe" })]);
    } finally {
      process.env.PATH = savedPath;
    }

    const pi = controlledWorkspace("pi-release-agent");
    mkdirSync(join(pi, ".pi"), { recursive: true });
    installHookIntegration({ workspace: pi, provider: "pi", agentId: "pi-release-agent", mode: "control", piPackageDir: fakePiPackage("1.6.0") });
    expect(hookReleaseDoctorChecks(pi)).toEqual([expect.objectContaining({ id: "hook-release-pi", status: "WARN" })]);
    const qualifiedPi = controlledWorkspace("pi-release-agent");
    installHookIntegration({ workspace: qualifiedPi, provider: "pi", agentId: "pi-release-agent", mode: "control", piPackageDir: fakePiPackage("1.5.2") });
    expect(hookReleaseDoctorChecks(qualifiedPi)).toEqual([expect.objectContaining({ id: "hook-release-pi", status: "PASS" })]);
    expect(boundClaudeCode().version).toBe("2.1.296");
  });
});
