import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { registerSessionCommands } from "../src/cli-session-commands.js";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyAgentRun, type AgentRunSummary } from "../src/agent/runReport.js";
import { readTurnEndMeta } from "../src/session/turnLifecycleMeta.js";
import { runComposedTurn } from "../src/kernel/agentLoopRunner.js";
import { STUB_PROVIDER_ID, STUB_PROVIDER_MODEL, stubProviderRoute, stubProviderTransport } from "../src/agent/stubProvider.js";

/**
 * SH-LOOP-01 and SH-LOOP-06 through the real CLI: `--continue` resumes the newest released session, refuses by
 * name when none qualifies or the flags changed, `amc session latest` agrees with it, and `--stop` bounds a run.
 */
const originalCwd = process.cwd();
let workspace: string; let home: string;
beforeEach(() => {
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-cli-continue-")));
  home = realpathSync(mkdtempSync(join(tmpdir(), "amc-cli-continue-home-")));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  process.chdir(workspace);
});
afterEach(() => { process.chdir(originalCwd); rmSync(workspace, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true }); });

async function run(args: string[]): Promise<{ summary: (AgentRunSummary & { runLimit?: unknown }) | null; errors: string[]; failed: boolean }> {
  const output: string[] = []; const errors: string[] = []; let failed = false;
  const program = new Command().exitOverride();
  registerAgentCommands(program, { log: line => output.push(line), error: line => errors.push(line), fail: () => { failed = true; } });
  await program.parseAsync(["agent-loop", "run", ...args, "--provider", "stub", "--credentials-home", home, "--json"], { from: "user" });
  // A run that reported and then failed (a run limit) still printed its summary; a refusal before any session printed none.
  const last = output.at(-1);
  return { summary: last === undefined ? null : JSON.parse(last) as AgentRunSummary & { runLimit?: unknown }, errors, failed };
}
function events(sessionId: string) {
  const ledger = openLedger(workspace, { readonly: true });
  try { return ledger.getAllEvents().filter(row => row.session_id === sessionId); } finally { ledger.close(); }
}
async function latestJson(): Promise<Record<string, unknown>> {
  const lines: string[] = []; const original = console.log;
  console.log = (line: string) => { lines.push(line); };
  try { const program = new Command().exitOverride(); registerSessionCommands(program); await program.parseAsync(["session", "latest", "--json"], { from: "user" }); }
  finally { console.log = original; process.exitCode = 0; }
  return JSON.parse(lines.join("\n")) as Record<string, unknown>;
}

describe("amc agent-loop run --continue", () => {
  it("refuses with NO_SESSION_TO_CONTINUE when nothing is eligible, and never starts a new session", async () => {
    const result = await run(["hello", "--continue"]);
    expect(result.failed).toBe(true);
    expect(result.errors.join("\n")).toContain("NO_SESSION_TO_CONTINUE");
    const ledger = openLedger(workspace, { readonly: true });
    try { expect(ledger.getAllEvents().filter(row => row.event_type === "session/open")).toHaveLength(0); } finally { ledger.close(); }
  });

  it("continues the newest released session as its next turn, and session latest names the same id", async () => {
    const first = await run(["first", "--keep-open"]);
    expect(first.failed, first.errors.join("\n")).toBe(false);
    const sealed = await run(["sealed run"]); // newer, but sealed: not a candidate
    expect(sealed.failed).toBe(false);
    const latest = await latestJson();
    expect(latest).toMatchObject({ ok: true, session: { sessionId: first.summary!.sessionId } });
    const second = await run(["second", "--continue", "--keep-open"]);
    expect(second.failed, second.errors.join("\n")).toBe(false);
    expect(second.summary!.sessionId).toBe(first.summary!.sessionId);
    expect(second.errors.join("\n")).toContain(`continuing session ${first.summary!.sessionId}`);
    expect(events(first.summary!.sessionId).filter(row => row.event_type === "turn/start")).toHaveLength(2);
    expect((await verifyAgentRun(workspace, first.summary!.sessionId)).integrityOk).toBe(true);
  });

  it("names the session and the mismatch when the continued run's flags differ from the original", async () => {
    const first = await run(["first", "--keep-open", "--max-steps", "3"]);
    expect(first.failed).toBe(false);
    const changed = await run(["second", "--continue", "--max-steps", "4"]);
    expect(changed.failed).toBe(true);
    expect(changed.errors.join("\n")).toContain(`CONTINUE_CONFIGURATION_MISMATCH: session ${first.summary!.sessionId}`);
  });

  it("is exclusive with --session and --fork-from", async () => {
    const result = await run(["x", "--continue", "--session", "some-id"]);
    expect(result.failed).toBe(true);
    expect(result.errors.join("\n")).toContain("--continue chooses the session itself");
  });
});

describe("amc agent-loop run --stop", () => {
  it("max-turns:1 refuses the queued second turn through the composed runner: a signed limit cause, no second turn/start", async () => {
    // A queued follow-up deterministically owes a second turn; the pre-startTurn check refuses it.
    const outcome = await runComposedTurn({
      workspace, agentId: "default", systemPrompt: "You are an AMC-governed agent.", prompt: "first", runLimits: { maxTurns: 1 },
      route: { providerId: STUB_PROVIDER_ID, model: STUB_PROVIDER_MODEL, params: { max_tokens: 256, stream: true } },
      routes: [stubProviderRoute()], transport: stubProviderTransport(), credentials: { homeDir: home, env: {}, watch: false, projectDir: null },
      onReady: handle => { handle.queue("second"); }
    });
    expect(outcome.status).toBe("idle");
    // MUTATION: drop runLimit from the composed outcome and the host cannot tell this run from a completed one.
    expect(outcome.runLimit).toMatchObject({ kind: "limit", condition: "max-turns", bound: 1 });
    const rows = events(outcome.sessionId);
    expect(rows.filter(row => row.event_type === "turn/start")).toHaveLength(1);
    const cancel = rows.find(row => row.event_type === "loop/cancel");
    expect(cancel && JSON.parse(cancel.meta_json)).toMatchObject({ requestedBy: "run-limit", cause: { kind: "limit", condition: "max-turns", bound: 1 } });
    expect(readTurnEndMeta(rows.find(row => row.event_type === "turn/end")!.meta_json)?.reason).toBe("complete");
    const flagged = await run(["bounded", "--stop", "max-turns:1", "--tools", "none"]);
    expect(flagged.failed, flagged.errors.join("\n")).toBe(false);
    expect(flagged.errors.join("\n")).toContain("run limits: max-turns:1");
  });

  it("timeout-ms ends a slow turn with cause deadline and exits 1, and a malformed condition is refused before any session row", async () => {
    const bad = await run(["x", "--stop", "max-turns:zero"]);
    expect(bad.failed).toBe(true);
    expect(bad.errors.join("\n")).toContain("--stop:");
    // MUTATION: drop the CLI refusal and --stop is silently ignored by a goal-rounds run, which starts no root driver.
    const rounds = await run(["goal", "--stop", "timeout-ms:1000", "--goal-rounds", "2", "--delegate", "--tools", "workspace"]);
    expect(rounds.failed).toBe(true);
    expect(rounds.errors.join("\n")).toContain("--stop bounds the root driver");
    // The old assertion (exit 0) encoded the defect: a run a limit cut short reported success.
    const result = await run(["slow", "--stop", "timeout-ms:100", "--think-ms", "1500", "--tools", "none"]);
    expect(result.failed).toBe(true);
    expect(result.summary?.runLimit).toMatchObject({ kind: "limit", condition: "deadline", bound: 100 });
    expect(result.errors.join("\n")).toContain("Run limit reached: timeout-ms:100");
    const ending = readTurnEndMeta(events(result.summary!.sessionId).find(row => row.event_type === "turn/end")!.meta_json);
    expect(ending).toMatchObject({ reason: "cancelled", cancelCause: { kind: "limit", condition: "deadline", bound: 100 } });
    expect((await verifyAgentRun(workspace, result.summary!.sessionId)).integrityOk).toBe(true);
  });

  it("a resumed session already at its turn bound is refused before its prompt runs: runLimit in the JSON, exit 1", async () => {
    // MUTATION: drop the runLimit failure in reportRun and this run exits 0 with turn: null and no reason.
    const first = await run(["first", "--keep-open"]);
    expect(first.failed, first.errors.join("\n")).toBe(false);
    const bounded = await run(["second", "--session", first.summary!.sessionId, "--stop", "max-turns:1", "--keep-open"]);
    expect(bounded.failed).toBe(true);
    expect(bounded.summary?.runLimit).toMatchObject({ kind: "limit", condition: "max-turns", bound: 1 });
    expect(bounded.errors.join("\n")).toContain("Run limit reached: max-turns:1");
    const rows = events(first.summary!.sessionId);
    expect(rows.filter(row => row.event_type === "turn/start")).toHaveLength(1);
    expect(rows.filter(row => row.event_type === "loop/cancel").map(row => JSON.parse(row.meta_json) as Record<string, unknown>))
      .toEqual([expect.objectContaining({ requestedBy: "run-limit", cause: { kind: "limit", condition: "max-turns", bound: 1 } })]);
    expect((await verifyAgentRun(workspace, first.summary!.sessionId)).integrityOk).toBe(true);
  });
});
