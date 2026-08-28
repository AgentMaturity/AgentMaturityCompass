import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { SessionService } from "../src/session/sessionService.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { credentialRef } from "../src/credentials/credentialRef.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { spawnSubagent } from "../src/agent/subagentSpawn.js";
import { createDriverRunner } from "../src/agent/subagentRunner.js";
import {
  FixedCredentials,
  LOOP_MODEL,
  LOOP_PROVIDER,
  scriptedAdapter,
  silentTransport,
  textStep
} from "./helpers/agentLoopHarness.js";

/**
 * Continuable children (P6.1a).
 *
 * A child that can still be asked something has not finished. So its
 * `delegation-completed` is deferred until the parent releases the handle, and a
 * parent that never releases leaves an unmatched `delegation-started` — the
 * honest signature of a delegation nobody ended.
 */
const PASS = "subagent-continuable-test-passphrase";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-continuable-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "payments-agent", trustBoundaryMode: "isolated" });
  initBudgets(dir, "payments-agent");
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  return dir;
}

function runnerFor(dir: string, scripts: ReturnType<typeof textStep>[]) {
  const registry = new AdapterRegistry();
  registry.register({
    providerId: LOOP_PROVIDER,
    adapter: scriptedAdapter(scripts),
    baseUrl: "https://api.anthropic.invalid",
    credentialRef: credentialRef("AMC_LOOP_TEST_KEY"),
    models: [LOOP_MODEL]
  });
  let clock = 1_000;
  return createDriverRunner({
    workspace: dir,
    makeLlm: (session) =>
      new LlmRuntime({
        session,
        credentials: new FixedCredentials(),
        registry,
        transport: silentTransport,
        now: () => { clock += 5; return clock; }
      }),
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
    systemPrompt: "You are a careful delegate.",
    harnessVersion: "3.2.0",
    compositionDigest: "composition-digest",
    policyDigest: "policy-digest"
  });
}

function parentRows(dir: string, sessionId: string): Array<{ event_type: string; meta_json: string }> {
  const db = new Database(join(dir, ".amc", "evidence.sqlite"), { readonly: true });
  try {
    return db
      .prepare("SELECT event_type, meta_json FROM evidence_events WHERE session_id = ? ORDER BY id")
      .all(sessionId) as Array<{ event_type: string; meta_json: string }>;
  } finally {
    db.close();
  }
}

async function spawnContinuable(dir: string, scripts: ReturnType<typeof textStep>[]) {
  const parentSession = new SessionService(dir);
  parentSession.open({
    agentId: "payments-agent", harnessVersion: "3.2.0", compositionDigest: "c", policyDigest: "p"
  });
  const outcome = await spawnSubagent({
    workspace: dir,
    parent: rootIdentity("payments-agent"),
    request: { runAs: "researcher", goal: "first question", continuable: true },
    session: { recordLoopEvent: (r) => parentSession.recordLoopEvent(r), recordProjectedEvidence: () => null },
    runner: runnerFor(dir, scripts),
    mintSessionId: () => "child-continuable"
  });
  return { parentSession, outcome };
}

describe("a child can be asked more than once", () => {
  it("answers a second question through the same inbox", async () => {
    const dir = workspace();
    const { parentSession, outcome } = await spawnContinuable(dir, [
      textStep("first answer"),
      textStep("second answer")
    ]);

    expect(outcome.ok, outcome.ok ? "" : outcome.reason).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.childText).toContain("first answer");
    expect(outcome.handle, "a continuable child hands back a handle").toBeDefined();

    const again = await outcome.handle!.continue("second question");
    expect(again.ok).toBe(true);
    expect(again.text).toContain("second answer");

    outcome.handle!.close("reported", "done");
    parentSession.close({ reason: "completed" });
  });

  it("reports only what the child said THIS time", async () => {
    // `readAgentRunSummary` folds the whole session, so without a cursor the
    // second continuation would hand the parent the first answer again as if it
    // were the new one.
    const dir = workspace();
    const { parentSession, outcome } = await spawnContinuable(dir, [
      textStep("first answer"),
      textStep("second answer")
    ]);
    if (!outcome.ok) throw new Error("expected a spawn");

    const again = await outcome.handle!.continue("second question");

    expect(again.text).toContain("second answer");
    expect(again.text, "the first answer is not re-reported").not.toContain("first answer");

    outcome.handle!.close("reported", "done");
    parentSession.close({ reason: "completed" });
  });

  it("keeps the same session across continuations", async () => {
    const dir = workspace();
    const { parentSession, outcome } = await spawnContinuable(dir, [
      textStep("a"), textStep("b")
    ]);
    if (!outcome.ok) throw new Error("expected a spawn");

    await outcome.handle!.continue("more");
    outcome.handle!.close("reported", "done");
    parentSession.close({ reason: "completed" });

    const db = new Database(join(dir, ".amc", "evidence.sqlite"), { readonly: true });
    const turns = (db
      .prepare("SELECT COUNT(*) n FROM evidence_events WHERE session_id = ? AND event_type = 'turn/end'")
      .get("child-continuable") as { n: number }).n;
    db.close();

    expect(turns, "two turns in one child session, not two sessions").toBe(2);
  });
});

describe("a live child is not an accounted-for one", () => {
  it("writes no completion while the child is still alive", async () => {
    const dir = workspace();
    const { parentSession, outcome } = await spawnContinuable(dir, [textStep("a"), textStep("b")]);
    if (!outcome.ok) throw new Error("expected a spawn");
    const parentId = parentSession.sessionId;

    const rowsWhileAlive = parentRows(dir, parentId);
    expect(rowsWhileAlive.some((r) => r.event_type === "agent_delegation_started")).toBe(true);
    expect(
      rowsWhileAlive.some((r) => r.event_type === "agent_delegation_completed"),
      "the delegation is still open"
    ).toBe(false);

    outcome.handle!.close("reported", "done");
    parentSession.close({ reason: "completed" });

    const after = parentRows(dir, parentId);
    expect(after.some((r) => r.event_type === "agent_delegation_completed"), "closing accounts for it")
      .toBe(true);
  });

  it("leaves an unmatched started when the parent never releases the child", async () => {
    // Not a leak to paper over: an announced delegation with no completion is
    // exactly what a reader needs to see when a parent walked away.
    const dir = workspace();
    const { parentSession, outcome } = await spawnContinuable(dir, [textStep("a")]);
    if (!outcome.ok) throw new Error("expected a spawn");
    const parentId = parentSession.sessionId;
    parentSession.close({ reason: "completed" });

    const rows = parentRows(dir, parentId);
    expect(rows.filter((r) => r.event_type === "agent_delegation_started")).toHaveLength(1);
    expect(rows.filter((r) => r.event_type === "agent_delegation_completed")).toHaveLength(0);
  });

  it("closes once, however many times it is asked", async () => {
    // A parent may release a child on a path that also unwinds. Two completion
    // rows for one delegation would make the log say it ended twice.
    const dir = workspace();
    const { parentSession, outcome } = await spawnContinuable(dir, [textStep("a")]);
    if (!outcome.ok) throw new Error("expected a spawn");
    const parentId = parentSession.sessionId;

    outcome.handle!.close("reported", "done");
    outcome.handle!.close("cancelled", "again");
    outcome.handle!.close("failed", "and again");
    parentSession.close({ reason: "completed" });

    const completions = parentRows(dir, parentId)
      .filter((r) => r.event_type === "agent_delegation_completed");
    expect(completions).toHaveLength(1);
    expect(JSON.parse(completions[0]!.meta_json)["reason"], "the first settlement stands").toBe("done");
  });

  it("refuses more work after release, rather than reopening the child", async () => {
    const dir = workspace();
    const { parentSession, outcome } = await spawnContinuable(dir, [textStep("a"), textStep("b")]);
    if (!outcome.ok) throw new Error("expected a spawn");

    outcome.handle!.close("reported", "done");
    const after = await outcome.handle!.continue("one more thing");

    expect(after.ok).toBe(false);
    expect(after.reason).toContain("released");
    parentSession.close({ reason: "completed" });
  });
});

describe("a non-continuable child is unchanged", () => {
  it("still accounts for itself immediately and hands back no handle", async () => {
    const dir = workspace();
    const parentSession = new SessionService(dir);
    parentSession.open({
      agentId: "payments-agent", harnessVersion: "3.2.0", compositionDigest: "c", policyDigest: "p"
    });
    const parentId = parentSession.sessionId;

    const outcome = await spawnSubagent({
      workspace: dir,
      parent: rootIdentity("payments-agent"),
      request: { runAs: "researcher", goal: "one question" },
      session: { recordLoopEvent: (r) => parentSession.recordLoopEvent(r), recordProjectedEvidence: () => null },
      runner: runnerFor(dir, [textStep("one answer")]),
      mintSessionId: () => "child-oneshot"
    });
    parentSession.close({ reason: "completed" });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.handle, "not continuable, so nothing to hold").toBeUndefined();
    expect(
      parentRows(dir, parentId).filter((r) => r.event_type === "agent_delegation_completed")
    ).toHaveLength(1);
  });
});

describe("the runner's own use-after-release guard", () => {
  it("refuses cleanly instead of throwing on a closed session", async () => {
    // Mutation testing found this guard was indistinguishable from decoration:
    // every test reached it through the handle, which already refuses first. It
    // is reachable without the handle — `SubagentContinuation` is on the runner's
    // own result — and without it a caller gets an opaque failure from a closed
    // session rather than an answer it can act on.
    const dir = workspace();
    const runner = runnerFor(dir, [textStep("a"), textStep("b")]);

    const first = await runner({
      continuable: true,
      toolsetAgentId: "payments-agent",
      identity: { governedAs: "payments-agent", runAs: "researcher", depth: 1, parent: "payments-agent" },
      childSessionId: "child-raw",
      goal: "first"
    });
    expect(first.ok, first.ok ? "" : first.reason).toBe(true);
    expect(first.continuation).toBeDefined();

    first.continuation!.close();
    const after = await first.continuation!.continue("more");

    expect(after.ok).toBe(false);
    expect(after.reason).toContain("released");
  });
});
