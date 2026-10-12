/**
 * Claude Code hook fixtures (P1-23): the payloads recorded from the pinned Claude Code release
 * (tests/fixtures/harness-hooks/claude-code/<version>/<Event>-<case>.json), a workspace with a signed Claude Code
 * control installation, and the requests AMC's forwarder sends. The recorded paths are redacted to /__PROJECT__ and
 * /__HOME__; `recorded()` puts this test's workspace and home in their place, field names unchanged.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { installHookIntegration } from "../../src/adapters/hookIntegration.js";
import { cachedFileSha256 } from "../../src/adapters/pi/piInstall.js";
import { claudeEnvelope } from "../../src/adapters/hookProviders/claudeCodePayloads.js";
import { handleHookControlRequest } from "../../src/bridge/hookControlRoute.js";
import { evaluateProviderHookControl } from "../../src/bridge/hookControl.js";
import { controlledWorkspace } from "./piHookFixtures.js";

export const CLAUDE_CODE_VERSION = "2.1.296";
export const FIXTURE_DIR = resolve("tests", "fixtures", "harness-hooks", "claude-code", CLAUDE_CODE_VERSION);
export const agentId = "claude-controlled";
export const lease = { leaseId: "lease_claude_fixture", expiresTs: Date.now() + 3_600_000 };

export function fixtureNames(): string[] {
  return readdirSync(FIXTURE_DIR).filter((name) => name.endsWith(".json")).sort();
}

/** A recorded payload with this workspace and home in place of the redacted paths. */
export function recorded(name: string, workspace: string, home = join(workspace, ".fixture-home")): Record<string, unknown> {
  const text = readFileSync(join(FIXTURE_DIR, `${name}.json`), "utf8");
  return JSON.parse(text.split("/__PROJECT__").join(realpathSync.native(workspace)).split("/__HOME__").join(home)) as Record<string, unknown>;
}

/**
 * The Claude Code install a test installation binds: this process's own Node binary, so the registration's check of
 * the session process's executable (CLAUDE_PID = this process) can pass. Its version is the pinned one.
 */
export function boundClaudeCode(version = CLAUDE_CODE_VERSION) {
  const binaryPath = realpathSync(process.execPath);
  return { binaryPath, version, sha256: cachedFileSha256(binaryPath)! };
}

/** A workspace with signed policies and a signed Claude Code control installation, with no managed settings. */
export function claudeWorkspace(options: { version?: string; register?: boolean; bridgeBase?: string } = {}): string {
  const workspace = controlledWorkspace(agentId);
  installHookIntegration({ workspace, provider: "claude-code", agentId, mode: "control", claudeCodeInstall: boundClaudeCode(options.version),
    ...(options.bridgeBase ? { bridgeBase: options.bridgeBase } : {}) });
  if (options.register !== false) register(workspace, String(recorded("SessionStart-startup", workspace).session_id));
  return workspace;
}

/** What AMC's forwarder sends for a SessionStart: the session id, Claude Code's pid and its configuration directory. */
export function register(workspace: string, sessionId: string, configDir = join(workspace, ".fixture-home", ".claude"), pid = process.pid) {
  mkdirSync(configDir, { recursive: true });
  return handleHookControlRequest({ workspace, authenticatedAgentId: agentId, provider: "claude-code", lease,
    rawInput: JSON.stringify({ hook_event_name: "SessionStart", session_id: sessionId, amc: { claudePid: pid, configDir } }) });
}

/** The PreToolUse request AMC's forwarder sends: Claude Code's payload bytes in AMC's envelope with a fresh nonce. */
export function controlRequest(payload: Record<string, unknown> | Buffer, nonce: string = randomUUID()): string {
  return claudeEnvelope(Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload), "utf8"), nonce);
}

export function decide(workspace: string, rawInput: string) {
  return evaluateProviderHookControl({ workspace, authenticatedAgentId: agentId, provider: "claude-code", rawInput, lease });
}
