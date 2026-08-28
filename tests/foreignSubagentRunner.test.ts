import { mkdtempSync, rmSync, realpathSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { initWorkspace } from "../src/workspace.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { spawnSubagent } from "../src/agent/subagentSpawn.js";
import { listHandoffPackets } from "../src/fleet/handoffPacket.js";
import type { LoopEventRecord } from "../src/session/loopEventMeta.js";
import { createForeignRunner } from "../src/agent/foreignSubagentRunner.js";
import type { SubagentRunContext } from "../src/agent/subagentSpawn.js";

/**
 * A delegated child that is a FOREIGN process (plan P6.1b).
 *
 * The same `SubagentRunner` seam as the in-process driver, so `spawnSubagent`
 * keeps deciding everything that matters — depth, the signed packet, the
 * announced session, the started/completed pair. Only the executor changes.
 *
 * Composed from `spawnGovernedChild` rather than `runAdapterCommand`, which
 * cannot satisfy this seam: it requires AMC Studio to be running, mints its own
 * session id, returns only an exit code with no child text, and its SANDBOX
 * branch hardcodes `exitCode: 0`.
 */
const PASS = "foreign-runner-test-passphrase";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-foreign-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "payments-agent", trustBoundaryMode: "isolated" });
  return dir;
}

/** A stand-in for `claude -p` / `codex exec`: prints an answer, exits. */
function fakeAgent(dir: string, body: string): string {
  const script = join(dir, "fake-agent");
  writeFileSync(script, `#!/bin/sh\n${body}\n`, "utf8");
  chmodSync(script, 0o755);
  return script;
}

const ctx = (over: Partial<SubagentRunContext> = {}): SubagentRunContext => ({
  continuable: false,
  toolsetAgentId: "payments-agent",
  identity: { governedAs: "payments-agent", runAs: "researcher", depth: 1, parent: "payments-agent" },
  childSessionId: "foreign-child-1",
  goal: "summarise the ledger",
  ...over
});

function runnerFor(dir: string, script: string, over: Record<string, unknown> = {}) {
  return createForeignRunner({
    workspace: dir,
    spawn: (goal) => ({ command: script, args: [goal] }),
    governedEnv: () => ({
      env: { AMC_LEASE: "lease-token-abc", AMC_GATEWAY_URL: "http://127.0.0.1:3210/openai" },
      lease: "lease-token-abc"
    }),
    ...over
  });
}

describe("a foreign child answers through the same seam", () => {
  it("returns the child's own words, folded from its recorded output", async () => {
    const dir = workspace();
    const runner = runnerFor(dir, fakeAgent(dir, 'echo "I checked 40 rows."'));

    const result = await runner(ctx());

    expect(result.ok, result.ok ? "" : result.reason).toBe(true);
    expect(result.text.trim()).toBe("I checked 40 rows.");
  });

  it("passes the goal to the foreign command", async () => {
    const dir = workspace();
    const runner = runnerFor(dir, fakeAgent(dir, 'echo "goal was: $1"'));

    const result = await runner(ctx({ goal: "count the anomalies" }));

    expect(result.text).toContain("count the anomalies");
  });

  it("refuses when the child exits non-zero, rather than returning partial words", async () => {
    // The failure `runAdapterCommand`'s SANDBOX branch cannot express. A child
    // that printed something and then crashed has not answered.
    const dir = workspace();
    const runner = runnerFor(dir, fakeAgent(dir, 'echo "half an ans"; exit 2'));

    const result = await runner(ctx());

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("exit");
    expect(result.text, "a crashed child's partial output is not its answer").toBe("");
  });

  it("refuses a child that said nothing", async () => {
    const dir = workspace();
    const runner = runnerFor(dir, fakeAgent(dir, "exit 0"));

    const result = await runner(ctx());

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("no output");
  });
});

describe("a foreign child is governed or it does not run", () => {
  it("refuses to spawn without a lease", async () => {
    // ADR-5: governed by default. A foreign child with no lease reaches the
    // provider directly, outside the gateway, with nothing metering or recording
    // it -- which is the one arrangement AMC must never create on purpose.
    const dir = workspace();
    const runner = runnerFor(dir, fakeAgent(dir, 'echo "hi"'), {
      governedEnv: () => ({ env: { AMC_GATEWAY_URL: "http://127.0.0.1:3210/openai" }, lease: "" })
    });

    const result = await runner(ctx());

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/lease|ungoverned/i);
  });

  it("keeps the child's lease out of the recorded output", async () => {
    // A child that echoes its own credential must not put it in the signed log.
    const dir = workspace();
    const runner = runnerFor(dir, fakeAgent(dir, 'echo "my token is $AMC_LEASE"'));

    const result = await runner(ctx());

    expect(result.ok).toBe(true);
    expect(result.text, "the lease is scrubbed").not.toContain("lease-token-abc");
  });
});

describe("a foreign child does not hang its parent", () => {
  it("refuses on the deadline, and says it was the deadline", async () => {
    // A timed-out child is killed by signal, so its exit code is 1 -- and
    // "exited 1" would send an operator hunting a crash rather than a deadline.
    const dir = workspace();
    const runner = runnerFor(dir, fakeAgent(dir, "sleep 30"), { timeoutMs: 1_500 });

    const result = await runner(ctx());

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("timed out");
  }, 30_000);
});

describe("a truncated answer is not an answer", () => {
  it("refuses rather than reporting the part that fit", async () => {
    // The monitor caps recorded output at 4 MiB and says so with a
    // `runtime_output_truncated` metric. Folding the rows anyway would hand the
    // parent a silently-cut answer that reads as complete -- and the parent
    // quotes it to its model as the delegate's finding.
    const dir = workspace();
    // 5 MiB of output, past the cap.
    const runner = runnerFor(dir, fakeAgent(dir, "head -c 5242880 /dev/zero | tr '\\0' 'x'"));

    const result = await runner(ctx());

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("cannot be reported in full");
  }, 60_000);
});

describe("a foreign child stops when its parent gives up", () => {
  it("kills the process on the signal rather than running to completion", async () => {
    // The signal is only a channel if something listens. `spawnGovernedChild`
    // has always accepted one; the runner had to pass `ctx.signal` down for a
    // cancelled delegation to actually stop a foreign process.
    const dir = workspace();
    const controller = new AbortController();
    const runner = runnerFor(dir, fakeAgent(dir, 'sleep 30; echo "finished"'));

    const started = Date.now();
    setTimeout(() => controller.abort(), 400);
    const result = await runner(ctx({ signal: controller.signal }));

    expect(Date.now() - started, "stopped early, not after the sleep").toBeLessThan(15_000);
    expect(result.ok).toBe(false);
  }, 30_000);
});

describe("a foreign child cannot be continued", () => {
  it("refuses a continuable request instead of pretending", async () => {
    // `claude -p` and `codex exec` are one-shot. Handing back a continuation
    // that silently starts a FRESH process on every follow-up would present a
    // new agent with no memory as the same child -- and dsh's own out-of-process
    // providers implement no continuation either.
    const dir = workspace();
    const runner = runnerFor(dir, fakeAgent(dir, 'echo "hi"'));

    const result = await runner(ctx({ continuable: true }));

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("continuable");
    expect(result.continuation, "and no handle is offered").toBeUndefined();
  });
});

describe("a foreign child is governed by the same chokepoint as an in-process one", () => {
  it("runs through spawnSubagent with a signed packet and an announced session", async () => {
    // The point of putting the seam at the runner: a provider cannot opt out of
    // the governance by being foreign. Depth, the Ed25519 packet, the announced
    // child session and the started/completed pair are all decided by
    // spawnSubagent, exactly as for the in-process driver.
    const dir = workspace();
    const rows: LoopEventRecord[] = [];
    const before = listHandoffPackets(dir).length;

    const outcome = await spawnSubagent({
      workspace: dir,
      parent: rootIdentity("payments-agent"),
      request: { runAs: "researcher", goal: "summarise the ledger" },
      session: { recordLoopEvent: (r) => { rows.push(r); return null; },
    recordProjectedEvidence: () => null },
      runner: runnerFor(dir, fakeAgent(dir, 'echo "40 rows, two anomalies."')),
      mintSessionId: () => "foreign-governed-1"
    });

    expect(outcome.ok, outcome.ok ? "" : outcome.reason).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.childText).toContain("two anomalies");
    expect(listHandoffPackets(dir).length, "a signed packet was minted for it").toBe(before + 1);
    expect(rows.map((r) => r.kind)).toEqual(["delegation-started", "delegation-completed"]);

    // The foreign process really wrote under the id the parent announced.
    const started = rows[0] as { childSessionId: string };
    expect(started.childSessionId).toBe("foreign-governed-1");
    const db = new Database(join(dir, ".amc", "evidence.sqlite"), { readonly: true });
    const n = (db.prepare("SELECT COUNT(*) n FROM evidence_events WHERE session_id = ?")
      .get("foreign-governed-1") as { n: number }).n;
    db.close();
    expect(n, "the announced session is where the child's evidence lives").toBeGreaterThan(0);
  });

  it("settles a crashed foreign child as failed, not as a silent success", async () => {
    const dir = workspace();
    const rows: LoopEventRecord[] = [];

    const outcome = await spawnSubagent({
      workspace: dir,
      parent: rootIdentity("payments-agent"),
      request: { runAs: "researcher", goal: "g" },
      session: { recordLoopEvent: (r) => { rows.push(r); return null; },
    recordProjectedEvidence: () => null },
      runner: runnerFor(dir, fakeAgent(dir, 'echo "half"; exit 7')),
      mintSessionId: () => "foreign-crashed-1"
    });

    expect(outcome.ok).toBe(false);
    const completed = rows.find((r) => r.kind === "delegation-completed") as { settledAs: string } | undefined;
    expect(completed?.settledAs).toBe("failed");
  });
});
