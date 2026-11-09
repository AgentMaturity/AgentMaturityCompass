import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { sha256Hex } from "../src/utils/hash.js";
import { lockVault } from "../src/vault/vault.js";
import { resolveLatestSession, summarizeNativeSessions } from "../src/session/latestSession.js";
import { listNativeInteractiveSessions } from "../src/setup/nativeInteractiveNavigation.js";
import { Command } from "commander";
import { registerSessionCommands } from "../src/cli-session-commands.js";

/**
 * SH-LOOP-01: "the latest session I can continue" is ONE selector, shared by `--continue`, `amc session latest`
 * and the chat picker. It applies the picker's rule (native, released, this agent) AND resume's continuation
 * controls, so a delegated child or a parent-stopped session is never chosen, and it never claims a writer.
 */
let workspace: string;
const identity = { agentId: "default", harnessVersion: "latest-test", compositionDigest: sha256Hex("composition"), policyDigest: sha256Hex("policy") };
beforeEach(() => {
  vi.stubEnv("AMC_SESSION_STORE", undefined); vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-latest-session");
  workspace = mkdtempSync(join(tmpdir(), "amc-latest-session-"));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
});
afterEach(() => { lockVault(workspace); vi.unstubAllEnvs(); rmSync(workspace, { recursive: true, force: true }); });

function session(id: string, options: { agentId?: string; runtime?: "amc" | "claude"; turns?: number; seal?: boolean } = {}) {
  const service = new SessionService(workspace, openSessionEventStore(workspace, "sqlite"));
  service.open({ sessionId: id, ...identity, ...(options.agentId === undefined ? {} : { agentId: options.agentId }), ...(options.runtime === undefined ? {} : { runtime: options.runtime }) });
  for (let turn = 0; turn < (options.turns ?? 1); turn += 1) {
    service.startTurn({ trigger: turn === 0 ? "user" : "followup" }); service.recordUserMessage(`prompt ${turn}`);
    if (options.seal === false && turn === (options.turns ?? 1) - 1) return service; // left mid-turn: interrupted
    service.endTurn({ reason: "complete" }); service.sealTurn();
  }
  return service;
}

it("picks the newest released native session for this agent and reports what it skipped", () => {
  session("older").releaseWithoutClosing();
  session("other-agent", { agentId: "reviewer" }).releaseWithoutClosing();
  session("foreign", { runtime: "claude" }).releaseWithoutClosing();
  const sealed = session("sealed"); sealed.close({ reason: "completed" }); sealed.disposeWithoutClosing();
  session("newest", { turns: 2 }).releaseWithoutClosing();
  const latest = resolveLatestSession({ workspace, agentId: "default" });
  expect(latest.ok).toBe(true);
  if (!latest.ok) throw new Error("unreachable");
  expect(latest.session).toMatchObject({ sessionId: "newest", state: "released", turns: 2, canResume: true });
  // Delegating to the same summariser as the chat picker: both see the same rows in the same order.
  expect(listNativeInteractiveSessions(workspace, "default").map(row => row.sessionId)).toEqual(summarizeNativeSessions(workspace, "default").map(row => row.sessionId));
});

it("refuses, by name, when nothing is eligible: an active writer, an interrupted turn and another agent's session", () => {
  const live = session("live");
  try {
    session("interrupted", { seal: false }).disposeWithoutClosing();
    session("reviewer-only", { agentId: "reviewer" }).releaseWithoutClosing();
    const latest = resolveLatestSession({ workspace, agentId: "default" });
    expect(latest.ok).toBe(false);
    if (latest.ok) throw new Error("unreachable");
    expect(latest.code).toBe("NO_SESSION_TO_CONTINUE");
    const reasons = Object.fromEntries(latest.skipped.map(row => [row.sessionId, row.reason]));
    expect(reasons.live).toMatch(/active/);
    expect(reasons.interrupted).toMatch(/writer state is (active|interrupted)/);
    expect(reasons["reviewer-only"]).toMatch(/agent reviewer/);
  } finally { live.releaseWithoutClosing(); }
});

it("passes over a session that resume's continuation controls would refuse (a parent stop)", () => {
  // MUTATION: drop `assertSessionContinuationControls` from continuationBlocker and "a-stopped" is selected.
  session("plain").releaseWithoutClosing();
  // Created last (newest head) and named to sort first on a timestamp tie, so the picker's rule alone would take it.
  const stopped = session("a-stopped", { turns: 0 });
  stopped.startTurn({ trigger: "user" }); stopped.recordUserMessage("x");
  stopped.recordLoopEvent({ kind: "cancel", cause: { kind: "parent" }, keepInbox: false, requestedBy: "parent", observedHeadEventId: null, phase: "running" });
  stopped.endTurn({ reason: "cancelled", cause: { kind: "parent" } }); stopped.sealTurn(); stopped.releaseWithoutClosing();
  const all = summarizeNativeSessions(workspace, "default");
  expect(all[0]).toMatchObject({ sessionId: "a-stopped", canResume: true });
  const latest = resolveLatestSession({ workspace, agentId: "default" });
  if (!latest.ok) throw new Error(latest.reason);
  expect(latest.session.sessionId).toBe("plain");
});

it("prints ledger-sourced ids with terminal controls escaped: amc session latest and the --continue refusal", async () => {
  // MUTATION: print the skipped rows raw and the OSC title sequence from the recorded agent id reaches the terminal.
  session("hostile", { agentId: "evil\u001b]0;pwned\u0007" }).releaseWithoutClosing();
  const lines: string[] = []; const original = { log: console.log, error: console.error }; const cwd = process.cwd();
  console.log = (line: string) => { lines.push(line); }; console.error = (line: string) => { lines.push(line); };
  try {
    process.chdir(workspace);
    const program = new Command().exitOverride(); registerSessionCommands(program);
    await program.parseAsync(["session", "latest", "--agent", "default"], { from: "user" });
  } finally { console.log = original.log; console.error = original.error; process.chdir(cwd); process.exitCode = 0; }
  const printed = lines.join("\n");
  expect(printed).toContain("NO_SESSION_TO_CONTINUE");
  expect(printed).toContain("\\u001b]0;pwned\\u0007");
  expect(printed).not.toContain("\u001b]0;");
  const { continuedSession, resolveContinuityRun } = await import("../src/cli/agentLoopContinuityOptions.js");
  const errors: string[] = [];
  expect(continuedSession({ log: () => undefined, error: line => errors.push(line), fail: () => undefined }, { workspace, agentId: "default" })).toBeNull();
  expect(errors.join("\n")).not.toContain("\u001b]0;");
  // The chosen session's id is ledger data too: the "continuing session" line escapes it.
  // MUTATION: print the chosen id raw and the clear-screen sequence reaches the terminal.
  session("chosen\u001b[2J", { turns: 1 }).releaseWithoutClosing();
  const logged: string[] = [];
  const run = resolveContinuityRun({ log: line => logged.push(line), error: line => logged.push(line), fail: () => undefined },
    { continue: true }, { workspace, agentId: "default", wantsDelegation: false, toolMode: "none" });
  expect(run?.session).toBe("chosen\u001b[2J");
  expect(logged.join("\n")).toContain("continuing session chosen\\u001b[2J");
  expect(logged.join("\n")).not.toContain("\u001b[2J");
});
