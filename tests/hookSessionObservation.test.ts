/**
 * Watch: whole-session observation for Claude Code and Codex. Session hooks are recorded leniently (an unreadable or
 * unknown payload is still recorded), as the provider's own word, digests only, under the lease's agent; the Claude
 * Code observe hook always answers `{}` with exit 0, so it never blocks the agent. Control mode is unchanged.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runHookForward } from "../src/adapters/hookForwarder.js";
import { getHookIntegrationStatus, installHookIntegration, removeHookIntegration } from "../src/adapters/hookIntegration.js";
import { CLAUDE_OBSERVE_SESSION_HOOKS, claudeSessionSha256 } from "../src/adapters/hookProviders/claudeCode.js";
import { openLedger } from "../src/ledger/ledger.js";
import { signFileWithAuditor } from "../src/org/orgSigner.js";
import { sha256Hex } from "../src/utils/hash.js";
import { readSessionEvent, recordSessionEvent } from "../src/bridge/sessionObservations.js";
import { controlledWorkspace, removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

afterEach(() => removeFixtureWorkspaces());
const agentId = "session-watch-agent";
const PROMPT = "summarise the confidential merger memo";
const TOOL_HOOKS = ["PostToolUse", "PostToolUseFailure", "PreToolUse"];

/** An observe install in the shape AMC wrote before it observed sessions: the three tool hooks only, config and signed manifest. */
function earlierObserveInstall(workspace: string): string {
  installHookIntegration({ workspace, provider: "claude-code", agentId, mode: "observe" });
  const settingsPath = join(workspace, ".claude", "settings.local.json");
  const manifestPath = join(workspace, ".amc", "hooks", "claude-code.json");
  const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as { hooks: Record<string, unknown> };
  settings.hooks = Object.fromEntries(Object.entries(settings.hooks).filter(([event]) => TOOL_HOOKS.includes(event)));
  const configText = `${JSON.stringify(settings, null, 2)}\n`;
  writeFileSync(settingsPath, configText);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { handlers: Array<{ eventName: string }>; configSha256: string };
  manifest.handlers = manifest.handlers.filter((row) => TOOL_HOOKS.includes(row.eventName));
  manifest.configSha256 = sha256Hex(Buffer.from(configText, "utf8"));
  writeFileSync(manifestPath, JSON.stringify(manifest));
  signFileWithAuditor(workspace, manifestPath);
  return settingsPath;
}

describe("reading a session hook", () => {
  test("keeps tokens, digests text and ids it does not need, and never fails", () => {
    const read = readSessionEvent("claude-code", JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: "s-1", prompt_id: "p-1", prompt: PROMPT,
      permission_mode: "default", agent_type: "a".repeat(64), new_field_from_a_later_release: 1 }));
    expect(read).toMatchObject({ event: "UserPromptSubmit", sessionSha256: claudeSessionSha256("s-1"), unknownFields: 1,
      reported: { prompt_id: "p-1", permission_mode: "default", prompt: { length: PROMPT.length } } });
    expect(JSON.stringify(read)).not.toContain(PROMPT);
    expect((read.reported as Record<string, unknown>).agent_type).toMatchObject({ length: 64 });
    expect(readSessionEvent("claude-code", "not json \u001b[31m")).toMatchObject({ event: "unreadable" });
    expect(readSessionEvent("claude-code", "[1,2]")).toMatchObject({ event: "unreadable" });
    expect(readSessionEvent("codex", JSON.stringify({ hook_event_name: "‮Evil", session_id: "c" }))).toMatchObject({ event: "unknown", eventName: { length: 7 } }); // bytes, digested: the bidi mark never reaches a row
    expect(readSessionEvent("codex", JSON.stringify({ hook_event_name: "Interrupt", session_id: "c", turn_id: "t-9" }))).toMatchObject({ event: "Interrupt", reported: { turn_id: "t-9" } });
  });
});

describe("recording and hooks", () => {
  test("rows are self-reported, the lease's agent, signed, and carry no prompt text", () => {
    const workspace = controlledWorkspace(agentId);
    recordSessionEvent({ workspace, agentId, provider: "claude-code", leaseId: "lease_x",
      rawInput: JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: "s-1", prompt: PROMPT, agentId: "someone-else", trustTier: "OBSERVED" }) });
    recordSessionEvent({ workspace, agentId, provider: "codex", leaseId: "lease_x", rawInput: "{oops" });
    const ledger = openLedger(workspace);
    try {
      const rows = ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE json_extract(meta_json, '$.auditType') = 'HOOK_SESSION_EVENT' ORDER BY rowid").all() as Array<{ meta_json: string }>;
      expect(rows).toHaveLength(2);
      const metas = rows.map((row) => JSON.parse(row.meta_json) as Record<string, unknown>);
      expect(metas[0]).toMatchObject({ trustTier: "SELF_REPORTED", contentTier: "SELF_REPORTED", agentId, provider: "claude-code", event: "UserPromptSubmit" });
      expect(metas[1]).toMatchObject({ provider: "codex", event: "unreadable" });
      expect(rows.map((row) => row.meta_json).join("")).not.toContain(PROMPT);
    } finally {
      ledger.close();
    }
  });

  test("a Claude Code observe install adds every session hook and removing it takes them all out", () => {
    const workspace = controlledWorkspace(agentId);
    installHookIntegration({ workspace, provider: "claude-code", agentId, mode: "observe" });
    const settings = JSON.parse(readFileSync(join(workspace, ".claude", "settings.local.json"), "utf8")) as { hooks?: Record<string, unknown> };
    expect(Object.keys(settings.hooks ?? {}).sort()).toEqual([...CLAUDE_OBSERVE_SESSION_HOOKS, "PostToolUse", "PostToolUseFailure", "PreToolUse"].sort());
    expect(getHookIntegrationStatus({ workspace, provider: "claude-code" }).state).toBe("installed");
    removeHookIntegration({ workspace, provider: "claude-code" });
    // The file AMC created is gone again: no session handler is left behind.
    expect(existsSync(join(workspace, ".claude", "settings.local.json"))).toBe(false);
  });

  test("an observe install made before session hooks still reads installed, says how to add them, and reinstall and remove work", () => {
    const workspace = controlledWorkspace(agentId);
    const settingsPath = earlierObserveInstall(workspace);

    const status = getHookIntegrationStatus({ workspace, provider: "claude-code" });
    expect(status.state).toBe("installed");
    expect(status.issues.join("\n")).toContain("amc connect hooks install --provider claude-code --mode observe");
    installHookIntegration({ workspace, provider: "claude-code", agentId, mode: "observe" });
    const upgraded = getHookIntegrationStatus({ workspace, provider: "claude-code" });
    expect(upgraded).toMatchObject({ state: "installed", issues: [] });
    expect(Object.keys((JSON.parse(readFileSync(settingsPath, "utf8")) as { hooks: object }).hooks)).toHaveLength(TOOL_HOOKS.length + CLAUDE_OBSERVE_SESSION_HOOKS.length);
    removeHookIntegration({ workspace, provider: "claude-code" });
    expect(existsSync(settingsPath)).toBe(false);
  });

  test("an earlier-shape observe install can be removed directly", () => {
    const workspace = controlledWorkspace(agentId);
    const settingsPath = earlierObserveInstall(workspace);
    removeHookIntegration({ workspace, provider: "claude-code" });
    expect(existsSync(settingsPath)).toBe(false);
  });

  test("the observe session hook answers {} with exit 0 within its deadline even when AMC is not there or the payload is junk", async () => {
    const workspace = controlledWorkspace(agentId);
    installHookIntegration({ workspace, provider: "claude-code", agentId, mode: "observe", bridgeBase: "http://127.0.0.1:3709" });
    const opts = { provider: "claude-code" as const, mode: "observe" as const, agent: agentId, tokenFile: ".amc/hooks/claude-code.lease", bridgeUrl: "http://127.0.0.1:3709" };
    for (const [event, input] of [["UserPromptSubmit", JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: "s", prompt: PROMPT })], ["Stop", "\u0000junk"]] as const) {
      const started = Date.now();
      const outcome = await runHookForward({ ...opts, event }, async () => input, workspace, 4_000);
      expect(outcome).toMatchObject({ stdout: "{}\n", exitCode: 0 });
      expect(Date.now() - started).toBeLessThan(4_500);
    }
  });
});
